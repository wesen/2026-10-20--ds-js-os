#!/usr/bin/env python3
"""Measure matched typed Agenda firmware images and restore the saved app."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SCRIPTS = Path(__file__).resolve().parent
CAPTURE = SCRIPTS.parents[5] / "picocalc-os/tools/p4cap.py"
PERIPHERALS = {"keyboard", "display", "power", "compositor"}


def cli():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("rv32", "wasm", "restore", "backup", "esptool", "esptool-python", "output"):
        p.add_argument("--" + name, type=Path, required=True)
    p.add_argument("--port", required=True)
    p.add_argument("--boots", type=int, default=6)
    p.add_argument("--builds", type=int, default=8)
    p.add_argument("--edits", type=int, default=5)
    args = p.parse_args()
    if min(args.boots, args.builds, args.edits) < 1:
        p.error("all trial counts must be positive")
    return args


def firmware_worlds(image):
    config = image.with_name(image.stem + "-manifest.json")
    return json.loads(config.read_text())["worlds"]


def compare_manifests(wasm, rv32):
    def normalize(worlds, engine):
        names = {world["name"] for world in worlds}
        if len(names) != len(worlds) or "agenda" not in names or names & PERIPHERALS:
            raise SystemExit(f"expected the headless Agenda manifest for {engine}")
        result = []
        for world in worlds:
            world = dict(world)
            if world["name"] == "agenda":
                valid = (world.pop("engine", None) == engine and
                         world.get("file") == "agenda/compiled.bin" and
                         world.get("claims") == ["fs:/notes"])
                if not valid:
                    raise SystemExit(f"unexpected compiled Agenda entry for {engine}")
            result.append(world)
        return result
    if normalize(wasm, "wasm") != normalize(rv32, "native"):
        raise SystemExit("the headless system manifests differ outside Agenda's engine")


def capture(port, *args):
    return subprocess.check_output(
        [sys.executable, CAPTURE, "-p", port, *args], text=True, errors="replace"
    )


def flash(args, image, label):
    capture(args.port, "--no-reset", "-s", "1", "-c", "0.1 hold")
    with (args.output / (label + "-flash.log")).open("wb") as log:
        subprocess.run(
            [args.esptool_python, args.esptool, "--chip", "esp32p4", "--port", args.port,
             "--baud", "921600", "write_flash", "0x10000", image],
            stdout=log, stderr=subprocess.STDOUT, check=True,
        )


def measure(args, script, *options):
    return json.loads(subprocess.check_output(
        [sys.executable, SCRIPTS / script, "--port", args.port, *options], text=True
    ))


def main():
    args = cli()
    restore_bytes = args.restore.read_bytes()
    if not restore_bytes or not args.backup.read_bytes().startswith(restore_bytes):
        raise SystemExit("the restore image differs from the saved application partition")
    manifests = {"wasm": firmware_worlds(args.wasm), "rv32": firmware_worlds(args.rv32)}
    compare_manifests(manifests["wasm"], manifests["rv32"])
    args.output.mkdir(parents=True, exist_ok=True)
    target_data = {}
    try:
        for target in ("rv32", "wasm"):
            image = getattr(args, target)
            print(f"flashing and measuring {target}", flush=True)
            flash(args, image, target)
            target_data[target] = {
                "firmware_sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
                "cold": measure(args, "10-measure-agenda-boot.py", "--trials", str(args.boots)),
                "bundled": measure(args, "05-measure-agenda-p4.py", "--runs", str(args.builds)),
                "editable": measure(args, "05-measure-agenda-p4.py", "--runs", str(args.edits),
                                    "--source", "build"),
            }
            (args.output / (target + ".json")).write_text(json.dumps(target_data[target], indent=2) + "\n")
    finally:
        print("restoring the previously verified application image", flush=True)
        flash(args, args.restore, "restore")
        log = capture(args.port, "--no-reset", "-s", "9", "-c", "7 cji status")
        (args.output / "restored-probe.log").write_text(log)
        if "#OK cji" not in log or "booting" not in log:
            raise SystemExit("restored application did not answer the boot probe")
    receipt = {
        "configuration": "Same ESP32-P4, headless native system catalog, typed Agenda, and installed CJI slot",
        "manifest_worlds": len(manifests["rv32"]),
        "endpoint": "Source capture through first file-backed frame publication",
        "restored_firmware_sha256": hashlib.sha256(restore_bytes).hexdigest(),
        "targets": target_data,
    }
    (args.output / "matched.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
