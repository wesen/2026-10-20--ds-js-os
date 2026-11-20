"""Calibrate once on the opening at depth four, then predict times for other positions."""
import json
from pathlib import Path
import statistics

ticket = Path(__file__).resolve().parents[2]
rows = json.loads((ticket / "various/chess/summary.json").read_text())["rows"]
anchor = next(r for r in rows if r["position"] == "opening" and r["depth"] == 4)
anchor_us = anchor["p4WallUsMinMedianMax"][1]
results = []
seen = set()
for row in rows:
    if row["position"] == "opening":
        continue
    key = (row["position"], row["modelInstructions"], row["result"]["nodes"], row["result"]["slices"])
    if key in seen:
        continue
    seen.add(key)
    us = row["p4WallUsMinMedianMax"][1]
    predictions = {
        "nodes": anchor_us * row["result"]["nodes"] / anchor["result"]["nodes"],
        "instructions": anchor_us * row["modelInstructions"] / anchor["modelInstructions"],
    }
    results.append({"position":row["position"],"depth":row["depth"],"budget":row["budget"],
                    "observedMicroseconds":us,"predictedMicroseconds":predictions,
                    "signedErrorPercent":{k:100*(v-us)/us for k,v in predictions.items()}})
summary = {}
for key in ["nodes","instructions"]:
    errors = [abs(r["signedErrorPercent"][key]) for r in results]
    summary[key] = {"medianAbsolutePercentError":statistics.median(errors), "maxAbsolutePercentError":max(errors)}
receipt = {"anchor":{"position":"opening","depth":4,"elapsedMicroseconds":anchor_us,
                    "instructions":anchor["modelInstructions"],"nodes":anchor["result"]["nodes"]},
           "rule":"Exclude opening and repeated identical work within a position. Each other case gets one vote.",
           "summary":summary,"predictions":results}
(ticket / "various/search-time-prediction.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(len(results), summary)
