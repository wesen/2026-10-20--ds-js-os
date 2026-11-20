"""Pair the clean Files comparison, actual body rebuild, native slot materialization and entry invocation."""
import argparse
import json
from pathlib import Path
from statistics import median


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


if __name__=="__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt",type=Path)
    args=parser.parse_args()
    raw=json.loads(args.receipt.read_text())
    if not raw["restored"] or len(raw["boots"])!=2:
        raise ValueError("expected two verified boots and restoration")
    print(json.dumps([paired(boot) for boot in raw["boots"]], indent=2))
