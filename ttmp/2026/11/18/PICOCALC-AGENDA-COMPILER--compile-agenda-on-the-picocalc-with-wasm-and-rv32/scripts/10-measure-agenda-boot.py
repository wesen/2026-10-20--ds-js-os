#!/usr/bin/env python3
"""Reboot the attached P4 and record only Agenda cold-start milestones."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

STAGES = (
    "before-cji-restore", "before-dispatch", "world-init",
    "world-init-done", "file-submitted", "file-returned", "settle",
)
WORLD_FIELDS = {
    "engine", "first_us", "total_us", "attempts", "js_setup_us", "js_prelude_us",
    "js_source_us", "js_init_us",
}


def capture(port, world_profile):
    repo = Path(__file__).resolve().parents[6]
    log = subprocess.check_output(
        [sys.executable, repo / "picocalc-os/tools/p4cap.py", "-p", port, "-s", "7.5"],
        text=True,
        errors="replace",
    )
    fields = {
        "compile_us": r"agenda compile source=bundle status=ok us=(\d+)",
        "first_response_us": r"agenda response us=(\d+)",
        "world_bytes": r"agenda response us=\d+ world_bytes=(\d+)",
        "frame_turn_us": r"agenda frame turn_us=(\d+)",
    }
    for stage in STAGES:
        pattern = rf"agenda stage {stage} us=(\d+)"
        if stage != "before-cji-restore" or re.search(pattern, log):
            fields[stage.replace("-", "_") + "_us"] = pattern
    trial = {}
    for name, pattern in fields.items():
        match = re.search(pattern, log)
        if match is None:
            raise SystemExit(f"missing {name} in cold boot serial output")
        trial[name] = int(match.group(1))
    if world_profile:
        worlds = {}
        for line in log.splitlines():
            match = re.search(r"agenda boot-world name=(\S+) ((?:\w+=\d+ ?)+)", line)
            if match:
                sample = {
                    key: int(value) for key, value in re.findall(r"(\w+)=(\d+)", match[2])
                }
                if sample.keys() != WORLD_FIELDS:
                    raise SystemExit(f"incomplete startup sample for {match[1]}")
                worlds[match[1]] = sample
        if "agenda" not in worlds or not any(boot["engine"] == 0 for boot in worlds.values()):
            raise SystemExit("missing per-world boot measurements")
        trial["worlds"] = worlds
    return trial


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--world-profile", action="store_true")
    args = parser.parse_args()
    if args.trials < 1:
        parser.error("--trials must be positive")
    print(json.dumps({"trials": [capture(args.port, args.world_profile) for _ in range(args.trials)]}, indent=2))


if __name__ == "__main__":
    main()
