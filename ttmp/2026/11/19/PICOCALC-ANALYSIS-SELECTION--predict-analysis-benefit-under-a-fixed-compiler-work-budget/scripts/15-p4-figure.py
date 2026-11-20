"""Draw the complete physical elapsed time by selector compilation phase."""
import argparse
import gzip
import json
from pathlib import Path
from statistics import mean

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

PHASES = (
    ("setup", "Inputs, realm, and scripts", "#263F58"),
    ("dispatch", "Call preparation", "#768C9C"),
    ("features", "Parser and feature pass", "#9C5738"),
    ("ordering", "Function ordering", "#E2AA55"),
    ("native", "Native generation and teardown", "#4582A4"),
)
LANES = (("base", "Source order"), ("literal", "Literal only"), ("density", "Words per cell"))


def draw(data, output):
    inputs = [("editor", "Editor · identical full ELF")]
    if "synthetic" in data["summary"]:
        inputs.append(("synthetic", "Distributed synthetic · raw RV32"))
    fig, axes = plt.subplots(1, len(inputs), squeeze=False, sharex=True, figsize=(11.4, 4.6))
    fig.subplots_adjust(left=.15, right=.98, top=.74, bottom=.22, wspace=.42)
    fig.text(.15, .952, "The extra pass in physical cold compilation",
             fontsize=20, color="#172D43", weight="bold", va="top")
    fig.text(.15, .865, "ESP32-P4 · Mean elapsed time by phase across 12 matched blocks",
             fontsize=11, color="#4A6071", va="top")
    for ax, (app, caption) in zip(axes[0], inputs, strict=True):
        by_lane = {lane: [row for boot in data["boots"] for row in boot["rows"]
                          if row["app"] == app and row["lane"] == lane] for lane, _ in LANES}
        for index, (lane, _) in enumerate(LANES):
            left = 0
            for phase, _, color in PHASES:
                seconds = mean(row["phases"][phase]["us"] for row in by_lane[lane])/1e6
                ax.barh(index, seconds, left=left, height=.56, color=color, zorder=2)
                left += seconds
            ax.annotate(f"{left:.2f}", (left,index), xytext=(4,0),
                        textcoords="offset points", va="center", fontsize=9, color="#283D4E")
        ax.set_title(caption, fontsize=11, loc="left", color="#172D43", pad=10, weight="bold")
        ax.set_yticks(range(len(LANES)), [label for _, label in LANES])
        ax.set_ylim(2.6, -.6)
        ax.set_xlabel("Seconds", fontsize=9, color="#4A6071")
        ax.grid(axis="x", color="#DFE7EF", linewidth=.6, zorder=0)
        ax.spines[["top", "right", "left"]].set_visible(False)
        ax.spines["bottom"].set_color("#CBD6DF")
        ax.tick_params(length=0, labelsize=9, colors="#3E5366", pad=5)
    axes[0][0].set_xlim(left=0, right=axes[0][0].get_xlim()[1] * 1.08)
    handles = [plt.Rectangle((0, 0), 1, 1, color=color) for _, _, color in PHASES]
    fig.legend(handles, [label for _,label,_ in PHASES],
               loc="lower center", bbox_to_anchor=(.59,.028),
               frameon=False, ncol=3, labelcolor="#4A6071", fontsize=9)
    fig.savefig(output,dpi=170,facecolor="white")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("summary_gz", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with gzip.open(args.summary_gz,"rt") as stream:
        draw(json.load(stream),args.output)
