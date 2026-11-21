"""Score complete block-matched C and current Typed frames on the same P4."""
from pathlib import Path
from statistics import median
import argparse
import json

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("capture",type=Path)
parser.add_argument("out",type=Path)
args=parser.parse_args()
ticket=Path(__file__).resolve().parents[2]
lines=args.capture.read_text(errors="replace").splitlines()
assert not any(line.startswith("CFERROR") for line in lines)
assert any(line.startswith("SIMDLAB END") for line in lines)
fixtures=json.loads((ticket/"various/director/frame-fixtures.json").read_text())
raw=[]
cells={}
for line in lines:
    if line.startswith("CFROW "):
        _,block,fixture,arm,phase,us,cycles=line.split()
        row={"block":int(block),"fixture":fixture,"arm":int(arm),"phase":int(phase),
             "us":int(us),"cycles":int(cycles)}
        key=(fixture,row["phase"],row["arm"],row["block"])
        assert key not in cells and row["us"]>0 and row["cycles"]>0
        cells[key]=row["us"]
        raw.append(row)
expected={(f["fixture"],phase,arm,block) for f in fixtures for phase in range(2) for arm in range(3) for block in range(6)}
assert set(cells)==expected
def relative(times,baseline):
    ratios=[a/b for a,b in zip(times,baseline)]
    return {"typed_over_control_elapsed_ratio":median(ratios),
            "typed_elapsed_pct_higher":median([100*(x-1) for x in ratios]),
            "typed_frames_per_second_pct_of_control":median([100/x for x in ratios]),
            "typed_extra_us":median([a-b for a,b in zip(times,baseline)]),
            "pairs_with_typed_higher_elapsed":sum(a>b for a,b in zip(times,baseline))}

results=[]
for fixture in fixtures:
    name=fixture["fixture"]
    for phase,stage in [(0,"clean"),(1,"primary")]:
        times=[[cells[name,phase,a,b] for b in range(6)] for a in range(3)]
        medians=list(map(median,times))
        results.append({"fixture":name,"stride":fixture["stride"],"phase":stage,"pairs":6,
                        "median_us":dict(zip(["scalarC","pieC","typed"],medians)),
                        "typed_vs_scalarC":relative(times[2],times[0]),"typed_vs_pieC":relative(times[2],times[1]),
                        "scalarC_vs_pieC_elapsed_ratio":median([a/b for a,b in zip(times[0],times[1])])})
args.out.mkdir(parents=True,exist_ok=True)
for name,rows in [("rows",raw),("result",results)]:
    (args.out/("typed-vs-c-"+name+".json")).write_text(json.dumps(rows,indent=2)+"\n")
for row in results[:2]:
    print(json.dumps(row))
