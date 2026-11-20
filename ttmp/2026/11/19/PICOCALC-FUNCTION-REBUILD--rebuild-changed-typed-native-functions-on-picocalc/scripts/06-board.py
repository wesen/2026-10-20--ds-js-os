"""Qualify the rebuild firmware on the lab's scheduled ESP32-P4 and restore it."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
legacy, = (DAY.parent / "18").glob("PICOCALC-TYPED-APPS--*/scripts/06-qualify-files-on-p4.py")
shared = runpy.run_path(str(legacy))
combined, = DAY.glob("PICOCALC-RV32-COMBINED--*/scripts/06-board.py")
worlds = runpy.run_path(str(combined))["worlds"]


def sha(contents):
    return hashlib.sha256(contents).hexdigest()


def parse(log, evidence):
    oracle = {(row["kind"], row["id"]): row for row in evidence}
    suite = {kind: [row["id"] for row in evidence if row["kind"] == kind]
             for kind in ("files", "fixture")}
    expected = [(block, kind, (block + i) % 2, case)
                for block in range(4) for i in range(2)
                for kind, cases in suite.items() for case in cases]
    cold = []
    rows = []
    setups = []
    guests = []
    cold_started = False
    stock_measurement = None
    active_series = None
    pending_guest = None

    for line in log.splitlines():
        if line == "REBUILDCOLDSTART":
            if cold_started:
                raise ValueError("duplicate cold marker")
            cold_started = True
        match = re.fullmatch(
            r"files compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)", line)
        if match and cold_started:
            if stock_measurement:
                raise ValueError("duplicate stock wrapper row")
            stock_measurement = tuple(map(int, match.groups()))
        if line.startswith("REBUILDCOLD "):
            _, block, size, digest = line.split()
            row = oracle["files", "seed"]
            if not cold_started or not stock_measurement or digest != row["sha256"] or int(size) != row["size"]:
                raise ValueError("cold stock output differs from frozen oracle")
            us, peak, reported_size = stock_measurement
            if not us or not peak or int(size) != reported_size:
                raise ValueError("invalid cold stock measurement")
            cold.append({"block": int(block), "us": us, "peak": peak, "size": int(size), "sha256": digest})
            stock_measurement = None
            cold_started = False
        if line.startswith("REBUILDSETUP "):
            _, block, kind, marked, us, live, peak = line.split()
            active_series = (int(block), kind, int(marked))
            setups.append(dict(zip(("block", "kind", "marked"), active_series),
                               us=int(us), live=int(live), peak=int(peak)))
        if line.startswith("REBUILDROW "):
            _, block, kind, marked, digest, size, payload = line.split(" ", 6)
            row = json.loads(payload)
            identity = (int(block), kind, int(marked), row["id"])
            if len(rows) >= len(expected) or identity != expected[len(rows)] or active_series != identity[:3]:
                raise ValueError(f"unexpected identity or missing setup {identity}")
            ref = oracle[kind, row["id"]]
            for field in ("mode", "error", "reason", "built", "reused", "instructionBytes"):
                if row.get(field) != ref.get(field):
                    raise ValueError(f"{identity}: {field} differs from host oracle: {row}")
            if digest != ref.get("sha256", "-") or int(size) != ref.get("size", 0):
                raise ValueError(f"{identity}: ELF identity differs from the frozen host")
            if row["cleanUs"] <= 0 or sum(row["phases"].values()) > row["elapsed"]:
                raise ValueError(f"{identity}: inconsistent timing")
            if not 0 < row["heap"]["live"] <= row["heap"]["peak"] <= 2 * 1024 * 1024:
                raise ValueError(f"{identity}: allocator ceiling violated")
            rows.append(dict(row, block=int(block), kind=kind, marked=bool(int(marked)),
                             sha256=digest if digest != "-" else None, size=int(size)))
            if pending_guest:
                raise ValueError("missing guest result before next row")
            if kind == "files" and row["id"] in ("seed", "body"):
                pending_guest = identity
        if line.startswith("REBUILDGUEST "):
            _, case, load_us, run_us, result, *units = line.split()
            expected_guest = (-1, [0, 0, 0]) if case == "seed" else (3, [95, 65, 98])
            if not pending_guest or pending_guest[-1] != case or (int(result), list(map(int, units))) != expected_guest:
                raise ValueError(f"native entry gave the wrong result: {line}")
            guests.append(dict(block=pending_guest[0], case=case, marked=bool(pending_guest[2]),
                               load_us=int(load_us), run_us=int(run_us), result=int(result), units=list(map(int, units))))
            pending_guest = None

    if (len(rows) != len(expected) or len(setups) != 16 or len(guests) != 16
        or [row["block"] for row in cold] != list(range(4)) or pending_guest or cold_started
        or "REBUILDDONE" not in log.splitlines() or "REBUILDFAIL" in log or "REBUILDERROR" in log):
        raise ValueError(f"incomplete rebuild run: {len(rows)}/{len(expected)} rows, {len(guests)} guests, {len(cold)} cold")
    return {"rows": rows, "setups": setups, "guests": guests, "cold": cold, "worlds": worlds(log)}


def parse_endpoint(log, evidence):
    body = next(row for row in evidence if (row["kind"], row["id"]) == ("files", "body"))
    expected = [(block, position, "rebuild" if (block + position) % 2 else "clean")
                for block in range(6) for position in range(2)]
    rows = []
    for line in log.splitlines():
        if not line.startswith("ENDPOINTROW "):
            continue
        _, block, position, mode, us, load_us, run_us, before, live, peak, size, result, x, y, z, digest = line.split()
        row = dict(block=int(block), position=int(position), mode=mode, us=int(us), load_us=int(load_us),
                   run_us=int(run_us), before=int(before), live=int(live), peak=int(peak), size=int(size),
                   result=int(result), units=[int(x), int(y), int(z)], sha256=digest)
        if len(rows) >= len(expected) or (row["block"], row["position"], row["mode"]) != expected[len(rows)]:
            raise ValueError(f"unexpected endpoint row {row}")
        if (row["size"] != body["size"] or digest != body["sha256"] or row["result"] != 3
            or row["units"] != [95, 65, 98] or row["us"] < row["load_us"] + row["run_us"]
            or not 0 < row["before"] <= row["peak"] <= 2 * 1024 * 1024
            or not 0 < row["live"] <= row["peak"]):
            raise ValueError(f"invalid linked Files endpoint {row}")
        rows.append(row)
    if (len(rows) != len(expected) or not {"ENDPOINTSTART", "ENDPOINTDONE"} <= set(log.splitlines())
        or "ENDPOINTFAIL" in log or "REBUILDERROR" in log):
        raise ValueError(f"incomplete endpoint trial: {len(rows)}/{len(expected)} rows")
    return {"rows": rows, "worlds": worlds(log)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("backup", type=Path)
    parser.add_argument("--port", required=True)
    parser.add_argument("--esptool", required=True, type=Path)
    parser.add_argument("--boots", type=int, default=2, choices=[1, 2, 3])
    parser.add_argument("--seconds", type=int)
    parser.add_argument("--endpoint", action="store_true", help="qualify the continuous Files source-to-entry clock")
    args = parser.parse_args()
    if args.seconds is None:
        args.seconds = 25 if args.endpoint else 48
    args.esptool_python = args.esptool.parent / "python"
    work = args.work.resolve()
    image = work / "build/picocalc-os-p4.bin"
    reactor = work / "build/esp-idf/main/files-reactor.elf"
    table = (args.backup / "partition-table.bin").read_bytes()
    build_table = (work / "build/partition_table/partition-table.bin").read_bytes()
    original = args.backup / "factory-original.bin"
    if build_table.ljust(4096, b"\xff") != table or original.stat().st_size != 8 * 1024 * 1024:
        raise ValueError("unexpected restore backup or partition map")
    contents = image.read_bytes()
    if not 0 < len(contents) < original.stat().st_size:
        raise ValueError("unexpected trial image size")
    manifest = json.loads((work / "sources.json").read_text())
    physical_scripts = {"candidate/wasm.js", "candidate/rv32.js", "candidate/files.js",
                        "candidate/incremental.js", "candidate/cases.js",
                        "stock/wasm.js", "stock/rv32.js", "stock/files.js", "stock/files.typed"}
    if args.endpoint:
        physical_scripts.add("candidate/endpoint.js")
    for name in physical_scripts:
        text = (work / name).read_bytes()
        if sha(text) != manifest["sha256"][name] or text not in contents:
            raise ValueError(f"firmware identity mismatch for {name}")
    subprocess.run(["node", HERE / "04-host.mjs", work, reactor, "40"], check=True)
    host = json.loads((work / "host.json").read_text())
    result = dict(firmware=sha(contents), table=sha(table), original=sha(original.read_bytes()),
                  configuration=host["configuration"], boots=[], restored=False)
    receipt = work / "physical.json"
    if receipt.exists():
        raise FileExistsError(receipt)

    def save():
        receipt.write_text(json.dumps(result, indent=2) + "\n")

    def capture(label, duration, commands):
        log = shared["capture"](args.port, work, label, duration, commands)
        with gzip.open(work / (label + ".log.gz"), "wt", encoding="utf-8") as archive:
            archive.write(log)
        return log

    begin = "ENDPOINTSTART" if args.endpoint else "REBUILDSTART"
    parse_boot = parse_endpoint if args.endpoint else parse
    save()
    try:
        shared["flash"](args, work, image, "trial")
        for i in range(args.boots):
            commands = ["0.4 reboot"] if i else []
            commands.append(f"{args.seconds - 3} worlds")
            log = capture(f"boot-{i + 1}", args.seconds, commands)
            if not i and begin not in log:
                log = capture("boot-1-retry", args.seconds, ["0.4 reboot", commands[-1]])
            result["boots"].append(parse_boot(log, host["evidence"]))
            save()
    finally:
        shared["flash"](args, work, original, "restore")
        result["restored_worlds"] = worlds(capture("restored", 17, ["14 worlds"]))
        result["restored"] = True
        save()


if __name__ == "__main__":
    main()
