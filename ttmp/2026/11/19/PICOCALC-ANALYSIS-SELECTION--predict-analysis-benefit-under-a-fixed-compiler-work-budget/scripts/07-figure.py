"""Draw held-out oracle recovery with and without the planning charge."""
import argparse
import gzip
import json
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter


def graph(data, output):
    families = ("concentrated", "decoys", "distributed")
    family_labels = ("Concentrated", "Decoy writes", "Distributed")
    policies = (("source", "Source order", "#275C83"),
                ("literal", "Literal only", "#A55A31"),
                ("density", "Words per cell", "#72549E"))
    fig, axes = plt.subplots(1, 2, figsize=(11, 6.4), sharey=True)
    fig.subplots_adjust(left=.29, right=.96, top=.78, bottom=.16, wspace=.13)
    fig.text(.29, .962, "Ranking recovers more code when planning is free",
             color="#172D43", weight="bold", fontsize=17, va="top")
    fig.text(.29, .905, "Fraction of the attainable RV32 word savings · 32,768-cell budget",
             fontsize=11, color="#4A6071", va="top")
    y_ticks, labels = [], []
    for j, (metric, heading) in enumerate(
            (("words", "Equal proof budget"), ("plannerChargedWords", "Planning visits charged"))):
        ax = axes[j]
        for i, family in enumerate(families):
            modules = [m for m in data["modules"] if m["name"].startswith(family + "-")]
            budgets = [next(b for b in m["budgets"] if b["budget"] == 32768 and b["binding"])
                       for m in modules]
            if i:
                ax.axhline(i*4-1, color="#CBD6DF", linewidth=.75)
            for k, (policy, label, color) in enumerate(policies):
                y = i*4+k
                series = [100 * result / b["oracle"] for b in budgets
                          for result in b["comparisons"][policy][metric]]
                ax.hlines(y, min(series), max(series), color=color, linewidth=2.5, alpha=.58)
                ax.scatter(median(series), y, s=42, color=color, zorder=3,
                           linewidth=.55, edgecolors="white")
                if j == 0:
                    y_ticks.append(y)
                    labels.append(f"{family_labels[i]} · {label}")
        ax.set_title(heading, loc="left", fontsize=12, color="#172D43", weight="bold", pad=12)
        ax.set_xlim(-3, 103)
        ax.set_ylim(10.65, -.65)
        ax.xaxis.set_major_formatter(PercentFormatter(xmax=100, decimals=0))
        ax.set_xticks([0,25,50,75,100])
        ax.grid(axis="x", color="#E1E8EE", linewidth=.7)
        ax.tick_params(length=0, colors="#3E5366", labelsize=9, pad=6)
        ax.spines[["top", "right", "left"]].set_visible(False)
        ax.spines["bottom"].set_color("#CBD6DF")
    axes[0].set_yticks(y_ticks, labels)
    fig.text(.29, .062, "Dots show medians and bars show the full range over 440 orderings per family.",
             color="#4A6071", fontsize=9.5)
    fig.savefig(output, dpi=170, facecolor="white")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_gz", type=Path)
    parser.add_argument("output", type=Path)
    args=parser.parse_args()
    with gzip.open(args.json_gz, "rt") as data:
        graph(json.load(data), args.output)
