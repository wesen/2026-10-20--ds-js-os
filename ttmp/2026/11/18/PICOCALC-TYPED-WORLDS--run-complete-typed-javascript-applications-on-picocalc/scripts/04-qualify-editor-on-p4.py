#!/usr/bin/env python3
"""Flash and compare the typed Editor workflow on the physical PicoCalc."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess

TICKETS = Path(__file__).resolve().parents[2]
FILES = next(TICKETS.glob("PICOCALC-TYPED-APPS--*")) / "scripts"
BOARD = runpy.run_path(str(FILES / "06-qualify-files-on-p4.py"))
EXPECTED = "# Sample\n- one\n- two\n"


def validate_pair(args):
    table = (args.backup / "partition-table.bin").read_bytes()
    original = args.backup / "factory-original.bin"
    if original.stat().st_size != 0x800000:
        raise RuntimeError("the existing 8 MiB app backup is required")
    if (args.images / "wasm/sdkconfig").read_bytes() != (args.images / "rv32/sdkconfig").read_bytes():
        raise RuntimeError("the paired images have different SDK configurations")
    for kind in ("editor", "files", "agenda"):
        bundles = []
        for target, engine in (("wasm", "wasm"), ("rv32", "native")):
            directory = args.images / target
            if table != (directory / "partition-table.bin").read_bytes():
                raise RuntimeError("the test image has a different partition table")
            manifest = json.loads((directory / f"system.typed-{kind}.json").read_text())
            world = next(w for w in manifest["worlds"] if w["name"] == "editor")
            if world.pop("engine") != engine or world["file"] != "editor/compiled.bin" or world.get("claims"):
                raise RuntimeError(f"unexpected Editor entry for {target}")
            bundles.append(manifest)
        if bundles[0] != bundles[1]:
            raise RuntimeError(f"manifests differ outside Editor in {kind}")
    return original


def qualify(args, target, engine):
    output = args.output / target
    output.mkdir()
    image = args.images / target / "picocalc-os-p4.bin"
    BOARD["flash"](args, output, image, target)

    def capture(name, duration, commands, screenshots=False):
        return BOARD["capture"](args.port, output, name, duration, commands, screenshots=screenshots)

    boot = capture("boot", 18, ["6 reboot", "15 worlds"])
    matches = re.findall(r"editor compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)", boot)
    loads = re.findall(rf"boot-world name=editor engine={engine} first_us=(\d+) total_us=(\d+)", boot)
    if not matches or not loads or "#OK worlds" not in boot:
        raise RuntimeError(f"{target}: the typed Editor boot or console check failed")
    directory = f"typed-editor-check-{target}"
    preflight = capture("preflight", 1.5, [f"0.3 ls {directory}"])
    if f"no directory {directory}\n#OK ls" not in preflight:
        raise RuntimeError(f"{target}: the scratch directory is unavailable or already exists")
    file = directory + "/entry.md"
    commands = [
        "0.4 key f1", "1.1 key d", "1.9 key f3", f"2.6 type {directory}", "5 key enter",
        "5.8 key enter", "6.7 key f2", "7.4 type entry.md", "8.5 key enter", "9.5 type # Sample",
        "10.8 key enter", "11.5 type - one", "12.4 key enter", "13.1 type two", "13.9 key f2",
        f"15 cat {file}", "15.8 key f3", "16.5 type two", "17.3 key enter", "18.2 shot",
        "23 key f6", "23.8 shot", "28.5 key f6", "29.4 type X", "30.2 key esc", "31 key esc",
        f"32 cat {file}", f"32.4 ls {directory}", "33 key f5", "33.8 key f5", "34.6 key backspace", "35.4 key f5",
        "36.2 key f5", f"37.3 ls {directory}", "38 stats",
    ]
    run = capture("workflow", 41, commands, screenshots=True)
    if run.count(EXPECTED + "#OK cat") != 2 or f"no directory {directory}\n#OK ls" not in run:
        raise RuntimeError(f"{target}: saved bytes or scratch cleanup failed")
    if not re.search(rf"^\s+entry\.md +{len(EXPECTED) - 1}\n#OK ls$", run, re.M):
        raise RuntimeError(f"{target}: the saved file has the wrong exact byte length")
    if re.search(r"editor crashed|typed world .* rejected", run):
        raise RuntimeError(f"{target}: Editor reported a runtime failure")
    screenshots = (output / "workflow-capture.log").read_text(errors="replace")
    if screenshots.count("crc ok") != 2:
        raise RuntimeError(f"{target}: did not capture both search and Markdown preview")
    buses = {bus: (int(transfers), int(errors)) for bus, transfers, errors in re.findall(
        r"bus (i2c0|spi2) +busy +[\d.]+ ms, (\d+) transfers, \d+ bytes, (\d+) errors", run)}
    if set(buses) != {"i2c0", "spi2"} or any(not transfers or errors for transfers, errors in buses.values()):
        raise RuntimeError(f"{target}: unexpected bus health {buses}")
    return {
        "image_sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
        "compiles": [dict(zip(("us", "peak_js_bytes", "module_bytes"), map(int, sample))) for sample in matches],
        "loads": [dict(zip(("start_after_agenda_compile_us", "loader_us"), map(int, sample))) for sample in loads],
        "workflow": "pass", "buses": buses,
        "shots": {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
                  for name in ("shot-1.png", "shot-2.png")},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    for name in ("images", "output", "esptool-python", "esptool", "backup"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    original = validate_pair(args)
    args.output.mkdir()
    results = {}
    try:
        for target, engine in (("wasm", 1), ("rv32", 2)):
            results[target] = qualify(args, target, engine)
            (args.output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    except (OSError, RuntimeError, subprocess.CalledProcessError):
        BOARD["flash"](args, args.output, original, "restore")
        raise


if __name__ == "__main__":
    main()
