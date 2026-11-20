#!/usr/bin/env python3
"""Prepare the guarded Editor corpus and current/direct/bounded compiler lanes."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ops_path, = DAY.glob("PICOCALC-STREAMED-TYPED-OPS--*/scripts/01-stage.py")
ops = load(ops_path, "typed_ops")


def replace(source, a, b):
    return ops.require_replace(source, a, b)


def guarded_editor(source):
    old = """    while (i < end) {
        rows.setCharCodeAt(at, text.charCodeAt(i));
        at = at + 1;
        i = i + 1;
    }"""
    guard = """    if (end <= text.length) {
        while (0 <= i && i < end) {
            rows.setCharCodeAt(at, text.charCodeAt(i));
            at = at + 1;
            i = i + 1;
        }
    }
"""
    return replace(source, old, guard + old)


def frontend(source, mode, conditions=False):
    source = replace(source, "const DIRECT_READ = true;",
                     f'const DIRECT_READ = true;\nconst FACT_POLICY = "{mode}";')
    source = replace(source, "class FunctionEmitter {",
                     (HERE / "02-facts.js").read_text().rstrip() + "\n\nclass FunctionEmitter {")
    source = replace(source, "        this.locals.set(name, { type, index, mutable });",
                     "        this.locals.set(name, { type, index, mutable });\n"
                     "        this.bounds?.local(index, type);")
    if conditions:
        source = replace(source, '            this.want(this.exprType(operand), "bool");',
                         '            this.want(this.exprType(operand), "bool");\n'
                         '            this.term = undefined;')
    else:
        source = replace(source, '            this.code.push(OP.eqz);\n            return "bool";',
                         '            this.code.push(OP.eqz);\n            this.term = undefined;\n            return "bool";')
    source = replace(source, '                this.code.push(OP.sub);\n            }\n            return "i32";',
                     '                this.code.push(OP.sub);\n            }\n            this.term = undefined;\n            return "i32";')
    source = replace(source, "            this.emitConst(value);\n            lex.next();",
                     "            this.emitConst(value);\n            if (value === 0) this.term = 0;\n            lex.next();")
    source = replace(source, '            this.minmax();\n            return "i32";',
                     '            this.minmax();\n            this.term = undefined;\n            return "i32";')
    source = replace(source, "                this.emitConst(this.bufferLiteral(binding.index));",
                     "                this.emitConst(this.bufferLiteral(binding.index));\n                this.term = undefined;")
    source = replace(source, "                this.code.push(0x28, 2, 0);",
                     "                this.code.push(0x28, 2, 0);\n                this.term = this.bounds?.length(binding);")
    source = replace(source, "            this.textRead(binding, pos);",
                     "            this.textRead(binding, pos, this.term);\n            this.term = undefined;")
    source = replace(source, "        return binding.type;",
                     "        this.term = this.bounds?.scalar(binding);\n        return binding.type;")
    first = source.index("    expr(minPrecedence = 0")
    final_anchor = "    exprType(value)" if conditions else "    result(type, branch)"
    last = source.index(final_anchor, first)
    expression = "06-conditions-expression.js" if conditions else "03-expression.js"
    source = source[:first] + (HERE / expression).read_text() + "\n" + source[last:]
    source = replace(source, "        this.emitIndex(0x10, callee.index);",
                     "        this.emitIndex(0x10, callee.index);\n"
                     "        this.bounds?.forget();\n        this.term = undefined;")
    if conditions:
        source = replace(source, '            const test = this.condition();\n            if (typeof test === "string") this.branchIf(VOID);',
                         '            const test = this.condition();\n'
                         '            const entry = this.bounds?.checkpoint();\n'
                         '            this.bounds?.assume(this.term);\n'
                         '            if (typeof test === "string") this.branchIf(VOID);')
    else:
        source = replace(source, "            this.branchIf(VOID);",
                         "            this.branchIf(VOID);\n"
                         "            const entry = this.bounds?.checkpoint();\n"
                         "            this.bounds?.assume(this.term);")
    source = replace(source, "            else this.result(result, true);\n            this.code.push(OP.end);",
                     "            else this.result(result, true);\n            this.code.push(OP.end);\n"
                     "            this.bounds?.join(entry);")
    source = replace(source, '        if (lex.accept("while")) {\n            lex.expect("(");',
                     '        if (lex.accept("while")) {\n'
                     '            const entry = this.bounds?.beginLoop(this.locals, lex);\n'
                     '            lex.expect("(");')
    while_anchor = "            else this.emitCondition(test, false, 1);" if conditions else "            this.exitWhile();"
    source = replace(source, while_anchor + "\n            this.block(result);",
                     while_anchor + "\n            this.bounds?.assume(this.term);\n"
                     "            this.block(result);\n            this.bounds?.join(entry);")
    source = replace(source, "                    this.emitMemory(0x36, 2, field.offset);",
                     "                    this.emitMemory(0x36, 2, field.offset);\n                    this.bounds?.forget();")
    source = replace(source, "                this.emitIndex(OP.set, local.index);",
                     "                this.emitIndex(OP.set, local.index);\n                this.bounds?.assign(local.index);")
    source = replace(source, "class NumericFunctionEmitter extends FunctionEmitter {",
                     """class NumericFunctionEmitter extends FunctionEmitter {
    constructor(lexer, functions, records) {
        super(lexer, functions, records);
        if (FACT_POLICY !== "current") this.bounds = new BoundsFacts();
    }""")
    source = replace(source, '''    textRead(binding, pos) {
        this.code.push(TYPED_READ, binding.index * 2 + Number(binding.type === "buffer"));''',
                     '''    textRead(binding, pos, term) {
        const proven = this.bounds?.proves(term, this.bounds.length(binding));
        this.code.push(TYPED_READ, binding.index * 4 + Number(binding.type === "buffer") + 2 * Number(!!proven));''')
    return replace(source, "        if (this.hasTypedOperations) fn.hasTypedOperations = true;",
                   "        if (this.hasTypedOperations) fn.hasTypedOperations = true;\n"
                   "        if (this.bounds) fn.bounds = {proven: this.bounds.proven, exhausted: this.bounds.exhausted, examined: this.bounds.examined};")


def backend(source, instrument=False):
    source = replace(source, "        const recv = binding >> 1;\n        this.load(T6, 4 * recv);",
                     "        const recv = binding >> 2;\n        if (!(binding & 2)) {\n            this.load(T6, 4 * recv);")
    marker = "        this.load(T6, 0, T6);\n        this.emit(instruction.b(6, index, T6, 8)); // bltu: success skips ebreak\n        this.emit(0x00100073);"
    code = ("            this.emit(0x17900013); // guest counter marker: addi x0, x0, 377\n" if instrument else "") + "\n".join("    "+line for line in marker.splitlines())
    return replace(source, marker, code + "\n        }")


def apply_facts(typed, mode, instrument=False, *, conditions=False):
    for part in ("wasm", "rv32"):
        path = typed / f"{part}.js"
        transform = (lambda src: frontend(src, mode, conditions)) if part == "wasm" else (lambda src: backend(src, instrument))
        path.write_text(transform(path.read_text()))


def stage(work, typedops):
    work.mkdir(parents=True)
    base = typedops / "lanes/direct"
    sources = work / "sources"
    shutil.copytree(typedops / "staged/sources", sources)
    editor = sources / "editor/app.typed"
    editor.write_text(guarded_editor(editor.read_text()))
    output = {}
    for label in ("clean", "count"):
        output[label] = {}
        for lane in ("current", "direct", "bounded"):
            target = work / label / lane
            shutil.copytree(base, target)
            apply_facts(target/"typed", lane, instrument=label == "count")
            output[label][lane] = {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in sorted((target/"typed").glob("*.js"))
            }
    (work/"compiler-hashes.json").write_text(json.dumps(output, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("typedops", type=Path)
    args = parser.parse_args()
    stage(args.work.resolve(), args.typedops.resolve())
