#!/usr/bin/env python3
"""Compose A6, streamed typed operations and each A7 register policy."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil

HERE = Path(__file__).resolve().parent
ops = runpy.run_path(str(HERE / "01-stage.py"))


def stage(a7, output):
    output.mkdir(parents=True)
    # Make each policy consumable by the ordinary typed-operation differential.
    (output / "staged").mkdir()
    shutil.copytree(a7 / "sources", output / "staged/sources")
    receipt = {}
    for policy in ("uses", "loops"):
        receipt[policy] = {}
        for lane in ("staged", "observe", "direct"):
            target = output / policy / "lanes" / lane / "typed"
            shutil.copytree(a7 / "lanes" / policy / "typed", target)
            if lane != "staged":
                ops["apply_typed_ops"](target, lane, conditions=True, registers=True)
            receipt[policy][lane] = {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in sorted(target.glob("*.js"))
            }
        (output / policy / "staged").symlink_to(output / "staged")
    (output / "compiler-hashes.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("a7", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    stage(args.a7.resolve(), args.output.resolve())
