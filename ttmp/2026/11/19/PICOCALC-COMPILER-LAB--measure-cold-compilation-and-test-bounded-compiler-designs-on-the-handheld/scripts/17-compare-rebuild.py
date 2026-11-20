"""Pair the clean Files comparison, actual body rebuild, native slot materialization and entry invocation."""
import argparse
import gzip
import json
from pathlib import Path
from statistics import median


def read(path):
    if path.suffix==".gz":
        with gzip.open(path,"rt") as f:
            return json.load(f)
    return json.loads(path.read_text())


def paired(boot):
    rows = {r["block"]:r for r in boot["rows"] if r["kind"]=="files" and r["id"]=="body" and not r["marked"]}
    guests = {g["block"]:g for g in boot["guests"] if g["case"]=="body" and not g["marked"]}
    if set(rows) != set(range(4)) or guests.keys() != rows.keys():
        raise ValueError("incomplete Files edited-body comparison")
    data = []
    for block, r in sorted(rows.items()):
        g = guests[block]
        if g["result"] != 3 or g["units"] != [95, 65, 98]:
            raise ValueError("edited entry must recognize _Ab")
        elapsed = r["elapsed"] + g["load_us"] + g["run_us"]
        data.append(dict(block=block, build_us=r["elapsed"], clean_link_us=r["cleanUs"], load_us=g["load_us"],
                         run_us=g["run_us"], measured_components_us=elapsed, peak_bytes=r["heap"]["peak"],
                         vs_clean_build_percent=100*(r["elapsed"]-r["cleanUs"])/r["cleanUs"]))
    return {"rows":data,"medians":{k:median(r[k] for r in data) for k in data[0] if k!="block"}}


def continuous(boot):
    cells={(r["block"],r["mode"]):r for r in boot["rows"]}
    expected={(i,name) for i in range(6) for name in ("rebuild","clean")}
    if set(cells)!=expected or len(boot["rows"])!=12:
        raise ValueError("expected six matched edit-to-return pairs")
    pairs=[]
    for i in range(6):
        a,b=cells[i,"rebuild"],cells[i,"clean"]
        if a["sha256"]!=b["sha256"] or any(x["units"]!=[95,65,98] or x["result"]!=3 for x in (a,b)):
            raise ValueError("warm clean and edited build must return identical ELF and native result")
        pairs.append(dict(block=i,clean_us=b["us"],rebuild_us=a["us"],delta_us=a["us"]-b["us"],
                          delta_percent=100*(a["us"]/b["us"]-1),
                          retained_difference=a["before"]-b["before"],peak_difference=a["peak"]-b["peak"],
                          rebuild_load_us=a["load_us"],rebuild_run_us=a["run_us"]))
    return {"rows":pairs,"medians":{k:median(row[k] for row in pairs) for k in pairs[0] if k!="block"}}


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt",type=Path)
    parser.add_argument("--endpoint",type=Path,help="separate continuous source-to-return campaign")
    args=parser.parse_args()
    raw=read(args.receipt)
    if not raw["restored"] or len(raw["boots"])!=2:
        raise ValueError("expected two verified boots and restoration")
    result={"components":[paired(boot) for boot in raw["boots"]]}
    if args.endpoint:
        supplemental=read(args.endpoint)
        if not supplemental["restored"] or len(supplemental["boots"])!=2:
            raise ValueError("expected two verified endpoint boots and restoration")
        result["continuous"]=[continuous(boot) for boot in supplemental["boots"]]
    print(json.dumps(result,indent=2))
