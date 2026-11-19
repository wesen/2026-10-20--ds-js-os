#!/usr/bin/env python3
"""Extract reproducible Files measurements from the powered trial logs."""
import argparse
import hashlib
import json
from pathlib import Path
import re

COMPILE = re.compile(r"^files compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)", re.M)
LOAD = re.compile(r"^agenda boot-world name=files engine=(\d+) first_us=(\d+) total_us=(\d+)", re.M | re.ASCII)
AGENDA = re.compile(r"^agenda response us=(\d+)", re.M)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("trial", type=Path)
    cli.add_argument("images", type=Path)
    cli.add_argument("backup", type=Path)
    args = cli.parse_args()
    workflows = json.loads((args.trial / "results.json").read_text())
    data = {"camera_samples": 0, "targets": {}}
    for target, engine in (("wasm", 1), ("rv32", 2)):
        path = args.trial / target
        boot = (path / "boot.log").read_text(errors="replace")
        compile_fields = ("microseconds", "peak_js_bytes", "module_bytes")
        compiles = [dict(zip(compile_fields, map(int, match))) for match in COMPILE.findall(boot)]
        loaded = [tuple(map(int, match)) for match in LOAD.findall(boot)]
        if not compiles or not loaded or any(mode != engine for mode, _, _ in loaded):
            raise SystemExit(f"{target} missing successful compile or expected runtime load")
        if "#OK worlds" not in boot or workflows[target]["workflow"] != "pass":
            raise SystemExit(f"{target} missing console or workflow verification")
        data["targets"][target] = {
            "image_sha256": hashlib.sha256((args.images / target / "picocalc-os-p4.bin").read_bytes()).hexdigest(),
            "compiles_in_uart_capture": compiles,
            "load_logged_by_agenda": [{"engine": mode, "start_us_relative_to_agenda_compile": start, "loader_us": duration}
                                       for mode, start, duration in loaded],
            "agenda_first_frame_us": [int(n) for n in AGENDA.findall(boot)],
            "workflow": workflows[target]["workflow"],
            "buses": {name: dict(zip(("transfers", "errors"), stats))
                      for name, stats in workflows[target]["buses"].items()},
            "screenshot_sha256": hashlib.sha256((path / "shot-1.png").read_bytes()).hexdigest(),
        }
    data["original_application_sha256"] = hashlib.sha256((args.backup / "factory-original.bin").read_bytes()).hexdigest()
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
