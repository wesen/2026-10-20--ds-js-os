"""Draw the renderer-stage comparison from the captured device summary."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
from matplotlib import pyplot as plt
t=Path(__file__).resolve().parent.parent;v=t/'various'
d=json.loads((v/'physical-summary.json').read_text())
fig,axes=plt.subplots(1,2,figsize=(9.4,3.9),layout='constrained')
for ax,name,denom,arms,title in zip(axes,['sysmon','snake'],[20,24],
        [[('G','Full JSON'),('M','Manual'),('A','Extracted')],[('J','Full JSON'),('SJ','Semantic JSON'),('T','Packed')]],['System · 20 attempts','Snake · 24 observations']):
    for j,(key,label) in enumerate(arms):
        row=d[name][key];p=row['producerUs']/denom/1000;r=row['receiverUs']/denom/1000
        ax.barh(j,p,color='#24527b',label='Producer' if j==0 else None)
        ax.barh(j,r,left=p,color='#edae49',label='Receiver' if j==0 else None)
        ax.text(p+r,j,f'  {p+r:.2f}',va='center',fontsize=10)
    ax.set(yticks=range(3),yticklabels=[a[1] for a in arms],xlabel='Milliseconds per attempted screen',title=title)
    ax.set_xlim(0,ax.get_xlim()[1]*1.17);ax.invert_yaxis();ax.spines[['right','top']].set_visible(False)
fig.suptitle('Where semantic screens spend CPU on the ESP32-P4',fontweight='bold')
axes[0].legend(loc='upper right',fontsize=9)
fig.savefig(v/'renderer-stage-costs.png',dpi=165);plt.close(fig)
