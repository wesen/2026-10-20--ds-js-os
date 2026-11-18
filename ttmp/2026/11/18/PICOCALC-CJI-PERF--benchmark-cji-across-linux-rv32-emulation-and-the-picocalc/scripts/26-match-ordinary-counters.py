"""Compare exact GC work across physical P4, native x86-64 and emulated RV32 at the same heap size."""
import argparse
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("scratch", type=Path)
parser.add_argument("world")
parser.add_argument("mib", type=int)
args = parser.parse_args()
stem = args.scratch / f"{args.world}-{args.mib}-guest"
if stem.with_suffix(".ir").read_bytes() != (args.scratch / f"{args.world}.ref").read_bytes():
    raise ValueError("guest IR differs from reference")
raw = stem.with_suffix(".stats").read_text()
work = re.search(r"(\d+) collections, (\d+) bytes copied, heap now (\d+) bytes, most live (\d+) bytes", raw)
metrics = re.search(r"frontend_steps=(\d+) gc_steps=(\d+) slide_bytes=(\d+)", raw)
collections, survivor, arena, peak = map(int, work.groups())
front, gc, slide = map(int, metrics.groups())
if arena != args.mib * 1024**2 or not 0 <= gc <= front:
    raise ValueError("invalid guest arena or nested instruction counts")
evidence = Path(__file__).resolve().parents[1] / "various"
native = next(r for r in json.loads((evidence / "compiler-baseline.json").read_text())["host_timing"]
              if r["world"] == args.world and r["heap_bytes"] == arena and r["variant"] == "measured")
physical = next(r for r in map(json.loads, (evidence / "p4/p4-runs.jsonl").read_text().splitlines())
                if r["world"] == args.world and r["requested_heap_mib"] == args.mib and r["verified"])
same = dict(collections=collections, survivor_bytes=survivor, slide_bytes=slide, live_peak_bytes=peak)
for field, val in same.items():
    if val != native[field] or val != physical["metrics"][field]:
        raise ValueError(f"unmatched collector metric {field}")
print(json.dumps(dict(world=args.world, mib=args.mib, matched_work=same, guest_frontend_steps=front,
                      guest_gc_steps=gc, p4_frontend_us=physical["metrics"]["frontend_us"],
                      p4_gc_us=physical["metrics"]["gc_us"], native_frontend_median_us=native["frontend_us"]["median"]),
                 indent=2))
