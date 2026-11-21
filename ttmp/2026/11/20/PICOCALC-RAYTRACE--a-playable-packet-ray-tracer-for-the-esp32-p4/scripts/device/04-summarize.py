"""Report medians of paired P4 observations, with every raw row retained separately."""

import argparse
import json
from collections import defaultdict
from pathlib import Path
from statistics import median

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("rows", type=Path)
args = parser.parse_args()
rows = json.loads(args.rows.read_bytes())
assert [r["block"] for r in rows] == list(range(18))
scenes = defaultdict(list)
for r in rows:
    assert r["equalFrame"] == r["equalDepth"] == r["equalInstrumented"] == 1
    scenes[r["scene"]].append(r)


def measurement(group, field):
    a = [r[field][0] for r in group]
    b = [r[field][1] for r in group]
    return {
        "scalarMedianUs": median(a),
        "pieMedianUs": median(b),
        "scalarRangeUs": [min(a), max(a)],
        "pieRangeUs": [min(b), max(b)],
        "medianPairedSavedUs": median(x - y for x, y in zip(a, b, strict=True)),
        "medianPairedSpeedup": round(
            median(x / y for x, y in zip(a, b, strict=True)), 5
        ),
        "pieFasterPairs": sum(y < x for x, y in zip(a, b, strict=True)),
    }


summary = []
for i, group in sorted(scenes.items()):
    assert len(group) == 6 and sum(r["pieFirst"] for r in group) == 3
    geometry = {
        k: group[0][k]
        for k in (
            "sphere",
            "light",
            "rays",
            "sphereTests",
            "sphereHits",
            "hitPixels",
            "shadowPixels",
            "pieGroups",
            "pieActiveLanes",
            "frameCRC",
            "depthCRC",
        )
    }
    assert all(all(r[k] == v for k, v in geometry.items()) for r in group)
    summary.append(
        {
            "scene": i,
            "pairs": len(group),
            **geometry,
            "survivingFraction": round(
                geometry["pieActiveLanes"] / geometry["sphereTests"], 6
            ),
            "setupMedianUs": median(r["setupUs"] for r in group),
            "frame": measurement(group, "frameUs"),
            "primary": measurement(group, "intersectionUs"),
        }
    )
print(
    json.dumps(
        {
            "pairedBlocks": len(rows),
            "scenes": summary,
            "allFrame": measurement(rows, "frameUs"),
            "allPrimary": measurement(rows, "intersectionUs"),
        },
        indent=2,
    )
)
