#!/usr/bin/env python3
"""One probe boot of an experiment image (the playable profile after the nucleus split), under the serial lock.

usage: python3 10-probe-boot.py BUILD OUT [--peripherals on|off-by-user]

Flashes BUILD's app with bench/board/device.install (write, verify, settle, health), which does not touch
firmware/PLAYABLE.json. Afterwards run `make restore-playable` to put the recorded playable image back.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("build", type=Path)
p.add_argument("out", type=Path)
p.add_argument("--peripherals", default="on", choices=("on", "off-by-user"))
p.add_argument("--health-only", action="store_true", help="BUILD is already on the board: only check it")
a = p.parse_args()
info = json.loads((a.build / "picocalc-build.json").read_text())
assert info["profile"] == "playable", info
print("probing", info["profile"], info["commit"], info["app"][:12], "peripherals", a.peripherals, flush=True)
record = device.install(a.build, a.out, a.peripherals, health_only=a.health_only)
print(json.dumps(record["health"], indent=1)[:2000])
print("probe boot healthy:", record["sha256"][:12])
