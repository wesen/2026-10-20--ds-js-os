"""Install the ray-tracing release, exercise the ordinary launcher, and qualify paired timings."""

import argparse
import json
import subprocess
import time
import zlib
from pathlib import Path
from board_common import (
    acquire,
    PLAYABLE,
    PLAYABLE_SHA,
    REPO,
    TICKET,
    check_build,
    health,
    release,
    save,
)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("build", type=Path)
parser.add_argument("sha256")
parser.add_argument("out", type=Path)
parser.add_argument("--previous", type=Path, default=PLAYABLE)
parser.add_argument("--port", default="/dev/ttyACM0")
a = parser.parse_args()
check_build(a.previous, PLAYABLE_SHA)
check_build(a.build, a.sha256)
assert a.sha256 != PLAYABLE_SHA
a.out.mkdir(parents=True, exist_ok=False)
host = a.out / "scalar-render"
nucleus = REPO / "picocalc-os/nucleus"
subprocess.run(
    [
        "cc",
        "-std=c11",
        "-O2",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-I",
        str(nucleus),
        str(TICKET / "scripts/device/host_frame.c"),
        str(nucleus / "raytrace_demo.c"),
        "-o",
        str(host),
    ],
    check=True,
)
images = {}


def scalar(kind, scene):
    key = (kind, *scene)
    if key not in images:
        images[key] = subprocess.check_output([str(host), kind, *map(str, scene)])
        assert len(images[key]) == 160 * 160 * 2
    return images[key]


def crc(data):
    return f"{zlib.crc32(data):08x}"


def expected_view(frame):
    rows = []
    for y in range(240):
        line = frame[(2 * y // 3) * 320 :][:320]
        rows.append(
            b"".join(line[(2 * x // 3) * 2 : (2 * x // 3) * 2 + 2] for x in range(240))
        )
    return b"".join(rows)


def capture(c, label, scene):
    expected = expected_view(scalar("frame", scene))
    limit = time.monotonic() + 20
    while True:
        observed = c.shot(label, a.out)
        raw = (a.out / (label + ".rgb565")).read_bytes()
        view = b"".join(
            raw[((32 + y) * 320 + 40) * 2 : ((32 + y) * 320 + 280) * 2]
            for y in range(240)
        )
        if view == expected:
            return {
                "label": label,
                "scene": scene,
                "viewportPixels": 57600,
                "expectedCRC": crc(expected),
                "actualCRC": crc(view),
                "framebuffer": observed,
                "pngSHA256": release.sha(a.out / (label + ".png")),
            }
        if time.monotonic() >= limit:
            difference = next(
                i // 2
                for i, (actual_byte, expected_byte) in enumerate(
                    zip(view, expected, strict=True)
                )
                if actual_byte != expected_byte
            )
            raise AssertionError(
                (label, "viewport", difference, "CRC", crc(view), crc(expected))
            )
        time.sleep(0.2)


def run_bench(c):
    rows = []
    for block in range(18):
        entries = [
            json.loads(x[len("RAYROW ") :])
            for x in c.command(f"raybench {block}", timeout=20)
            if x.startswith("RAYROW ")
        ]
        assert len(entries) == 1, (block, entries)
        row = entries[0]
        scene = row["sphere"] + row["light"]
        assert (row["block"], row["pieFirst"], row["scene"]) == (
            block,
            block % 2,
            (block // 2) % 3,
        )
        assert (
            row["equalFrame"] == row["equalDepth"] == row["equalInstrumented"] == 1
        ), row
        assert row["frameCRC"] == crc(scalar("frame", scene)) and row[
            "depthCRC"
        ] == crc(scalar("depth", scene)), row
        assert (
            row["rays"] == 25600
            and row["sphereTests"] == 3 * row["rays"]
            and row["sphereTests"] == 8 * row["pieGroups"]
        )
        assert (
            0
            < row["hitPixels"]
            <= row["sphereHits"]
            == row["pieActiveLanes"]
            < row["sphereTests"]
        )
        assert 0 < row["shadowPixels"] <= row["rays"] - row["hitPixels"]
        assert min(row["frameUs"] + row["intersectionUs"]) > 0
        rows.append(row)
        save(a.out / "rows.json", rows)
        print(
            "block",
            block,
            "frame",
            row["frameUs"],
            "primary",
            row["intersectionUs"],
            flush=True,
        )
    return rows


with acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:

    def connect():
        return release.unit.Console(a.port, log)

    def flash(operation, build, label):
        release.esp(operation, build, a.out, label, a.port)

    c = connect()
    release.hold(c)
    flash("verify_flash", a.previous, "previous-readback")
    c = connect()
    health(c)
    release.hold(c)
    try:
        flash("write_flash", a.build, "new-app")
        flash("verify_flash", a.build, "new-readback")
        c = connect()
        h = health(c)
        c.command("key f1")
        time.sleep(0.3)
        c.command("key v")
        time.sleep(0.4)
        worlds = c.health()
        assert "raytrace" in worlds and not worlds["raytrace"]["last_error"]
        captures = []
        for label, key, scene in [
            ("default", None, [68, 61, 31, 25]),
            ("sphere-right", "right", [76, 61, 31, 25]),
            ("light-up", "w", [76, 61, 31, 17]),
            ("reset", "r", [68, 61, 31, 25]),
        ]:
            if key:
                c.command("key " + key)
                time.sleep(0.3)
            captures.append(capture(c, label, scene))
            save(a.out / "screens.json", captures)
        assert (
            captures[0]["actualCRC"] == captures[-1]["actualCRC"]
            and len(set(x["actualCRC"] for x in captures)) == 3
        )
        c.command("key f1")
        time.sleep(0.4)
        rows = run_bench(c)
        health(c)
        release.hold(c)
        flash("verify_flash", a.build, "final-readback")
        c = connect()
        final = health(c)
        save(
            a.out / "final.json",
            {
                "qualified": True,
                "appSHA256": a.sha256,
                "previousSHA256": PLAYABLE_SHA,
                "partitionSHA256": release.PART_SHA,
                "verifiedFinalAppAndPartition": True,
                "pairedBlocks": len(rows),
                "sceneCount": 3,
                "uiCaptures": len(captures),
                "health": final,
            },
        )
        print("QUALIFIED", a.sha256, flush=True)
    except BaseException:
        try:
            if c.port.is_open:
                release.hold(c)
        except Exception as e:
            print("hold before recovery:", e, flush=True)
        flash("write_flash", a.previous, "restore-previous")
        flash("verify_flash", a.previous, "restore-verified")
        c = connect()
        save(a.out / "rollback.json", {"restored": PLAYABLE_SHA, "health": health(c)})
        raise
    finally:
        c.close()
