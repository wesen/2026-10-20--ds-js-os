"""Summarize an arms run: per world and arm, device compile time, heap peak, and budget fit.

usage: python3 03-summarize-arms.py RUN_DIR [OUT.json]
Reads RUN_DIR/rows.jsonl (02-run-arms-firmware.py). A world's arm "fits" when every compile
succeeded and its slowest compile is within 75% of the world's deadline (the decision rule's
25% margin). "digests" counts distinct module digests across all compiles of that arm: 1 means
the arm's output was identical in every round and boot.
"""
import json, statistics, sys
from pathlib import Path

DEADLINE_US = {"files": 1_700_000, "agenda": 1_700_000, "editor": 6_000_000, "chess": 6_000_000}
HEAP = {"files": 2 << 20, "agenda": 2 << 20, "editor": 4 << 20, "chess": 4 << 20}
run = Path(sys.argv[1])
rows = [json.loads(l) for l in (run / "rows.jsonl").read_text().splitlines() if l.strip()]
arms = list(dict.fromkeys(r["arm"] for r in rows))
out = {}
print(f"| world | arm | n | median s | min–max s | peak MB | module B | digests | fits (≤75% of deadline) |")
print("|---|---|---:|---:|---:|---:|---:|---:|---|")
for app in DEADLINE_US:
    for arm in arms:
        rs = [r for r in rows if r["app"] == app and r["arm"] == arm]
        if not rs:
            continue
        ok = [r for r in rs if r["status"] == "ok"]
        us = [r["us"] for r in rs]
        cell = {"n": len(rs), "ok": len(ok), "medianUs": statistics.median(us), "minUs": min(us), "maxUs": max(us),
                "peakBytes": statistics.median(r["peak"] for r in rs), "bytes": sorted({r["bytes"] for r in ok}),
                "digests": len({r["fnv"] for r in ok}), "deadlineUs": DEADLINE_US[app], "heapLimit": HEAP[app]}
        cell["fits"] = len(ok) == len(rs) and max(us) <= 0.75 * DEADLINE_US[app]
        out[f"{app}.{arm}"] = cell
        print(f"| {app} | {arm} | {len(rs)} | {cell['medianUs'] / 1e6:.2f} | {min(us) / 1e6:.2f}–{max(us) / 1e6:.2f} | "
              f"{cell['peakBytes'] / 1e6:.2f} | {','.join(map(str, cell['bytes']))} | {cell['digests']} | "
              f"{'yes' if cell['fits'] else 'no'}{'' if len(ok) == len(rs) else f' ({len(rs) - len(ok)} failed)'} |")
if len(sys.argv) > 2:
    Path(sys.argv[2]).write_text(json.dumps(out, indent=1) + "\n")
