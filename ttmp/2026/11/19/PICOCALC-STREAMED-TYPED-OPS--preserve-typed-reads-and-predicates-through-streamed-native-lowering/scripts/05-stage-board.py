#!/usr/bin/env python3
"""Stage the three compiler lanes for the shared P4 cold/guest experiment."""
import argparse
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent


def stage(lanes, output):
    script, = DAY.glob("PICOCALC-COMPILER-LAB--*/scripts/01-stage.py")
    spec = importlib.util.spec_from_file_location("lab_stage", script)
    lab = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lab)
    baseline = lanes / "staged/typed"

    def staged_baseline(path):
        name = Path(path).stem.removeprefix("typed-")
        return (baseline / f"{name}.js").read_bytes()

    # The original harness normally uses the production compiler as its control.
    lab.frozen = staged_baseline
    lab.stage(output, {
        "base": lanes / "staged",
        "observe": lanes / "observe",
        "direct": lanes / "direct",
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lanes", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    stage(args.lanes.resolve(), args.output.resolve())
