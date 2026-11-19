#!/usr/bin/env python3
"""Summarize per-boot startup intervals in a matched Agenda receipt."""
import argparse
import json
from pathlib import Path
from statistics import median


def series(trials, measure):
    values = [measure(trial) for trial in trials]
    return {"min": min(values), "median": median(values), "max": max(values)}


def summarize(target):
    cold = target["cold"]
    settled = target["settled"]["trials"]
    summary = {
        "boots": len(cold),
        "healthy_boots": sum(
            trial.get("buses", {}).keys() >= {"i2c0", "spi2"}
            and all(trial["buses"][bus]["transfers"] and not trial["buses"][bus]["errors"]
                    for bus in ("i2c0", "spi2"))
            for trial in cold
        ),
        "boots_at_or_below_two_seconds": sum(trial["first_response_us"] <= 2_000_000 for trial in cold),
        "cold_compile_us": series(cold, lambda t: t["compile_us"]),
        "cold_first_response_us": series(cold, lambda t: t["first_response_us"]),
        "init_to_fs_submit_us": series(cold, lambda t: t["file_submitted_us"] - t["world_init_done_us"]),
        "fs_submit_to_return_us": series(cold, lambda t: t["file_returned_us"] - t["file_submitted_us"]),
        "fs_return_to_settle_us": series(cold, lambda t: t["settle_us"] - t["file_returned_us"]),
        "cold_publishing_turn_us": series(cold, lambda t: t["frame_turn_us"]),
        "cold_compiler_peak_bytes": series(cold, lambda t: t["peak_js_bytes"]),
        "cold_world_bytes": series(cold, lambda t: t["world_bytes"]),
        "module_bytes": series(cold, lambda t: t["module_bytes"]),
        "settled_first_response_us": series(settled, lambda t: t["first_response_us"]),
        "settled_publishing_turn_us": series(settled, lambda t: t["frame_turn_us"]),
    }
    if "workflow" in target:
        summary["workflow_passed"] = target["workflow"]["passed"]
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    receipt = json.loads(args.receipt.read_text())
    print(json.dumps({name: summarize(data) for name, data in receipt["targets"].items()}, indent=2))


if __name__ == "__main__":
    main()
