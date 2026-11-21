"""Time the stock and promoted Chess worlds after PSRAM relocation and restore playable firmware."""
import argparse
import json
from pathlib import Path
import signal
import statistics
import sys
import time

HERE = Path(__file__).resolve().parent
TICKET = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "device"))
import common

CASES = (0, 6, 15)
BLOCKS = 6
FIELDS = ("bestMove", "score", "completed", "nodes", "slices")
PSRAM_LOW, PSRAM_HIGH = 0x48000000, 0x4C000000  # ESP-IDF 5.4.2, esp32p4/soc/soc.h

def read(path):
    return json.loads(path.read_bytes())

def require(check, message):
    if not check:
        raise ValueError(message)

def prepare(probe, release):
    attestation = read(TICKET / "various/release/build.json")
    image = probe / "build/chess_psram_trial.bin"
    inputs = read(probe / "main/inputs.json")
    original = next(TICKET.parent.glob("PICOCALC-RELEASE-LAB--*"))
    frozen = read(original / "various/chess/host.json")
    oracle = read(probe / "oracle/host.json")
    require(oracle["digest"] == frozen["digest"] and oracle["sliceSteps"] == frozen["sliceSteps"] == 48,
            "Wasm oracle differs from frozen search")
    for index in CASES:
        for key in ("name", "position", "depth", "budget", "result"):
            require(oracle["expected"][index][key] == frozen["expected"][index][key], "case differs from frozen oracle")
    require(common.sha(release / common.APP) == attestation["firmwareSHA256"], "restore application mismatch")
    require(common.sha(release / common.PART) == common.sha(probe / "build" / common.PART) ==
            attestation["partitionSHA256"], "partition map mismatch")
    require(0 < image.stat().st_size < attestation["factoryBytes"], "probe does not fit")
    require([row["name"] for row in inputs] == ["stock", "promoted"], "expected original and promoted arms")
    prior = next(TICKET.parent.glob("PICOCALC-NATIVE-WAVE--*"))
    comparisons = read(prior / "various/director/composed-release-worlds.json")["chess"]["arms"]
    firmware = image.read_bytes()
    for arm, key in zip(inputs, ("early-stock", "late-leaf"), strict=True):
        elf = probe / "main" / (arm["name"] + ".elf")
        require(common.sha(elf) == arm["linkedSHA256"] == comparisons[key]["linkedELFSHA256"], "wrong world ELF")
        require(firmware.count(elf.read_bytes()) == 1, "expected complete world ELF once in probe flash image")
    require(inputs[1]["linkedSHA256"] == attestation["chess"]["linkedSHA256"], "promoted world differs from release")
    return dict(candidateSHA256=common.sha(image), ordinarySHA256=attestation["firmwareSHA256"],
                partitionSHA256=attestation["partitionSHA256"], oracleDigest=frozen["digest"],
                sliceSteps=48, arms=inputs), frozen["expected"]

def tokens(lines, keyword, n):
    parts = next(lines).split()
    require(len(parts) == n + 1 and parts[0] == keyword, f"expected {keyword} with {n} fields, got {parts!r}")
    return parts[1:]

def collect(lines, inputs, oracle):
    """Consume the exact block, arm and case schedule emitted by bench.c."""
    lines = iter(lines)
    hz, core, blocks, allocated = map(int, tokens(lines, "PROMO_BEGIN", 4))
    require(hz == 360000000 and core in (0, 1) and blocks == BLOCKS and allocated == 1, "probe setup")
    loads, rows = [], []
    for block in range(BLOCKS):
        for slot in range(2):
            arm = (block + slot) % 2
            b, a, base, start, step = tokens(lines, "PROMO_LOAD", 5)
            require((int(b), int(a)) == (block, arm), "incorrect loader order")
            base, start, step = (int(v, 16) for v in (base, start, step))
            require(all(PSRAM_LOW <= p < PSRAM_HIGH and not p % 4 for p in (base, start, step)), "outside P4 PSRAM")
            # Both frozen ELFs have their first PT_LOAD at virtual address zero.
            addresses = inputs[arm]["addresses"]
            require(start-base == addresses["chessStartSearch"] and step-base == addresses["chessSearchSlice"],
                    "relocated entry differs from the declared ELF address")
            loads.append(dict(block=block, arm=arm, segment=hex(base), begin=hex(start), slice=hex(step)))
            for i in range(len(CASES)):
                index = CASES[(i + block) % len(CASES)]
                b, a, f, elapsed, *values, ok = map(int, tokens(lines, "PROMO_ROW", 10))
                require((b, a, f) == (block, arm, index), "incorrect case or arm order")
                require(ok == 1 and elapsed > 0, "board result or root restoration failure")
                require(values == [oracle[index]["result"][field] for field in FIELDS], "search differs from frozen Wasm")
                rows.append(dict(block=b, arm=a, case=f, us=elapsed))
    require(tokens(lines, "PROMO_DONE", 1) == ["ok"], "incomplete probe")
    cells = {}
    for index in CASES:
        old, new = ([r["us"] for r in rows if r["arm"] == arm and r["case"] == index] for arm in (0,1))
        ratios = [n/o for n,o in zip(new, old, strict=True)]
        old_median, new_median = map(statistics.median, (old, new))
        cells[str(index)] = dict(fixture=oracle[index]["name"], expected=oracle[index]["result"],
            requestedDepth=oracle[index]["depth"], nodeBudget=oracle[index]["budget"],
            stockMedianUs=old_median, promotedMedianUs=new_median,
            medianOfPairedReductionsPct=statistics.median(100*(1-r) for r in ratios),
            reductionFromArmMediansPct=100*(1-new_median/old_median),
            reductionsByBlockPct=[100*(1-r) for r in ratios])
    return dict(cpuHz=hz, core=core, blocks=blocks, psramAllocationsChecked=True,
                loads=loads, rows=rows, cases=cells, rootCellsChecked=135, probePassed=True)

def serial_records(port, log):
    with common.unit.serial.Serial(port, 115200, timeout=.25) as device:
        deadline = time.monotonic() + 180
        pending = b""
        while time.monotonic() < deadline:
            raw = device.read(max(1, device.in_waiting))
            log.write(raw)
            pending += raw
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                if b"PROMO_" in line:
                    yield line[line.index(b"PROMO_"):].decode("ascii").strip()
        raise TimeoutError("did not receive the complete PROMO sequence")

def run(args):
    probe, release = args.probe.resolve(), args.release.resolve()
    receipt, oracle = prepare(probe, release)
    if args.preflight:
        print(json.dumps(receipt, indent=2))
        return
    require(args.out is not None, "supply a fresh raw output directory")
    out = args.out.resolve()
    require(out.is_relative_to(Path("/tmp")), "keep unfiltered serial output in /tmp")
    out.mkdir(parents=True, exist_ok=False)
    # Use common.esp for both images: it expects this standard app/partition directory layout.
    image = out / "probe-image"
    (image / "partition_table").mkdir(parents=True)
    (image / common.APP).symlink_to(probe / "build/chess_psram_trial.bin")
    (image / common.PART).symlink_to(probe / "build" / common.PART)
    report = out / "physical.json"
    common.save(report, receipt)
    with common.acquire(), (out / "uart.log").open("wb", buffering=0) as log:
        def connect():
            return common.unit.Console(args.port, log)
        def flash(verb, directory, label):
            common.esp(verb, directory, out, label, args.port)
        common.hold(connect())
        flash("verify_flash", release, "ordinary-before")
        common.hold(connect())
        try:
            flash("write_flash", image, "probe-write")
            flash("verify_flash", image, "probe-verify")
            feed = serial_records(args.port, log)
            try:
                receipt.update(collect(feed, receipt["arms"], oracle))
            finally:
                feed.close()
            common.save(report, receipt)
            print("validated 36 search timings", flush=True)
        finally:
            flash("write_flash", release, "ordinary-restore")
            flash("verify_flash", release, "ordinary-restore-verified")
            receipt["restoredReadback"] = True
            common.save(report, receipt)
            con = connect()
            try:
                worlds, painter = common.ready(con)
                con.input_ready()
                receipt["restoredNativeWorlds"] = sorted(set(worlds) & common.unit.NATIVE.keys())
                receipt["restoredPainter"] = painter
                receipt["keyboardPolling"] = True
                common.save(report, receipt)
                print("verified restored playable firmware and health", flush=True)
            finally:
                con.close()

if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("probe", type=Path)
    cli.add_argument("release", type=Path)
    cli.add_argument("out", type=Path, nargs="?")
    cli.add_argument("--preflight", action="store_true")
    cli.add_argument("--port", default="/dev/ttyACM0")
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    run(cli.parse_args())
