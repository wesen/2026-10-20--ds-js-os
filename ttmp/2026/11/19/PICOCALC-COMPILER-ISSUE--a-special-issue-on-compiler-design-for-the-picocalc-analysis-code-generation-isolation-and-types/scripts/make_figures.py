#!/usr/bin/env python3
"""Draw the issue's figures from the experiment outputs under various/ and the quiz grades.

Usage: make_figures.py [--round round1]
Writes PNG files to sources/issue/_assets/. Every number plotted also appears in a table in the article
that embeds the figure.

Colours are the first three slots of a categorical palette checked with a colour-vision
validator for the light surface used here; text uses neutral ink, never a series colour.
"""
import argparse
import json
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch  # noqa: E402

TICKET = Path(__file__).resolve().parent.parent
VARIOUS = TICKET / "various"
OUT = TICKET / "sources" / "issue" / "_assets"
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA, BLUE_LIGHT = "#2a78d6", "#eb6834", "#1baf7a", "#9cc3f0"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "text.color": INK, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK, "axes.edgecolor": GRID, "figure.facecolor": SURFACE,
                     "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE})


def base(figsize):
    fig, ax = plt.subplots(figsize=figsize, dpi=160)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.tick_params(length=0)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    return fig, ax


def title(fig, text, subtitle):
    fig.text(0.02, 0.965, text, fontsize=12, fontweight="bold", va="top", color=INK)
    fig.text(0.02, 0.905, subtitle, fontsize=9, va="top", color=INK2)


def instruction_mix():
    data = json.loads((VARIOUS / "01-rv32-instruction-mix.json").read_text())
    apps = ["editor", "agenda", "files"]
    rows = []
    for app in apps:
        c = data[app]
        stack = c["slotLoad"] + c["slotStore"]
        local = c["localLoad"] + c["localStore"] + c["argSpill"]
        rows.append((app.capitalize(), c["words"], stack, local, c["words"] - stack - local))
    fig, ax = base((7.6, 2.9))
    title(fig, "Half of the emitted instructions move temporaries through memory",
          "Share of all RV32 instructions emitted by the typed compiler's backend, by purpose")
    labels = ["Loads and stores of operand-stack slots", "Loads and stores of local variables", "Everything else"]
    colours = [BLUE, ORANGE, AQUA]
    for y, (name, total, *parts) in enumerate(rows):
        left = 0.0
        for part, colour in zip(parts, colours):
            share = 100 * part / total
            ax.barh(y, share - 0.5, left=left + 0.25, height=0.42, color=colour, linewidth=0)
            if share > 9:
                ax.text(left + share / 2, y, f"{share:.0f}%", ha="center", va="center", color="white", fontsize=9, fontweight="bold")
            left += share
        ax.text(101, y, f"{total:,} instr.", va="center", fontsize=8.5, color=INK2)
    ax.set_yticks(range(len(rows)), [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(0, 118)
    ax.set_xticks([0, 25, 50, 75, 100], ["0%", "25%", "50%", "75%", "100%"])
    handles = [plt.Rectangle((0, 0), 1, 1, color=c) for c in colours]
    ax.legend(handles, labels, loc="upper center", bbox_to_anchor=(0.45, -0.16), ncol=3, frameon=False, fontsize=8.5, handlelength=1.1)
    fig.subplots_adjust(left=0.1, right=0.98, top=0.78, bottom=0.26)
    fig.savefig(OUT / "handheld-rv32-instruction-mix.png")
    plt.close(fig)


def model_counts():
    data = json.loads((VARIOUS / "03-register-cache-model.json").read_text())["editor"]
    rows = [("Emitted today", data["actual"]), ("Model A: operand stack in registers", data["A"]),
            ("Model B: locals in registers too", data["B"])]
    fig, ax = base((7.6, 2.6))
    title(fig, "A counting model predicts native Editor code about three times smaller",
          "RV32 instructions for the complete typed Editor (120 functions); models are counts, not implementations")
    for y, (name, value) in enumerate(rows):
        ax.barh(y, value, height=0.42, color=BLUE, linewidth=0)
        note = "" if y == 0 else f"  ({rows[0][1] / value:.2f}× fewer)"
        ax.text(value + 500, y, f"{value:,}{note}", va="center", fontsize=9, color=INK)
    ax.set_yticks(range(len(rows)), [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(0, 60000)
    ax.set_xticks([0, 10000, 20000, 30000, 40000], ["0", "10K", "20K", "30K", "40K"])
    fig.subplots_adjust(left=0.36, right=0.98, top=0.76, bottom=0.12)
    fig.savefig(OUT / "handheld-register-model-editor.png")
    plt.close(fig)


def compile_phases():
    text = (VARIOUS / "04-compile-phase-timing.txt").read_text()
    grab = lambda label: float(re.search(re.escape(label) + r".*?median ([0-9.]+) ms", text).group(1))
    tokenize = grab("tokenize only")
    frontend = grab("frontend only")
    lowered = grab("frontend + RV32 lowering")
    rows = [("Tokenize", tokenize), ("Parse, check, emit WebAssembly", frontend - tokenize), ("Lower WebAssembly to RV32", lowered - frontend)]
    fig, ax = base((7.6, 2.6))
    title(fig, "The native compile path splits evenly between frontend and lowering",
          "Typed compiler on the complete Editor, run in QuickJS on a workstation; the device takes about 66 times longer")
    for y, (name, value) in enumerate(rows):
        ax.barh(y, value, height=0.42, color=BLUE, linewidth=0)
        ax.text(value + 0.3, y, f"{value:.1f} ms  ({100 * value / lowered:.0f}%)", va="center", fontsize=9, color=INK)
    ax.set_yticks(range(len(rows)), [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(0, 30)
    ax.set_xlabel("milliseconds (median of 15 runs)", fontsize=8.5)
    fig.subplots_adjust(left=0.34, right=0.98, top=0.76, bottom=0.2)
    fig.savefig(OUT / "handheld-compile-phases.png")
    plt.close(fig)


def reader_study(round_name):
    grades = TICKET / "sources" / "students" / round_name / "grades"
    if not grades.exists():
        return False
    rows = []
    for path in sorted(grades.glob("*.json")):
        rows.extend(json.loads(path.read_text()))
    if not rows:
        return False
    totals = {}
    for r in rows:
        key = (str(r["article"]).zfill(2), r["condition"], r["student"])
        totals[key] = totals.get(key, 0) + int(r["score"])
    articles = sorted({k[0] for k in totals})
    fig, ax = base((7.6, 4.2))
    title(fig, "Quiz scores before and after reading each article",
          "Mean of three student readers (a small language model at three thinking levels); maximum 12 points")
    for y, a in enumerate(articles):
        pre = [v for (art, cond, _), v in totals.items() if art == a and cond == "pre"]
        post = [v for (art, cond, _), v in totals.items() if art == a and cond == "post"]
        if not pre or not post:
            continue
        p, q = sum(pre) / len(pre), sum(post) / len(post)
        ax.plot([p, q], [y, y], color=GRID, linewidth=3, solid_capstyle="round", zorder=1)
        ax.scatter([p], [y], s=70, color=BLUE_LIGHT, edgecolor=SURFACE, linewidth=1.5, zorder=2)
        ax.scatter([q], [y], s=70, color=BLUE, edgecolor=SURFACE, linewidth=1.5, zorder=3)
        ax.text(max(p, q) + 0.25, y, f"{p:.1f} → {q:.1f}", va="center", fontsize=8.5, color=INK2)
    ax.set_yticks(range(len(articles)), [f"Article {int(a)}" for a in articles])
    ax.invert_yaxis()
    ax.set_xlim(0, 13.6)
    ax.set_xticks([0, 3, 6, 9, 12])
    handles = [plt.Line2D([], [], marker="o", linestyle="", color=BLUE_LIGHT, markersize=8),
               plt.Line2D([], [], marker="o", linestyle="", color=BLUE, markersize=8)]
    ax.legend(handles, ["Before reading (questions only)", "After reading the article"], loc="upper center",
              bbox_to_anchor=(0.45, -0.07), ncol=2, frameon=False, fontsize=8.5)
    fig.subplots_adjust(left=0.14, right=0.98, top=0.85, bottom=0.14)
    fig.savefig(OUT / f"handheld-reader-study-{round_name}.png")
    plt.close(fig)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", default="round1")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    instruction_mix()
    model_counts()
    compile_phases()
    drawn = reader_study(args.round)
    print("figures written to", OUT, "| reader study:", "drawn" if drawn else "no grades yet")


if __name__ == "__main__":
    main()
