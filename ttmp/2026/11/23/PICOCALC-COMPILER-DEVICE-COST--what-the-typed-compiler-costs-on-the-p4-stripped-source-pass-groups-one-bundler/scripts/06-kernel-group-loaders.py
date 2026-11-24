#!/usr/bin/env python3
"""Make every loader that reads the RV32 pass groups read the new kernel group (typed-rv32-kernel.js) too.

usage: 06-kernel-group-loaders.py

A loader that evaluates typed-rv32-loops.js (tests, bench, tools, the trace REPL's module table, the firmware's
bundle list) gets typed-rv32-kernel.js right after it, in the same form. Each edit is an exact replacement with a
checked count per file; a file whose count differs is an error and nothing is written.
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
L, K = "typed-rv32-loops", "typed-rv32-kernel"
# (file, old, new, expected count)
EDITS = [
    ("bench/board/stage.mjs", f'"{L}",', f'"{L}","{K}",', 1),
    ("bench/host/ray-profile.mjs", f'"compiler/typed/{L}.js",', f'"compiler/typed/{L}.js", "compiler/typed/{K}.js",', 1),
    ("bench/lib/compiler.mjs", f'"{L}.js",', f'"{L}.js", "{K}.js",', 1),
    ("compiler/typed/tools/typed-inspect.mjs", f'"{L}"]', f'"{L}","{K}"]', 1),
    ("tests/compiler/f32-cases.mjs", f'"compiler/typed/{L}.js",', f'"compiler/typed/{L}.js", "compiler/typed/{K}.js",', 1),
    ("tests/compiler/rv32-helpers.mjs", f'"{L}.js"]', f'"{L}.js", "{K}.js"]', 1),
    ("tests/compiler/typed-async.test.mjs", f'import "../../compiler/typed/{L}.js";\n',
     f'import "../../compiler/typed/{L}.js";\nimport "../../compiler/typed/{K}.js";\n', 1),
    ("tests/compiler/typed-bitwise.test.mjs", f'"compiler/typed/{L}.js",', f'"compiler/typed/{L}.js", "compiler/typed/{K}.js",', 1),
    ("tests/compiler/typed-inspect.test.mjs", f'"{L}"]', f'"{L}","{K}"]', 1),
    ("tests/compiler/typed-pie-loops.test.mjs", f'import "../../compiler/typed/{L}.js";\n',
     f'import "../../compiler/typed/{L}.js";\nimport "../../compiler/typed/{K}.js";\n', 1),
    ("tests/compiler/typed-rv32-emit.test.mjs", f'"compiler/typed/{L}.js",', f'"compiler/typed/{L}.js", "compiler/typed/{K}.js",', 5),
    ("tests/compiler/typed-rv32-kernel.test.mjs", f'"compiler/typed/{L}.js",', f'"compiler/typed/{L}.js", "compiler/typed/{K}.js",', 4),
    ("tests/compiler/typed-rv32-loops.test.mjs", f'"compiler/typed/{L}.js",', f'"compiler/typed/{L}.js", "compiler/typed/{K}.js",', 3),
    ("tests/compiler/typed-tape.test.mjs", f'"{L}.js",', f'"{L}.js", "{K}.js",', 1),
    ("tests/compiler/typed-wasm-inspect.test.mjs", f'import "../../compiler/typed/{L}.js";\n',
     f'import "../../compiler/typed/{L}.js";\nimport "../../compiler/typed/{K}.js";\n', 1),
    ("tools/gen/candela/typed/host.mjs", f"'compiler/typed/{L}.js',", f"'compiler/typed/{L}.js', 'compiler/typed/{K}.js',", 1),
    ("tools/trace-repl/pkg/tracecompiler/compiler.go",
     '\t{"typedRv32Loops", "rv32Loops", compilerPaths("typed-rv32-loops.js"), false},\n',
     '\t{"typedRv32Loops", "rv32Loops", compilerPaths("typed-rv32-loops.js"), false},\n'
     '\t{"typedRv32Kernel", "rv32Kernel", compilerPaths("typed-rv32-kernel.js"), false},\n', 1),
    ("firmware/port/esp32p4/cmake/typed-apps.cmake",
     '    "typed/rv32-loops.js=${REPO}/compiler/typed/typed-rv32-loops.js")',
     '    "typed/rv32-loops.js=${REPO}/compiler/typed/typed-rv32-loops.js"\n'
     '    "typed/rv32-kernel.js=${REPO}/compiler/typed/typed-rv32-kernel.js")', 1),
]

texts = {}
for rel, old, new, count in EDITS:
    text = texts.get(rel) or (REPO / rel).read_text()
    found = text.count(old)
    if found != count:
        sys.exit(f"{rel}: expected {count} of {old!r}, found {found}")
    texts[rel] = text.replace(old, new)
for rel, text in texts.items():
    (REPO / rel).write_text(text)
    print("edited", rel)
