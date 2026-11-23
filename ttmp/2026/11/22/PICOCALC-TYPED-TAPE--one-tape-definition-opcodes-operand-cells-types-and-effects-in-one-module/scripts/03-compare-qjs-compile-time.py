#!/usr/bin/env python3
"""Compare the Typed compiler's QuickJS compile time before and after the tape change, in alternation.

    03-compare-qjs-compile-time.py HARNESS OLD_DIR NEW_DIR UNITS_DIR [--blocks 6]

HARNESS is 02-qjs-compile-time.c built; OLD_DIR holds typed-wasm/async/rv32/world.js before the change,
NEW_DIR the compiler/typed directory after it (with tape.js). Each block runs old then new or new then
old (alternating), one compile each, for every unit with the policy the P4 uses at boot. Prints the
median load and compile microseconds per unit and arm, and the ratio new/old. Host timing only: it
says whether the interpreter does more work, not how long the P4 takes.
"""
import argparse
import statistics
import subprocess
from pathlib import Path

UNITS = [("agenda", "interactive", "none"), ("editor", "interactive", "world"), ("chess", "balanced", "world"),
         ("ray", "kernel", "none")]


def run(harness, files, unit, policy, imports):
    out = subprocess.run([harness, "1", str(unit), policy, imports, *map(str, files)], check=True,
                         capture_output=True, text=True).stdout.split()
    fields = dict(f.split("=") for f in out[1:])
    return int(fields["load_us"]), int(fields["compile_us"]), int(fields["image"])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("harness")
    parser.add_argument("old", type=Path)
    parser.add_argument("new", type=Path)
    parser.add_argument("units", type=Path)
    parser.add_argument("--blocks", type=int, default=6)
    args = parser.parse_args()
    names = ["typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js"]
    arms = {"old": [args.old / n for n in names], "new": [args.new / "tape.js"] + [args.new / n for n in names]}
    for unit, policy, imports in UNITS:
        rows = {"old": [], "new": []}
        for block in range(args.blocks):
            for arm in (["old", "new"] if block % 2 == 0 else ["new", "old"]):
                rows[arm].append(run(args.harness, arms[arm], args.units / (unit + ".typed"), policy, imports))
        images = {arm: {r[2] for r in rows[arm]} for arm in rows}
        assert images["old"] == images["new"] and len(images["old"]) == 1, images
        med = {arm: (statistics.median(r[0] for r in rows[arm]), statistics.median(r[1] for r in rows[arm])) for arm in rows}
        print(f"{unit:7} {policy:11} image {images['old'].pop():6} B  load old {med['old'][0]:8.0f} new {med['new'][0]:8.0f} us"
              f"  compile old {med['old'][1]:9.0f} new {med['new'][1]:9.0f} us  ratio {med['new'][1] / med['old'][1]:.3f}")


if __name__ == "__main__":
    main()
