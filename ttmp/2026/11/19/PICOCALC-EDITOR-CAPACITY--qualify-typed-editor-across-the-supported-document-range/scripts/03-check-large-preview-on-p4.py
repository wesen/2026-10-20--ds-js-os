#!/usr/bin/env python3
"""Exercise preview EOF over real PicoCalc input, filesystem and display."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import runpy
import time

from serial import Serial

TICKETS = Path(__file__).resolve().parents[2]
AUTOMATION = next((TICKETS.parent / "18").glob("PICOCALC-TYPED-APPS--*")) / "scripts"
BOARD = runpy.run_path(str(AUTOMATION / "06-qualify-files-on-p4.py"))
DIRECTORY = "typed-preview-window-check"
FILE = f"{DIRECTORY}/entry.md"
FIXTURE = b"A reading paragraph, followed by a blank line.\n\n" * 450 + b"END OF PREVIEW"

def stage_document(port, log, file=FILE, fixture=FIXTURE):
    # Pace each command and validate its offset before writing the next.
    # A missed UART fragment would otherwise make the remaining offsets wrong.
    with Serial(port, 115200, timeout=0.1) as uart:
        uart.reset_input_buffer()
        for offset in range(-560, len(fixture), 560):
            chunk = fixture[offset:offset + 560] if offset >= 0 else b""
            suffix = b" " + base64.b64encode(chunk) if chunk else b""
            command = b"\nput " + file.encode("ascii") + suffix + b"\n"
            for start in range(0, len(command), 48):
                uart.write(command[start:start + 48])
                uart.flush()
                time.sleep(0.008)
            receipt = b""
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and not receipt.endswith(b"#OK put\r\n"):
                receipt += uart.readline()
            log.write(receipt)
            log.flush()
            expected = max(0, offset + len(chunk))
            if f"put {file}: {expected} bytes".encode("ascii") not in receipt:
                raise RuntimeError(f"scratch upload failed at byte {expected}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--engine", choices=("native", "wasm"), required=True)
    parser.add_argument("--resume-staging", action="store_true",
                        help="retry upload after a staging failure with the same clean scratch Editor open")
    args = parser.parse_args()
    args.output.mkdir()

    def capture(label, duration, commands, shots=False):
        return BOARD["capture"](args.port, args.output, label, duration, commands, screenshots=shots)

    missing = f"no directory {DIRECTORY}\n#OK ls"
    preflight = capture("preflight", 1.8, ["0.3 worlds", f"1 ls {DIRECTORY}"])
    worlds = next(json.loads(line) for line in preflight.splitlines() if line.startswith('[{"name":'))
    editor = next(world for world in worlds if world["name"] == "editor")
    if editor["engine"] != args.engine or editor["file"] != "editor/compiled.bin":
        raise RuntimeError("the handheld is running a different Editor")
    if args.resume_staging and "  entry.md " not in preflight:
        raise RuntimeError("no existing scratch document to retry")
    if not args.resume_staging:
        if missing not in preflight:
            raise RuntimeError("scratch directory is busy or unavailable")
        setup = capture("setup", 10.2, [
            "0.4 key f1", "1.1 key d", "1.9 key f3", f"2.6 type {DIRECTORY}", "5 key enter",
            "5.8 key enter", "6.7 key f2", "7.4 type entry.md", "8.5 key enter", f"9.4 ls {DIRECTORY}",
        ])
        if missing in setup or "#OK ls" not in setup:
            raise RuntimeError("scratch directory was not created by Files")

    with (args.output / "stage.log").open("wb") as log:
        stage_document(args.port, log)

    run = capture("preview", 43, [
        "0.3 key esc", "1.2 key enter", "3 key f6", "4.5 shot",
        *(f"{8 + 0.51 * i:.2f} key pgdn" for i in range(57)), "38.4 shot", "42 stats",
    ], shots=True)
    if any("editor crashed" in line or ("typed world" in line and "rejected" in line)
           for line in run.splitlines()):
        raise RuntimeError("Editor reported a runtime failure")
    screenshots = (args.output / "preview-capture.log").read_text(errors="replace")
    if screenshots.count("crc ok") != 2:
        raise RuntimeError("expected two verified framebuffer captures")

    cleaned = capture("cleanup", 8, [
        "0.4 key esc", "1.1 key esc", "1.8 key f5", "2.5 key f5", "3.3 key backspace",
        "4.1 key f5", "4.9 key f5", f"6.2 ls {DIRECTORY}",
    ])
    if missing not in cleaned:
        raise RuntimeError("scratch cleanup did not remove the test directory")
    result = {
        "input_bytes": len(FIXTURE),
        "engine": editor["engine"],
        "page_down_keys": 57,
        "faults": [],
        "scratch_removed": True,
        "screenshots": {
            name: hashlib.sha256((args.output / name).read_bytes()).hexdigest()
            for name in ("shot-1.png", "shot-2.png")
        },
    }
    (args.output / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
