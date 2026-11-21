"""Show all six matched physical timing reductions and the median within each fixture."""
import argparse
import json
from pathlib import Path
from statistics import median
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("receipt",type=Path)
p.add_argument("output",type=Path)
args=p.parse_args()
receipt=json.loads(args.receipt.read_text())
assert receipt['probePassed'] and receipt['restoredReadback']
fig,ax=plt.subplots(figsize=(8.6,3.7))
names=['Opening · 871 nodes','Kiwipete · 7,194 nodes','After e2e4 · 1,600 nodes']
offsets=[-.15,-.09,-.03,.03,.09,.15]
xs=[]
for y,(case,name) in enumerate(zip(('0','6','15'),names,strict=True)):
    vals=receipt['cases'][case]['reductionsByBlockPct']
    assert len(vals)==len(offsets)
    ax.scatter(vals,[y+off for off in offsets],s=28,color='#42949e',zorder=4)
    ax.plot([min(vals),max(vals)],[y,y],color='#285061',lw=1.5)
    ax.plot(median(vals),y,'D',color='#193b50',ms=7,zorder=5)
    xs.extend(vals)
xmin=min(xs); xmax=max(xs); width=max(.07,xmax-xmin)
ax.set_xlim(xmin-.045*width,xmax+.07*width)

ax.set_yticks(range(3),names)
ax.set_ylim(2.48,-.48)
ax.xaxis.set_major_formatter(PercentFormatter(xmax=100,decimals=2))
ax.set_xlabel('Reduction in search time relative to the stock ELF')
ax.grid(axis='x',alpha=.2)
ax.spines[['top','right','left']].set_visible(False)
fig.suptitle('Chess search in external RAM on the ESP32-P4',x=.04,y=.98,ha='left',weight='bold',fontsize=16)
fig.text(.04,.865,'Each point is one matched block. Diamonds mark the median of the six paired reductions.',fontsize=10,color='#324959')
fig.tight_layout(rect=[0,0,1,.82])
args.output.parent.mkdir(parents=True,exist_ok=True)
fig.savefig(args.output,dpi=160,bbox_inches='tight',pad_inches=.22)
