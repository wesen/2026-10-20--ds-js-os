"""Summarize paired telemetry replays on P4 and their corresponding RV32 instruction counts."""
import argparse
import json
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("physical", type=Path)
parser.add_argument("model", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
board, model = (json.loads(p.read_text()) for p in (args.physical, args.model))
assert board["qualified"] and board["inputs"] == model["inputs"]
arms = board["inputs"]["arms"]
blocks = range(board["config"]["blocks"])
data = {(r["block"], r["endpoint"], r["arm"]): r for r in board["runs"]}
counts = {(r["arm"], r["endpoint"]): r["instructions"] for r in model["rows"]}
assert len(data) == len(blocks) * len(arms) * 3
summary = []
for e, endpoint in enumerate(("parse", "count", "label")):
    for i, arm in enumerate(arms):
        times = [data[b, e, i]["us"] for b in blocks]
        delta = [100 * (data[b, e, 0]["us"] - t) / data[b, e, 0]["us"] for b, t in zip(blocks, times)]
        steps = counts[arm["arm"], endpoint]
        summary.append(dict(endpoint=endpoint, arm=arm["arm"], bytes=arm["imageBytes"],
                            medianUs=median(times), minUs=min(times), maxUs=max(times),
                            pairedReductionPct=round(median(delta), 3), pairedMinPct=round(min(delta), 3),
                            pairedMaxPct=round(max(delta), 3), fasterBlocks=sum(x > 0 for x in delta),
                            instructions=steps, instructionReductionPct=round(100*(1-steps/counts[arms[0]["arm"], endpoint]),3)))
args.output.mkdir(parents=True, exist_ok=True)
(args.output/"paired-results.json").write_text(json.dumps(summary, indent=2)+"\n")

labels = {
    "bounds-selected":"Identical code, second address", "semantics-late":"Late semantic lowering",
    "semantics-selected":"Selective late lowering", "burst-leaf":"Frameless leaves",
    "burst-inline":"Selective inlining", "stock_repeat":"Identical entry, repeated",
    "early-leaf":"Frameless leaves", "early-inline":"Selective inlining",
    "late-stock":"Late semantics", "late-leaf":"Late + frameless", "late-inline":"Late + inline"
}
display = [labels[arm["arm"]] for arm in arms[1:]]
fig, axes = plt.subplots(1, 3, figsize=(11, 4), sharex=True, sharey=True)
for axis, endpoint in zip(axes, ("parse", "count", "label")):
    rows = [r for r in summary if r["endpoint"] == endpoint][1:]
    for y, row in enumerate(rows):
        axis.plot([row["pairedMinPct"],row["pairedMaxPct"]], [y,y], color="#8baab8", lw=2)
        axis.scatter(row["pairedReductionPct"],y,color="#00677b",s=25,zorder=3)
        axis.scatter(row["instructionReductionPct"],y,color="#a44c20",marker="x",s=26,zorder=3)
    axis.set_title(endpoint.capitalize())
    axis.axvline(0,color="#777",lw=.8)
    axis.grid(axis="x",alpha=.2)
    axis.set_xlabel("Reduction from stock (%)")
axes[0].set_yticks(range(len(display)),display)
axes[0].invert_yaxis()
composed = arms[0]["arm"] == "early-stock"
title = "Combining late lowering and leaf optimization on the ESP32-P4" if composed else "Generated telemetry code on the ESP32-P4"
fig.suptitle(title, fontsize=14)
fig.text(.5,.015,"Dot: median of 11 paired timing changes   |   Line: observed range   |   Cross: modeled instruction reduction",ha="center")
fig.tight_layout(rect=(0,.055,1,.93))
filename = "telemetry-composed-runtime.png" if composed else "telemetry-native-runtime.png"
fig.savefig(args.output/filename, dpi=160, bbox_inches="tight")
