#!/usr/bin/env python3
"""08-device.py: the Typed arm on the PicoCalc (PICOCALC-CANDELA-TYPED; copied to PICOCALC-CANDELA-KERNEL-CODEGEN), on an experiment image.

usage: python3 -I 08-device.py OUT [--install BUILD] [--peripherals on|off-by-user] COMMAND ...

With --install, flashes BUILD through bench/board/device.install (settle, health) first. Then, under the board lock,
sends each console COMMAND (e.g. "gallery digest B-01 4 psram typed") and waits for its CGAL digest or error record
(or, for commands that print no digest, 5 s). Writes OUT/uart.log, OUT/cgal.jsonl (every CGAL record), and
OUT/compiles.txt (the firmware's "... compile ... us=" lines, boot compiles included). Restore the playable image
afterwards from the main checkout (make restore-playable)."""
import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / "AGENTS.md").exists())
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--install", type=Path)
    ap.add_argument("--peripherals", default="on")
    ap.add_argument("--timeout", type=int, default=1200)
    ap.add_argument("commands", nargs="*")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    if a.install:
        rec = device.install(a.install, a.out / "install", a.peripherals)
        print(json.dumps({"installed": rec["sha256"]}), flush=True)
    cgal = (a.out / "cgal.jsonl").open("a")
    compiles = (a.out / "compiles.txt").open("a")
    with device.acquire(), (a.out / "uart.log").open("ab", buffering=0) as log:
        console = device.Console(device.PORT, log)
        try:
            for cmd in a.commands:
                console.send(cmd)
                wants = cmd.startswith("gallery digest")
                deadline = time.monotonic() + (a.timeout if wants else 5)
                while time.monotonic() < deadline:
                    try:
                        raw = console.line(deadline).decode(errors="replace").strip()
                    except TimeoutError:
                        break
                    if " compile " in raw and "us=" in raw:
                        compiles.write(raw + "\n"); compiles.flush(); print(raw, flush=True)
                    if raw.startswith("CGAL {"):
                        r = json.loads(raw[5:])
                        r["command"] = cmd
                        cgal.write(json.dumps(r) + "\n"); cgal.flush()
                        print(json.dumps(r), flush=True)
                        if wants and r.get("ev") in ("digest", "error"):
                            break
                    elif "Guru Meditation" in raw or "abort()" in raw:
                        print("CRASH", raw, flush=True)
        finally:
            console.close()


if __name__ == "__main__":
    main()
