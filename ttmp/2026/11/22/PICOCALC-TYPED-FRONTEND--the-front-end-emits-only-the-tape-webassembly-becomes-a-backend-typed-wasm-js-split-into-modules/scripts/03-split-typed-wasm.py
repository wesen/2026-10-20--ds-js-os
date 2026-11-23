#!/usr/bin/env python3
"""Split compiler/typed/typed-wasm.js into compiler/typed/frontend/*.js and compiler/typed/wasm/*.js.

    python3 03-split-typed-wasm.py            dry run: print each module's chunks and line counts
    python3 03-split-typed-wasm.py --write    write the modules (run from the repository root)

The input is typed-wasm.js after commit 380140d (the front end writes only the tape). Every line between the
IIFE's "use strict" and its closing line goes to exactly one module, in source order within each module; the script
asserts that, and that each chunk starts at the expected anchor. The only text changes: `class FunctionEmitter {`
becomes `class ExpressionParser {` (expressions.js), the statement methods move into `class FunctionEmitter extends
ExpressionParser` (statements.js), and each module gets a header comment. Afterwards
`node compiler/typed/frontend/build.mjs` writes typed-wasm.js from the modules.
"""
import sys
from pathlib import Path

SOURCE = Path("compiler/typed/typed-wasm.js")
lines = SOURCE.read_text().split("\n")
assert lines[1] == "(() => {" and lines[2] == '"use strict";', lines[:3]
assert lines[-1] == "" and lines[-2] == "})();", lines[-2:]
BODY_START, BODY_END = 3, len(lines) - 2  # [start, end) in 0-based indices


def find(anchor, start=0):
    hits = [i for i, line in enumerate(lines) if line == anchor and i >= start]
    assert hits, "missing anchor: " + anchor
    return hits[0]


# Chunks in source order: (anchor of the first line, module). Each chunk runs to the next chunk's anchor.
CHUNKS = [
    ("// The tape's opcodes and block types (tape.js, loaded first). The Wasm mode writes the same opcodes.", "expressions-head"),
    ("const TOKEN = /\\s*(?:\\/\\/[^\\n]*(?:\\n|$)\\s*)*((?:[a-zA-Z_]\\w*)|(?:\\d+)|(?:\"(?:[^\"\\\\\\x00-\\x1f]|\\\\(?:[\"\\\\/bfnrt]|u[0-9a-fA-F]{4}))*\")|(?:!==|===|<=|>=|>>|\\|\\||&&|[{}():;,.=\\-+*/%!<>]))/y;", "lexer"),
    ("function unsigned(value) {", "wasm/encode"),
    ("function vec(elements) {", "wasm/module"),
    ("// An index belongs to one exact source string in one compilation.", "lexer"),
    ("class FunctionEmitter {", "expressions"),
    ("    result(type, branch) {", "statements"),
    ("    bufferLiteral(receiver) {", "expressions"),
    ("    block(result) {", "statements"),
    ("class InspectionCallbackError extends Error {", "frontend/inspect"),
    ("function scanSignatures(lex, records, declared, functionBase, enums, distinct, asyncSpans = false) {", "declarations"),
    ("// Parse and check `source`, writing each function's tape (fn.code, fn.nlocals, fn.literals) and handing it to", "compile"),
    ("// The Wasm backend: a tape serialized as a WebAssembly function body. An operation's opcode is its Wasm opcode and", "wasm/encode"),
    ("const inspectedWasm = Symbol(\"Wasm inspection ranges\");", "wasm/inspect"),
    ("// Compile source's functions with the front end and serialize each tape as it arrives; the tapes are released.", "wasm/encode"),
    ("function describeWasmFunction(fn, event, marks, length, inspect) {", "wasm/inspect"),
    ("function signature(fn) {", "wasm/module"),
    ("function recordLayouts(records) {", "declarations"),
    ("function compile(source, options) {", "wasm/module"),
    ("function inspectWasmEmission(bytes, functions, inspect) {", "wasm/inspect"),
    ("function readSection(sections, id, read) {", "wasm/module"),
    ("// The trusted runtime owns memory, host imports, and world exports. Its", "wasm/link"),
]

starts = []
at = BODY_START
for anchor, module in CHUNKS:
    i = find(anchor, at)
    starts.append(i)
    at = i + 1
assert starts[0] == BODY_START, (starts[0], BODY_START)
assert starts == sorted(starts)
bounds = list(zip(starts, starts[1:] + [BODY_END]))

pieces = {}
for (anchor, module), (lo, hi) in zip(CHUNKS, bounds):
    pieces.setdefault(module, []).append((lo, hi))
covered = sorted(i for spans in pieces.values() for lo, hi in spans for i in range(lo, hi))
assert covered == list(range(BODY_START, BODY_END)), "every body line exactly once"


def text(module):
    out = []
    for lo, hi in pieces[module]:
        chunk = lines[lo:hi]
        while chunk and chunk[-1] == "":
            chunk = chunk[:-1]
        out.append("\n".join(chunk))
    return "\n\n".join(out) + "\n"


HEADERS = {
    "frontend/lexer.js": "// The front end's lexer: the token regexp, the reserved words, and the lexical index a host may provide (the P4's C\n"
                         "// scanner) so that the lexer reads precomputed token rows instead of running the regexp.\n",
    "frontend/declarations.js": "// The signature pass: records, enums, distinct types, member aliases, function signatures, and the call graph's\n"
                                "// acyclicity check; and the layouts the backends publish.\n",
    "frontend/expressions.js": "// The front end's parser and type checker, part one: the tape writer and the expressions (prefix, postfix and\n"
                               "// binary operators, calls, members, buffer literals). There is no syntax tree: each construct is checked and its\n"
                               "// tape written as it is parsed. The tape's constants below are shared by the whole bundle.\n",
    "frontend/statements.js": "// The front end's parser and type checker, part two: blocks, conditionals, loops, match, declarations and\n"
                              "// assignments, and one function's body. typed-async.js subclasses FunctionEmitter as its TypeChecker.\n",
    "frontend/inspect.js": "// The front end's inspection events: the tape's operations of each inspected function, with source spans.\n",
    "frontend/compile.js": "// The front end's entry: compileFunctions parses a program and hands each function's tape to the backend\n"
                           "// before parsing the next (streaming), with the async rewrite (typed-async.js) when the source needs it.\n",
    "wasm/encode.js": "// The WebAssembly backend, part one: a tape serialized as a Wasm function body.\n",
    "wasm/module.js": "// The WebAssembly backend, part two: a module of Typed functions (compile), and the reader and writer of\n"
                      "// module sections that linkWorld uses.\n",
    "wasm/inspect.js": "// The WebAssembly backend's inspection events: each inspected function's Wasm operations and their byte ranges in\n"
                       "// the final module.\n",
    "wasm/link.js": "// The WebAssembly backend, part three: a Typed world linked into a trusted Wasm reactor; and what the bundle\n"
                    "// publishes.\n",
}

expressions = text("expressions-head") + "\n" + text("expressions")
assert expressions.count("class FunctionEmitter {") == 1
expressions = expressions.replace("class FunctionEmitter {", "class ExpressionParser {") + "}\n"
statements = text("statements")
assert statements.rstrip().endswith("}\n}") or statements.rstrip().endswith("}"), statements[-40:]
statements = "class FunctionEmitter extends ExpressionParser {\n" + statements

modules = {
    "frontend/lexer.js": text("lexer"),
    "frontend/declarations.js": text("declarations"),
    "frontend/expressions.js": expressions,
    "frontend/statements.js": statements,
    "frontend/inspect.js": text("frontend/inspect"),
    "frontend/compile.js": text("compile"),
    "wasm/encode.js": text("wasm/encode"),
    "wasm/module.js": text("wasm/module"),
    "wasm/inspect.js": text("wasm/inspect"),
    "wasm/link.js": text("wasm/link"),
}
assert set(modules) == set(HEADERS)
total = 0
for name, body in modules.items():
    n = body.count("\n")
    total += n
    chunks = pieces[{"frontend/lexer.js": "lexer", "frontend/declarations.js": "declarations",
                     "frontend/expressions.js": "expressions", "frontend/statements.js": "statements",
                     "frontend/inspect.js": "frontend/inspect", "frontend/compile.js": "compile",
                     "wasm/encode.js": "wasm/encode", "wasm/module.js": "wasm/module",
                     "wasm/inspect.js": "wasm/inspect", "wasm/link.js": "wasm/link"}[name]]
    print(f"{name:26} {n:5} lines  from {', '.join(f'{lo + 1}-{hi}' for lo, hi in chunks)}")
print(f"{total} lines from {BODY_END - BODY_START} body lines of {SOURCE}")
if "--write" in sys.argv:
    for name, body in modules.items():
        path = Path("compiler/typed") / name
        path.parent.mkdir(parents=True, exist_ok=True)
        assert not path.exists(), path
        path.write_text(HEADERS[name] + body)
    print("written")
