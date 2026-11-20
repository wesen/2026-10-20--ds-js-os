"""Plot paired physical edit times and measured rebuild phase costs."""
import argparse
import json
from pathlib import Path
from statistics import mean

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CASES = [
    ("files", "body", "Files helper edit"),
    ("fixture", "body", "Fixture body edit"),
    ("fixture", "signature", "Fixture signature edit"),
    ("fixture", "layout", "Fixture layout edit"),
]
PHASES = [
    ("walk", "Headers and dependencies", "#5667a7"),
    ("body", "Body checking", "#4b9f90"),
    ("lower", "RV32 lowering", "#80b861"),
    ("assemble", "Assembly and relocation", "#e0a053"),
    ("validate", "Entry validation", "#a85f8c"),
    ("link", "Reactor link", "#3766a2"),
    ("publish", "Cache publication", "#a8a7a4"),
]


def plot(source, output):
    with source.open() as stream:
        boots = json.load(stream)["board"]
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11,
                         "axes.spines.top": False, "axes.spines.right": False})
    fig, (elapsed, phases) = plt.subplots(1, 2, figsize=(11.7, 5.5), sharey=True,
                                         gridspec_kw={"width_ratios": [1.1, 1]})
    for y, (app, edit, _) in enumerate(CASES):
        groups = [boot["by_case"][app][edit] for boot in boots]
        for i, (key, color, label) in enumerate([
            ("clean_us", "#30384e", "Warm clean"), ("candidate_us", "#087f74", "Rebuild"),
        ]):
            for boot_no, group in enumerate(groups):
                summary = group[key]
                lo, med, hi = (summary[k] / 1000 for k in ("min", "median", "max"))
                lane = y + (-0.17 if i == 0 else 0.17) + (boot_no - 0.5) * 0.09
                elapsed.errorbar(med, lane, xerr=[[med - lo], [hi - med]], fmt="o" if boot_no == 0 else "s",
                                 color=color, markersize=4.5, capsize=2.5,
                                 label=label if y == 0 and boot_no == 0 else None)
        left = 0
        for key, label, color in PHASES:
            width = mean(group["mean_phases_us"][key] for group in groups) / 1000
            phases.barh(y, width, left=left, color=color, height=0.30, label=label if y == 0 else None)
            left += width
    elapsed.set_yticks(range(len(CASES)), [label for _, _, label in CASES])
    elapsed.set_ylim(len(CASES) - 0.5, -0.5)
    for axis, title in [(elapsed, "Complete edits"), (phases, "Work inside the rebuild")]:
        axis.set_title(title, loc="left", pad=10, weight="bold")
        axis.set_xlabel("Milliseconds")
        axis.set_xlim(left=0)
        axis.grid(axis="x", alpha=0.23)
        axis.set_axisbelow(True)
        axis.tick_params(axis="y", length=0)
    elapsed.legend(loc="upper left", bbox_to_anchor=(0, -0.19), frameon=False, ncol=2, fontsize=9)
    phases.legend(loc="upper left", bbox_to_anchor=(0, -0.19), frameon=False, ncol=2, fontsize=9)
    fig.subplots_adjust(left=0.19, right=0.97, wspace=0.16, top=0.91, bottom=0.29)
    fig.savefig(output, dpi=180, facecolor="white")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("summary", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    plot(args.summary, args.output)
