"""Plot the actual work for equivalent rows, with and without pass ablations."""
import sys,json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
from matplotlib import pyplot as plt
p=Path(sys.argv[1])
ct=json.loads((p/'execution.json').read_text())
js=json.loads((p/'typed-counts.json').read_text())
fig,(a,b)=plt.subplots(1,2,figsize=(11,4.8),layout='constrained')
def bars(ax,labels,values,colors):
    bars=ax.barh(labels,[v/1e6 for v in values],color=colors)
    ax.invert_yaxis()
    ax.bar_label(bars,fmt='%.2f',padding=3,fontsize=9)
    ax.spines[['top','right']].set_visible(False)
    ax.set_xlabel('Executed instructions, millions')
    ax.margins(x=.17)
cv=lambda key:ct[key]['totals']['instructions']
bars(a,['Stock Typed','Grouped Typed','PIE Typed','Checked GCC','Checked LLVM'],
     [js[k]['totals']['instructions'] for k in ['stock','scalar','pie']]+[cv('checked-gcc'),cv('checked-llvm')],
     ['#52748a']*3+['#94603a']*2)
a.set_title('Same 160 row inputs')
bars(b,['GCC without IV opts','GCC with IV opts','LLVM without LSR','LLVM with LSR'],
     [cv(k) for k in ['unchecked-gcc-noiv','unchecked-gcc','unchecked-llc-nolsr','unchecked-llc']],
     ['#8a9999','#317265']*2)
b.set_title('Induction-variable passes, unchecked C')
fig.savefig(sys.argv[2],dpi=160)
