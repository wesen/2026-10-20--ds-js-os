#!/usr/bin/env python3
"""Run an isolated Files workflow on a matched pair of PicoCalc application images."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

CAPTURE = Path(__file__).resolve().parents[6] / "picocalc-os/tools/p4cap.py"
CONTENTS = "p4 files parity"
FIXTURE = "typed-file-check"


def capture(port, output, name, duration, commands, *, screenshots=False):
    options = [part for command in commands for part in ("-c", command)]
    if screenshots:
        options += ["--shot-dir", str(output)]
    with (output / f"{name}.log").open("wb") as log, (output / f"{name}-capture.log").open("wb") as err:
        subprocess.run([sys.executable, CAPTURE, "-p", port, "--no-reset", "-s", str(duration), *options],
                       stdout=log, stderr=err, check=True)
    raw = (output / f"{name}.log").read_bytes()
    return raw.decode(errors="replace").replace("\r\n", "\n")


def flash(args, output, image, label):
    hold = capture(args.port, output, f"{label}-hold", 1.5, ["0.2 hold"])
    if "i2c0 held between transactions" not in hold or "#OK hold" not in hold:
        raise RuntimeError(f"{label}: keyboard bus did not acknowledge hold")
    with (output / f"{label}-flash.log").open("wb") as log:
        subprocess.run([args.esptool_python, args.esptool, "--chip", "esp32p4", "-p", args.port,
                        "-b", "921600", "write_flash", "0x10000", image],
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    if b"Hash of data verified" not in (output / f"{label}-flash.log").read_bytes():
        raise RuntimeError(f"{label}: flash hash verification missing")


def qualify(args, target, directory):
    output = args.output / target
    output.mkdir()
    image = args.images / target / "picocalc-os-p4.bin"
    flash(args, output, image, target)
    boot = capture(args.port, output, "boot", 10, ["0.6 reboot", "7 worlds"])
    compile_entry = re.search(r"files compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)", boot)
    if not compile_entry:
        raise RuntimeError(f"{target}: Files compile completion missing")
    expected = 24400 if target == "rv32" else 49089
    if int(compile_entry[3]) != expected:
        raise RuntimeError(f"{target}: unexpected Files module size {compile_entry[3]}, expected {expected}")
    pre = capture(args.port, output, "preflight", 1.5, [f"0.3 ls {directory}"])
    if f"no directory {directory}\n#OK ls" not in pre:
        raise RuntimeError(f"{target}: fixture path is unavailable or already exists")
    old, new = f"{directory}/a", f"{directory}/b"
    keys = [
        "0.4 key f1", "1.1 key d", "1.9 key f3", f"2.6 type {directory}", "4.6 key enter",
        "5.6 key enter", "6.5 key f2", "7.2 type a", "7.9 key enter", f"9.1 type {CONTENTS}",
        "11.0 key f2", f"12.0 cat {old}", "12.9 key esc", "13.6 key f4", "14.3 key backspace",
        "15.0 type b", "15.7 key enter", f"16.6 cat {new}", "17.2 shot",
        "21.5 key f5", f"22.2 cat {new}", "23 key f5", f"23.8 cat {new}",
        "24.6 key backspace", "25.4 key f5", "26.1 key f5", f"27 ls {directory}", "28 stats",
    ]
    report = capture(args.port, output, "workflow", 30, keys, screenshots=True)
    if report.count(f"{CONTENTS}\n#OK cat") != 3:
        raise RuntimeError(f"{target}: create/save, rename, or first F5 readback failed")
    if f"no file {new}\n#OK cat" not in report or f"no directory {directory}\n#OK ls" not in report:
        raise RuntimeError(f"{target}: confirmed deletion or directory cleanup failed")
    if "crc ok" not in (output / "workflow-capture.log").read_text(errors="replace"):
        raise RuntimeError(f"{target}: no CRC-checked screenshot")
    buses = {bus: (int(count), int(errors)) for bus, count, errors in re.findall(
        r"bus (i2c0|spi2) +busy +[\d.]+ ms, (\d+) transfers, \d+ bytes, (\d+) errors", report)}
    if buses.keys() != {"i2c0", "spi2"} or any(count == 0 or errors for count, errors in buses.values()):
        raise RuntimeError(f"{target}: unhealthy bus counters {buses}")
    return {"compile_us": int(compile_entry[1]), "peak_js_bytes": int(compile_entry[2]),
            "module_bytes": int(compile_entry[3]), "workflow": "pass", "buses": buses}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    for name in ("images", "output", "esptool-python", "esptool", "backup"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    table = args.backup / "partition-table.bin"
    original = args.backup / "factory-original.bin"
    if original.stat().st_size != 0x800000 or any(
        table.read_bytes() != (args.images / target / "partition-table.bin").read_bytes()
        for target in ("rv32", "wasm")
    ):
        raise SystemExit("board backup does not match the two test partition tables")
    args.output.mkdir()
    results = {}
    try:
        for target in ("wasm", "rv32"):
            directory = FIXTURE + "-" + target
            results[target] = qualify(args, target, directory)
            (args.output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    except (OSError, RuntimeError, subprocess.CalledProcessError):
        flash(args, args.output, original, "restore")
        raise


if __name__ == "__main__":
    main()
