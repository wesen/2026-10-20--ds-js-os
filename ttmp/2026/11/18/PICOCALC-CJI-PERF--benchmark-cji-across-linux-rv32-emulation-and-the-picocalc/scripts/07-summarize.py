"""Produce a compact JSON report for verified artifacts present in a run directory."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
from statistics import median
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
args = parser.parse_args()
out = args.directory


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def spread(values):
    return {"median": median(values), "min": min(values), "max": max(values)}


def load_rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def native_profile(world):
    listing = subprocess.check_output(["callgrind_annotate", "--auto=no", "--threshold=99",
                                       str(out / f"{world}.cg")], text=True)
    pattern = r"^\s*([\d,]+)\s+\(\s*[\d.]+%\)\s+(.+)$"
    rows = [(int(count.replace(",", "")), label) for count, label in re.findall(pattern, listing, re.M)]
    total = next(count for count, label in rows if label == "PROGRAM TOTALS")
    functions = [{"symbol": label.split(" [")[0].split(":", 1)[-1], "instructions": count}
                 for count, label in rows if label != "PROGRAM TOTALS"]
    return dict(instructions=total, top=functions[:12])


def guest_profile(world):
    log = (out / f"{world}.rv32.log").read_text()
    count = re.search(r"; (\d+) instructions", log)
    symbols = re.findall(r"^\s*(\d+) (\S+) \(entered (\d+) times\)", log, re.M)
    assert count and symbols
    return dict(harness_instructions=int(count[1]),
                top=[dict(symbol=s, instructions=int(n), entries=int(e)) for n,s,e in symbols[:12]])


report = {"worlds": {}, "host_timing": []}
for world in ["files", "agenda"]:
    reference = digest(out / f"{world}.ref")
    summary = dict(slir_sha256=reference, source_sha256=digest(Path(f"picocalc-os/js/apps/{world}.js")))
    report["worlds"][world] = summary
    for kind, collect in [("native", native_profile), ("rv32", guest_profile)]:
        ir = out / f"{world}.{kind}.ir"
        if ir.exists() and digest(ir) == reference:
            summary[kind] = collect(world)
    for mib in [8, 10]:
        stem = out / f"{world}-{mib}-guest"
        if stem.with_suffix(".ir").exists() and digest(stem.with_suffix(".ir")) == reference:
            stats = stem.with_suffix(".stats").read_text()
            match = re.search(r"cji_metrics frontend_steps=(\d+) gc_steps=(\d+) slide_bytes=(\d+)", stats)
            if match:
                summary[f"guest_metrics_{mib}MiB"] = dict(zip(
                    ("frontend_steps", "gc_steps", "slide_bytes"), map(int, match.groups())))

groups = defaultdict(list)
for row in load_rows(out / "host-runs.jsonl"):
    assert row["verified"] and row["slir_sha256"] == report["worlds"][row["world"]]["slir_sha256"]
    if not row["warmup"]:
        groups[row["world"], row["heap_bytes"], row["variant"]].append(row)
for (world, heap, variant), rows in sorted(groups.items()):
    assert len({r["ordinal"] for r in rows}) == len(rows)
    timed = {k: spread([r[k] for r in rows]) for k in
             ("process_elapsed_us", "process_cpu_us", "frontend_us", "gc_us") if rows[0][k] is not None}
    work = {}
    for k in ["collections", "survivor_bytes", "slide_bytes", "live_peak_bytes", "executable_sha256"]:
        values = {r[k] for r in rows}
        assert len(values) == 1, (world, k, values)
        work[k] = values.pop()
    report["host_timing"].append(dict(world=world, heap_bytes=heap, variant=variant,
                                      n=len(rows), **timed, **work))
print(json.dumps(report, indent=2))
