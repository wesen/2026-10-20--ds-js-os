"""Write a verified playable app into slot 0x10000 and confirm its eight worlds.

Used when the running firmware cannot quiesce, for example after a failed
install. The supplied build directory must hold the app and partition table
whose digests check_build accepts. Only the app slot is written.
"""
import argparse
from pathlib import Path
import sys

ticket = Path(__file__).resolve().parents[1]
repo = next(p for p in ticket.parents if (p / ".git").exists())
previous = next((repo / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*"))
sys.path.insert(0, str(previous / "scripts/device"))
from board_common import acquire, check_build, health, release, save

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", default="/dev/ttyACM0")
parser.add_argument("--restore", type=Path, required=True)
parser.add_argument("--restore-sha", required=True)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
check_build(args.restore, args.restore_sha)
args.out.mkdir(parents=True, exist_ok=False)
with acquire(), (args.out / "uart.log").open("wb", buffering=0) as log:
    release.esp("write_flash", args.restore, args.out, "restore-write", args.port)
    release.esp("verify_flash", args.restore, args.out, "restore-verify", args.port)
    console = release.unit.Console(args.port, log)
    try:
        save(args.out / "after.json", {"sha256": args.restore_sha, "health": health(console)})
    finally:
        console.close()
print((args.out / "after.json").read_text())
