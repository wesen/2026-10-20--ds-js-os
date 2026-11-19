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
REPLY_WAIT_FIELDS = {"reply_wait_us", "reply_wait_segments"}


def capture(port, world_profile, bus_profile=False):
    repo = Path(__file__).resolve().parents[6]
    launcher = [sys.executable, repo / "picocalc-os/tools/p4cap.py", "-p", port]
    if bus_profile:
        held = subprocess.check_output(
            [*launcher, "--no-reset", "-s", "1.5", "-c", "0.2 hold"], text=True, errors="replace",
        )
        if "i2c0 held between transactions" not in held or "#OK hold" not in held:
            raise SystemExit("keyboard bus did not acknowledge hold before reboot")
    options = ["-s", "9.0", "-c", "7 stats"] if bus_profile else ["-s", "7.5"]
    log = subprocess.check_output(
        [*launcher, *options],
        text=True,
        errors="replace",
    )
    fields = {
        "compile_us": r"agenda compile source=bundle status=ok us=(\d+)",
        "peak_js_bytes": r"agenda compile source=bundle status=ok us=\d+ peak_js_bytes=(\d+)",
        "module_bytes": r"agenda compile source=bundle status=ok us=\d+ peak_js_bytes=\d+ module_bytes=(\d+)",
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
    if bus_profile:
        trial["buses"] = {
            name: {"transfers": int(transfers), "errors": int(errors)}
            for name, transfers, errors in re.findall(r"^  bus (\S+).*?, (\d+) transfers, \d+ bytes, (\d+) errors", log, re.M)
        }
        if not {"i2c0", "spi2"} <= trial["buses"].keys():
            raise SystemExit("missing I2C or SPI counters in powered cold boot serial output")
    cache = re.search(r"quickjs prelude cache bytes=(\d+) build_us=(\d+)", log)
    if cache:
        trial["prelude_cache"] = {"bytes": int(cache[1]), "build_us": int(cache[2])}
    origin = re.search(r"agenda boot source_start_us=(\d+)", log)
    relocation = re.search(r"cji: loader start_us=(\d+) end_us=(\d+)", log)
    if origin and relocation:
        trial["cji_loader"] = {
            "start_us": int(relocation[1]) - int(origin[1]),
            "end_us": int(relocation[2]) - int(origin[1]),
        }
    if world_profile:
        worlds = {}
        for line in log.splitlines():
            match = re.search(r"agenda boot-world name=(\S+) ((?:\w+=\d+ ?)+)", line)
            if match:
                sample = {
                    key: int(value) for key, value in re.findall(r"(\w+)=(\d+)", match[2])
                }
                if sample.keys() not in (WORLD_FIELDS, WORLD_FIELDS | REPLY_WAIT_FIELDS):
                    raise SystemExit(f"incomplete startup sample for {match[1]}")
                worlds[match[1]] = sample
        if "agenda" not in worlds or not any(boot["engine"] == 0 for boot in worlds.values()):
            raise SystemExit("missing per-world boot measurements")
        trial["worlds"] = worlds
        compositor = {
            kind: {
                "total_us": int(total), "segments": int(segments),
                "reply_wait_us": int(wait), "reply_wait_segments": int(wait_segments),
            }
            for kind, total, segments, wait, wait_segments in re.findall(
                r"agenda compositor kind=(\S+) total_us=(\d+) segments=(\d+) "
                r"reply_wait_us=(\d+) reply_wait_segments=(\d+)", log
            )
        }
        if compositor:
            if compositor.keys() != {"draw", "worlds.status", "other"}:
                raise SystemExit("incomplete compositor boot measurements")
            trial["compositor"] = compositor
    return trial


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--world-profile", action="store_true")
    parser.add_argument("--bus-profile", action="store_true", help="record the I2C and SPI counters with each boot")
    args = parser.parse_args()
    if args.trials < 1:
        parser.error("--trials must be positive")
    print(json.dumps({"trials": [capture(args.port, args.world_profile, args.bus_profile) for _ in range(args.trials)]}, indent=2))


if __name__ == "__main__":
    main()
