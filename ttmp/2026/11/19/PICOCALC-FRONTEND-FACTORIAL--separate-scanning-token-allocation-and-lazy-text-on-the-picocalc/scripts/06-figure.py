"""Draw paired physical frontend differences for the three native apps."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def draw(results, output):
    apps = ("files", "agenda", "editor")
    rows = [
        ("factorial", "scanner_fresh", "Cursor with fresh records", "#275C83"),
        ("factorial", "scanner_reuse", "Cursor with reused records", "#275C83"),
        ("factorial", "reuse_regex", "Reuse with regex", "#72549E"),
        ("factorial", "reuse_cursor", "Reuse with cursor", "#72549E"),
        ("lazy", "lazy_delta", "Lazy text with cursor", "#AC5A22"),
    ]
    fig, axes = plt.subplots(len(apps), 2, figsize=(10.7, 8.0))
    fig.subplots_adjust(left=.24, right=.97, bottom=.1, top=.86, wspace=.25, hspace=.72)
    fig.text(.24, .955, "What changed the cost of a cold compile?", fontsize=20,
             color="#172D43", weight="bold", va="top")
    fig.text(.24, .906, "ESP32-P4 · Paired median and interquartile range",
             fontsize=11, color="#4A6071", va="top")
    for i, app in enumerate(apps):
        for j, (metric, divisor, units) in enumerate(
                (("us", 1000, "Cold compile · ms"), ("peak", 1024, "QuickJS peak · KiB"))):
            ax = axes[i][j]
            ax.axvline(0, color="#9AABBB", linestyle="--", linewidth=1)
            for y, (image, comparison, _, color) in enumerate(rows):
                stats = results[image][app][metric]["matched"][comparison]
                ax.hlines(y, stats["q25"] / divisor, stats["q75"] / divisor,
                          linewidth=3.1, color=color, zorder=3)
                ax.scatter(stats["median"] / divisor, y, s=32,
                           c=color, edgecolors="white", linewidth=.6, zorder=4)
            ax.set_yticks(range(len(rows)), [r[2] for r in rows] if j == 0 else [""] * len(rows))
            ax.set_title(app.title() + "  |  " + units, fontsize=11,
                         loc="left", color="#172D43", pad=10, weight="bold")
            ax.set_ylim(4.65, -.65)
            ax.margins(x=.105)
            ax.grid(axis="x", linewidth=.6, color="#E1E8EE")
            ax.tick_params(axis="both", length=0, labelsize=9, colors="#3E5366", pad=5)
            ax.spines[["top", "left", "right"]].set_visible(False)
            ax.spines["bottom"].set_color("#CBD6DF")
    fig.text(.24, .043, "Each point summarizes 16 matched factorial blocks or 12 matched lazy-text blocks.",
             fontsize=9.5, color="#4A6071")
    fig.savefig(output, dpi=170, facecolor="white")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("summary", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    draw(json.loads(args.summary.read_text())["results"], args.output)


if __name__ == "__main__":
    main()
