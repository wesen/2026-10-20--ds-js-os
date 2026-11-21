"""Sum conditional hardware times within matched scene/block before computing percentages."""
import csv
import json
from pathlib import Path
from statistics import median

ticket = Path(__file__).resolve().parents[2]
with (ticket/"various/ray/packet-classes.csv").open() as stream:
    rows = [{k:int(v) for k,v in r.items()} for r in csv.DictReader(stream)]
assert len(rows) == 243
records = {}
for scene_id, scene in enumerate(["opening", "dense", "sparse"]):
    blocks = []
    for block in range(9):
        arms = []
        for arm in range(3):
            classes = [r for r in rows if (r["scene"],r["block"],r["schedule"]) == (scene_id,block,arm)]
            assert sorted(r["class"] for r in classes) == [0,1,2] and all(r["all_passed"] for r in classes)
            arms.append(sum(r["cycles"] for r in classes))
        blocks.append(arms)
    def result(arm):
        pct = [100*(r[0]-r[arm])/r[0] for r in blocks]
        return {"pairedPercentSaved":median(pct), "wins":sum(p>0 for p in pct)}
    records[scene] = {"minVsScalar":result(1),"minMaxVsScalar":result(2),
                      "matchedBlocks":blocks,"unit":"summed cycles across the three separately timed packet classes"}
(ticket/"various/director/packet-mixtures.json").write_text(json.dumps(records,indent=2)+"\n")
for scene,r in records.items():
    print(scene,r['minVsScalar'],r['minMaxVsScalar'])
