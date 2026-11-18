"""Draw the guide's architecture and stage timing figures from the scoped receipts."""
import argparse
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

HERE = Path(__file__).resolve().parents[2]
OUT = HERE / "various/board"


def architecture():
    fig, ax = plt.subplots(figsize=(8.4, 4.9))
    ax.set(xlim=(0,3), ylim=(0,4.02))
    ax.axis("off")
    headings = ["Existing JS world", "Current CJI native", "Proposed typed world"]
    lanes = [
        ["JS source + prelude", "QuickJS parser", "VM bytecode", "QuickJS interpreter"],
        ["JS source + exports", "Whole-program typing\nand library expansion", "SLIR → assembler\n→ native ELF", "Operator slot\non the P4"],
        ["JS-like typed source", "Signatures and\nfunction-local types", "Structured Wasm\n+ world ABI", "WAMR interpreter"],
    ]
    for i, (label, nodes) in enumerate(zip(headings, lanes)):
        x = i + 0.5
        ax.text(x, 3.88, label, ha="center", va="center", fontsize=12, weight="bold")
        for j, node in enumerate(nodes):
            y = 3.29 - .88*j
            if j:
                ax.annotate("", (x, y+.29), (x, y+.60), arrowprops={"arrowstyle":"-|>","color":"#303030","lw":1.4})
            box = FancyBboxPatch((x-.445,y-.245),.89,.49,boxstyle="round,pad=0.025", facecolor=["#f5f5f5","#eeeeee","#dae4ea"][i],edgecolor="#434343",linewidth=1.1)
            ax.add_patch(box)
            ax.text(x,y,node,ha="center",va="center",fontsize=11.1)
    fig.tight_layout(pad=.4)
    fig.savefig(OUT/"architecture.png",dpi=175,bbox_inches="tight")
    plt.close(fig)


def timings():
    prior = next(HERE.parent.glob("*CJI-TRIE*/various/physical/physical-summary.json"))
    ref = json.loads(prior.read_text())
    new = {w:json.loads((OUT/f"native-{w}.jsonl").read_text()) for w in ("agenda","files")}
    bytecode = {r["world"]:r for r in csv.DictReader((OUT/"quickjs-p4.csv").open())}
    fig, axes = plt.subplots(1, 2, figsize=(8.2, 3.6), gridspec_kw={"wspace":.36})
    for ax, title, names, series, units in (
        (axes[0],"Native linked ELF",["Agenda","Files"],[
            ("Combined range", [ref[w]["both"]["elapsed_s"] for w in new],"#333333"),
            ("Local numeric", [new[w]["elapsed_ms"]/1000 for w in new],"#adadad")], "seconds per build"),
        (axes[1],"QuickJS on the P4",["Agenda","Files","Calc"],[
            ("Source compiled", [float(bytecode[w]["compile_median_ms"]) for w in ("agenda","files","calc")],"#333333"),
            ("Through registration", [float(bytecode[w]["ready_median_ms"]) for w in ("agenda","files","calc")],"#adadad")], "milliseconds per world"),
    ):
        for j,(label,values,color) in enumerate(series):
            bars = ax.bar([k+(j-.5)*.36 for k,v in enumerate(values)], values, width=.34, color=color,edgecolor="black",linewidth=.6,label=label)
            ax.bar_label(bars,labels=[f"{x:.0f}" for x in values],fontsize=9,padding=2)
        ax.set_xticks(range(len(names)),names)
        ax.set_ylabel(units)
        ax.set_title(title,fontsize=13,weight="bold")
        ax.spines[["top","right"]].set_visible(False)
        ax.margins(y=.2)
        ax.legend(loc="upper center", bbox_to_anchor=(.5,-.13),frameon=False,fontsize=9)
    fig.subplots_adjust(bottom=.25,top=.9,left=.085,right=.99)
    fig.savefig(OUT/"device-timings.png",dpi=175,bbox_inches="tight")
    plt.close(fig)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("figure", choices=("architecture","timings","all"))
choice = parser.parse_args().figure
if choice in ("architecture","all"):
    architecture()
if choice in ("timings","all"):
    timings()
