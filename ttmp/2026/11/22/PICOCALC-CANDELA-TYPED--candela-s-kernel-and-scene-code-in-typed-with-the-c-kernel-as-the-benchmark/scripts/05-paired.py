#!/usr/bin/env python3
"""05-paired.py: a paired board study of the gallery's two kernel arms, Typed against C++ (PICOCALC-CANDELA-TYPED).

usage: python3 -I 05-paired.py OUT [--blocks 4] [--passes 4] [ID ...]

On the candela-typed image already running (install it first; the Typed arm compiles on its first digest, which
this script runs once as a warm-up), under the board lock: for each block and scene, "gallery digest ID PASSES psram
typed" and "... cpp", with the order alternating by block (typed first in even blocks, cpp first in odd ones), so a
drift in the board's temperature or clock does not favour one arm. Each digest renders PASSES passes from a fresh
accumulation on the gallery's helper task and reports cyclesPerSample and seconds. Writes OUT/rows.jsonl (one row
per digest), OUT/uart.log and OUT/summary.json: per scene the per-block ratios typed/cpp of cycles per sample and of
seconds per pass, their median, the range, and whether every block's digests equal the arm's reference."""
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / "AGENTS.md").exists())
sys.path.insert(0, str(REPO / "bench/board"))
import device  # noqa: E402

REFS = {"cpp": REPO / "bench/reference/candela-gallery/rv32-4-passes.jsonl",
        "typed": REPO / "bench/reference/candela-gallery/typed-4-passes.jsonl"}


def digest(console, log_rows, sid, passes, arm, block, timeout=1200):
    console.send(f"gallery digest {sid} {passes} psram {arm}")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        raw = console.line(deadline).decode(errors="replace").strip()
        if "Guru Meditation" in raw or "assert failed" in raw:
            raise RuntimeError(f"board crashed: {raw}")
        if raw.startswith("CGAL {"):
            r = json.loads(raw[5:])
            if r.get("ev") == "error":
                raise RuntimeError(f"{sid} {arm}: {r}")
            if r.get("ev") == "digest" and r.get("id") == sid and r.get("arm") == arm:
                r["block"] = block
                log_rows.write(json.dumps(r) + "\n"); log_rows.flush()
                return r
    raise TimeoutError(f"{sid} {arm}: no digest within {timeout} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--blocks", type=int, default=4)
    ap.add_argument("--passes", type=int, default=4)
    ap.add_argument("ids", nargs="*")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    refs = {arm: {r["id"]: r for r in map(json.loads, p.read_text().splitlines())} for arm, p in REFS.items()}
    ids = a.ids or list(refs["cpp"])
    rows = (a.out / "rows.jsonl").open("w")
    with device.acquire(), (a.out / "uart.log").open("wb", buffering=0) as log:
        console = device.Console(device.PORT, log)
        try:
            warm = digest(console, rows, ids[0], a.passes, "typed", -1)
            print(json.dumps({"warmup": ids[0], "beginMs": warm["beginMs"]}), flush=True)
            for block in range(a.blocks):
                for sid in ids:
                    for arm in (("typed", "cpp") if block % 2 == 0 else ("cpp", "typed")):
                        r = digest(console, rows, sid, a.passes, arm, block)
                        print(json.dumps({k: r[k] for k in ("block", "id", "arm", "cyclesPerSample", "seconds", "acc")}), flush=True)
        finally:
            console.close()
    got = [json.loads(l) for l in (a.out / "rows.jsonl").read_text().splitlines()]
    summary = {"blocks": a.blocks, "passes": a.passes, "scenes": {}}
    for sid in ids:
        by = {(r["block"], r["arm"]): r for r in got if r["id"] == sid and r["block"] >= 0}
        cyc = [by[b, "typed"]["cyclesPerSample"] / by[b, "cpp"]["cyclesPerSample"] for b in range(a.blocks)]
        sec = [by[b, "typed"]["seconds"] / by[b, "cpp"]["seconds"] for b in range(a.blocks)]
        same = all(by[b, arm][k] == refs[arm][sid][k] for b in range(a.blocks) for arm in ("typed", "cpp")
                   for k in ("frame0", "acc", "disp"))
        summary["scenes"][sid] = {
            "typedCyclesPerSample": statistics.median(by[b, "typed"]["cyclesPerSample"] for b in range(a.blocks)),
            "cppCyclesPerSample": statistics.median(by[b, "cpp"]["cyclesPerSample"] for b in range(a.blocks)),
            "typedSecPerPass": statistics.median(by[b, "typed"]["seconds"] for b in range(a.blocks)) / a.passes,
            "cppSecPerPass": statistics.median(by[b, "cpp"]["seconds"] for b in range(a.blocks)) / a.passes,
            "ratioCycles": statistics.median(cyc), "ratioCyclesRange": [min(cyc), max(cyc)],
            "ratioSeconds": statistics.median(sec), "ratioSecondsRange": [min(sec), max(sec)],
            "digestsMatchReference": same}
    ratios = [s["ratioCycles"] for s in summary["scenes"].values()]
    summary["geomeanRatioCycles"] = statistics.geometric_mean(ratios)
    (a.out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(json.dumps({"geomeanRatioCycles": summary["geomeanRatioCycles"]}))


if __name__ == "__main__":
    main()
