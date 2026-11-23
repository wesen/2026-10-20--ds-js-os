#!/usr/bin/env python3
"""Split compiler/typed/typed-async.js into compiler/typed/async/*.js.

    python3 05-split-typed-async.py            dry run: print each module's chunks and line counts
    python3 05-split-typed-async.py --write    write the modules (run from the repository root)

The input is typed-async.js at commit 6ead992 (lowered-code lexers report original positions). Every line between
the IIFE's "use strict" and its closing line goes to exactly one module, in source order within each module; the
script asserts that, that each chunk starts at its anchor, and that no module exists yet. The only text added is each
module's header comment. Afterwards `node compiler/typed/async/build.mjs` writes typed-async.js from the modules.
"""
import sys
from pathlib import Path

SOURCE = Path("compiler/typed/typed-async.js")
lines = SOURCE.read_text().split("\n")
assert lines[2] == "(() => {" and lines[3] == '"use strict";', lines[:4]
assert lines[-1] == "" and lines[-2] == "})();", lines[-2:]
BODY_START, BODY_END = 5, len(lines) - 2  # [start, end) in 0-based indices, after the blank line that follows "use strict"
assert lines[4] == "", lines[4]


def find(anchor, start=0):
    hits = [i for i, line in enumerate(lines) if line == anchor and i >= start]
    assert hits, "missing anchor: " + anchor
    return hits[0]


# Chunks in source order: (anchor of the first line, module). Each chunk runs to the next chunk's anchor.
CHUNKS = [
    ("// Existing typed sources use start and pending as locals and record fields.", "scan"),
    ("// Use the real expression/statement checker over already lexed source tokens.", "body"),
    ("function isOperation(tokens, i) {", "scan"),
    ("class Cursor {", "body"),
    ("// Reuse C-produced lexically valid rows. A null body result requests the old", "scan"),
    ("class AsyncBody extends Cursor {", "body"),
    ("function contains(sequence, property) {", "liveness"),
    ("function allocate(program) {", "allocate"),
    ("class GeneratedText {", "text"),
    ("function cut(fn) {", "lower"),
    ("const stateField = (frame, kind) => \"state.\" + frame.base + kind;", "text"),
    ("function emitStep(program, writer, frame) {", "lower"),
    ("function zero(type, types) {", "tasks"),
    ("function prepare(source, imports) {", "rewrite"),
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
    "scan": "// The whole-program pre-pass: which functions are async, the task operations (start, cancel, pending, resume)\n"
            "// in every body, the call graph and its acyclicity. The front end streams each function to the backend, so the\n"
            "// generated functions and the frames must be known before the first ordinary body is compiled.\n",
    "body": "// An async function's body as a statement skeleton (AsyncBody): each expression and simple statement is checked\n"
            "// by the front end's own FunctionEmitter with its tape writers turned off (TypeChecker); the skeleton keeps\n"
            "// the bindings each statement uses and defines, for liveness.\n",
    "liveness": "// Liveness over the statement skeleton: the bindings live after each wait, which a frame saves in WorldState.\n",
    "allocate": "// Frames in WorldState: one per task and async function it reaches, with state, token, the saved scalars and,\n"
                "// for a function awaited from two places, its caller; and the asyncLayout the backends publish.\n",
    "text": "// The lowered program as chunks: copied ranges of the original source and generated text, each with the original\n"
            "// position diagnostics report (originalAt); and the text helpers of the generated functions.\n",
    "lower": "// One frame's step function: the body cut at its waits into pieces dispatched by pc, with saves before each\n"
             "// suspension and reloads on resumption.\n",
    "tasks": "// The task operations' functions: start (with its busy check), cancel, pending, and resume, the dispatcher that\n"
             "// routes a completion event to the innermost waiting frame and up through its callers.\n",
    "rewrite": "// The entry: prepare (scan, check, analyze, allocate) and rewrite (the lowered program and its plan for the\n"
               "// front end, compileFunctions in frontend/compile.js); what the bundle publishes.\n",
}

ORDER = ["scan", "body", "liveness", "allocate", "text", "lower", "tasks", "rewrite"]
assert set(ORDER) == set(pieces) == set(HEADERS)
modules = {name: HEADERS[name] + text(name) for name in ORDER}
# Only blank lines at chunk ends are dropped: the non-blank lines are the body's, as a multiset.
nonblank = sorted(line for line in lines[BODY_START:BODY_END] if line.strip())
assert sorted(line for name in ORDER for line in text(name).split("\n") if line.strip()) == nonblank
total = 0
for name in ORDER:
    n = text(name).count("\n")
    total += n
    print(f"async/{name + '.js':12} {n:5} lines  from {', '.join(f'{lo + 1}-{hi}' for lo, hi in pieces[name])}")
print(f"{total} lines from {BODY_END - BODY_START} body lines of {SOURCE}")
if "--write" in sys.argv:
    for name in ORDER:
        path = Path("compiler/typed/async") / (name + ".js")
        path.parent.mkdir(parents=True, exist_ok=True)
        assert not path.exists(), path
        path.write_text(modules[name])
    print("wrote", len(ORDER), "modules")
