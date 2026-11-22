#!/usr/bin/env python3
"""10-strip-shots.py: drop the screen captures' base64 lines from a run's uart.log, keeping everything else.

usage: python3 -I 10-strip-shots.py RUN_DIR

Each "shot" streams the framebuffer's RLE as base64 lines between "#SHOT 320 320" and "#END <crc32> <runs>"; the run
script decodes them into scene-<ID>.png and checks the CRC (run.json "shots"). The lines are 80-90% of the log.
This keeps the #SHOT and #END lines, replaces the data between them by one line "#SHOT-DATA <n> lines stripped",
and leaves every other byte as it was. Writes uart.log in place, after checking that every capture in run.json has
its PNG."""
import json
import re
import sys
from pathlib import Path

B64 = re.compile(rb"^[A-Za-z0-9+/]+=*\r?$")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    run = Path(sys.argv[1])
    shots = json.loads((run / "run.json").read_text()).get("shots", {})
    for label in shots:
        name = label if label in ("boot", "end") else f"scene-{label}"
        assert (run / f"{name}.png").is_file(), name
    log = run / "uart.log"
    lines = log.read_bytes().split(b"\n")
    out, inside, n, stripped = [], False, 0, 0
    for line in lines:
        if line.startswith(b"#SHOT "):
            inside, n = True, 0
            out.append(line)
        elif inside and line.startswith(b"#END "):
            out.append(f"#SHOT-DATA {n} lines stripped (the capture is the PNG beside this log)".encode())
            out.append(line)
            inside = False
            stripped += n
        elif inside and B64.match(line):
            n += 1
        else:
            out.append(line)
    before = log.stat().st_size
    log.write_bytes(b"\n".join(out))
    print(f"{log}: {stripped} base64 lines stripped, {before} -> {log.stat().st_size} bytes")


if __name__ == "__main__":
    main()
