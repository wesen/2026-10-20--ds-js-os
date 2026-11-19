#!/usr/bin/env python3
"""Find a dense miss and a hit at EOF in one 64 KiB PicoCalc document."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy

PREVIEW = runpy.run_path(str(Path(__file__).with_name("03-check-large-preview-on-p4.py")))
BOARD = PREVIEW["BOARD"]
DIRECTORY = "typed-search-window-check"
FILE = f"{DIRECTORY}/entry.txt"
FIXTURE = (b"text " * 15 + b"\r\n") * 851 + b"needlezzz"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--engine", choices=("native", "wasm"), required=True)
    parser.add_argument("--navigation", action="store_true", help="also edit, save and reopen at the last line")
    args = parser.parse_args()
    args.output.mkdir()

    def capture(label, duration, commands, shots=False):
        return BOARD["capture"](args.port, args.output, label, duration, commands, screenshots=shots)

    missing = f"no directory {DIRECTORY}\n#OK ls"
    preflight = capture("preflight", 1.8, ["0.3 worlds", f"1 ls {DIRECTORY}"])
    if missing not in preflight:
        raise RuntimeError("scratch directory is busy or unavailable")
    worlds = next(json.loads(line) for line in preflight.splitlines() if line.startswith('[{"name":'))
    editor = next(world for world in worlds if world["name"] == "editor")
    if editor["engine"] != args.engine or editor["file"] != "editor/compiled.bin":
        raise RuntimeError("the handheld is running a different Editor")
    setup = capture("setup", 10.6, [
        "0.4 key f1", "1.1 key d", "1.9 key f3", f"2.6 type {DIRECTORY}", "5 key enter",
        "5.8 key enter", "6.7 key f2", "7.4 type entry.txt", "8.5 key enter", f"9.8 ls {DIRECTORY}",
    ])
    if missing in setup or "#OK ls" not in setup:
        raise RuntimeError("scratch directory was not created by Files")

    with (args.output / "stage.log").open("wb") as log:
        PREVIEW["stage_document"](args.port, log, FILE, FIXTURE)
    commands = [
        "0.3 key esc", "1.2 key enter", "4 key f3", "4.8 type text text z", "6.3 key enter",
        "9 shot", "13 key f3", "13.8 key esc", "14.6 key f3", "15.4 type needle", "16.5 key enter",
        "19 shot", "23.5 key f4",
    ]
    duration = 27
    shot_count = 2
    saved_bytes = len(FIXTURE.replace(b"\r\n", b"\n")) + 1
    if args.navigation:
        commands.extend([
            "25 key right", "25.8 key up", "26.6 key pgup", "27.4 key pgup", "28.2 key pgup",
            "30 key f4", "32 key backspace", "32.8 key enter", "33.6 key end", "34.4 type !",
            "35.2 key f2", f"37 ls {DIRECTORY}", "37.8 shot",
            "42.5 key esc", "43.4 key enter", "47 shot",
        ])
        duration = 54
        shot_count = 4
    commands.append(f"{duration - 1} stats")
    run = capture("search", duration, commands, shots=True)
    if args.navigation and not re.search(rf"^  entry\.txt +{saved_bytes}\n#OK ls$", run, re.M):
        raise RuntimeError("the saved document length does not match the fixture")
    if any("editor crashed" in line or ("typed world" in line and "rejected" in line)
           for line in run.splitlines()):
        raise RuntimeError("Editor reported a runtime failure")
    screenshots = (args.output / "search-capture.log").read_text(errors="replace")
    if screenshots.count("crc ok") != shot_count:
        raise RuntimeError("unexpected number of verified framebuffer captures")
    cleanup = capture("cleanup", 8, [
        "0.4 key esc", "1.2 key f5", "2 key f5", "3.3 key backspace",
        "4.1 key f5", "4.9 key f5", f"6.2 ls {DIRECTORY}",
    ])
    if missing not in cleanup:
        raise RuntimeError("scratch cleanup did not remove the test directory")
    receipt = {
        "input_bytes": len(FIXTURE),
        "engine": editor["engine"],
        "faults": [],
        "scratch_removed": True,
        "screenshots": {
            name: hashlib.sha256((args.output / name).read_bytes()).hexdigest()
            for name in (f"shot-{i + 1}.png" for i in range(shot_count))
        },
    }
    if args.navigation:
        receipt["saved_bytes"] = saved_bytes
    (args.output / "results.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
