"""Summarize ordinary P4 observations only after both arms pass their gates."""

import argparse
import json
from pathlib import Path
from statistics import median

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "receipts", type=Path, help="directory of baseline- and candidate- JSON files"
)
args = parser.parse_args()


def stats(values):
    return {
        "min": min(values),
        "median": median(values),
        "max": max(values),
        "n": len(values),
    }


def compare(earlier, later):
    return {
        "baseline": stats(earlier),
        "candidate": stats(later),
        "medianChangePct": round(100 * (median(later) / median(earlier) - 1), 2),
    }


def read(arm, receipt):
    return json.loads((args.receipts / f"{arm}-{receipt}.json").read_text())


arms = ["baseline", "candidate"]
boots = [read(arm, "cold")["cold"] for arm in arms]
chess = [read(arm, "chess")["rows"] for arm in arms]
editors = [read(arm, "editor") for arm in arms]
assert all(len(rows) == 3 for rows in boots + chess)
assert all(read(arm, "final")["qualified"] for arm in arms)
assert all(
    r["replyAppSHA256"]
    == "5ebdc7118d57aac83f7fc5702dab8db5546d8a18e32a7c6c9dc9b8b28644c55b"
    for arm in chess
    for r in arm
)
assert all(
    editor["scratchRemoved"] and editor["reopenedReadback"] == ["alpha text", "beTa7"]
    for editor in editors
)
assert len(set(editor["editedScreen"] for editor in editors)) == 1
apps = sorted(boots[0][0]["apps"])
output = {"application": {a: read(a, "cold")["application"] for a in arms}, "cold": {}}
for app in apps:
    comparison = {}
    for field in ("us", "peakJSBytes", "moduleBytes"):
        comparison[field] = compare(
            *[[r["apps"][app][field] for r in arm] for arm in boots]
        )
    output["cold"][app] = comparison
for field in ("rebootToLastCompilerLineMs", "rebootToPolledHealthyMs"):
    output[field] = compare(*[[r[field] for r in arm] for arm in boots])
output["chessWorldCpuMs"] = compare(
    *[[r["chessWorldCpuMs"] for r in arm] for arm in chess]
)
output["keyToTwoPaintsUpperMs"] = compare(
    *[[r["hostCompletionBracketMs"][1] for r in arm] for arm in chess]
)
output["editor"] = {
    field: compare(*[[r[field]] for r in editors])
    for field in ("firstSaveHostMs", "editorWorldCpuMs")
}
print(json.dumps(output, indent=2))
