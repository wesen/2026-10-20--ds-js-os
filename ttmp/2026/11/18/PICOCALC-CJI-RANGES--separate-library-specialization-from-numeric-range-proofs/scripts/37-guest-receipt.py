"""Summarize completed RISC-V guest runs after verifying firmware IDs, reference bytes and nested counts."""
import argparse
import hashlib
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("world")
parser.add_argument("directory", type=Path)
args = parser.parse_args()
d = args.directory
pins = {Path(path).name: digest for digest, path in (line.split(maxsplit=1) for line in
                                                      (d / "verified.sha256").read_text().splitlines())}
for name in ("control.elf", "guard.elf", "ref.ir"):
    if hashlib.sha256((d / name).read_bytes()).hexdigest() != pins[name]:
        raise ValueError(f"identity mismatch for {name}")
if (d / "guard.ir").read_bytes() != (d / "ref.ir").read_bytes():
    raise ValueError("guarded frontend output differs from reference")
result = dict(world=args.world, heap_mib=8, slir_sha256=pins["ref.ir"], variants={})
for variant in ("control", "guard"):
    stats = (d / f"{variant}.stats").read_text()
    metric = re.search(r"frontend_steps=(\d+) gc_steps=(\d+) slide_bytes=(\d+)", stats)
    heap = re.search(r"(\d+) collections, (\d+) bytes copied, heap now (\d+) bytes, most live (\d+) bytes", stats)
    if not metric or not heap:
        raise ValueError(f"incomplete metrics for {variant}")
    front, gc, slide = map(int, metric.groups())
    count, survivor, cap, peak = map(int, heap.groups())
    if not 0 <= gc <= front or not 0 < peak <= cap == 8388608:
        raise ValueError(f"invalid intervals or memory for {variant}")
    result["variants"][variant] = dict(firmware_sha256=pins[f"{variant}.elf"], frontend_steps=front,
                                       gc_steps=gc, slide_bytes=slide, collections=count,
                                       survivor_bytes=survivor, live_peak_bytes=peak)
a, b = (result["variants"][v]["frontend_steps"] for v in ("control", "guard"))
result["frontend_instruction_reduction_percent"] = 100 * (a-b)/a
print(json.dumps(result, indent=2))
