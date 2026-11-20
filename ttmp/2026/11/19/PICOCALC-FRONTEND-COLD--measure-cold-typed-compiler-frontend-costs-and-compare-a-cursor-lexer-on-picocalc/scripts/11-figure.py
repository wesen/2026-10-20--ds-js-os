"""Plot clean paired Editor times and the mean exclusive phase partition."""
import argparse
import json
from pathlib import Path
from statistics import mean

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def editor_rows(receipt, variant):
    return [row for boot in receipt["boots"] for row in boot["rows"]
            if row["app"] == "editor" and row["variant"] == variant]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("figure", type=Path)
    args = parser.parse_args()
    receipt = json.loads(args.receipt.read_text())

    fig, (clean, phases) = plt.subplots(
        1, 2, figsize=(11.5, 4.3), gridspec_kw={"width_ratios": [0.9, 1.4]},
    )
    fig.subplots_adjust(left=0.09, bottom=0.25, right=0.98, top=0.82, wspace=0.42)
    fig.suptitle("Cold Editor compilation on the ESP32-P4", fontsize=17, x=0.08, ha="left")
    for axis in (clean, phases):
        axis.spines[["top", "right", "left"]].set_visible(False)
        axis.tick_params(axis="y", length=0)
        axis.grid(axis="x", color="#dae0e4", lw=0.7)
        axis.set_axisbelow(True)
        axis.set_xlabel("Elapsed time (s)")

    clean.set_title("Clean builds", loc="left", pad=9, fontweight="bold")
    labels = []
    for index, boot in enumerate(receipt["boots"]):
        t = boot["summary"]["editor"]["variants"]
        control, cursor = [t[variant]["median_us"] / 1e6 for variant in ("base", "cursor")]
        clean.plot((cursor, control), (index, index), color="#7e858b", lw=2.2, zorder=2)
        for time, color in ((control, "#22445f"), (cursor, "#007867")):
            clean.scatter(time, index, color=color, s=77, zorder=3)
            clean.annotate(f"{time:.3f}", (time, index), (0, -19), textcoords="offset points",
                           ha="center", va="top", fontsize=9, color=color)
        paired = boot["summary"]["editor"]["cursor_minus_base_us"]["median"]
        labels.append(f"Boot {index + 1}")
        clean.annotate(f"{abs(paired) / 1000:.0f} ms paired saving", ((control + cursor) / 2, index),
                       (0, 14), textcoords="offset points", ha="center", fontsize=9)
    clean.set_yticks(range(len(labels)), labels)
    clean.set_xlim(2.05, 2.55)
    clean.set_ylim(1.57, -0.55)
    for x, label, color in ((0.08, "●  Cursor", "#007867"), (0.50, "●  Control", "#22445f")):
        clean.text(x, -0.29, label, color=color, fontsize=9, transform=clean.transAxes)

    phase_groups = (
        ("Setup", "#7895ae", ("read", "realm", "eval_wasm", "eval_rv32", "eval_linker", "args")),
        ("Parse and dispatch", "#55858a", ("dispatch", "parse")),
        ("Match and token", "#e0a13b", ("match", "token")),
        ("Native lowering", "#22445f", ("lower",)),
        ("Output and finish", "#9682a2", ("assemble", "link", "copy", "teardown")),
    )
    phases.set_title("Marked builds by exclusive phase", loc="left", pad=9, fontweight="bold")
    for index, variant in enumerate(("base_trace", "cursor_trace")):
        rows = editor_rows(receipt, variant)
        left = 0
        for label, color, keys in phase_groups:
            length = mean(sum(row["phases"][key]["us"] for key in keys) for row in rows) / 1e6
            phases.barh(index, length, left=left, height=0.43, color=color, label=label if index == 0 else None)
            left += length
        assert abs(left - mean(row["us"] for row in rows) / 1e6) < 1e-9
        phases.text(left + 0.025, index, f"{left:.2f}", va="center", fontsize=9)
    phases.set_yticks((0, 1), ("Control", "Cursor"))
    phases.set_xlim(0, 2.83)
    phases.set_ylim(1.57, -0.55)
    phases.legend(loc="upper left", bbox_to_anchor=(-0.025, -0.20), frameon=False, ncols=3,
                  columnspacing=1, handlelength=1.05, fontsize=8.8)

    fig.savefig(args.figure, dpi=190, facecolor="white")


if __name__ == "__main__":
    main()
