"""Record the health of the firmware now running on the PicoCalc, under the serial lock, without flashing.

usage: python3 12-after-health.py --out FILE.json [--port /dev/ttyACM0] [--peripherals on|off-by-user]

For a run whose final health check could not complete (the user switched the keyboard and display off while the
playable app was being restored): records which app /tmp/picocalc-current-playable.txt names, and the board's health
by lib/board_health.py, with keyboard and display recorded as "off by user" when asked.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from board_health import board_health, release  # noqa: E402
from board_common import acquire, save  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--out", type=Path, required=True)
ap.add_argument("--port", default="/dev/ttyACM0")
ap.add_argument("--peripherals", choices=("on", "off-by-user"), default="off-by-user")
a = ap.parse_args()
with acquire(), (a.out.parent / (a.out.stem + ".uart.log")).open("ab", buffering=0) as log:
    restore_dir, restore_sha = Path("/tmp/picocalc-current-playable.txt").read_text().split()
    console = release.unit.Console(a.port, log)
    try:
        save(a.out, {"sha256": restore_sha, "build": restore_dir, "health": board_health(console, a.peripherals)})
    finally:
        console.close()
print(json.dumps(json.loads(a.out.read_text()), indent=1)[:1500])
