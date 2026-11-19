#!/usr/bin/env python3
"""Hold arithmetic statements fixed while varying function partition and source order."""
import argparse
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "representation"))
import run as harness


def source_for(sizes):
    functions = []
    for i, size in enumerate(sizes):
        body = "x=x+1;\n" * size
        functions.append(f"function f{i}(a:i32):i32 {{ let x=a;\n{body}return x; }}\n")
    return "".join(functions)


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    shapes = {
        "one": [2048],
        "eight": [256] * 8,
        "sixty-four": [32] * 64,
        "large-first": [1796] + [4] * 63,
        "large-last": [4] * 63 + [1796],
    }
    with TemporaryDirectory(prefix="methods-shape-") as name:
        work = Path(name)
        engine, _ = harness.setup(work)
        receipt = {"revision": harness.REVISION, "engine": engine, "shapes": {}}
        for label, sizes in shapes.items():
            source = source_for(sizes)
            verification = harness.verify(work, source, [])
            rows = []
            for rotation in range(4):
                peak = {}
                for lane, start, high, _ in harness.invoke(work, source, [], "memory", rotation=rotation):
                    peak[lane] = int(high) - int(start)
                rows.append(peak)
            receipt["shapes"][label] = {"partition": sizes, "statements": sum(sizes),
                "verification": verification, "extraPeakBytesByOrder": rows}
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    run()
