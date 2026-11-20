"""Produce paired per-boot effects; guest cycles are medians of paired 128-call batches."""
import argparse
import json
from pathlib import Path
from statistics import median


def matched(base, candidate, blocks):
    if base.keys() != set(blocks) or candidate.keys() != set(blocks):
        raise ValueError("incomplete paired block")
    differences=[candidate[b]-base[b] for b in blocks]
    return dict(base_median=median(base.values()),candidate_median=median(candidate.values()),
                difference=median(differences),percent=median(100*d/base[b] for b,d in zip(blocks,differences)),
                differences=differences)


def summarize(results):
    if not results["restored"]:
        raise ValueError("missing post-trial firmware restore")
    names=list(results["compilers"])
    table=[]
    for i,boot in enumerate(results["boots"],1):
        for lane in names[1:]:
            for app in ("files","agenda","editor"):
                row=dict(boot=i,lane=lane,app=app)
                for metric in ("us","peak","words","bytes"):
                    def column(which):
                        return {r["block"]:r[metric] for r in boot["rows"] if r["lane"]==which and r["app"]==app}
                    row[metric]=matched(column("base"),column(lane),range(2*len(names)))
                if app!="editor":
                    op={"files":"compare","agenda":"weekday"}[app]
                    def cycles(which):
                        return {r["block"]:r["cycles"]/r["count"] for r in boot["guest"]
                                if r["op"]==op and r["lane"]==which}
                    row["guest_cycles_per_call"]=matched(cycles("base"),cycles(lane),range(16))
                table.append(row)
    return table


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt",type=Path)
    param=parser.parse_args()
    print(json.dumps(summarize(json.loads(param.receipt.read_text())),indent=2))
