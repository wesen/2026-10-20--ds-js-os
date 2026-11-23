#!/usr/bin/env python3
"""Soak the installed playable image and watch for the compositor's 80 ms turn-budget overrun (fix 4).

usage (repository root): python3 ttmp/.../scripts/01-compositor-soak.py OUT [--minutes 30] [--round 120] [--gap 6]
                                                                           [--seed 1] [--trace]

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

Writes OUT/uart-N.log per round, OUT/samples.jsonl (one row per sample), OUT/crashes.jsonl and OUT/summary.json.
"""
import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402

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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("--minutes", type=float, default=30)
    ap.add_argument("--round", type=float, default=120)
    ap.add_argument("--gap", type=float, default=6)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--trace", action="store_true")
    ap.add_argument("--port", default=device.PORT)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    rng = random.Random(a.seed)
    rows, keys, crashes, soaked, rnd = [], [], [], 0.0, 0
    began = time.monotonic()
    with (a.out / "samples.jsonl").open("w") as samples:
        while soaked < a.minutes * 60:
            seconds = min(a.round, a.minutes * 60 - soaked)
            log_path = a.out / f"uart-{rnd:02d}.log"
            with device.acquire(), log_path.open("wb", buffering=0) as log:
                t0 = time.monotonic()
                console = device.Console(a.port, log, drain_s=1)
                try:
                    if a.trace:
                        console.command("trace on")
                    first = len(rows)
                    round_(console, rnd, seconds, rng, rows, keys)
                    if a.trace:
                        console.command("trace off")
                finally:
                    console.close()
                soaked += time.monotonic() - t0
            for row in rows[first:]:
                samples.write(json.dumps(row) + "\n")
            samples.flush()
            for line in log_path.read_bytes().decode(errors="replace").splitlines():
                m = CRASH.search(line)
                if m:
                    crashes.append({"round": rnd, "kernelMs": float(m[1]) * 1, "world": m[2], "turn": m[3], "why": m[4]})
            c = rows[-1]["worlds"].get("compositor", {})
            print(f"round {rnd}: soaked {soaked / 60:.1f} min, uptime {rows[-1]['uptimeMs'] / 60000:.1f} min, compositor "
                  f"turns {c.get('turns')} restarts {c.get('restarts')} '{c.get('last_error')}', crashes so far {len(crashes)}",
                  flush=True)
            rnd += 1
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
    first, last = rows[0], rows[-1]
    ups = [r["uptimeMs"] for r in rows]
    comp = [r["worlds"]["compositor"] for r in rows]
    summary = {
        "soakedMinutes": round(soaked / 60, 2), "elapsedMinutes": round((time.monotonic() - began) / 60, 2),
        "rounds": rnd, "samples": len(rows), "keys": len(keys),
        "keyCounts": {k: keys.count(k) for k in sorted(set(keys))},
        "uptimeMs": {"first": ups[0], "last": ups[-1]},
        "rebootsSeen": sum(1 for x, y in zip(ups, ups[1:]) if y < x),
        "compositor": {
            "restartsFirst": comp[0]["restarts"], "restartsLast": comp[-1]["restarts"],
            "lastErrors": sorted({c["last_error"] for c in comp}),
            "turns": comp[-1]["turns"] - comp[0]["turns"], "cpuMs": round(comp[-1]["cpu_ms"] - comp[0]["cpu_ms"], 3),
            "meanTurnMs": round((comp[-1]["cpu_ms"] - comp[0]["cpu_ms"]) / max(1, comp[-1]["turns"] - comp[0]["turns"]), 3),
            "mboxPeak": max(c["mbox_peak"] for c in comp),
        },
        "worldsRestarted": {w: [first["worlds"][w]["restarts"], last["worlds"][w]["restarts"]] for w in WATCH
                            if w in first["worlds"] and w in last["worlds"]},
        "i2c0": {"transfers": last["buses"]["i2c0"]["transfers"] - first["buses"]["i2c0"]["transfers"],
                 "errors": last["buses"]["i2c0"]["errors"] - first["buses"]["i2c0"]["errors"]},
        "crashes": crashes,
    }
    device.save(a.out / "summary.json", summary)
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
