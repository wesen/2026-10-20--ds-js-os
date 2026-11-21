"""Replay the evidence article's numerical claims directly from the two original tickets."""
from pathlib import Path
from statistics import median
import gzip, hashlib, json, re

day = Path(__file__).resolve().parents[2]
row = next(day.glob("PICOCALC-ROW-IR--*")) / "various"
device = next(day.glob("PICOCALC-PIE-LOOPS--*")) / "various/device"
def read(path):
    return json.loads(path.read_bytes())
def sha(data):
    return hashlib.sha256(data).hexdigest()
def stats(values):
    return {"min": min(values), "median": median(values), "max": max(values)}

name = "checked-middle"
archive = row / "llvm-pipeline"
test = read(archive / "manifest.json")["checked"]["middle"]
raw = gzip.decompress((archive / (name + ".log.gz")).read_bytes())
idx = json.loads(gzip.decompress((archive / (name + ".index.json.gz")).read_bytes()))
assert sha(raw) == test["sha256"] and len(idx) == test["dumps"]
points = []
last = None
drops = []
for i, rec in enumerate(idx):
    start, end = rec["offset"], idx[i + 1]["offset"] if i + 1 < len(idx) else len(raw)
    text = raw[start:end].decode()
    body = re.search(r"^define [^\n]*@row\(.*?^}", text, re.M | re.S)
    count = body.group().count("load i32, ptr %work,") if body else None
    if count is not None and last is not None and count < last:
        drops.append((i - 1, i, last, count))
    if i in (73, 74):
        points.append(dict(ordinal=i, start=start, end=end, header=rec["header"], directI32Loads=count))
    last = count
assert drops[0] == (73, 74, 11, 6)
c = read(row / "passes/execution.json")
t = read(row / "passes/typed-counts.json")
ablation = {
    k: {"verifiedRows": c[k]["rowsVerified"], "codeBytes": c[k]["rowBytes"], **c[k]["totals"]}
    for k in ("checked-gcc", "checked-llc", "checked-llc-nolsr")
}
assert ablation["checked-llc-nolsr"]["instructions"] - ablation["checked-llc"]["instructions"] == 41949
assert t["stock"]["totals"]["stackLoads"] + t["stock"]["totals"]["stackStores"] == 1290106
rows = read(device / "rows.json")
timings = {(v["fixture"], v["block"], v["program"]): (i, v) for i, v in enumerate(rows)}
assert len(rows) == len(timings) == 216
images = read(device / "images.json")
identities = {v["id"]: v for v in images}
assert len(set(v["source"] for v in images)) == 1
for receipt in read(device / "loads.json"):
    assert receipt["elfCRC"] == identities[receipt["program"]]["crc"]
summary = read(device / "summary.json")["poses"]
saved_by_pose = {}
for pose in sorted(summary):
    group = {}
    for phase, phase_name in enumerate(("clean", "audit", "primary", "shade")):
        for a,b,label in ((0,8,"stockToScalar"),(8,5,"scalarToPie"),(0,5,"stockToPie")):
            us, percentages = [], []
            for block in range(6):
                left = timings[pose,block,a][1]
                right = timings[pose,block,b][1]
                for field in ("pose", "stride", "crc", "fixture"):
                    assert left[field] == right[field]
                baseline, candidate = left["timesUs"][2][phase], right["timesUs"][2][phase]
                us.append(baseline-candidate)
                percentages.append(100*(baseline-candidate)/baseline)
            expected = summary[pose][phase_name]["paired"][label]
            assert expected["savedUs"] == stats(us)
            assert expected["savedPct"] == stats(percentages)
            if phase == 0:
                group[label] = expected
    saved_by_pose[pose] = group
out = {"checkedStreamSHA": sha(raw), "states": points, "c": ablation,
       "typed": {arm:v["totals"] for arm,v in t.items()},
       "defaultClean": saved_by_pose["default"], "physicalMedianGroups": 12*4*3,
       "scalarToPieCleanPctAcrossPoseMedians": stats([v["scalarToPie"]["savedPct"]["median"] for v in saved_by_pose.values()]),
       "physicalRowsSHA": sha((device/"rows.json").read_bytes())}
print(json.dumps(out, indent=2))
