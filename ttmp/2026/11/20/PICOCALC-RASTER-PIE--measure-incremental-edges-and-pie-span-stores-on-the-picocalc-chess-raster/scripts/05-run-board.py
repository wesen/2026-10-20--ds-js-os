"""Measure the stock and experimental 3D raster arms, then restore the playable app."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import signal
from statistics import median
import subprocess
import time

import serial

TICKETS = Path(__file__).resolve().parents[2]
source = next(TICKETS.glob("PICOCALC-SNAKE-INTEGRATION--*/scripts/device/01-normal-snake.py"))
spec = importlib.util.spec_from_file_location("console", source)
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
PARTITION = Path("partition_table/partition-table.bin")
ARMS = {"stock", "edges", "scalar", "pie"}
TIMED = {"e2", "e3", "f3", "high", "low", "pos-23", "pos-46"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capture(port, log, reference):
    with serial.Serial(port, 115200, timeout=.1) as uart:
        deadline = time.monotonic() + 110
        started = False
        while time.monotonic() < deadline:
            line = uart.readline()
            log.write(line)
            fields = line.decode(errors="replace").split()
            if not fields:
                continue
            op, *rest = fields
            if op == "RASTER_BEGIN":
                started = True
                result = {"configuration": rest, "cases": {}, "rasterCycles": [], "damageCases": {}, "damageCycles": []}
            elif not started:
                continue
            elif op == "RASTER_CASE":
                scene, crc, bands, charge, outcome = rest
                exp = reference[scene]
                result["cases"][scene] = {"crc": crc, "dirty": bands, "charge": int(charge),
                    "passed": outcome == "ok" and crc == exp["frameCRC32"] and
                              exp["metadata"] == f"charge={charge} dirty={bands}"}
            elif op == "RASTER_CYCLES":
                scene, arm, validate, *nums = rest
                observed = list(map(int, nums))
                if len(observed) != 11:
                    raise ValueError(f"Interrupted cycle series for {scene} {arm}")
                result["rasterCycles"].append({"scene": scene, "arm": arm, "validation": bool(int(validate)),
                                               "samples": observed, "median": median(observed)})
            elif op == "DAMAGE_CASE":
                transition, *observed, outcome = rest
                result["damageCases"][transition] = {"observed": observed, "status": outcome}
            elif op == "DAMAGE_CYCLES":
                transition, arm, *nums = rest
                observed = list(map(int, nums))
                if len(observed) != 7:
                    raise ValueError(f"Interrupted cycle series for {transition} {arm}")
                result["damageCycles"].append({"transition": transition, "arm": arm,
                                                "samples": observed, "median": median(observed)})
            elif op == "DAMAGE_DONE":
                result["damagePassed"] = rest == ["ok"]
            elif op == "RASTER_DONE":
                observed = {(r["scene"], r["arm"], r["validation"]) for r in result["rasterCycles"]}
                expected = {(scene, arm, check) for scene in TIMED for arm in ARMS for check in (False, True)}
                result["passed"] = (rest == ["51", "ok"] and result["cases"].keys() == reference.keys()
                    and all(row["passed"] for row in result["cases"].values())
                    and observed == expected and len(result["rasterCycles"]) == len(expected)
                    and result.get("damagePassed") and len(result["damageCases"]) == 10
                    and len(result["damageCycles"]) == 20)
                return result
    raise TimeoutError("No complete raster pass appeared on serial")


def run(args):
    candidate = args.benchmark / "raster_pie_experiment.bin"
    release = args.playable / "picocalc-os-p4.bin"
    partition = args.playable / PARTITION
    expected = {row["scene"]: row for row in json.loads(args.host.read_text())["cases"]}
    receipt = {"benchmark": digest(candidate), "playable": digest(release), "partition": digest(partition),
               "hostReceipt": digest(args.host), "fixtures": digest(args.benchmark.parent / "main/fixtures.bin")}
    if receipt["playable"] != args.playable_sha256 or partition.read_bytes() != (args.benchmark / PARTITION).read_bytes():
        raise ValueError("Recovery app or benchmark partition failed identity preflight")
    if max(release.stat().st_size, candidate.stat().st_size) >= 0x800000 or len(expected) != 51:
        raise ValueError("Image geometry or host fixture count differs from the experiment")
    if args.preflight:
        print(json.dumps(receipt, indent=2))
        return
    args.output.mkdir(parents=True, exist_ok=False)

    def save():
        (args.output / "physical.json").write_text(json.dumps(receipt, indent=2) + "\n")

    def flash(verb, image, tag):
        after = "no_reset" if verb == "write_flash" else "hard_reset"
        command = [str(args.esptool), "--chip", "esp32p4", "-p", args.port, "-b", "921600",
                   "--after", after, verb, "0x10000", str(image)]
        if verb == "verify_flash":
            command += ["0x8000", str(partition)]
        with (args.output / (tag + ".log")).open("wb") as log:
            subprocess.run(command, check=True, timeout=180, stdout=log, stderr=subprocess.STDOUT)

    with shared.LOCK.open("a") as guard, (args.output / "uart.log").open("wb", buffering=0) as log:
        fcntl.flock(guard, fcntl.LOCK_EX)
        save()

        def hold():
            console = shared.Console(args.port, log)
            try:
                if not any("held between transactions" in l for l in console.command("hold", timeout=16)):
                    raise RuntimeError("Original playable app did not release the controller bus")
            finally:
                console.close()

        hold()
        flash("verify_flash", release, "playable-before")
        hold()
        try:
            flash("write_flash", candidate, "benchmark-write")
            flash("verify_flash", candidate, "benchmark-verify")
            receipt.update(capture(args.port, log, expected))
            save()
            if not receipt["passed"]:
                raise RuntimeError("Board raster trial failed, see the recorded correctness rows")
        finally:
            flash("write_flash", release, "playable-restore")
            flash("verify_flash", release, "playable-restore-verify")
            receipt["restoreReadback"] = True
            save()
            console = shared.Console(args.port, log)
            try:
                receipt["restoredWorlds"] = sorted(name for name in console.health() if name in shared.NATIVE)
                rows = console.command("painter")
                receipt["restoredPainter"] = next(json.loads(row) for row in rows if row.startswith('{"sources"'))
                if not receipt["restoredPainter"]["installed"] or receipt["restoredPainter"]["rejects"]:
                    raise RuntimeError("Restored painter did not install cleanly")
            finally:
                console.close()
                save()


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--benchmark", required=True, type=Path)
    cli.add_argument("--playable", required=True, type=Path)
    cli.add_argument("--playable-sha256", required=True)
    cli.add_argument("--host", required=True, type=Path)
    cli.add_argument("--output", required=True, type=Path)
    cli.add_argument("--esptool", type=Path, default=Path("/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py"))
    cli.add_argument("--port", default="/dev/ttyACM0")
    cli.add_argument("--preflight", action="store_true")

    def interrupted(_sig, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    run(cli.parse_args())
