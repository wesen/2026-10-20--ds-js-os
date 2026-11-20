"""Plot every physical measurement of compiler time and Editor CPU in the matched small workflow."""
import argparse
import json
from pathlib import Path
from statistics import median
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def chart(ax, rows, name, divisor, label):
    colors = ("#245c85", "#b04f28")
    for i, engine in enumerate(("wasm", "rv32")):
        series = rows[engine][name]
        for j, arm in enumerate(("before", "after")):
            values = [v/divisor for v in series[arm]]
            x = i*3+j
            ax.scatter([x-0.13, x, x+0.13], values, s=29, color=colors[j], zorder=3)
            central = median(values)
            ax.plot([x-0.26,x+0.26], [central,central], color=colors[j], linewidth=2.4)
            ax.annotate(f"{central:.2f}", (x,central), xytext=(0,9),
                        textcoords="offset points", ha="center", fontsize=9, color=colors[j])
    ax.set_xticks([0,1,3,4], ["Manual\nWasm","Await\nWasm","Manual\nRV32","Await\nRV32"])
    ax.set_ylabel(label)
    top = ax.get_ylim()[1]
    ax.set_ylim(0,top*1.14)
    ax.grid(axis="y",color="#dddddd",linewidth=0.6)
    ax.spines[["top","right"]].set_visible(False)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("summary",type=Path)
    p.add_argument("out",type=Path)
    a=p.parse_args()
    rows=json.loads(a.summary.read_text())["workflow"]
    fig, axes=plt.subplots(1,2,figsize=(8.2,3.65),constrained_layout=True)
    chart(axes[0],rows,"us",1e6,"Cold Editor compile (seconds)")
    chart(axes[1],rows,"workflow_cpu_ms",1,"Editor CPU across the workflow (ms)")
    fig.suptitle("Hand-written and compiler-generated continuations on the ESP32-P4",fontweight="bold",fontsize=12)
    fig.savefig(a.out,dpi=165,facecolor="white")


if __name__=="__main__":
    main()
