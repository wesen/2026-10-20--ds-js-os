#!/usr/bin/env python3
"""Summarize two validated PicoCalc boots of the shared experiment."""
import argparse
import hashlib
import json
import statistics
from pathlib import Path

LANES = ("base", "compact", "direct")
PHASES = {"frontend": 0, "lowering": 1, "assembly": 2, "slot_output": 5}


def group(rows, name):
    return [r for r in rows if r["lane"] == name]


def summarize(path):
    data = json.loads(path.read_text())
    rows = data["rows"]
    by_lane = {name: {row["block"]: row for row in group(rows, name)} for name in LANES}
    for series in by_lane.values():
        assert set(series) == set(range(4))
    digests = {r["sha256"] for series in by_lane.values() for r in series.values()}
    sizes = {r["size"] for series in by_lane.values() for r in series.values()}
    assert len(digests) == len(sizes) == 1
    baseline = by_lane["base"]
    clean = {}
    for lane, series in by_lane.items():
        clean[lane] = {field: statistics.median(r[field] for r in series.values()) for field in ("us", "peak")}
        clean[lane]["paired_us_saved"] = statistics.median(
            baseline[block]["us"] - row["us"] for block, row in series.items())
        clean[lane]["faster_blocks"] = sum(baseline[block]["us"] > row["us"] for block, row in series.items())
    phases = {}
    for label, name in (("base", "pb"), ("direct", "pd")):
        samples = group(rows, name)
        assert len(samples) == 2
        assert {r["sha256"] for r in samples} == digests
        phases[label] = {key: {field: statistics.median(r["phases"][index][field] for r in samples)
                              for field in ("us", "peak")}
                         for key, index in PHASES.items()}
    return {"source_receipt_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "firmware_sha256": data["trial_firmware_sha256"], "block_count": len(baseline),
            "elf_sha256": digests.pop(), "elf_bytes": sizes.pop(), "clean": clean, "phases": phases}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("primary", type=Path)
    parser.add_argument("replication", type=Path)
    args = parser.parse_args()
    boots = {"primary": summarize(args.primary), "replication": summarize(args.replication)}
    assert boots["primary"]["elf_sha256"] == boots["replication"]["elf_sha256"]
    print(json.dumps(boots, indent=2))
