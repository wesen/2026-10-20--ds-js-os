#!/usr/bin/env python3
"""Split tests/compiler/typed-rv32.test.mjs (1,182 lines) into four test files and a helper module.

usage: 07-split-rv32-tests.py [--apply]

Lines 1-5 are the imports every file keeps; 6-26 (compiler(), words and the instruction-field helpers) move to
tests/compiler/rv32-helpers.mjs, which each test file imports. Every test (lines 28-1182) moves unchanged to one
file; the script asserts that each test line lands exactly once and that the cut points are test boundaries.
"""
import argparse
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
TESTS = REPO / "tests" / "compiler"
SOURCE = TESTS / "typed-rv32.test.mjs"
FILES = {
    "typed-rv32.test.mjs": ("Policies, the pass pipeline, its bundles and the pinned image of each policy.",
                            [(199, 257), (1098, 1182)]),
    "typed-rv32-emit.test.mjs": ("The emitters: frameless leaves, framed code, addresses, guarded returns, homes, "
                                 "instruction selection, inlining, branches, pointer homes.", [(28, 198), (258, 506)]),
    "typed-rv32-loops.test.mjs": ("Division facts, versioned loops with split locals, value sets.", [(507, 772)]),
    "typed-rv32-kernel.test.mjs": ("Hoisting, fused conjunctions, induction variables, argument-register reuse.",
                                   [(773, 1097)]),
}
HELPERS = (6, 26)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true")
    a = p.parse_args()
    lines = SOURCE.read_text().split("\n")
    assert lines[-1] == "" and len(lines) - 1 == 1182, len(lines)
    imports = lines[0:5]
    assert all(l.startswith("import ") for l in imports)
    used = set()
    for name, (_, ranges) in FILES.items():
        for first, last in ranges:
            assert lines[first - 1].startswith("test("), (name, first)
            assert last == 1182 or lines[last].startswith("test(") or lines[last] == "" and lines[last + 1].startswith("test("), (name, last)
            for n in range(first, last + 1):
                assert n not in used
                used.add(n)
    for n in range(28, 1183):
        assert n in used or lines[n - 1] == "", n
    helper_lines = lines[HELPERS[0] - 1:HELPERS[1]]
    helpers = ["// Shared by the typed-rv32*.test.mjs files: the compiler in a fresh realm and instruction-field helpers.",
               'import {readFileSync} from "node:fs";', 'import {createContext, runInContext} from "node:vm";', ""]
    helpers += [("export " + l if l.startswith(("function ", "const ")) else l) for l in helper_lines]
    out = {"rv32-helpers.mjs": "\n".join(helpers).rstrip("\n") + "\n"}
    for name, (what, ranges) in FILES.items():
        body = "\n\n".join("\n".join(lines[f - 1:l]).strip("\n") for f, l in ranges)
        out[name] = "\n".join(["// " + what, *imports,
                               'import {adjustsStack, compiler, destination, opcode, sourceRegister, words} from "./rv32-helpers.mjs";',
                               "", body]) + "\n"
    for name, text in out.items():
        print(f"{name}: {text.count(chr(10))} lines")
    total = sum(l - f + 1 for _, r in FILES.values() for f, l in r)
    print(f"{total} test lines moved of {1182 - 27}")
    if not a.apply:
        print("dry run; pass --apply")
        return
    for name, text in out.items():
        path = TESTS / name
        assert name == SOURCE.name or not path.exists(), path
        path.write_text(text)
    print("wrote", len(out), "files")


if __name__ == "__main__":
    main()
