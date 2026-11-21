"""Plot comparable default-pose frame and primary calls from physical row receipts."""
from pathlib import Path
from statistics import median
import argparse
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('rows', type=Path)
parser.add_argument('output', type=Path)
args=parser.parse_args()
rows=[r for r in json.loads(args.rows.read_text()) if r['fixture']=='default']
labels=["C scalar", "C + PIE", "Typed scalar", "Typed + divisor proof",
        "Primary spans", "Spans + divisor proof", "Scheduled scalar row",
        "Explicit PIE row", "Inferred PIE row", "Spans + shadow rows",
        "Spans + shadow rows + divisor proof"]
# Both C controls come from the same blocks as the plain Typed baseline.
arms=[(0,0),(0,1),(0,2),(1,2),(2,2),(3,2),(8,2),(4,2),(5,2),(6,2),(7,2)]
colors=['#646e7c']*2+['#396890']*2+['#477c70']*2+['#806399']*3+['#477c70']*2
fig,axes=plt.subplots(1,2,figsize=(10.7,5.7),sharey=True)
for ax,phase,title in zip(axes,[0,2],['Complete image','Primary depths and IDs']):
    times=[median(r['timesUs'][a][phase] for r in rows if r['program']==p)/1000 for p,a in arms]
    bars=ax.barh(range(len(arms)),times,color=colors,height=.65)
    ax.bar_label(bars,labels=[f'{x:.2f}' for x in times],padding=4,fontsize=8)
    ax.set_xlim(0,max(times)*1.22)
    ax.set_title(title,loc='left',fontweight='bold')
    ax.set_xlabel('Milliseconds per call')
    ax.set_axisbelow(True)
    ax.grid(axis='x',alpha=.2)
    ax.spines[['right','top','left']].set_visible(False)
axes[0].set_yticks(range(len(labels)),labels,fontsize=9)
axes[0].invert_yaxis()
fig.suptitle('Ray tracing on the ESP32-P4',x=.02,ha='left',weight='bold',fontsize=17)
fig.text(.02,.016,'Default sphere and light positions, 160 × 160. Bars show medians. Display transfer and cold compilation are outside both clocks.',fontsize=9)
fig.tight_layout(rect=(0,.045,1,.96))
fig.savefig(args.output,dpi=170,bbox_inches='tight')
