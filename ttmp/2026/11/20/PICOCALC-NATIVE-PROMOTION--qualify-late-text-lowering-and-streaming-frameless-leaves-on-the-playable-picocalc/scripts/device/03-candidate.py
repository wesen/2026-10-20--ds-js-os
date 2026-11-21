"""Qualify an ordinary app image, restore the known release on any exception."""

import argparse

import json
import time
from pathlib import Path

from common import (
    APP,
    PART,
    PART_SHA,
    RELEASE,
    RELEASE_SHA,
    acquire,
    cold,
    esp,
    hold,
    ready,
    save,
    sha,
    unit,
)
from workflows import document_lines, edit, key, play

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("build", type=Path)
parser.add_argument("expected_sha256")
parser.add_argument("baseline_ui", type=Path)
parser.add_argument("out", type=Path)
parser.add_argument(
    "--previous-build",
    type=Path,
    default=RELEASE,
    help="directory of the published baseline app and partition table",
)
parser.add_argument("--port", default="/dev/ttyACM0")
args = parser.parse_args()
assert (
    sha(args.previous_build / APP) == RELEASE_SHA
    and sha(args.previous_build / PART) == PART_SHA
)
assert sha(args.build / PART) == PART_SHA
assert sha(args.build / APP) == args.expected_sha256 != RELEASE_SHA
assert 0 < (args.build / APP).stat().st_size <= 8 * 1024 * 1024
baseline_editor = json.loads((args.baseline_ui / "editor.json").read_bytes())
baseline_moves = json.loads((args.baseline_ui / "chess.json").read_bytes())["rows"]
baseline_editor["readback"] = document_lines(baseline_editor["readback"])
assert len(baseline_moves) == 3 and baseline_editor["scratchRemoved"]
args.out.mkdir(parents=True, exist_ok=False)
result = {"application": args.expected_sha256, "partition": PART_SHA, "cold": []}

with acquire(), (args.out / "uart.log").open("wb", buffering=0) as log:

    def connect():
        return unit.Console(args.port, log)

    def flash(operation, image_dir, label):
        esp(operation, image_dir, args.out, label, args.port)

    c = connect()
    hold(c)
    flash("verify_flash", args.previous_build, "previous-verified")
    c = connect()
    ready(c)
    hold(c)
    try:
        flash("write_flash", args.build, "write-candidate")
        flash("verify_flash", args.build, "read-candidate")
        c = connect()
        ready(c)
        c.input_ready()
        for i in range(3):
            result["cold"].append(cold(c))
            save(args.out / "cold.json", result)
            print("completed candidate cold boot", i + 1, flush=True)
        time.sleep(2)
        rows = play(c, args.out, 3)
        for row, baseline in zip(rows, baseline_moves, strict=True):
            assert row["replyAppSHA256"] == baseline["replyAppSHA256"]
        editor = edit(c, args.out)
        save(args.out / "editor.json", editor)
        for field in ("readback", "reopenedReadback", "editedScreen", "scratchRemoved"):
            assert editor[field] == baseline_editor[field], field
        key(c, "f1")
        ready(c)
        c.input_ready()
        hold(c)
        flash("verify_flash", args.build, "candidate-final")
        c = connect()
        worlds, painter = ready(c)
        c.input_ready()
        assert painter["compiles"] == 1 and painter["rejects"] == 0
        save(
            args.out / "final.json",
            {
                "application": args.expected_sha256,
                "partition": PART_SHA,
                "qualified": True,
                "applicationAndPartitionReadback": True,
                "nativeWorlds": sorted(set(worlds) & unit.NATIVE.keys()),
                "keyboardPolling": True,
                "painter": painter,
            },
        )
        print("QUALIFIED", args.expected_sha256, flush=True)
    except BaseException:
        try:
            if c.port.is_open:
                hold(c)
        except Exception as err:
            print("could not hold before rollback:", err, flush=True)
        flash("write_flash", args.previous_build, "restore-previous")
        flash("verify_flash", args.previous_build, "restore-verified")
        c = connect()
        worlds, painter = ready(c)
        c.input_ready()
        save(
            args.out / "rollback.json",
            {
                "application": RELEASE_SHA,
                "partition": PART_SHA,
                "painter": painter,
                "nativeWorlds": sorted(set(worlds) & unit.NATIVE.keys()),
            },
        )
        raise
    finally:
        c.close()
