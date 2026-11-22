#!/usr/bin/env python3
"""06-run-device.py: install the gallery firmware on the PicoCalc, measure it, and leave it or restore the playable one.

usage: python3 -B 06-run-device.py --image BUILD --out DIR [--port /dev/ttyACM0] [--digest-passes 4]
           [--scene-seconds 30] [--scenes ID,...] [--skip-digests] [--skip-scenes] [--leave-installed]

BUILD is the gallery image's ESP-IDF build directory (build-smooth-chess.sh BUILD -D PICOCALC_CANDELA_GALLERY=ON).
Under the shared serial lock (PICOCALC-RAYTRACE's board_common.acquire, as PICOCALC-CANDELA-WORLD's 08-run-device.py):
read the restore target from /tmp/picocalc-current-playable.txt; check both builds; record the running firmware's
health; hold I2C; write and verify the gallery app at 0x10000 only (the verify resets the board); record its health;
capture the screen once the gallery has drawn (console "shot", the compositor's framebuffer, so it works with the
panel off). Then
  digests  "gallery digest ID N" per scene: frame-0, accumulation and display digests, cycles per sample;
  scenes   "gallery scene ID" per scene, kept on screen for --scene-seconds (or until it ends), with a screen capture:
           the renderer's own first, pass and scene records (time to first image, s/pass, samples/s, heap).
Finally record health again. The user has switched the keyboard and display off on purpose, so health is judged
with PICOCALC-CANDELA-WORLD's lib/board_health.py in "off-by-user" mode: keyboard and display recorded, not judged.
With --leave-installed and healthy worlds, the gallery stays installed and /tmp/picocalc-current-playable.txt is
rewritten to name BUILD; otherwise (or on any failure) the playable app is written back and verified.

Writes DIR/uart.log (every byte read), DIR/cgal.jsonl (every CGAL record with the step it arrived in), DIR/*.png
screen captures, DIR/before.json, DIR/candidate.json, DIR/candidate-after.json, DIR/after.json and DIR/run.json."""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / ".git").exists())
sys.path.insert(0, str(next((REPO / "ttmp/2026/11/20").glob("PICOCALC-RAYTRACE--*")) / "scripts/device"))
sys.path.insert(0, str(next((REPO / "ttmp/2026/11/21").glob("PICOCALC-CANDELA-WORLD--*")) / "scripts/lib"))
from board_common import acquire, check_build, release, save  # noqa: E402
from board_health import board_health  # noqa: E402

PLAYABLE = Path("/tmp/picocalc-current-playable.txt")


def healthy(console, timeout=90):
    """board_health in off-by-user mode, waiting while boot is still under way: the boot compiles (Candela, Agenda,
    Files, Editor, Chess) take about 10.4 s, so 13 s after a reset worlds may still be "restarting" (waiting to start)
    with no restarts and no error, and the painter may not have compiled yet. Anything else is an error at once."""
    deadline = time.monotonic() + timeout
    waited = 0
    while True:
        try:
            h = board_health(console, "off-by-user")
            h["waitedForBoot"] = waited
            return h
        except RuntimeError as e:
            text = str(e)
            starting = "unhealthy with peripherals off" in text and "'restarts': 0, 'last_error': ''" in text and "'state': 'crashed'" not in text \
                and "'state': 'stopped'" not in text
            if not (starting or text.startswith("painter ")) or time.monotonic() > deadline:
                raise
            time.sleep(2)
            waited += 2


class Records:
    """CGAL records from the console, with the step that produced them."""

    def __init__(self, path):
        self.f = path.open("a")
        self.step = "boot"

    def take(self, raw):
        if raw.startswith("CGAL {"):
            rec = json.loads(raw[5:])
            self.f.write(json.dumps({"step": self.step, "hostTime": round(time.time(), 3), **rec}) + "\n")
            self.f.flush()
            return rec
        return None


def wait_for(console, rec, until, timeout):
    """Read lines until until(record) is true or timeout seconds pass; return the matching record or None."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            raw = console.line(deadline).decode(errors="replace")
        except TimeoutError:
            return None
        r = rec.take(raw)
        if r is not None and until(r):
            return r
    return None


def command(console, rec, line, timeout=10):
    """A console command; CGAL lines that arrive meanwhile are recorded."""
    out = console.command(line, timeout=timeout)
    for raw in out:
        rec.take(raw)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--image", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--port", default="/dev/ttyACM0")
    ap.add_argument("--digest-passes", type=int, default=4)
    ap.add_argument("--scene-seconds", type=float, default=30)
    ap.add_argument("--scenes", default="")
    ap.add_argument("--skip-digests", action="store_true")
    ap.add_argument("--skip-scenes", action="store_true")
    ap.add_argument("--leave-installed", action="store_true")
    a = ap.parse_args()
    image_sha = hashlib.sha256((a.image / release.APP).read_bytes()).hexdigest()
    check_build(a.image, image_sha)
    a.out.mkdir(parents=True, exist_ok=False)
    run = {"image": str(a.image), "imageSha256": image_sha, "port": a.port, "started": time.time(), "args": vars(a) | {"image": str(a.image), "out": str(a.out)}}
    rec = Records(a.out / "cgal.jsonl")
    left = False
    with acquire(), (a.out / "uart.log").open("ab", buffering=0) as log:
        restore_dir, restore_sha = PLAYABLE.read_text().split()
        restore = Path(restore_dir)
        check_build(restore, restore_sha)
        run.update(restore=str(restore), restoreSha256=restore_sha, locked=time.time())
        save(a.out / "run.json", run)

        def connect():
            return release.unit.Console(a.port, log)

        console = connect()
        try:
            save(a.out / "before.json", {"sha256": restore_sha, "health": healthy(console)})
        finally:
            console.close()
        console = connect()
        release.hold(console)
        try:
            release.esp("write_flash", a.image, a.out, "candidate-write", a.port)
            t_reset = time.time()
            release.esp("verify_flash", a.image, a.out, "candidate-verify", a.port)   # hard reset
            console = connect()   # drains the boot output into uart.log for 13 s
            run["bootDrainedAt"] = time.time() - t_reset
            save(a.out / "candidate.json", {"sha256": image_sha, "health": healthy(console)})
            rec.step = "first-image"
            first = wait_for(console, rec, lambda r: r.get("ev") == "first", 60)
            run["firstSeen"] = first
            time.sleep(4)
            run["shots"] = {"boot": console.shot("boot", a.out)}
            command(console, rec, "gallery list")
            ids = [r["id"] for r in map(json.loads, (a.out / "cgal.jsonl").read_text().splitlines()) if r.get("ev") == "scene-list"]
            ids = list(dict.fromkeys(ids))
            if a.scenes:
                ids = [i for i in a.scenes.split(",") if i in ids]
            run["scenes"] = ids
            save(a.out / "run.json", run)
            if not a.skip_digests:
                for sid in ids:
                    rec.step = f"digest-{sid}"
                    command(console, rec, f"gallery digest {sid} {a.digest_passes}")
                    r = wait_for(console, rec, lambda r: r.get("ev") in ("digest", "error"), 400)
                    print(f"digest {sid}: {r}", flush=True)
            if not a.skip_scenes:
                for sid in ids:
                    rec.step = f"scene-{sid}"
                    command(console, rec, f"gallery scene {sid}")
                    t0 = time.monotonic()
                    wait_for(console, rec, lambda r: r.get("ev") == "first" and r.get("id") == sid, 60)
                    rest = a.scene_seconds - (time.monotonic() - t0)
                    if rest > 0:
                        wait_for(console, rec, lambda r: r.get("ev") == "scene" and r.get("id") == sid, rest)
                    run["shots"][sid] = console.shot(f"scene-{sid}", a.out)
                    print(f"scene {sid}: {round(time.monotonic() - t0, 1)} s", flush=True)
                rec.step = "scene-end"
                command(console, rec, "gallery scene B-01")   # ends the last measured scene (its record) and restarts the gallery
                wait_for(console, rec, lambda r: r.get("ev") == "first", 30)
            rec.step = "after"
            for cmd in ("stats", "heap", "worlds"):
                (a.out / f"end-{cmd}.txt").write_text("\n".join(command(console, rec, cmd, timeout=10)) + "\n")
            health = healthy(console)
            save(a.out / "candidate-after.json", {"health": health})
            run["shots"]["end"] = console.shot("end", a.out)
            save(a.out / "run.json", run)
            if a.leave_installed:
                # board_health raised if a judged world was unhealthy; it did not, so the gallery stays
                PLAYABLE.write_text(f"{a.image.resolve()} {image_sha}\n")
                left = True
                run["leftInstalled"] = {"build": str(a.image.resolve()), "sha256": image_sha, "previous": f"{restore} {restore_sha}"}
                console.close()
            else:
                release.hold(console)
        finally:
            if not left:
                try:
                    console.close()
                except Exception:
                    pass
                release.esp("write_flash", restore, a.out, "restore-write", a.port)
                release.esp("verify_flash", restore, a.out, "restore-verify", a.port)
                console = connect()
                try:
                    save(a.out / "after.json", {"sha256": restore_sha, "health": healthy(console)})
                finally:
                    console.close()
    run["finished"] = time.time()
    save(a.out / "run.json", run)
    print(json.dumps({k: run.get(k) for k in ("imageSha256", "restoreSha256", "leftInstalled", "firstSeen")}, indent=1))


if __name__ == "__main__":
    main()
