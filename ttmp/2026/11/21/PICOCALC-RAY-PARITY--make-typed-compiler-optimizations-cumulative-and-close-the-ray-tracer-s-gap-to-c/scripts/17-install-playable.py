#!/usr/bin/env python3
"""Install a playable firmware build on the PicoCalc and make it the restore target.
usage: python3 17-install-playable.py BUILD_DIR OUT [--peripherals on|off-by-user] [--port /dev/ttyACM0]
Checks the build's partition table and size, writes and verifies the app slot under the board lock,
records the worlds' health (with the keyboard and display "off by user" when the user has switched them
off, using PICOCALC-CANDELA-WORLD's board_health), and then writes "BUILD_DIR SHA256" to
/tmp/picocalc-current-playable.txt, which every later experiment restores to. The user allows installing
the latest firmware at any time (2026-11-22)."""
import argparse, json, sys, time
from pathlib import Path
ticket = Path(__file__).resolve().parents[1]
repo = next(p for p in ticket.parents if (p / ".git").exists())
sys.path.insert(0, str(next((repo / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*")) / "scripts/device"))
sys.path.insert(0, str(next((repo / "ttmp/2026/11/21").glob("PICOCALC-CANDELA-WORLD--*")) / "scripts/lib"))
from board_common import acquire, check_build, release, save  # noqa: E402
from board_health import board_health  # noqa: E402
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("build", type=Path)
parser.add_argument("out", type=Path)
parser.add_argument("--peripherals", choices=("on", "off-by-user"), default="on")
parser.add_argument("--port", default="/dev/ttyACM0")
parser.add_argument("--health-only", action="store_true", help="the build is already written: only wait, check and record")
args = parser.parse_args()
build = args.build.resolve()
sha = release.sha(build / release.APP)
check_build(build, sha)
args.out.mkdir(parents=True, exist_ok=False)
def settle(console, limit=60):
    # Boot compiles run for seconds after a reset (Chess about 3.8 s); worlds read "restarting" until
    # they start. board_health with the peripherals off takes one snapshot, so wait here first.
    deadline = time.monotonic() + limit
    while True:
        lines = console.command("worlds", timeout=10)
        worlds = next(json.loads(l) for l in lines if l.startswith('[{"name":'))
        waiting = [w["name"] for w in worlds if w["name"] in release.unit.NATIVE and w.get("state") == "restarting"]
        if not waiting or time.monotonic() >= deadline:
            return waiting
        time.sleep(1)


with acquire(), (args.out / "uart.log").open("wb", buffering=0) as log:
    if not args.health_only:
        release.esp("write_flash", build, args.out, "install-write", args.port)
        release.esp("verify_flash", build, args.out, "install-verify", args.port)
    console = release.unit.Console(args.port, log)
    try:
        print("still restarting after the wait:", settle(console))
        save(args.out / "after.json", {"build": str(build), "sha256": sha, "health": board_health(console, args.peripherals)})
    finally:
        console.close()
Path("/tmp/picocalc-current-playable.txt").write_text(f"{build} {sha}\n")
print((args.out / "after.json").read_text())
print("restore target:", build, sha)
