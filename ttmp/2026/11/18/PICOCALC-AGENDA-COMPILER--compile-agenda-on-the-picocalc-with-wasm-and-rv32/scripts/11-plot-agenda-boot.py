#!/usr/bin/env python3
"""Compare cold Agenda stage timing and total QuickJS startup work."""
import argparse
import json
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def load(path):
    return json.loads(path.read_text())["trials"]


def elapsed(trials, field):
    return median(trial[field] / 1000 for trial in trials)


def world_sum(trials, field):
    return median(sum(world[field] for world in trial["worlds"].values()) / 1000 for trial in trials)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("cache", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    profiles = [load(args.baseline), load(args.cache)]
    labels = ["Parse prelude per world", "Reuse compiled prelude"]
    colors = ["#64748b", "#2563eb"]
    fig, (latency, work) = plt.subplots(2, 1, figsize=(8, 5.2), layout="constrained")
    for index, (trials, color) in enumerate(zip(profiles, colors)):
        val = elapsed(trials, "first_response_us")
        latency.barh(index, val, color=color)
        latency.text(val + 28, index, f"{val:,.0f} ms", va="center")
        val = world_sum(trials, "js_prelude_us")
        work.barh(index, val, color=color)
        work.text(val + 10, index, f"{val:,.0f} ms", va="center")
    latency.axvline(2000, color="#991b1b", linestyle="--", linewidth=1, label="Two-second target")
    latency.legend(frameon=False, loc="upper right")
    latency.set_title("Cold source capture to kernel frame publication", loc="left")
    work.set_title("Total time in QuickJS prelude loading across worlds", loc="left")
    latency.set_xlim(0, 1.18 * max(elapsed(t, "first_response_us") for t in profiles))
    work.set_xlim(0, 1.18 * max(world_sum(t, "js_prelude_us") for t in profiles))
    for axes in (latency, work):
        axes.set_yticks([0, 1], labels)
        axes.invert_yaxis()
        axes.set_xlabel("Milliseconds, median of three headless ESP32-P4 boots")
        axes.spines[["top", "right"]].set_visible(False)
    fig.savefig(args.output, dpi=160)


if __name__ == "__main__":
    main()
