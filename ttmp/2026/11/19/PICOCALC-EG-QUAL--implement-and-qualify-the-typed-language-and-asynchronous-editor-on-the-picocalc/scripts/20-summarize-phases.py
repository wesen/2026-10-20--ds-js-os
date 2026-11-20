#!/usr/bin/env python3
"""Reconcile captured Editor phase rows with the stock compiler stopwatch."""
import argparse
import json
from pathlib import Path
import re
from statistics import mean, median

STANDARD = re.compile(r"\beditor compile source=bundle status=(ok|failed) us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)")
MARKER = "eg_compile_phase_v1 "
GROUPS = {
    "input": ["input"],
    "runtime_load_and_arguments": ["context", "bundle_scripts", "eval_wasm", "eval_async", "eval_rv32",
                                   "eval_world", "arg_setup", "js_dispatch", "native_setup"],
    "async_rewrite": ["rewrite_gate", "rewrite_read_program", "rewrite_scan_operations", "rewrite_source_graph",
                      "rewrite_analyze", "rewrite_allocate", "rewrite_text"],
    "ordinary_frontend": ["ordinary_signatures", "ordinary_emission", "ordinary_graph"],
    "native_backend": ["native_lower", "native_assembly", "world_validate", "native_link"],
    "copy_and_teardown": ["arg_release", "result_copy", "teardown", "error"],
}


def need(condition, message):
    if not condition:
        raise ValueError(message)


def lane(manifest, files, variant, last_per_log=False):
    manifest = json.loads(manifest.read_text())
    need(manifest["variant"] == variant, f"expected {variant} manifest")
    need(manifest["firmware"], f"no firmware metadata in {variant} manifest")
    names = manifest["phases"]
    groups = [phase for phases in GROUPS.values() for phase in phases]
    need(sorted(names) == sorted(groups), "unknown or duplicated phase names")
    samples = []
    for log in files:
        previous = None
        count_before = len(samples)
        for line in log.read_text(errors="replace").splitlines():
            if match := STANDARD.search(line):
                need(previous is None, f"{log}: normal Editor row was missing a phase row")
                previous = (match[1], *map(int, match.groups()[1:]))
            if MARKER not in line:
                continue
            need(previous is not None, f"{log}: phase row was missing its normal Editor row")
            record = json.loads(line.split(MARKER, 1)[1].strip())
            observed = tuple(record[key] for key in ("status", "total_us", "peak_js_bytes", "module_bytes"))
            need(observed == previous, f"{log}: compiler rows contain different timings or sizes")
            need(record["status"] == "ok", f"{log}: Editor compile failed")
            need(len(record["phase_us"]) == len(record["visits"]) == len(names), f"{log}: incomplete phase arrays")
            need(all(isinstance(x, int) and x >= 0 for k in ("phase_us", "visits") for x in record[k]),
                 f"{log}: invalid phase value")
            need(sum(record["phase_us"]) == record["total_us"], f"{log}: phase times do not exactly sum to total")
            record["phase_us"] = dict(zip(names, record["phase_us"]))
            record["visits"] = dict(zip(names, record["visits"]))
            need(record["visits"]["native_lower"] + 1 == record["visits"]["ordinary_emission"],
                 f"{log}: streaming body and lowering phase counts disagree")
            rewrite = [record["visits"][name] for name in GROUPS["async_rewrite"] + ["eval_async"]]
            need(all(value == (variant == "g4") for value in rewrite), f"{log}: async phase visits differ from pinned lane")
            need(record["visits"]["native_link"] == 1 and record["visits"]["teardown"] == 1,
                 f"{log}: expected complete link and teardown")
            record["groups_us"] = {group: sum(record["phase_us"][name] for name in phases)
                                   for group, phases in GROUPS.items()}
            record["log"] = str(log)
            samples.append(record)
            previous = None
        need(previous is None, f"{log}: last Editor compile was missing its phase row")
        need(len(samples) > count_before, f"{log}: no measured Editor compile")
        if last_per_log:
            # Flash can auto-boot before the scheduled explicit reboot in boot-1.
            # The stock cold matrix takes the final completed compile in each capture.
            samples[count_before:] = [samples[-1]]
    return {
        "revision": manifest["revision"], "firmware": manifest["firmware"], "samples": samples,
        "total_median_us": median(r["total_us"] for r in samples),
        "total_mean_us": mean(r["total_us"] for r in samples),
        "phase_median_us": {name: median(r["phase_us"][name] for r in samples) for name in names},
        "phase_mean_us": {name: mean(r["phase_us"][name] for r in samples) for name in names},
        "group_mean_us": {key: mean(r["groups_us"][key] for r in samples) for key in GROUPS},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--last-per-log", action="store_true", help="use the explicit reboot in each capture")
    for key in ("pre-g", "g4"):
        parser.add_argument(f"--{key}-manifest", type=Path, required=True)
        parser.add_argument(f"--{key}-logs", type=Path, nargs="+", required=True)
    args = parser.parse_args()
    before = lane(args.pre_g_manifest, args.pre_g_logs, "pre-g", args.last_per_log)
    after = lane(args.g4_manifest, args.g4_logs, "g4", args.last_per_log)
    need(before["firmware"]["reactorSha256"] == after["firmware"]["reactorSha256"], "reactor differs")
    matched_artifacts = set(before["firmware"]["artifacts"]) - {"picocalc-os-p4.bin"}
    need(all(before["firmware"]["artifacts"][key] == after["firmware"]["artifacts"][key] for key in matched_artifacts),
         "manifest, partition or sdkconfig differs")
    diff = {key: after["group_mean_us"][key] - val for key, val in before["group_mean_us"].items()}
    total = after["total_mean_us"] - before["total_mean_us"]
    need(abs(sum(diff.values()) - total) < 0.001, "group mean differences do not reconcile")
    print(json.dumps({"pre-g": before, "g4": after, "group_mean_delta_us": diff,
                      "total_mean_delta_us": total,
                      "total_median_ratio": after["total_median_us"] / before["total_median_us"]}, indent=2))


if __name__ == "__main__":
    main()
