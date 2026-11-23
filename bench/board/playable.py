#!/usr/bin/env python3
"""The playable firmware: the build the PicoCalc must be left on, recorded in the repository (PICOCALC-REPO-LAYOUT 5.3).

    playable.py status                                  what PLAYABLE.json records, and whether the store holds it
    playable.py store BUILD                             copy a build's app, partition table and bootloader into the store
    playable.py install BUILD OUT [--peripherals P]     store, flash, settle, health-check, then record it in PLAYABLE.json
    playable.py install --stored OUT [--peripherals P]  reinstall the recorded image from the store
    playable.py install BUILD OUT --health-only          BUILD is already on the board: check and record it
    playable.py install --stored OUT --health-only       check the recorded image on the board; PLAYABLE.json unchanged
    playable.py restore OUT [--peripherals P]           the same as install --stored (after an experiment image)

A health check judges a fresh boot: on a board up for more than device.FRESH_S seconds (--health-only after hours,
a "power cycle" that USB kept powered), it reboots the firmware from its console first (device.fresh_boot). Every
health record carries the uptime it judged from and each bus's transfers and errors over device.BUS_WINDOW_S.

PLAYABLE.json (firmware/PLAYABLE.json) names the profile, the commit, and the digests of the app and partition
table. The store (~/.cache/picocalc/firmware/<app sha256>/, or $PICOCALC_FIRMWARE_STORE) holds the files, so a restore
never depends on a /tmp build tree surviving. P is "on" or "off-by-user" (the keyboard and display switched off on
purpose); the default is the value recorded at the last install. Updating the playable firmware is one install and
one commit of PLAYABLE.json.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import device  # noqa: E402

REPO = HERE.parents[1]
RECORD = REPO / "firmware/PLAYABLE.json"
STORE = Path(os.environ.get("PICOCALC_FIRMWARE_STORE", Path.home() / ".cache/picocalc/firmware"))
FILES = (device.APP, device.PART, device.BOOT)


def load():
    return json.loads(RECORD.read_text())


def stored(digest):
    return STORE / digest


def store(build):
    """Copy a build's flashable files into STORE/<app sha256>/ and return that directory."""
    build = Path(build)
    digest = device.check_build(build)
    dest = stored(digest)
    for name in FILES:
        target = dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(build / name, target)
    assert device.sha(dest / device.APP) == digest
    return dest


def build_info(build):
    """The profile and commit a build directory was made from, as build.sh records them in picocalc-build.json."""
    info = Path(build) / "picocalc-build.json"
    return json.loads(info.read_text()) if info.exists() else {"profile": None, "commit": None, "dirty": None}


def record(build, digest, peripherals, after, overrides=None):
    info = {**build_info(build), **{k: v for k, v in (overrides or {}).items() if v is not None}}
    value = {
        "profile": info.get("profile"),
        "commit": info.get("commit"),
        "dirty": info.get("dirty"),
        "app": {"file": device.APP, "sha256": digest},
        "partitionTable": {"sha256": device.sha(Path(build) / device.PART)},
        "bootloader": {"sha256": device.sha(Path(build) / device.BOOT)},
        "store": str(stored(digest)).replace(str(Path.home()), "~"),
        "peripherals": peripherals,
        "health": {"judged": after["health"].get("judged", after["health"].get("worlds")),
                   "restartingAfterSettle": after["health"].get("restartingAfterSettle"),
                   "i2c0Window": {"seconds": after["health"]["buses"]["seconds"],
                                  **after["health"]["buses"]["deltas"].get("i2c0", {})}},
    }
    RECORD.write_text(json.dumps(value, indent=2) + "\n")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    s = sub.add_parser("store")
    s.add_argument("build", type=Path)
    i = sub.add_parser("install")
    i.add_argument("build", type=Path, nargs="?")
    i.add_argument("out", type=Path)
    i.add_argument("--stored", action="store_true")
    i.add_argument("--health-only", action="store_true", help="the build is already on the board: do not flash")
    i.add_argument("--profile", help="override the profile recorded for a build made before build.sh wrote one")
    i.add_argument("--commit", help="override the commit recorded for such a build")
    r = sub.add_parser("restore")
    r.add_argument("out", type=Path)
    for p in (i, r):
        p.add_argument("--peripherals", choices=("on", "off-by-user"))
        p.add_argument("--port", default=device.PORT)
    args = parser.parse_args()

    if args.command == "status":
        value = load()
        where = stored(value["app"]["sha256"])
        ok = (where / device.APP).exists() and device.sha(where / device.APP) == value["app"]["sha256"]
        print(json.dumps(value, indent=2))
        print("store:", where, "holds the recorded image" if ok else "DOES NOT hold the recorded image")
        return 0 if ok else 1
    if args.command == "store":
        print(store(args.build))
        return 0
    if args.command == "restore" or args.stored:
        value = load()
        build = stored(value["app"]["sha256"])
        device.check_build(build, value["app"]["sha256"])
        peripherals = args.peripherals or value.get("peripherals", "on")
        after = device.install(build, args.out, peripherals, args.port, health_only=args.health_only)
        print(json.dumps(after, indent=2))
        return 0
    if args.build is None:
        parser.error("install needs BUILD or --stored")
    previous = load().get("peripherals", "on") if RECORD.exists() else "on"
    peripherals = args.peripherals or previous
    where = store(args.build)
    after = device.install(where, args.out, peripherals, args.port, health_only=args.health_only)
    value = record(args.build, after["sha256"], peripherals, after, {"profile": args.profile, "commit": args.commit})
    print(json.dumps(value, indent=2))
    print("PLAYABLE.json updated; commit it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
