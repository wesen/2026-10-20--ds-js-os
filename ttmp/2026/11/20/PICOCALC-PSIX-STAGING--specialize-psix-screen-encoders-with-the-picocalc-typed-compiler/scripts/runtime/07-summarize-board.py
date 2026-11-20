"""Validate the adaptive board replay and summarize five matched blocks."""
import json
import statistics
import sys
from pathlib import Path

receipt_path, manifest_path, output = map(Path, sys.argv[1:])
receipts = json.loads(receipt_path.read_text())["adaptive"]
manifest = json.loads(manifest_path.read_text())
arms = ("generic", "trained", "online", "warm")
blocks = set(range(5))


def check_bytes(row, expected):
    for key in ("count", "bytes", "wireHash"):
        if row[key] != expected[key]:
            raise ValueError(f"{row['arm']} block {row['block']} differs on {key}")


def distribution(values):
    return {
        "median": statistics.median(values),
        "range": [min(values), max(values)],
    }


results = {}
consumed = 0
for app, test in manifest["tests"].items():
    expected = test["validation"]
    verify = [row for row in receipts if row["arm"] == f"verify-{app}"]
    if len(verify) != 1 or verify[0]["verified"] != 3:
        raise ValueError(f"missing exact-byte qualification for {app}")
    check_bytes(verify[0], expected)
    consumed += len(verify)
    grouped = {}
    for arm in arms:
        samples = [row for row in receipts if row["arm"] == f"{arm}-{app}"]
        if len(samples) != len(blocks) or {row["block"] for row in samples} != blocks:
            raise ValueError(f"incomplete physical samples for {arm}-{app}")
        for row in samples:
            check_bytes(row, expected)
        grouped[arm] = sorted(samples, key=lambda row: row["block"])
        consumed += len(samples)
    results[app] = {
        "exactByteVerification": verify[0]["verified"],
        "frames": expected["count"],
        "bytes": expected["bytes"],
        "wireHash": expected["wireHash"],
        "policies": {
            arm: {
                "encodeUs": distribution([row["elapsedUs"] for row in samples]),
                "setupUs": distribution([row["setupUs"] for row in samples]),
                "totalUs": distribution([row["elapsedUs"] + row["setupUs"] for row in samples]),
                "pairedEncodeOverGeneric": distribution([
                    row["elapsedUs"] / generic["elapsedUs"]
                    for row, generic in zip(samples, grouped["generic"], strict=True)
                ]),
                **{key: statistics.median(row[key] for row in samples) for key in (
                    "hits", "fallback", "compiled", "evictions", "guardAttempts",
                    "residentChargedBytes"
                )},
            }
            for arm, samples in grouped.items()
        },
    }
if consumed != len(receipts):
    raise ValueError("unrecognized physical sample")

output.write_text(json.dumps({"matchedBlocks": len(blocks), "receipts": consumed, "apps": results},
                            indent=2) + "\n")
