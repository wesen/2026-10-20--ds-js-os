#!/usr/bin/env python3
"""Compare the two Agenda backends with the same notes on the powered PicoCalc."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import runpy
import statistics
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[6]
COMPILER = next((ROOT / "ttmp/2026/11/18").glob("PICOCALC-AGENDA-COMPILER--*")) / "scripts"
BENCH = runpy.run_path(str(COMPILER / "12-measure-matched-targets.py"))
FIXTURE = "- [x] completed\n- [ ] dated @2030-05-01 14:30 !15m\n- board fixture\n"
TOGGLED = FIXTURE.replace("- [ ] dated", "- [x] dated")
EDITED = TOGGLED.replace("- board fixture", "- [ ] board fixtureX")
DELETED = EDITED.replace("- [ ] board fixtureX\n", "")
ADDED = DELETED + "- [ ] new @2030-06-01 14:00\n"
SAVED = ADDED.replace("- [x] completed", "- [x] completedX")


def args_for_run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    for name in ("images", "output", "esptool", "esptool-python"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--boots", type=int, default=4)
    parser.add_argument("--builds", type=int, default=4)
    parser.add_argument("--timings-only", action="store_true", help="omit the keyboard and Editor workflow")
    args = parser.parse_args()
    if min(args.boots, args.builds) < 1:
        parser.error("trial counts must be positive")
    return args


def validate_images(images):
    normalized = []
    for target, engine in (("wasm", "wasm"), ("rv32", "native")):
        worlds = BENCH["firmware_worlds"](images / (target + ".bin"))
        names = {world["name"] for world in worlds}
        if len(names) != len(worlds) or not BENCH["PERIPHERALS"] <= names:
            raise RuntimeError(f"{target} is missing powered peripherals")
        agenda = next(world for world in worlds if world["name"] == "agenda")
        if (agenda.pop("engine") != engine or agenda["file"] != "agenda/compiled.bin"
                or agenda["claims"] != ["fs:/notes"]):
            raise RuntimeError(f"unexpected {target} Agenda manifest")
        normalized.append(worlds)
    if normalized[0] != normalized[1]:
        raise RuntimeError("manifests differ outside the Agenda engine")
    for artifact in ("sdkconfig", "partitions.bin"):
        if (images / f"wasm-{artifact}").read_bytes() != (images / f"rv32-{artifact}").read_bytes():
            raise RuntimeError(f"images differ in {artifact}")
    return len(normalized[0])


def console(args, duration, *commands):
    options = [arg for cmd in commands for arg in ("-c", cmd)]
    return BENCH["capture"](args.port, "--no-reset", "-s", str(duration), *options)


def empty_notes(args):
    output = console(args, 2, "0.3 ls notes")
    return "#OK ls" in output and re.search(r"^\s+todo\.txt +0\s*$", output, re.M) is not None


def seed_notes(args, text):
    commands = ["0.2 put notes/todo.txt"]
    if text:
        commands.append("0.5 put notes/todo.txt " + base64.b64encode(text.encode()).decode())
    log = console(args, 1.4, *commands)
    if "put notes/todo.txt: 0 bytes" not in log or (text and f": {len(text)} bytes" not in log):
        raise RuntimeError("fixture write failed: " + log)


def smoke(args, target):
    output = args.output / target
    output.mkdir()
    commands = (
        "0.3 key f1", "0.9 key t", "2.2 key space", "3.2 cat notes/todo.txt",
        "3.8 key f3", "4.4 type X", "5.0 key enter", "5.9 cat notes/todo.txt",
        "6.4 key f5", "7.1 cat notes/todo.txt", "7.6 key f5", "8.5 cat notes/todo.txt",
        "9.0 key f2", "9.5 type new @2030-06-01 2pm", "12 key enter",
        "13.0 cat notes/todo.txt", "13.6 key f6", "14.9 key end", "15.3 type X", "16.1 key f2",
        "17.1 cat notes/todo.txt", "17.8 key f1", "18.4 key t", "19.2 key f4",
        "20.2 shot", "24 stats",
    )
    options = [arg for cmd in commands for arg in ("-c", cmd)]
    with (output / "workflow.log").open("w") as log, (output / "shot.log").open("w") as shot:
        subprocess.run(
            [sys.executable, BENCH["CAPTURE"], "-p", args.port, "--no-reset", "-s", "25", "--shot-dir", output, *options],
            stdout=log, stderr=shot, check=True,
        )
    raw = (output / "workflow.log").read_text(errors="replace")
    notes = re.findall(r"^- \[x\] completedX?\n.*?^#OK cat$", raw, re.M | re.S)
    notes = [body.removesuffix("#OK cat") for body in notes]
    want = [TOGGLED, EDITED, EDITED, DELETED, ADDED, SAVED]
    crc = "crc ok" in (output / "shot.log").read_text()
    buses = {
        bus: {"transfers": int(transfers), "errors": int(errors)}
        for bus, transfers, errors in re.findall(
            r"bus (i2c0|spi2) +busy +[\d.]+ ms, (\d+) transfers, \d+ bytes, (\d+) errors", raw
        )
    }
    healthy = buses.keys() == {"i2c0", "spi2"} and all(b["transfers"] and not b["errors"] for b in buses.values())
    return {"passed": notes == want and crc and healthy, "file_states": notes,
            "framebuffer_crc": crc, "bus_counts": buses}


def flash_target(args, target):
    BENCH["flash"](args, args.images / (target + ".bin"), target, require_hold=True)
    raw = (args.output / (target + "-flash.log")).read_text(errors="replace")
    if "Hash of data verified" not in raw:
        raise RuntimeError(f"{target} image was not verified by the flash writer")
    boot = console(args, 8.5, "7 cji status")
    (args.output / (target + "-boot.log")).write_text(boot)
    if "#OK cji" not in boot:
        raise RuntimeError(f"{target} console did not respond")


def main():
    args = args_for_run()
    worlds = validate_images(args.images)
    args.output.mkdir()
    if not empty_notes(args):
        raise SystemExit("This fixture requires an existing empty notes/todo.txt.")
    receipt = {
        "configuration": "Same powered ESP32-P4, panel and keyboard, 8 MiB app partition, and matching system manifests",
        "manifest_worlds": worlds,
        "fixture": FIXTURE,
        "sources": (args.images / "sources.sha256").read_text().splitlines(),
        "endpoint": "Source capture to first file-backed Agenda publication",
        "targets": {},
    }
    loaded = None
    try:
        for target, engine in (("wasm", 1), ("rv32", 2)):
            print(f"Installing and qualifying {target}", flush=True)
            loaded = None
            flash_target(args, target)
            loaded = target
            seed_notes(args, FIXTURE)
            cold = BENCH["measure"](args, "10-measure-agenda-boot.py", "--trials", str(args.boots),
                                    "--world-profile", "--bus-profile")
            if any(trial["worlds"]["agenda"]["engine"] != engine for trial in cold["trials"]):
                raise RuntimeError(f"cold trace did not show the {target} engine")
            settled = BENCH["measure"](args, "05-measure-agenda-p4.py", "--runs", str(args.builds))
            data = {
                "firmware_sha256": hashlib.sha256((args.images / (target + ".bin")).read_bytes()).hexdigest(),
                "cold": cold["trials"],
                "cold_median_response_us": statistics.median(row["first_response_us"] for row in cold["trials"]),
                "settled": settled,
            }
            if not args.timings_only:
                data["workflow"] = smoke(args, target)
            receipt["targets"][target] = data
            (args.output / f"{target}.json").write_text(json.dumps(data, indent=2) + "\n")
    finally:
        if loaded != "rv32":
            print("Returning the board to the verified RV32 build", flush=True)
            flash_target(args, "rv32")
        seed_notes(args, "")
        if not empty_notes(args):
            raise RuntimeError("could not restore the empty notes file")
    (args.output / "matched.json").write_text(json.dumps(receipt, indent=2) + "\n")
    if not args.timings_only and not all(row["workflow"]["passed"] for row in receipt["targets"].values()):
        raise SystemExit("At least one device workflow failed; see the retained timing and workflow receipt.")


if __name__ == "__main__":
    main()
