#!/usr/bin/env python3
"""Soak the installed playable image and watch for the compositor's 80 ms turn-budget overrun (fix 4).

usage (repository root): python3 ttmp/.../scripts/01-compositor-soak.py OUT [--minutes 30] [--round 120] [--gap 6]
                                                                           [--seed 1] [--trace] [--max-hours 3]

Nothing is flashed. The soak runs in rounds of --round seconds. Each round holds the board lock
(bench/board/device.py) and releases it for --gap seconds afterwards, so other agents can use the board in between.
A round has two halves, both driven by console key injection (`key NAME`, which goes through the keyboard
controller's queue and the I2C keyboard driver like a real key):
  - the Candela gallery: F1, p, then Left or Right (a scene change) every 2-4 s;
  - Chess: F1, h, then a random walk of arrows and Enter every 0.3-1.0 s (Enter selects a piece or plays a move,
    which starts the engine), a view rotation (F3/F4, the 3D painter redraws) about every 8th key, a new game (F2)
    about every 150th.
`worlds` and `stats` are read every 10 s. Between commands the console keeps reading, so every UART byte is kept:
the kernel logs a crash as "[t] W crashed handling TYPE: why" whether or not its trace is on (--trace turns it on
for the rounds; it logs every dispatched message and slows the kernel task, so it is off by default).

Other agents flash experiment images between rounds. A round starts only on a board that answers and has not been
reset since the last round; otherwise the board is held, its flash is compared with the playable image the main
checkout's PLAYABLE.json records (verify_flash, which resets it), and the soak continues on a fresh boot of it, or
waits a minute (another agent's image) and tries again. Samples are split into boots in the summary.

Writes OUT/uart-N.log per round, OUT/samples.jsonl (one row per sample), OUT/crashes.jsonl and OUT/summary.json.
"""
import argparse
import json
import os
import random
import re
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402
import playable  # noqa: E402

MAIN_PLAYABLE = Path("/home/manuel/code/wesen/2026-10-20--ds-js-os/firmware/PLAYABLE.json")
CRASH = re.compile(r"\[\s*([\d.]+)\] (\S+) crashed(?: handling (.*?))?: (.*)$")
WATCH = ("compositor", "chess", "gallery", "keyboard", "display", "launcher")
FIELDS = ("state", "turns", "msgs", "cpu_ms", "mbox_peak", "restarts", "budget_ms", "last_error")
CHESS_KEYS = ["left", "right", "up", "down"] * 3 + ["enter"] * 4


def sample(console, rnd, phase):
    worlds = console.worlds(timeout=15)
    lines = console.command("stats", timeout=15)
    up = next(float(m[1]) for m in map(device.UPTIME.match, lines) if m)
    buses = {m[1]: {"busyMs": float(m[2]), "transfers": int(m[3]), "errors": int(m[5])}
             for m in map(device.BUS.search, lines) if m}
    return {"host": round(time.time(), 3), "round": rnd, "phase": phase, "uptimeMs": up, "buses": buses,
            "worlds": {w: {f: worlds[w].get(f) for f in FIELDS} for w in WATCH if w in worlds}}


def key(console, name, log):
    console.command(f"key {name}", timeout=5)
    log.append(name)


def round_(console, rnd, seconds, rng, rows, keys):
    start = time.monotonic()
    next_sample = start
    phase = None
    while time.monotonic() - start < seconds:
        now = time.monotonic()
        want = "gallery" if now - start < seconds / 2 else "chess"
        if want != phase:
            phase = want
            key(console, "f1", keys)
            console.drain(.8)
            key(console, "p" if phase == "gallery" else "h", keys)
            console.drain(1.0)
        if now >= next_sample:
            try:
                rows.append(sample(console, rnd, phase))
            except (TimeoutError, ValueError, StopIteration) as exc:   # a busy kernel; the next sample will do
                print(f"round {rnd}: sample failed: {exc!r}", flush=True)
            next_sample = now + 10
        if phase == "gallery":
            key(console, rng.choice(["left", "right", "right"]), keys)
            console.drain(rng.uniform(2, 4))
        else:
            r = rng.random()
            key(console, rng.choice(["f3", "f4"]) if r < 1 / 8 else "f2" if r > 1 - 1 / 150 else rng.choice(CHESS_KEYS), keys)
            console.drain(rng.uniform(.3, 1.0))
    rows.append(sample(console, rnd, phase))


def others_active():
    """Other processes with the board lock open: holding it, or waiting for it (another agent's board session)."""
    me, found = os.getpid(), []
    for fd_dir in Path("/proc").glob("[0-9]*/fd"):
        if int(fd_dir.parent.name) == me:
            continue
        try:
            if any(os.readlink(fd) == str(device.LOCK) for fd in fd_dir.iterdir()):
                found.append(int(fd_dir.parent.name))
        except OSError:
            continue
    return found


def board_ready(console, last_up):
    """The uptime if the board answers and has not been reset since the last round, else None."""
    try:
        up = console.uptime_ms(deadline_s=15)
    except (TimeoutError, ValueError):
        return None
    return up if last_up is None or up >= last_up else None


def verify_playable(log, out, rnd, port):
    """Someone reset or flashed the board between rounds: hold it (best effort), compare its app slot and partition
    table with the playable image main's PLAYABLE.json records (verify_flash, which resets it), and settle. False if
    the board holds another image (another agent's experiment): wait for its restore."""
    record = json.loads(MAIN_PLAYABLE.read_text())
    store = playable.stored(record["app"]["sha256"])
    device.check_build(store, record["app"]["sha256"])
    device.quiesce(port, log)
    try:
        device.esp("verify_flash", store, out, f"verify-{rnd:02d}", port)
    except subprocess.CalledProcessError:
        # Not the playable image. A failed verify leaves the chip in its bootloader: start the image it holds again.
        with (Path(out) / f"verify-{rnd:02d}-reset.log").open("wb") as f:
            subprocess.run([device.ESPTOOL, "--chip", "esp32p4", "-p", port, "--after", "hard_reset", "read_mac"],
                           stdout=f, stderr=subprocess.STDOUT, check=False, timeout=60)
        return False
    console = device.Console(port, log)
    try:
        device.settle(console)
    finally:
        console.close()
    return True


def segments(rows):
    """Rows split where the uptime goes back (a boot)."""
    out = []
    for r in rows:
        if not out or r["uptimeMs"] < out[-1][-1]["uptimeMs"]:
            out.append([])
        out[-1].append(r)
    return out


def summarize(seg):
    first, last = seg[0], seg[-1]
    c0, c1 = first["worlds"]["compositor"], last["worlds"]["compositor"]
    return {
        "uptimeMs": [first["uptimeMs"], last["uptimeMs"]], "samples": len(seg),
        "compositor": {"restarts": [c0["restarts"], c1["restarts"]],
                       "lastErrors": sorted({r["worlds"]["compositor"]["last_error"] for r in seg}),
                       "turns": c1["turns"] - c0["turns"], "cpuMs": round(c1["cpu_ms"] - c0["cpu_ms"], 3),
                       "meanTurnMs": round((c1["cpu_ms"] - c0["cpu_ms"]) / max(1, c1["turns"] - c0["turns"]), 3),
                       "mboxPeak": max(r["worlds"]["compositor"]["mbox_peak"] for r in seg)},
        "restarts": {w: [first["worlds"][w]["restarts"], last["worlds"][w]["restarts"]] for w in WATCH
                     if w in first["worlds"] and w in last["worlds"]},
        "i2c0": {k: last["buses"]["i2c0"][k] - first["buses"]["i2c0"][k] for k in ("transfers", "errors")},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("--minutes", type=float, default=30)
    ap.add_argument("--round", type=float, default=120)
    ap.add_argument("--gap", type=float, default=6)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--trace", action="store_true")
    ap.add_argument("--max-hours", type=float, default=3, help="give up when the board stays unavailable this long")
    ap.add_argument("--port", default=device.PORT)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    rng = random.Random(a.seed)
    rows, keys, crashes, events, soaked, rnd, last_up = [], [], [], [], 0.0, 0, None
    began = time.monotonic()
    with (a.out / "samples.jsonl").open("w") as samples:
        while soaked < a.minutes * 60 and time.monotonic() - began < a.max_hours * 3600:
            seconds = min(a.round, a.minutes * 60 - soaked)
            log_path = a.out / f"uart-{rnd:02d}.log"
            first = len(rows)
            waiting = False
            with device.acquire(), log_path.open("wb", buffering=0) as log:
                console = device.Console(a.port, log, drain_s=1)
                if last_up is None or board_ready(console, last_up) is None:
                    # The first round, or the board was reset or is silent: the image must be checked, which resets
                    # it. Not while another agent is in a board session (it holds or waits for the lock), whose
                    # image may be on the board between its operations.
                    console.close()
                    busy = others_active()
                    ok = False if busy else verify_playable(log, a.out, rnd, a.port)
                    events.append({"round": rnd, "host": round(time.time(), 3), "othersActive": busy,
                                   "event": "first round" if last_up is None else "reset or silent before the round",
                                   "playableVerified": ok})
                    print(f"round {rnd}: checking the image; other board sessions {busy}; playable verified: {ok}", flush=True)
                    waiting = not ok
                    if waiting and sum(1 for e in events if not e["playableVerified"] and not e["othersActive"]) >= 10:
                        raise SystemExit("the board has held another image for ten tries; stopping the soak")
                    console = device.Console(a.port, log, drain_s=1)
                t0 = time.monotonic()
                try:
                    if not waiting:
                        if a.trace:
                            console.command("trace on")
                        round_(console, rnd, seconds, rng, rows, keys)
                        if a.trace:
                            console.command("trace off")
                finally:
                    console.close()
                if not waiting:
                    soaked += time.monotonic() - t0
            rnd += 1
            if waiting:
                last_up = None
                time.sleep(30)
                continue
            for row in rows[first:]:
                samples.write(json.dumps(row) + "\n")
            samples.flush()
            for line in log_path.read_bytes().decode(errors="replace").splitlines():
                m = CRASH.search(line)
                if m:
                    crashes.append({"round": rnd - 1, "kernelMs": float(m[1]), "world": m[2], "turn": m[3], "why": m[4]})
            if len(rows) > first:
                last_up = rows[-1]["uptimeMs"]
                c = rows[-1]["worlds"].get("compositor", {})
                print(f"round {rnd - 1}: soaked {soaked / 60:.1f} min, uptime {last_up / 60000:.1f} min, compositor turns "
                      f"{c.get('turns')} restarts {c.get('restarts')} '{c.get('last_error')}', crashes so far {len(crashes)}",
                      flush=True)
            if soaked < a.minutes * 60:
                time.sleep(a.gap)
    with device.acquire(), (a.out / "uart-end.log").open("wb", buffering=0) as log:
        console = device.Console(a.port, log, drain_s=1)
        try:
            key(console, "f1", keys)
            console.drain(.8)
            key(console, "p", keys)   # leave the gallery in front, as a boot does
            console.drain(1)
        finally:
            console.close()
    (a.out / "crashes.jsonl").write_text("".join(json.dumps(c) + "\n" for c in crashes))
    segs = [summarize(seg) for seg in segments(rows)]
    comp = {"turns": sum(s["compositor"]["turns"] for s in segs), "cpuMs": round(sum(s["compositor"]["cpuMs"] for s in segs), 3),
            "restartsDuringSoak": sum(s["compositor"]["restarts"][1] - s["compositor"]["restarts"][0] for s in segs),
            "mboxPeak": max(s["compositor"]["mboxPeak"] for s in segs)}
    comp["meanTurnMs"] = round(comp["cpuMs"] / max(1, comp["turns"]), 3)
    summary = {
        "soakedMinutes": round(soaked / 60, 2), "elapsedMinutes": round((time.monotonic() - began) / 60, 2),
        "rounds": rnd, "samples": len(rows), "keys": len(keys),
        "keyCounts": {k: keys.count(k) for k in sorted(set(keys))},
        "events": events, "boots": len(segs), "compositor": comp, "segments": segs, "crashes": crashes,
    }
    device.save(a.out / "summary.json", summary)
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
