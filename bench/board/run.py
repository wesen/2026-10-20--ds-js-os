#!/usr/bin/env python3
"""Run a built board study on the PicoCalc and put the playable firmware back.

usage: python3 bench/board/run.py OUT CAPTURE [--peripherals on|off-by-user] [--deadline SECONDS]
       python3 bench/board/run.py --probe CAPTURE     check everything a run needs, without flashing

OUT is a directory built by build.sh (the app is OUT/build/simd-lab.bin); CAPTURE is a new directory for the raw
capture. The playable image is the one picocalc-os/PLAYABLE.json records, from the store: the run refuses to start
unless the stored files match the recorded digests. It checks the playable firmware's health, writes the study app,
captures its output until SIMDLAB END, then rewrites and verifies the playable image and checks its health again
(CAPTURE/{before,image,after}.json, bench.log, uart.log and the esptool logs).
--probe checks that the store holds the recorded playable files, that the board answers on its port under the
lock, and that the running firmware is the recorded one and healthy (CAPTURE/probe.json).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import device  # noqa: E402
import playable  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("out", type=Path, nargs="?")
parser.add_argument("capture", type=Path)
parser.add_argument("--probe", action="store_true")
parser.add_argument("--peripherals", choices=("on", "off-by-user"))
parser.add_argument("--deadline", type=int, default=300)
parser.add_argument("--port", default=device.PORT)
args = parser.parse_args()
record = playable.load()
digest = record["app"]["sha256"]
store = playable.stored(digest)
device.check_build(store, digest)
assert device.sha(store / device.PART) == record["partitionTable"]["sha256"], "stored partition table differs from PLAYABLE.json"
peripherals = args.peripherals or record.get("peripherals", "on")
if args.probe:
    assert args.out is None, "--probe takes only CAPTURE"
    args.capture.mkdir(parents=True, exist_ok=False)
    with device.acquire(), (args.capture / "uart.log").open("wb", buffering=0) as log:
        # Reach the firmware's quiescent point, then verify_flash compares the board's app slot and partition table
        # with the stored files and resets the board.
        device.hold(device.Console(args.port, log))
        device.esp("verify_flash", store, args.capture, "probe-verify", args.port)
        console = device.Console(args.port, log)
        try:
            health = device.health(console, peripherals)
        finally:
            console.close()
    device.save(args.capture / "probe.json", {"store": str(store), "sha256": digest, "onBoard": True, "health": health})
    print(f"probe ok: the board runs the recorded playable image {digest[:12]} and is healthy ({peripherals})")
    sys.exit(0)
assert args.out is not None, "OUT is required"
app = args.out / "build/simd-lab.bin"
assert app.exists(), f"{app}: build the study first (bench/board/build.sh)"
device.run_app(app, args.capture, store, digest, peripherals, args.port, args.deadline)
print(json.dumps(json.loads((args.capture / "after.json").read_text()), indent=1)[:2000])
