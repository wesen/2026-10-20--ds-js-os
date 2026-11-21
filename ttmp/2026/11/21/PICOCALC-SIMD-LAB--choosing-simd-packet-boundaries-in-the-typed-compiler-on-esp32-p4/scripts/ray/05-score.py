#!/usr/bin/env python3
"""Validate timed trial records and compute block-paired percentage changes."""
import argparse
import csv
import json
from pathlib import Path
from statistics import median

def score(raw, tag, names, dimensions, count, fieldnames, baseline, out):
    rows = {}
    for line in raw.read_text(errors="replace").splitlines():
        if not line.startswith(tag + " "):
            continue
        fields = line.split()[1:]
        if tag == "CEILING":
            block, scene, arm, cycles, ok = fields
            case = scene
            calls = 160
        else:
            block, family, n, arm, cycles, calls, ok = fields
            case = family + "/" + n
        key = int(block), case, arm
        if key in rows or ok != "1":
            raise ValueError(f"duplicate or bad result: {line}")
        rows[key] = int(cycles), int(calls)
    expected = {(b, case, arm) for b in range(count) for case in dimensions for arm in names}
    if set(rows) != expected:
        raise ValueError(f"incomplete record set: {sorted(expected - set(rows))}")
    summary = {}
    with (out / (tag.lower() + ".csv")).open("w") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["block", *fieldnames, "arm", "cycles", "guest_calls", "all_passed"])
        for (block, case, arm), (cycles, calls) in sorted(rows.items()):
            writer.writerow([block, *case.split("/"), arm, cycles, calls, 1])
    for case in dimensions:
        entries = {}
        for arm in names:
            control = baseline[arm]
            curr = [rows[i, case, arm][0] for i in range(count)]
            ref = [rows[i, case, control][0] for i in range(count)]
            entries[arm] = {
                "cycles_median": median(curr), "control": control,
                "paired_delta_cycles_median": median(a-b for a,b in zip(curr,ref)),
                "paired_saving_percent_median": round(median(100*(b-a)/b for a,b in zip(curr,ref)),4),
                "faster_blocks": sum(a<b for a,b in zip(curr,ref)),
            }
        summary[case] = entries
    (out / (tag.lower() + "-summary.json")).write_text(json.dumps(summary, indent=2)+"\n")

parser=argparse.ArgumentParser()
parser.add_argument("trial",choices=["rows","proof"])
parser.add_argument("log",type=Path)
parser.add_argument("out",type=Path)
args=parser.parse_args()
args.out.mkdir(parents=True,exist_ok=True)
if args.trial=="rows":
    names = ["typed-stock","typed-scalar","typed-pie","checked-c","reg-scalar","input-min","input-minmax","typed-empty","typed-full"]
    controls = ["typed-stock","typed-stock","typed-scalar","typed-stock","checked-c","reg-scalar","reg-scalar","typed-pie","typed-pie"]
    score(args.log,"CEILING",names,["opening","dense","sparse"],9,["scene"],dict(zip(names,controls)),args.out)
else:
    score(args.log,"PROOF",["0","1","2"],[f"{f}/{n}" for f in range(4) for n in [8,32,127]],
          6,["ceiling_family","length"],{"0":"1","1":"1","2":"1"},args.out)
