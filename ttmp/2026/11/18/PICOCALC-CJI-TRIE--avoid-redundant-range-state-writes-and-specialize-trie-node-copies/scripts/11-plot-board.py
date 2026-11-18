"""Plot wall-clock module completion times from the validated physical summaries."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('summary',type=Path)
parser.add_argument('destination',type=Path)
args=parser.parse_args()
rows=json.loads(args.summary.read_text())
with plt.rc_context({'font.size':11, 'axes.spines.right':False, 'axes.spines.top':False}):
    fig,axes=plt.subplots(1,2,figsize=(9,3.7),layout='constrained')
    for ax,world in zip(axes,('agenda','files')):
        names=('guard','reuse','typed','both')
        vals=[rows[world][n]['elapsed_s'] for n in names]
        bars=ax.barh(range(4),vals,color=['#666666','#386579','#856641','#416c53'])
        ax.set_yticks(range(4),['Guarded control','Reuse unchanged path','Typed node copy','Combined'])
        ax.invert_yaxis()
        ax.set_xlim(0,max(vals)*1.25)
        ax.bar_label(bars,fmt='%.1f s',padding=4)
        ax.set_title(world.title())
        ax.set_xlabel('End-to-end seconds')
        ax.set_axisbelow(True)
        ax.grid(axis='x',alpha=.22)
    fig.suptitle('Compiling on the ESP32-P4 at an 8 MiB frontend heap')
    fig.savefig(args.destination,dpi=170)
