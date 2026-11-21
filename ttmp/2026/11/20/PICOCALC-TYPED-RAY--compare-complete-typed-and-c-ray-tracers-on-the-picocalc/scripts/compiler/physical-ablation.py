"""Read the device owner's completed matrix; pair compiler comparisons by fixture and repetition."""
import argparse
import json
from pathlib import Path
from statistics import median

cli = argparse.ArgumentParser(description=__doc__)
cli.add_argument("rows", type=Path)
cli.add_argument("loads", type=Path)
cli.add_argument("out", type=Path)
args = cli.parse_args()
data = json.loads(args.rows.read_text())
arms = {"stock": 0, "divisor": 1, "explicit": 4, "inferred": 5, "matched": 8}
rows = {name: {} for name in arms}
for row in data:
    for name, program in arms.items():
        if row["program"] != program:
            continue
        key = (row["fixture"], row["rep"])
        assert key not in rows[name]
        rows[name][key] = row

keys = sorted(rows["stock"])
fixtures = sorted(set(k[0] for k in keys))
assert len(fixtures) == 12
assert all(sorted(index) == keys for index in rows.values())
assert all(len([k for k in keys if k[0] == fixture]) == 3 for fixture in fixtures)
for key in keys:
    observations = [rows[name][key] for name in arms]
    for field in ["pose", "stride", "crc"]:
        assert all(row[field] == observations[0][field] for row in observations)
    for row in observations:
        assert all(355 < c / t < 365 for c, t in zip(row["cycles"][2], row["timesUs"][2]))

measures = {"frame": 0, "primary": 2}
comparisons = {}
for after, before in [("divisor","stock"), ("explicit","stock"), ("explicit","matched"), ("inferred","matched"), ("explicit","inferred")]:
    summary = {}
    for metric,i in measures.items():
        pairs = [(rows[before][k]["timesUs"][2][i],rows[after][k]["timesUs"][2][i]) for k in keys]
        ratio = [(a-b)*100/a for a,b in pairs]
        by_pose = {}
        for fixture in fixtures:
            rs = [r for k,r in zip(keys,ratio) if k[0]==fixture]
            by_pose[fixture] = round(median(rs),4)
        summary[metric] = {"n":len(ratio),"pairedMedianReductionPercent":round(median(ratio),4),
                           "pairedMin":round(min(ratio),4),"pairedMax":round(max(ratio),4),
                           "wins":sum(r>0 for r in ratio),"perFixtureMedianReductionPercent":by_pose}
    comparisons[after+"Vs"+before] = summary
defaults = {name:{metric:median(index[k]["timesUs"][2][i] for k in keys if k[0]=="default")
                  for metric,i in measures.items()} for name,index in rows.items()}
loads = json.loads(args.loads.read_text())
compile_costs = {}
for name, number in arms.items():
    selected = [l for l in loads if l['program'] == number]
    assert sorted(l['rep'] for l in selected) == [0,1,2]
    compile_costs[name] = {"medianCompilerUs":median(l['compilerUs'] for l in selected),
                           "maxTrackedJSBytes":max(l['quickjsPeakBytes'] for l in selected)}
args.out.write_text(json.dumps({"ids":arms,"defaultMedianUs":defaults,"comparisons":comparisons,
                                "compile":compile_costs},indent=2)+"\n")
print(json.dumps(defaults))
