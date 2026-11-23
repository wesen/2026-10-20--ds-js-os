#!/usr/bin/env python3
"""Compare compile time and peak heap of two Typed compiler revisions in a bare QuickJS realm, in alternation.

    04-compare-qjs.py HARNESS OLD_DIR NEW_DIR SOURCE REACTOR [--blocks 12]

HARNESS is 02-qjs-measure.c built. OLD_DIR and NEW_DIR are compiler/typed directories (tape.js, typed-wasm.js,
typed-async.js, typed-rv32.js, typed-world.js). SOURCE is a world's Typed source (the Editor's source.list joined
with newlines), REACTOR the Wasm reactor for compileTypedWorld. Each block runs old then new, or new then old, one
fresh runtime and one compile each, for the RV32 compile under the P4's boot policy ("interactive", the policy the
playable firmware uses for the Editor) and for the Wasm world. Block k sets QJS_GC_PHASE=k % 16 for both arms
(02-qjs-measure.c), so the peaks are taken over the cycle collector's phases. Prints medians and the ratio new/old,
and the peaks' ranges. Host timing:
it says whether the interpreter does more work, not how long the P4 takes.
"""
import argparse
import os
import statistics
import subprocess
from pathlib import Path

FILES = ["tape.js", "typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js"]


def run(harness, directory, source, mode, arg, phase):
    out = subprocess.run([harness, "1", str(source), mode, arg, *[str(directory / f) for f in FILES]], check=True,
                         capture_output=True, text=True, env={**os.environ, "QJS_GC_PHASE": str(phase)}).stdout.split()
    fields = dict(f.split("=") for f in out[1:])
    return int(fields["compile_us"]), int(fields["peak"]), int(fields["out"])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("harness")
    parser.add_argument("old", type=Path)
    parser.add_argument("new", type=Path)
    parser.add_argument("source", type=Path)
    parser.add_argument("reactor")
    parser.add_argument("--blocks", type=int, default=12)
    args = parser.parse_args()
    for mode, arg in (("rv32", "interactive"), ("wasm", args.reactor)):
        rows = {"old": [], "new": []}
        for block in range(args.blocks):
            for arm in (["old", "new"] if block % 2 == 0 else ["new", "old"]):
                rows[arm].append(run(args.harness, getattr(args, arm), args.source, mode, arg, block % 16))
        outs = {arm: {r[2] for r in rows[arm]} for arm in rows}
        assert outs["old"] == outs["new"] and len(outs["old"]) == 1, outs
        t = {arm: statistics.median(r[0] for r in rows[arm]) for arm in rows}
        p = {arm: statistics.median(r[1] for r in rows[arm]) for arm in rows}
        spread = {arm: (min(r[1] for r in rows[arm]), max(r[1] for r in rows[arm])) for arm in rows}
        print(f"{mode:4} out {outs['old'].pop():6} B  compile old {t['old']:8.0f} new {t['new']:8.0f} us "
              f"ratio {t['new'] / t['old']:.3f}  peak old {p['old']:9.0f} new {p['new']:9.0f} B ratio "
              f"{p['new'] / p['old']:.3f}  (peak ranges old {spread['old']} new {spread['new']})")


if __name__ == "__main__":
    main()
