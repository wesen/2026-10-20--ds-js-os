"""Time a standalone factory app, then verify and reboot the identified playable app.

Esptool writes application slot 0x10000 only. The mounted board's partition
table and the entire supplied restore image must pass verify_flash first.
Passing --probe only asks the running normal firmware to report health.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

from serial import Serial

ticket = Path(__file__).resolve().parents[2]
repo = next(p for p in ticket.parents if (p / ".git").exists())
previous = next((repo / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*"))
sys.path.insert(0, str(previous / "scripts/device"))
from board_common import acquire, check_build, health, release, save

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", default="/dev/ttyACM0")
parser.add_argument("--restore", type=Path, required=True)
parser.add_argument("--restore-sha", required=True)
parser.add_argument("--app", type=Path)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--probe", action="store_true")
parser.add_argument("--deadline", type=float, default=190)
args = parser.parse_args()
check_build(args.restore, args.restore_sha)
args.out.mkdir(parents=True, exist_ok=False)
with acquire(), (args.out / "uart.log").open("wb", buffering=0) as log:
    def connect():
        return release.unit.Console(args.port, log)
    def espcmd(op, build, tag):
        release.esp(op, build, args.out, tag, args.port)
    console = connect()
    try:
        save(args.out/"before.json", health(console))
    finally:
        console.close()
    if args.probe:
        sys.exit(0)
    if not args.app or not args.app.is_file():
        raise SystemExit("A built diagnostic app is required")
    console = connect()
    release.hold(console)
    espcmd("verify_flash", args.restore, "verified-prior")
    # verify_flash hard resets the board. Request the normal quiescent point
    # again so outstanding storage operations finish before flashing.
    console=connect()
    health(console)
    release.hold(console)
    try:
        with (args.out/"trial-write.log").open("wb") as f:
            subprocess.run([release.ESP,"--chip","esp32p4","-p",args.port,"-b","921600",
                            "--after","no_reset","write_flash","0x10000",str(args.app)],
                           check=True,stdout=f,stderr=subprocess.STDOUT,timeout=120)
        with (args.out/"trial-verify.log").open("wb") as f:
            subprocess.run([release.ESP,"--chip","esp32p4","-p",args.port,"-b","921600",
                            "--after","hard_reset","verify_flash","0x10000",str(args.app)],
                           check=True,stdout=f,stderr=subprocess.STDOUT,timeout=120)
        deadline = time.monotonic()+args.deadline
        began = False
        with Serial(args.port,115200,timeout=.3) as stream, (args.out/"bench.log").open("wb",buffering=0) as out:
            while time.monotonic()<deadline:
                line=stream.readline()
                if not line:
                    continue
                out.write(line)
                if b"SIMDLAB BEGIN" in line:
                    began=True
                elif b"SIMDLAB END" in line and began:
                    break
                elif b"Guru Meditation" in line or b"assert failed" in line:
                    raise RuntimeError(line.decode(errors="replace").strip())
            else:
                raise TimeoutError("no SIMDLAB END; inspect bench.log")
        save(args.out/"image.json",{"sha256":hashlib.sha256(args.app.read_bytes()).hexdigest(),
                                    "bytes":args.app.stat().st_size,"port":args.port})
    finally:
        espcmd("write_flash",args.restore,"restore-write")
        espcmd("verify_flash",args.restore,"restore-verify")
        console=connect()
        try:
            save(args.out/"after.json",{"sha256":args.restore_sha,"health":health(console)})
        finally:
            console.close()
