#!/usr/bin/env python3
"""Paired board study of the boot compiles: control and candidate firmware, installed in alternation.

usage: 08-board-boot-compiles.py --control DIR --candidate DIR --out OUT [--blocks 3] [--peripherals off-by-user]
       08-board-boot-compiles.py --summarize OUT

Each block installs both images with bench/board/device.install (write, verify, the boot's compiles, settle,
health) in the order AB, BA, AB, ..., and keeps the boot's UART log in OUT/bNN-ARM/. device.install holds the
serial lock for each install. It never touches firmware/PLAYABLE.json; run `make restore-playable` afterwards.
The summary reads every "<app> compile source=... status=... us=... peak_js_bytes=..." and "typed compiler
bytecode: PATH N bytes" line and prints, per app, each arm's median compile time and peak compiler heap and the
paired per-block differences (candidate - control), plus each image's bytecode cache entries.
"""
import argparse
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(REPO / "bench/board"))
COMPILE = re.compile(r"^(\S+) compile source=(\S+) status=(\w+) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")
BYTECODE = re.compile(r"^typed compiler bytecode: (\S+) (\d+) bytes")
APPS = ("agenda", "editor", "files", "chess", "candela", "mobile-painter")
DEADLINES = {"agenda": 1.7, "files": 1.7, "editor": 6.0, "chess": 6.0}


def parse(log):
    compiles, bytecode = {}, {}
    for raw in log.read_bytes().split(b"\n"):
        line = raw.decode(errors="replace").strip()
        if m := COMPILE.match(line):
            compiles[m[1]] = {"status": m[3], "us": int(m[4]), "peak": int(m[5]), "module": int(m[6])}
        elif m := BYTECODE.match(line):
            bytecode[m[1]] = int(m[2])
    return compiles, bytecode


def summarize(out):
    runs = json.loads((out / "runs.json").read_text())
    rows = []
    for run in runs:
        compiles, bytecode = parse(out / run["dir"] / "uart.log")
        rows.append({**run, "compiles": compiles, "bytecode": bytecode})
    (out / "rows.json").write_text(json.dumps(rows, indent=1) + "\n")
    arms = ("control", "candidate")
    print("| App | control s | candidate s | paired Δ s (per block) | 75 % of deadline | control peak KB | "
          "candidate peak KB | paired Δ KB |")
    print("|---|---:|---:|---|---:|---:|---:|---:|")
    for app in APPS:
        by = {arm: [r for r in rows if r["arm"] == arm and app in r["compiles"]] for arm in arms}
        if not all(by.values()):
            continue
        med = lambda arm, key: statistics.median(r["compiles"][app][key] for r in by[arm])
        deltas, peaks = [], []
        for block in sorted({r["block"] for r in rows}):
            pair = {r["arm"]: r["compiles"].get(app) for r in rows if r["block"] == block}
            if all(pair.get(arm) for arm in arms):
                deltas.append((pair["candidate"]["us"] - pair["control"]["us"]) / 1e6)
                peaks.append((pair["candidate"]["peak"] - pair["control"]["peak"]) / 1024)
        status = {arm: sorted({r["compiles"][app]["status"] for r in by[arm]}) for arm in arms}
        print(f"| {app} | {med('control', 'us') / 1e6:.3f} | {med('candidate', 'us') / 1e6:.3f} | "
              + ", ".join(f"{d:+.3f}" for d in deltas) + f" | {0.75 * DEADLINES[app]:.2f} | " if app in DEADLINES else
              f"| {app} | {med('control', 'us') / 1e6:.3f} | {med('candidate', 'us') / 1e6:.3f} | "
              + ", ".join(f"{d:+.3f}" for d in deltas) + " | | ", end="")
        print(f"{med('control', 'peak') / 1024:.0f} | {med('candidate', 'peak') / 1024:.0f} | "
              + ", ".join(f"{d:+.0f}" for d in peaks) + f" |{'' if status == {'control': ['ok'], 'candidate': ['ok']} else ' ' + str(status)}")
    for arm in arms:
        caches = [r["bytecode"] for r in rows if r["arm"] == arm]
        print(arm, "bytecode cache:", json.dumps(caches[0]))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--control", type=Path)
    p.add_argument("--candidate", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--blocks", type=int, default=3)
    p.add_argument("--peripherals", default="off-by-user", choices=("on", "off-by-user"))
    p.add_argument("--summarize", action="store_true")
    a = p.parse_args()
    if a.summarize:
        return summarize(a.out)
    import device
    a.out.mkdir(parents=True, exist_ok=False)
    images = {"control": a.control, "candidate": a.candidate}
    digests = {arm: device.check_build(path) for arm, path in images.items()}
    runs = []
    for block in range(a.blocks):
        order = ("control", "candidate") if block % 2 == 0 else ("candidate", "control")
        for arm in order:
            tag = f"b{block:02d}-{arm}"
            print("install", tag, digests[arm][:12], flush=True)
            try:
                record = device.install(images[arm], a.out / tag, a.peripherals)
                runs.append({"block": block, "arm": arm, "dir": tag, "sha256": record["sha256"], "healthy": True})
            except Exception as error:  # keep the log of a failed boot; the summary reads its compile lines
                runs.append({"block": block, "arm": arm, "dir": tag, "sha256": digests[arm], "healthy": False,
                             "error": repr(error)[:500]})
                print("unhealthy:", repr(error)[:300], flush=True)
            (a.out / "runs.json").write_text(json.dumps(runs, indent=1) + "\n")
    summarize(a.out)


if __name__ == "__main__":
    main()
