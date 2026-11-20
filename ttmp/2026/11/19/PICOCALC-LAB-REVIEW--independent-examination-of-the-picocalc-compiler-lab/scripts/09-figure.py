"""Draw separate numerical accounts of proof payoffs and linked-body changes."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ticket=Path(__file__).resolve().parents[1]
measures=ticket/'various'
budget=json.loads((measures/'policy.json').read_text())
rows=json.loads((measures/'rebuild.json').read_text())['history']
fig, axes=plt.subplots(1,2,figsize=(10.2,3.7),layout='constrained')
pal=('#286374','#b76338')
a,b=axes
for i,lane in enumerate(('always','select')):
    gain=[budget[k]['base']['words']-budget[k][lane]['words'] for k in ('early','late')]
    bars=a.bar([x+(i-.5)*.32 for x in range(2)],gain,.29,label=lane.capitalize(),color=pal[i])
    a.bar_label(bars,padding=3)
a.set(xticks=[0,1],xticklabels=['First','Last'],xlabel='Position of productive function',ylabel='RV32 words saved',ylim=(0,845),title='Budget spent in source order')
wanted=['body','signature and callers','reorder state fields']
for i,(key,name) in enumerate([('built','Rebuilt'),('changedLinkedBodies','Changed in ELF')]):
    vals=[next(r[key] for r in rows if r['id']==kind) for kind in wanted]
    rect=b.bar([x+(i-.5)*.32 for x in range(3)],vals,.29,color=pal[i],label=name)
    b.bar_label(rect,padding=3)
b.set(xticks=[0,1,2],xticklabels=['Body','Signature','State layout'],xlabel='Editor edit',ylabel='Functions',ylim=(0,95),title='Compilation and final linked bytes')
for ax in axes:
    ax.legend(loc='upper center',bbox_to_anchor=(.5,-.22),ncol=2,frameon=False)
    ax.spines[['top','right']].set_visible(False)
    ax.set_axisbelow(True)
    ax.grid(axis='y',alpha=.23)
asset=ticket/'analysis/_assets/picocalc-methods-policy-and-fragments.png'
asset.parent.mkdir(exist_ok=True)
fig.savefig(asset,dpi=160)
