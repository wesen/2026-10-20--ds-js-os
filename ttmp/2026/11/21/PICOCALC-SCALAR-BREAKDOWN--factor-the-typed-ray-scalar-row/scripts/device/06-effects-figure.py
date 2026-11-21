"""Plot median within-pair savings and observed seven-block ranges at the opening pose."""
import json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

receipt=json.loads(Path(sys.argv[1]).read_text())['poses']['default']['pairedSavings']
effects=[('hoistWhenStack','Hoist checks, stack locals'),('hoistWhenRegisters','Hoist checks, register locals'),
         ('registersWhenChecked','Register locals, checks kept'),('registersWhenHoisted','Register locals, checks hoisted'),
         ('both','Both, full domain'),('skip','Skip inactive sphere rows'),('remainingToPriorMatched','Residual to previous scalar row')]
fig,ax=plt.subplots(figsize=(8.1,4.9),layout='constrained')
for i,(key,label) in enumerate(effects):
    for phase,offset,color in [('primary',-.14,'#285879'),('clean',.14,'#ae551e')]:
        d=receipt[phase][key];y=i+offset
        lo,mid,hi=(d[k]/1000 for k in ('min','median','max'))
        ax.hlines(y,lo,hi,color=color,lw=2)
        ax.plot(mid,y,'o',color=color,ms=5)
ax.set_yticks(range(len(effects)),[name for key,name in effects]);ax.invert_yaxis()
ax.set_xlabel('Milliseconds saved per call, paired within repetition');ax.set_xlim(left=0)
ax.set_title('Scalar changes on the opening pose',loc='left',weight='bold')
ax.grid(axis='x',alpha=.2);ax.set_axisbelow(True);ax.spines[['right','top','left']].set_visible(False)
legend=[Line2D([],[],color=c,marker='o',label=l) for c,l in [('#285879','Primary depths and IDs'),('#ae551e','Clean frame')]]
ax.legend(handles=legend,loc='upper center',bbox_to_anchor=(.5,-.17),ncol=2,frameon=False)
fig.savefig(sys.argv[2],dpi=180)
