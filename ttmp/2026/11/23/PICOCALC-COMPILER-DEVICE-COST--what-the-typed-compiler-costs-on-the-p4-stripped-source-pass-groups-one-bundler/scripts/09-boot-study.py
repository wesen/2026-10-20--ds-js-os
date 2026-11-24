#!/usr/bin/env python3
"""Paired board study of the boot compiles over several firmware arms, installed in rotating order.

usage: 09-boot-study.py --arm NAME=DIR [--arm NAME=DIR ...] --out OUT [--blocks 3] [--lock-per-block]
       09-boot-study.py --summarize OUT

The first arm is the control. Block b installs the arms rotated by b (ABC, BCA, CAB, ...) with
bench/board/device.install (serial lock per install, write, verify, the boot's compiles, settle, health with
peripherals on) and keeps each boot's UART log in OUT/bNN-ARM/. --lock-per-block holds the serial lock for a whole
block (its installs back to back, the same steps) instead of per install, so a block's arms run in one sitting on a
board other agents share. A keyboard bus that stops answering (the health check's I2C0 error) stops the study. It never touches firmware/PLAYABLE.json; run
`make restore-playable` from the main checkout afterwards. The summary reads every "<app> compile source=... us=...
peak_js_bytes=... module_bytes=..." line, the TYPEDCOMPILE line after it and the "typed compiler bytecode: PATH N
bytes" lines, and prints per app and arm the median compile time, the peak compiler heap, the module bytes, and per
block the difference to the control (and to the previous arm), plus each arm's bytecode cache.
"""
import argparse
import json
import re
import statistics
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
COMPILE = re.compile(r"(\S+) compile source=(\S+) status=(\w+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")
BYTECODE = re.compile(r"typed compiler bytecode: (\S+) (\d+) bytes")
HIT = re.compile(r"(\S+) cache hit us=")
DEADLINES = {"agenda": 4.0, "files": 3.0, "editor": 6.0, "chess": 6.0, "candela": 8.0}


def parse(log):
    compiles, bytecode, last = {}, {}, None
    for raw in log.read_bytes().split(b"\n"):
        line = raw.decode(errors="replace").strip()
        if m := COMPILE.search(line):
            last = m[1]
            compiles[last] = {"status": m[3], "us": int(m[4]), "peak": int(m[5]), "module": int(m[6])}
        elif line.startswith("TYPEDCOMPILE ") and last:
            try:
                compiles[last]["phases"] = json.loads(line[len("TYPEDCOMPILE "):])
            except ValueError:
                pass
        elif m := BYTECODE.search(line):
            bytecode[m[1]] = int(m[2])
        elif m := HIT.search(line):
            bytecode.setdefault("cacheHits", []).append(m[1])
    return compiles, bytecode


def load_us(phases, in_call=None):
    return sum(e["loadUs"] + e["runUs"] for e in phases.get("evals", []) if in_call is None or e["inCall"] == in_call)


def summarize(out):
    runs = json.loads((out / "runs.json").read_text())
    arms = list(dict.fromkeys(r["arm"] for r in json.loads((out / "arms.json").read_text())))
    rows = []
    for run in runs:
        compiles, bytecode = parse(out / run["dir"] / "uart.log")
        rows.append({**run, "compiles": compiles, "bytecode": bytecode})
    (out / "rows.json").write_text(json.dumps(rows, indent=1) + "\n")
    apps = [a for a in ("candela", "files", "editor", "agenda", "chess", "chess/painter")
            if any(a in r["compiles"] for r in rows)]
    blocks = sorted({r["block"] for r in rows})
    print("| App | arm | median s | Δ vs control per block (ms) | Δ vs previous arm per block (ms) | load ms (outside / in call) | "
          "call s | free ms | peak KB | Δ peak KB | module bytes | % of deadline |")
    print("|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|")
    for app in apps:
        for i, arm in enumerate(arms):
            mine = [r["compiles"][app] for r in rows if r["arm"] == arm and app in r["compiles"]]
            if not mine:
                continue
            def deltas(other):
                out_ = []
                for b in blocks:
                    pair = {r["arm"]: r["compiles"].get(app) for r in rows if r["block"] == b}
                    if pair.get(arm) and pair.get(other):
                        out_.append((pair[arm]["us"] - pair[other]["us"]) / 1000)
                return ", ".join(f"{d:+.1f}" for d in out_)
            med = lambda f: statistics.median(f(c) for c in mine)
            phased = [c for c in mine if "phases" in c]
            ph = lambda f: statistics.median(f(c["phases"]) for c in phased) if phased else float("nan")
            control_peak = statistics.median(r["compiles"][app]["peak"] for r in rows if r["arm"] == arms[0] and app in r["compiles"])
            deadline = DEADLINES.get(app)
            share = f"{100 * med(lambda c: c['us']) / 1e6 / deadline:.1f}" if deadline else ""
            print(f"| {app} | {arm} | {med(lambda c: c['us']) / 1e6:.3f} | {deltas(arms[0]) if i else ''} | "
                  f"{deltas(arms[i - 1]) if i else ''} | {ph(lambda p: load_us(p, False)) / 1000:.1f} / {ph(lambda p: load_us(p, True)) / 1000:.1f} | "
                  f"{ph(lambda p: p['callUs'] - load_us(p, True)) / 1e6:.3f} | {ph(lambda p: p['freeUs']) / 1000:.1f} | "
                  f"{med(lambda c: c['peak']) / 1024:.0f} | {(med(lambda c: c['peak']) - control_peak) / 1024:+.0f} | "
                  f"{sorted({c['module'] for c in mine})} | "
                  f"{share} |")
    for arm in arms:
        caches = [r["bytecode"] for r in rows if r["arm"] == arm and r["bytecode"]]
        if caches:
            print(arm, "bytecode cache:", json.dumps(caches[0]), "total", sum(v for v in caches[0].values() if isinstance(v, int)))
    print("health:", {arm: [r["healthy"] for r in runs if r["arm"] == arm] for arm in arms})
    print("compiled-module cache hits (should be none):",
          {r["dir"]: r["bytecode"]["cacheHits"] for r in rows if r["bytecode"].get("cacheHits")})


def install_held(device, build, out, digest):
    """device.install's steps (hold, write, verify, boot, health with peripherals on) for a caller holding the lock."""
    out.mkdir(parents=True, exist_ok=False)
    with (out / "uart.log").open("wb", buffering=0) as log:
        # A firmware with the compiled-module cache (PICOCALC-COMPILE-CACHE) would serve the next boot's modules from
        # it when its key matches (the same arm in a later block): empty it first, so every boot compiles.
        try:
            console = device.Console(device.PORT, log, drain_s=1)
            try:
                cleared = [line for line in console.command("typed cache clear", timeout=60)
                           if "TCACHE" in line or "unknown" in line]
            finally:
                console.close()
        except Exception as error:  # an image without a console; the boot's log shows any cache hit
            cleared = [repr(error)[:200]]
        record = {"build": str(build), "sha256": digest, "cacheCleared": cleared,
                  "heldBeforeFlash": device.quiesce(device.PORT, log)}
        device.write_app(build, out, "install", device.PORT)
        console = device.Console(device.PORT, log)
        try:
            record["health"] = device.health(console, "on")
        finally:
            console.close()
    device.save(out / "after.json", record)
    return record


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--arm", action="append", default=[])
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--blocks", type=int, default=3)
    p.add_argument("--summarize", action="store_true")
    p.add_argument("--lock-per-block", action="store_true")
    a = p.parse_args()
    if a.summarize:
        return summarize(a.out)
    import device
    arms = [dict(zip(("arm", "dir"), spec.split("=", 1))) for spec in a.arm]
    assert arms, "at least one arm (one arm: the boots of one image, for its health and deadlines)"
    a.out.mkdir(parents=True, exist_ok=False)
    for arm in arms:
        arm["sha256"] = device.check_build(arm["dir"])
    (a.out / "arms.json").write_text(json.dumps(arms, indent=1) + "\n")
    runs = []

    def block_installs(block, order):
        for arm in order:
            tag = f"b{block:02d}-{arm['arm']}"
            print("install", tag, arm["sha256"][:12], time.strftime("%H:%M:%S"), flush=True)
            try:
                if a.lock_per_block:
                    record = install_held(device, arm["dir"], a.out / tag, arm["sha256"])
                else:
                    record = device.install(arm["dir"], a.out / tag, "on")
                runs.append({"block": block, "arm": arm["arm"], "dir": tag, "sha256": record["sha256"], "healthy": True})
            except Exception as error:  # keep the failed boot's log; the summary reads its compile lines
                runs.append({"block": block, "arm": arm["arm"], "dir": tag, "sha256": arm["sha256"], "healthy": False,
                             "error": repr(error)[:500]})
                print("unhealthy:", repr(error)[:300], flush=True)
                if "I2C0" in repr(error):
                    (a.out / "runs.json").write_text(json.dumps(runs, indent=1) + "\n")
                    sys.exit("the keyboard bus stopped answering: board work stops here")
            (a.out / "runs.json").write_text(json.dumps(runs, indent=1) + "\n")

    for block in range(a.blocks):
        order = arms[block % len(arms):] + arms[:block % len(arms)]
        if a.lock_per_block:
            with device.acquire():
                block_installs(block, order)
            time.sleep(5)  # let a waiting agent take the lock
        else:
            block_installs(block, order)
    summarize(a.out)


if __name__ == "__main__":
    main()
