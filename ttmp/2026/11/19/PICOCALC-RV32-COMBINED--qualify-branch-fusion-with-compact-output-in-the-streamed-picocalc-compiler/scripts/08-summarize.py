"""Summarize complete matched observations from each boot without pooling restarts."""
import argparse
import json
from pathlib import Path
from statistics import median

APPS=("files","agenda","editor")
LANES=("base","branch","compact","both")
def summary(rows):
    assert len(rows)==48
    result={}
    for app in APPS:
        group=[r for r in rows if r["app"]==app]
        cells={(r["block"],r["lane"]):r for r in group}
        assert len(cells)==len(group)==16
        result[app]={}
        for field in ("us","peak"):
            values={lane:[cells[b,lane][field] for b in range(4)] for lane in LANES}
            assert all({cells[b,lane]["position"] for b in range(4)}==set(range(4)) for lane in LANES)
            b,f,c,x=map(values.get,LANES)
            contrasts=[x[i]-f[i]-c[i]+b[i] for i in range(4)]
            savings=[old-new for old,new in zip(b,x)]
            result[app][field]={
                "median":{name:median(v) for name,v in values.items()},
                "both_vs_base_savings":savings,"median_savings":median(savings),
                "median_paired_percent_saved":median(100*s/old for s,old in zip(savings,b)),
                "both_wins":sum(s>0 for s in savings),
                "both_minus_branch_median":median(a-z for a,z in zip(x,f)),
                "both_minus_compact_median":median(a-z for a,z in zip(x,c)),
                "interaction_by_block":contrasts,"median_interaction":median(contrasts),
            }
    return result

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("receipt",type=Path)
    a=p.parse_args()
    trial=json.loads(a.receipt.read_text())
    assert len(trial["boots"])==2
    print(json.dumps([summary(b["rows"]) for b in trial["boots"]],indent=2))
