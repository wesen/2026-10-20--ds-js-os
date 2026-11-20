"""Temporarily run the standalone Chess benchmark, then restore the attested release."""
import argparse
import fcntl
import importlib.util
import json
from hashlib import sha256
from pathlib import Path
import re
import signal
import struct
import subprocess
import time

import serial

DAY = Path(__file__).resolve().parents[3]
source = next(DAY.glob("PICOCALC-SNAKE-INTEGRATION--*/scripts/device/01-normal-snake.py"))
spec = importlib.util.spec_from_file_location("console_helpers", source)
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)

APP = "picocalc-os-p4.bin"
RELEASE_SHA = "134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1"
PART_SHA = "72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30"
FIELDS = ("bestMove", "score", "completed", "nodes", "slices")
HEADER = re.compile(rb"CHESS-BENCH v1 cases=(\d+) repeats=(\d+) hz=(\d+) slice=(\d+) core=(\d+) internal=(\d+)")
ROW = re.compile(rb"CHESS-ROW ((?:-?\d+ ?){10})")


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def capture(args, log, host):
    rows = {}
    meta = None
    deadline = time.monotonic() + 300
    quantities = len(host["expected"])
    with serial.Serial(args.port, 115200, timeout=.2) as port:
        while time.monotonic() < deadline:
            raw = port.readline()
            if not raw:
                continue
            log.write(raw)
            text = raw.strip()
            if found := HEADER.fullmatch(text):
                if meta:
                    raise ValueError("benchmark rebooted")
                cases, repeats, hz, slice_steps, core, internal = map(int, found.groups())
                if cases != quantities or slice_steps != host["sliceSteps"] or repeats != 3:
                    raise ValueError(f"unexpected benchmark contract: {text!r}")
                meta = {"cases":cases, "repeats":repeats, "cpuHz":hz, "sliceSteps":slice_steps,
                        "core":core, "boardBufferInternal":bool(internal)}
            elif match := ROW.fullmatch(text):
                if meta is None:
                    raise ValueError("missing benchmark header")
                index, rep, move, score, completed, nodes, slices, wall, max_slice, ok = map(int, match[1].split())
                if (index, rep) in rows or not 0 <= index < quantities or not 0 <= rep < meta["repeats"]:
                    raise ValueError(f"invalid or duplicate row: {text!r}")
                actual = dict(zip(FIELDS, (move, score, completed, nodes, slices)))
                expected = {name:host["expected"][index]["result"][name] for name in FIELDS}
                if not ok or actual != expected or not 0 <= max_slice <= wall:
                    raise ValueError(f"unexpected benchmark result: {text!r}")
                rows[index,rep] = {**actual, "wallUs":wall, "maxSliceUs":max_slice}
                if len(rows) % quantities == 0:
                    print(f"Verified {len(rows)} board searches", flush=True)
            elif text == b"CHESS-DONE ok":
                if not meta or len(rows) != meta["repeats"] * quantities:
                    raise ValueError("incomplete result matrix")
                series = [[rows[index,rep] for rep in range(meta["repeats"])] for index in range(quantities)]
                canonical = b"".join(struct.pack("<5i", *(group[0][name] for name in FIELDS)) for group in series)
                if sha256(canonical).hexdigest() != host["digest"]:
                    raise ValueError("board canonical result digest differs from Wasm")
                return {"measurement":meta, "digest":host["digest"], "rows":series}
            elif text.startswith(b"CHESS-DONE"):
                raise ValueError(text)
    raise TimeoutError(f"benchmark incomplete after 300 seconds: {len(rows)} verified rows")


def run(args):
    board = args.build / "typed_chess_benchmark.bin"
    release = args.release / APP
    table = args.release / "partition-table.bin"
    host = json.loads((args.build.parent / "main/host.json").read_text())
    if digest(release) != RELEASE_SHA or digest(table) != PART_SHA:
        raise ValueError("release artifact identity changed")
    if table.read_bytes() != (args.build / "partition_table/partition-table.bin").read_bytes():
        raise ValueError("benchmark partition table differs")
    if digest(args.build.parent / "main/engine.bin") != host["rv32Sha256"]:
        raise ValueError("native engine bytes differ from the host-staged build")
    if max(board.stat().st_size, release.stat().st_size) >= 0x800000:
        raise ValueError("app exceeds the factory partition")
    args.output.mkdir(parents=True, exist_ok=False)
    receipt = {"benchmarkSha256":digest(board), "releaseSha256":RELEASE_SHA, "partitionSha256":PART_SHA,
               "engineSourceSha256":host["engineSourceSha256"], "rv32Sha256":host["rv32Sha256"]}

    def record():
        (args.output / "physical.json").write_text(json.dumps(receipt, indent=2) + "\n")

    def esp(verb, image, tag):
        after = "no_reset" if verb == "write_flash" else "hard_reset"
        cmd = [str(args.esptool), "--chip", "esp32p4", "-p", args.port, "-b", "921600",
               "--after", after, verb, "0x10000", str(image)]
        if verb == "verify_flash":
            cmd += ["0x8000", str(table)]
        with (args.output / (tag + ".log")).open("wb") as log:
            subprocess.run(cmd, check=True, timeout=180, stdout=log, stderr=subprocess.STDOUT)

    def interrupt(*_):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, interrupt)
    with shared.LOCK.open("a") as guard, (args.output / "uart.log").open("wb", buffering=0) as log:
        fcntl.flock(guard, fcntl.LOCK_EX)

        def hold():
            console = shared.Console(args.port, log)
            try:
                if not any("held between transactions" in row for row in console.command("hold", timeout=16)):
                    raise RuntimeError("release drivers did not acknowledge hold")
            finally:
                console.close()

        record()
        hold()
        esp("verify_flash", release, "release-before")
        receipt["releaseBefore"] = True
        hold()
        try:
            esp("write_flash", board, "benchmark-write")
            esp("verify_flash", board, "benchmark-verify")
            receipt.update(capture(args, log, host))
            record()
        except BaseException as exc:
            receipt["failure"] = repr(exc)
            record()
            raise
        finally:
            esp("write_flash", release, "release-restore")
            esp("verify_flash", release, "release-restore-verify")
            receipt["restoreReadback"] = True
            record()
            console = shared.Console(args.port, log)
            try:
                worlds = console.health()
                status = console.command("painter")
                painter = next(json.loads(line) for line in status if line.startswith('{"sources"'))
                receipt["restoredWorlds"] = sorted(name for name in shared.NATIVE if name in worlds)
                receipt["restoredPainter"] = painter
                if not painter["installed"] or painter["rejects"]:
                    raise ValueError("ordinary painter failed boot after restore")
            finally:
                console.close()
                record()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("build", "release", "output"):
        p.add_argument(name, type=Path)
    p.add_argument("--port", default="/dev/ttyACM0")
    p.add_argument("--esptool", type=Path, default=Path("/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
    run(p.parse_args())
