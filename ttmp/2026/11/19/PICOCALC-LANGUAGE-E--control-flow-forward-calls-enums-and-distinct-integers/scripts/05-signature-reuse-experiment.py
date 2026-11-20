#!/usr/bin/env python3
"""Stage frozen compiler snapshots and instrument the signature-reuse experiment."""
import argparse
import json
import subprocess
from pathlib import Path

OS = Path("picocalc-os")
COMPILER = OS / "compiler"
EDITOR = OS / "worlds/editor"


def git_text(revision, path):
    return subprocess.check_output(["git", "show", f"{revision}:{path}"], text=True)


def change(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"expected a single anchor: {old[:120]}")
    return source.replace(old, new, 1)


def stage(root, name, revision, continuation):
    directory = root / name
    directory.mkdir(exist_ok=True)
    files = ["typed-wasm.js", "typed-rv32.js", "typed-world.js"]
    if continuation:
        files.append("typed-async.js")
    for name in files:
        (directory / name).write_text(git_text(revision, COMPILER / name))
    names = git_text(revision, EDITOR / "source.list").strip().splitlines()
    (directory / "editor.typed").write_text("".join(git_text(revision, EDITOR / n) + "\n" for n in names))
    return directory


def modify(directory, name, transform):
    path = directory / name
    path.write_text(transform(path.read_text()))


def reuse_frontend(source):
    source = change(source,
        "numericOperands, onFunction, onSignatures, lowered?.prefix);",
        "numericOperands, onFunction, onSignatures, lowered);")
    source = change(source,
        "onFunction, onSignatures, generatedPrefix) {",
        "onFunction, onSignatures, lowered) {\n    const generatedPrefix = lowered?.prefix;")
    return change(source,
        "    const functions = scanSignatures(lex, records, declared, functionBase, enums, distinct);",
        """    const functions = lowered?.ordinarySignatures ?? [];
    for (const [ordinal, signature] of functions.entries()) {
        signature.index = functionBase + ordinal;
        declared.set(signature.name, signature);
    }
    if (lowered) {
        lex.offset = lowered.generatedAt;
        lex.next();
    }
    for (const signature of scanSignatures(lex, records, declared,
        functionBase + functions.length, enums, distinct)) functions.push(signature);""")


def reuse_rewrite(source):
    source = change(source,
        "return {source, types, functions, imports, prefix,",
        "return {source, types, functions, imports, prefix, signatures,")
    source = change(source,
        "    for (const fn of program.functions.values()) {\n        if (fn.async) {\n            writer.copy(at, fn.start);",
        "    const ordinarySignatures = [];\n"
        "    for (const fn of program.functions.values()) {\n"
        "        if (fn.async) {\n            writer.copy(at, fn.start);")
    source = change(source,
        "        for (const op of fn.replacements) {\n            writer.copy(at, op.at);",
        """        const {name, params, paramNames, result} = program.signatures[fn.index];
        ordinarySignatures.push({name, params, paramNames, result, bodyAt: writer.offset + fn.bodyAt - at});
        for (const op of fn.replacements) {
            writer.copy(at, op.at);""")
    source = change(source,
        '    writer.copy(at, source.length);\n    writer.add("\\n", source.length);',
        '    writer.copy(at, source.length);\n    const generatedAt = writer.offset;\n    writer.add("\\n", source.length);')
    return change(source,
        "    return writer.result(program.prefix, allocation.layout);",
        "    return {...writer.result(program.prefix, allocation.layout), ordinarySignatures, generatedAt};")


COUNTERS = """
const experimentCounters = globalThis.__signatureExperiment ??= {};
function experimentPhase(label, fn) {
    const begin = __now();
    try {
        return fn();
    } finally {
        const row = experimentCounters[label] ??= {ms: 0, count: 0};
        row.ms += __now() - begin;
        row.count++;
    }
}
"""


def instrument_frontend(source, reused):
    source = change(source, '"use strict";', '"use strict";\n' + COUNTERS)
    source = change(source, "    const lowered = globalThis.typedAsync?.rewrite(source, imported);",
        '    const lowered = experimentPhase("rewrite", () => globalThis.typedAsync?.rewrite(source, imported));')
    source = change(source,
        "const {records, enums, distinct} = parseDeclarations(lex);",
        'const {records, enums, distinct} = experimentPhase("emitRecords", () => parseDeclarations(lex));')
    return change(source,
        "for (const signature of scanSignatures(lex, records, declared,\n"
        "        functionBase + functions.length, enums, distinct)) functions.push(signature);" if reused else
        "const functions = scanSignatures(lex, records, declared, functionBase, enums, distinct);",
        'const generated = experimentPhase("emitSignatures", () => scanSignatures(lex, records, declared,\n'
        '        functionBase + functions.length, enums, distinct));\n'
        '    for (const signature of generated) functions.push(signature);' if reused else
        'const functions = experimentPhase("emitSignatures", () => scanSignatures(lex, records, declared,\n'
        '        functionBase, enums, distinct));')


def instrument_rewrite(source):
    source = change(source, '"use strict";', '"use strict";\n' + COUNTERS)
    source = change(source,
        "const signatures = typedWasm.scanSignatures(lex, types.records, new Map(imports), 0,\n"
        "        types.enums, types.distinct, true);",
        'const signatures = experimentPhase("sourceSignatures", () => typedWasm.scanSignatures(lex, types.records,\n'
        '        new Map(imports), 0, types.enums, types.distinct, true));')
    for old, new in [
        ("const program = readProgram(source, imports);",
         'const program = experimentPhase("readProgram", () => readProgram(source, imports));'),
        ("scanOperations(program);", 'experimentPhase("scanOperations", () => scanOperations(program));'),
        ("assertAcyclic(program);", 'experimentPhase("sourceAcyclic", () => assertAcyclic(program));'),
        ("analyze(program);", 'experimentPhase("analyze", () => analyze(program));'),
        ("const allocation = allocate(program);",
         'const allocation = experimentPhase("allocate", () => allocate(program));'),
    ]:
        # The semicolons distinguish calls at prepare from function declarations.
        source = change(source, old, new)
    return source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--control", default="289281c")
    parser.add_argument("--baseline", default="1357545")
    parser.add_argument("--g4", default="7b321a9")
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    stage(args.directory, "control", args.control, False)
    stage(args.directory, "pre-g", args.baseline, False)
    stage(args.directory, "g4", args.g4, True)
    reuse = stage(args.directory, "reuse", args.g4, True)
    modify(reuse, "typed-wasm.js", reuse_frontend)
    modify(reuse, "typed-async.js", reuse_rewrite)
    for label, reused in [("g4-profile", False), ("reuse-profile", True)]:
        target = stage(args.directory, label, args.g4, True)
        if reused:
            modify(target, "typed-wasm.js", reuse_frontend)
            modify(target, "typed-async.js", reuse_rewrite)
        modify(target, "typed-wasm.js", lambda s: instrument_frontend(s, reused))
        modify(target, "typed-async.js", instrument_rewrite)
    for name in ("control", "pre-g", "g4", "reuse", "g4-profile", "reuse-profile"):
        print(json.dumps({"variant": name, "directory": str(args.directory / name)}))


if __name__ == "__main__":
    main()
