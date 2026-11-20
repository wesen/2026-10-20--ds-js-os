"""Summarize normal or instrumented physical gameplay receipts in input order."""
import argparse
import json
from pathlib import Path
import statistics

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("before", type=Path)
p.add_argument("after", type=Path)
p.add_argument("output", type=Path)
args = p.parse_args()


def range_of(values):
    return {"median":round(statistics.median(values),4),
            "min":round(min(values),4),"max":round(max(values),4)}


def summarize(path):
    raw = json.loads(path.read_text())
    blocks = raw["blocks"]
    totals = {"hostActiveMs":range_of([row["runningHostMs"] for row in blocks])}
    for name, fields in blocks[0]["delta"].items():
        totals[name] = {field:range_of([row["delta"][name][field] for row in blocks]) for field in fields}
    arm = {"imageSha256":raw["imageSha256"],"blocks":len(blocks),"totals":totals}
    if "instrumented" in blocks[0]:
        observations = [r["instrumented"] for r in blocks]
        summed = {}
        for key, value in observations[0].items():
            if isinstance(value, dict):
                assert all(r[key]["n"] > 0 for r in observations),key
                rates = [r[key]["us"]/r[key]["n"] for r in observations]
                summed[key] = {"nPerBlock":range_of([r[key]["n"] for r in observations]),
                               "meanUsPerEventByBlock":range_of(rates)}
            else:
                summed[key] = range_of([r[key] for r in observations])
        summed["meanBytesPerPostByBlock"] = range_of([r["postBytes"]/r["posts"] for r in observations])
        arm["instrumented"] = summed
    return raw, arm


before, old = summarize(args.before)
after, new = summarize(args.after)
assert before["partitionSha256"] == after["partitionSha256"]
matches = {name:row["appSha256"] == after["screens"][name]["appSha256"]
           for name,row in before["screens"].items() if name in after["screens"]}
args.output.write_text(json.dumps({"before":old,"after":new,"appCropExact":matches},indent=2)+"\n")
