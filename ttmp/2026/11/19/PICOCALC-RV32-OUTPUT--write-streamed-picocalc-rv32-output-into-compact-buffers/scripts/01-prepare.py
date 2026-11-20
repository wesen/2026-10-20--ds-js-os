#!/usr/bin/env python3
"""Reconstruct exact production, compact raw, or direct linked compiler inputs."""
import argparse
import subprocess
from pathlib import Path

BASE = "6426798f69c691f5c1979233ebdeb540f8ce7c61"
ROOT = Path(__file__).resolve().parents[6]
FILES = {
    "typed/wasm.js": "picocalc-os/compiler/typed-wasm.js",
    "typed/rv32.js": "picocalc-os/compiler/typed-rv32.js",
    "typed/world.js": "picocalc-os/compiler/typed-world.js",
    "files/compile.js": "picocalc-os/worlds/files/compile.js",
    "agenda/compile.js": "picocalc-os/worlds/agenda/compile.js",
}

SLABS = """const SLAB_WORDS = 1024;
const SLAB_MASK = SLAB_WORDS - 1;
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

// One word cursor and one patch coordinate space for all functions.
class InstructionSlabs {
    constructor() {
        this.words = 0;
        this.slabs = [];
        this.tail = null;
    }

    get length() { return 4 * this.words; }

    patch(at, word) {
        this.slabs[at >>> 10][at & SLAB_MASK] = word;
    }

    copyTo(bytes, offset) {
        let remaining = this.words;
        for (const slab of this.slabs) {
            const words = Math.min(SLAB_WORDS, remaining);
            if (LITTLE_ENDIAN) {
                bytes.set(new Uint8Array(slab.buffer, 0, 4 * words), offset);
            } else {
                const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4 * words);
                for (let i = 0; i < words; i++) view.setUint32(4 * i, slab[i], true);
            }
            offset += 4 * words;
            remaining -= words;
        }
    }
}

"""


def replace(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"expected one anchor: {old!r}")
    return source.replace(old, new, 1)


def compact_backend(source, direct):
    edits = [
        ("class FunctionCode {", SLABS + "class FunctionCode {"),
        ("constructor(program, functions, starts) {", "constructor(program, functions, starts, output) {"),
        ("        this.words = [];",
         "        this.output = output;\n        this.start = output.words;"),
        ("    emit(word) { this.words.push(word >>> 0); }", """    emit(word) {
        const output = this.output;
        const index = output.words++ & SLAB_MASK;
        if (index === 0) {
            output.tail = new Uint32Array(SLAB_WORDS);
            output.slabs.push(output.tail);
        }
        output.tail[index] = word;
    }"""),
        ("from: this.words.length", "from: this.output.words"),
        ("label.at = this.words.length", "label.at = this.output.words"),
        ("        this.words[0] = instruction.i(0x13, SP, 0, SP, -frame) >>> 0;\n"
         "        this.words[1] = instruction.s(2, SP, RA, frame - 4) >>> 0;",
         "        this.output.patch(this.start, instruction.i(0x13, SP, 0, SP, -frame));\n"
         "        this.output.patch(this.start + 1, instruction.s(2, SP, RA, frame - 4));"),
        ("    const code = [];\n    function lower(fn) {\n        targets.push({global: true});",
         "    const code = [];\n    const output = new InstructionSlabs();\n"
         "    function lower(fn) {\n        targets.push({at: output.words});"),
        ("code.push(new FunctionCode(fn, callables, targets).lower());",
         "code.push(new FunctionCode(fn, callables, targets, output).lower());"),
        ("""    let words = 0;
    for (let i = 0; i < code.length; i++) {
        targets[imported.length + i].at = words;
        words += code[i].words.length;
    }
    const image = new Uint8Array(words * 4);
    const view = new DataView(image.buffer);
""", ""),
        ("offset: 4 * (start + from)", "offset: 4 * from"),
        ("target.at - from - (target.global ? start : 0)", "target.at - from"),
        ("""            fn.words[from] = instruction.j(rd, delta) >>> 0;
        }
        for (let j = 0; j < fn.words.length; j++) view.setUint32(4 * (start + j), fn.words[j], true);
    }""",
         """            output.patch(from, instruction.j(rd, delta));
        }
    }
    const image = new Uint8Array(output.length);
    output.copyTo(image, 0);"""),
    ]
    for old, new in edits:
        source = replace(source, old, new)
    if direct:
        for old, new in [
            ("function compile(source, imports = [], maxSourceLength, options) {",
             "function compile(source, imports = [], maxSourceLength, options, keepSlabs = false) {"),
            ("    const image = new Uint8Array(output.length);\n    output.copyTo(image, 0);",
             "    const image = keepSlabs ? output : new Uint8Array(output.length);\n"
             "    if (!keepSlabs) output.copyTo(image, 0);"),
            ("    bytes.set(program.image, slot + codeOffset);",
             "    if (program.image instanceof InstructionSlabs) program.image.copyTo(bytes, slot + codeOffset);\n"
             "    else bytes.set(program.image, slot + codeOffset);"),
            ("globalThis.typedRv32 = {compile, linkSlot};",
             """function compileForSlot(source, imports, maxSourceLength, options) {
    return compile(source, imports, maxSourceLength, options, true);
}

globalThis.typedRv32 = {compile, compileForSlot, linkSlot};"""),
        ]:
            source = replace(source, old, new)
    return source


def profile(path, source):
    if path == "typed/rv32.js":
        edits = [
            ("    const imported = imports.map(", "    globalThis.outputPhase(0);\n    const imported = imports.map("),
            ("    function consume(fn) {\n", "    function consume(fn) {\n        globalThis.outputPhase(1);\n"),
            ("        fn.code = null;", "        fn.code = null;\n        globalThis.outputPhase(0);"),
            ("        for (const fn of functions) lower(fn);",
             "        globalThis.outputPhase(1);\n        for (const fn of functions) lower(fn);"),
            ("function linkSlot(program, runtime, entries) {",
             "function linkSlot(program, runtime, entries) {\n    globalThis.outputPhase(4);"),
            ("    const bytes = new Uint8Array(runtime);",
             "    globalThis.outputPhase(5);\n    const bytes = new Uint8Array(runtime);"),
            ("    return bytes;", "    globalThis.outputPhase(6);\n    return bytes;"),
        ]
        assembly_anchor = "    let words = 0;" if "    let words = 0;" in source else "    const entries = Object.create(null);"
        for old, new in edits:
            source = replace(source, old, new)
        return replace(source, assembly_anchor, "    globalThis.outputPhase(2);\n" + assembly_anchor)
    if path.endswith("world.js") or path.endswith("compile.js"):
        at = source.index("    const program = typedRv32.")
        split = source.index("\n", at) + 1
        indent = source[split:split + len(source[split:]) - len(source[split:].lstrip())]
        return source[:split] + indent + "globalThis.outputPhase(3);\n" + source[split:]
    return source


def prepare(out, mode, profiled):
    for path, git_path in FILES.items():
        source = subprocess.check_output(["git", "-C", ROOT, "show", f"{BASE}:{git_path}"]).decode()
        if path == "typed/rv32.js" and mode != "baseline":
            source = compact_backend(source, mode == "direct")
        if path.endswith(("world.js", "compile.js")) and mode == "direct":
            source = replace(source, "typedRv32.compile(", "typedRv32.compileForSlot(")
        if profiled:
            source = profile(path, source)
        dest = out / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(source.encode())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=("baseline", "compact", "direct"))
    parser.add_argument("--profile", action="store_true")
    args = parser.parse_args()
    prepare(args.out, args.mode, args.profile)
