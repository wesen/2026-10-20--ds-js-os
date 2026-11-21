"""Score isolated hand schedules on actual opening/dense/sparse packet inputs."""
import csv
import json
import sys
from pathlib import Path
from statistics import median

raw, out = map(Path, sys.argv[1:])
values={}
for line in raw.read_text(errors="replace").splitlines():
    if not line.startswith("PKTCLASS "):
        continue
    block, scene, arm, group, count, cycles, ok = map(int, line.split()[1:])
    key = block, scene, arm, group
    assert ok == 1 and key not in values and count > 0
    values[key] = (count, cycles)
assert set(values)=={(b,s,a,g) for b in range(9) for s in range(3) for a in range(3) for g in range(3)}
out.mkdir(exist_ok=True, parents=True)
with (out/"packet-classes.csv").open("w") as f:
    w=csv.writer(f,lineterminator="\n")
    w.writerow(["block","scene","schedule","class","packets","cycles","all_passed"])
    for key,(count,cycles) in sorted(values.items()):
        w.writerow([*key,count,cycles,1])
scenes=["opening","dense","sparse"]
groups=["empty","mixed","full"]
names=["scalar","empty","empty-full"]
results={}
for scene, name in enumerate(scenes):
    results[name]={}
    for group, label in enumerate(groups):
        counts={values[b,scene,a,group][0] for b in range(9) for a in range(3)}
        assert len(counts)==1
        count=counts.pop()
        if scene==0:
            assert count==[2111,282,742][group]
        means=[[values[b,scene,a,group][1]/count for b in range(9)] for a in range(3)]
        results[name][label]=dict(packets_per_block=count, schedules={
            arm: dict(cycles_per_packet_median=round(median(mean),3),
                      median_saving_vs_scalar_pct=round(median(100*(x-y)/x for x,y in zip(means[0],mean)),3),
                      wins_vs_scalar=sum(x>y for x,y in zip(means[0],mean)))
            for arm,mean in zip(names,means)})
(out/"packet-classes-summary.json").write_text(json.dumps(results,indent=2)+"\n")
