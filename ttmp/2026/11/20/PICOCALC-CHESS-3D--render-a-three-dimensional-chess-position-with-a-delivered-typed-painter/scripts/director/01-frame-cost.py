"""Plot comparable timed portions of the flat and 3D physical Chess paints."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("flat",type=Path)
parser.add_argument("scene",type=Path)
parser.add_argument("output",type=Path)
a=parser.parse_args()
runs=[("Flat",json.loads(a.flat.read_text())),("3D",json.loads(a.scene.read_text()))]
samples=[]
for label,data in runs:
    for square in ("e2","e3","f3"):
        s=data["screens"][square]
        p=s["painter"]
        assert p["installed"] and p["compiles"]==1 and p["rejects"]==0
        assert s["panel"]["faults"]==0 and s["panel"]["remaining"]==0
        samples.append((label+" "+square,p["native_us"]/1000,p["raster_us"]/1000))
fig,axes=plt.subplots(1,2,figsize=(9.2,3.5),sharey=True)
for axis,col,title,color in zip(axes,[1,2],["Native painter invocation","Raster into framebuffer"],["#287d80","#a94325"]):
    values=[r[col] for r in samples]
    bars=axis.barh(range(len(values)),values,color=color)
    axis.bar_label(bars,labels=[f"{v:.3f}" for v in values],padding=4,fontsize=9)
    axis.set_xlabel("Milliseconds")
    axis.set_title(title,loc="left")
    axis.set_xlim(0,max(values)*1.32)
    axis.spines[["top","right"]].set_visible(False)
axes[0].set_yticks(range(len(samples)),[r[0] for r in samples])
axes[0].invert_yaxis()
fig.tight_layout()
fig.savefig(a.output,dpi=160)
