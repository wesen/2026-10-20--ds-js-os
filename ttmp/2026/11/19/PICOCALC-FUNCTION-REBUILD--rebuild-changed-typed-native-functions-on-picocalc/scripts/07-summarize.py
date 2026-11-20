"""Summarize paired rebuild samples per boot. Keep the complete rows separately."""
import argparse
import gzip
import json
from pathlib import Path
from statistics import median, mean


def read(path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            return json.load(stream)
    return json.loads(path.read_text())


def distribution(values):
    return {"n": len(values), "min": min(values), "median": median(values), "max": max(values)}


def summarize(rows, cold, setups=(), guests=()):
    groups = {}
    for key in dict.fromkeys((row["kind"], row["id"]) for row in rows):
        kind, edit = key
        samples = [row for row in rows if (row["kind"], row["id"]) == key]
        plain = {row["block"]: row for row in samples if not row["marked"]}
        marked = {row["block"]: row for row in samples if row["marked"]}
        summary = {
            "candidate_us": distribution([row["elapsed"] for row in plain.values()]),
            "clean_us": distribution([row["cleanUs"] for row in plain.values()]),
            "paired_saved_us": distribution([row["cleanUs"] - row["elapsed"] for row in plain.values()]),
            "phase_probe_change_us": distribution([marked[b]["elapsed"] - plain[b]["elapsed"] for b in plain]),
        }
        if "heap" in next(iter(plain.values())):
            summary["live_heap_bytes"] = distribution([row["heap"]["live"] for row in plain.values()])
            summary["peak_heap_bytes"] = distribution([row["heap"]["peak"] for row in plain.values()])
        if not next(iter(plain.values())).get("error"):
            summary["mean_phases_us"] = {phase: mean(row["phases"][phase] for row in marked.values())
                                         for phase in next(iter(marked.values()))["phases"]}
            summary["mean_measured_us"] = mean(row["elapsed"] for row in marked.values())
        groups.setdefault(kind, {})[edit] = summary
    result = {"by_case": groups, "files_fresh_us": distribution([row["us"] for row in cold])}
    if "peak" in cold[0]:
        result["files_fresh_peak_bytes"] = distribution([row["peak"] for row in cold])
    if setups:
        result["setup"] = {kind: {
            name: distribution([row[name] for row in setups if row["kind"] == kind and not row["marked"]])
            for name in ("us", "live", "peak")
        } for kind in ("files", "fixture")}
    if guests:
        result["files_guest"] = {case: {
            name: distribution([row[name] for row in guests if row["case"] == case and not row["marked"]])
            for name in ("load_us", "run_us")
        } for case in ("seed", "body")}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", type=Path)
    parser.add_argument("--board", type=Path)
    args = parser.parse_args()
    host = read(args.host)
    output = {"host": summarize(host["candidates"], host["cold"])}
    if args.board:
        physical = read(args.board)
        if not physical["restored"] or len(physical["boots"]) < 2:
            raise ValueError("expected a restored board with two complete boots")
        output["board"] = [summarize(boot["rows"], boot["cold"], boot["setups"], boot["guests"])
                           for boot in physical["boots"]]
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
