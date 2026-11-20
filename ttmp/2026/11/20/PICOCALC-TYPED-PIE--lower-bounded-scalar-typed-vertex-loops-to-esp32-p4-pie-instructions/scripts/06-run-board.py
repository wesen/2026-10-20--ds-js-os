#!/usr/bin/env python3
"""Measure the three kernels and put the attested playable application back."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import time

import serial

HERE = Path(__file__).resolve().parent
TICKETS = HERE.parents[1]
SNAKE = next(TICKETS.glob("PICOCALC-SNAKE-INTEGRATION--*/scripts/device/01-normal-snake.py"))
spec = importlib.util.spec_from_file_location("playable_console", SNAKE)
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
PARTITION = Path("partition_table/partition-table.bin")
COUNTS = {1, 7, 8, 9, 17, 64, 256, 1024}
ARMS = {"stock", "portable", "pie"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capture(port, log):
    with serial.Serial(port, 115200, timeout=0.1) as uart:
        deadline = time.monotonic() + 45
        cases, cycles = {}, {}
        while time.monotonic() < deadline:
            line = uart.readline()
            log.write(line)
            fields = line.decode(errors="replace").split()
            if fields == ["PIE_BEGIN"]:
                cases, cycles = {}, {}
            elif fields and fields[0] == "PIE_CASE":
                _, arm, count, variant, crc, result = fields
                cases[arm, int(count), int(variant)] = {"crc32": crc, "status": result}
            elif fields and fields[0] == "PIE_CYCLES":
                _, arm, count, lo, mid, hi = fields
                cycles[arm, int(count)] = {"min": int(lo), "median": int(mid), "max": int(hi)}
            elif fields and fields[0] == "PIE_DONE":
                expected_cases = {(arm, count, k) for arm in ARMS for count in COUNTS for k in range(3)}
                expected_cycles = {(arm, count) for arm in ARMS for count in COUNTS}
                if set(cases) != expected_cases or set(cycles) != expected_cycles:
                    continue   # we may have joined a pass midstream
                return {
                    "passed": fields[1] == "ok" and all(row["status"] == "ok" for row in cases.values()),
                    "cases": [dict(arm=a, vertices=n, variant=k, **v) for (a, n, k), v in sorted(cases.items())],
                    "cyclesPerCall": [dict(arm=a, vertices=n, **v) for (a, n), v in sorted(cycles.items())],
                }
    raise TimeoutError("No complete PIE benchmark pass appeared on the console")


def run(args):
    experiment = args.benchmark / "typed_pie_experiment.bin"
    playable = args.playable / "picocalc-os-p4.bin"
    partition = args.playable / PARTITION
    receipt = {
        "benchmark": digest(experiment),
        "playable": digest(playable),
        "partition": digest(partition),
        "compiled": {a: json.loads((args.benchmark.parent / f"{a}.json").read_text()) for a in sorted(ARMS)},
        "kernelSHA256": {a: digest(args.benchmark.parent / "main" / f"{a}.bin") for a in sorted(ARMS)},
    }
    if receipt["playable"] != args.playable_sha256:
        raise ValueError("Playable recovery image failed its SHA256 check")
    if partition.read_bytes() != (args.benchmark / PARTITION).read_bytes():
        raise ValueError("Benchmark partition table differs from playable firmware")
    if max(experiment.stat().st_size, playable.stat().st_size) >= 0x800000:
        raise ValueError("Application image exceeds the factory partition")
    if args.preflight:
        print(json.dumps(receipt, indent=2))
        return

    args.output.mkdir(parents=True, exist_ok=False)
    def record():
        (args.output / "physical.json").write_text(json.dumps(receipt, indent=2) + "\n")

    def esp(verb, image, tag):
        after = "no_reset" if verb == "write_flash" else "hard_reset"
        cmd = [str(args.esptool), "--chip", "esp32p4", "-p", args.port, "-b", "921600",
               "--after", after, verb, "0x10000", str(image)]
        if verb == "verify_flash":
            cmd += ["0x8000", str(partition)]
        with (args.output / (tag + ".log")).open("wb") as log:
            subprocess.run(cmd, check=True, timeout=180, stdout=log, stderr=subprocess.STDOUT)

    def interrupt(_signal, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupt)
    with shared.LOCK.open("a") as guard, (args.output / "uart.log").open("wb", buffering=0) as log:
        fcntl.flock(guard, fcntl.LOCK_EX)
        record()
        def hold():
            console = shared.Console(args.port, log)
            try:
                if not any("held between transactions" in row for row in console.command("hold", timeout=16)):
                    raise RuntimeError("Playable drivers did not acknowledge hold")
            finally:
                console.close()

        hold()
        esp("verify_flash", playable, "playable-before")
        hold()
        try:
            esp("write_flash", experiment, "benchmark-write")
            esp("verify_flash", experiment, "benchmark-verify")
            receipt.update(capture(args.port, log))
            record()
            if not receipt["passed"]:
                raise RuntimeError("One or more board correctness cases failed")
        finally:
            esp("write_flash", playable, "playable-restore")
            esp("verify_flash", playable, "playable-restore-verify")
            receipt["restoreReadback"] = True
            record()
            console = shared.Console(args.port, log)
            try:
                worlds = console.health()
                lines = console.command("painter")
                painter = next(json.loads(line) for line in lines if line.startswith('{"sources"'))
                receipt["restoredWorlds"] = sorted(worlds)
                receipt["restoredPainter"] = painter
                record()
            finally:
                console.close()


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--benchmark", required=True, type=Path)
    cli.add_argument("--playable", required=True, type=Path)
    cli.add_argument("--playable-sha256", required=True)
    cli.add_argument("--output", required=True, type=Path)
    cli.add_argument("--esptool", required=True, type=Path)
    cli.add_argument("--port", default="/dev/ttyACM0")
    cli.add_argument("--preflight", action="store_true")
    run(cli.parse_args())
