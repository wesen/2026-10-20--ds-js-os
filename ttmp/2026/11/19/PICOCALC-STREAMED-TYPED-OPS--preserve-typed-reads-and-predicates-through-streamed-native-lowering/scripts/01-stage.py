#!/usr/bin/env python3
"""Reconstruct the frozen staged compiler and materialize typed operations lanes."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
REPO = HERE.parents[5]
BASELINE = "dbe26be439802540c8bedcf814198720f3822200"
READ = 0x100
PREDICATE = 0x101


def frozen(path):
    return subprocess.check_output(["git", "-C", REPO, "show", f"{BASELINE}:{path}"])


def require_replace(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f"expected one compiler staging anchor {before!r}")
    return source.replace(before, after)


def read_support(name):
    return (HERE / name).read_text().rstrip()


def frontend(source, mode, conditions=False):
    replacements = {
        "const VOID = 0x40;": f"const VOID = 0x40;\nconst TYPED_READ = {READ}, TYPED_PREDICATE = {PREDICATE};\n"
                             f"const DIRECT_READ = {str(mode == 'direct').lower()};",
        """            const pos = this.nextLocal++;
            this.want(this.expr(), "i32");
            lex.expect(")");
            this.emitIndex(OP.set, pos);
            this.codeUnitAddress(binding.index, pos);
            this.code.push(0x2f, 1, 4);""":
        """            const pos = this.textReadTemp();
            this.want(this.expr(), "i32");
            lex.expect(")");
            this.textRead(binding, pos);""",
        "                this.code.push(OP.if, I32);": "                this.branchIf(I32);",
        "                this.code.push(opcode);": "                this.emitBinary(opcode);",
        "            this.code.push(OP.if, VOID);": "            this.branchIf(VOID);",
        "            this.code.push(OP.eqz, 0x0d, 1);": "            this.exitWhile();",
        "    codeUnitAddress(receiver, position) {": """    emitBinary(op) { this.code.push(op); }
    branchIf(type) { this.code.push(OP.if, type); }
    exitWhile() { this.code.push(OP.eqz, 0x0d, 1); }

    textReadTemp() { return this.nextLocal++; }

    textRead(binding, pos) {
        this.emitIndex(OP.set, pos);
        this.codeUnitAddress(binding.index, pos);
        this.code.push(0x2f, 1, 4);
    }

    codeUnitAddress(receiver, position) {""",
        "    finish(fn) { return fn; }": read_support("02-emitter.js"),
        "globalThis.typedWasm = { compile, linkWorld, invoke, compileFunctions };":
        "globalThis.typedWasm = { compile, linkWorld, invoke, compileFunctions, TYPED_READ, TYPED_PREDICATE };",
    }
    if conditions:
        replacements.pop("            this.code.push(OP.if, VOID);")
        replacements.pop("            this.code.push(OP.eqz, 0x0d, 1);")
        replacements.update(condition_anchors())
    for before, after in replacements.items():
        source = require_replace(source, before, after)
    if conditions:
        source = require_replace(source, "    packPredicate(consumer, operand) {",
                                 read_support("07-conditions-adapter.js"))
        source = require_replace(source, "Number(consumer === 0x0d) + Number(negated)",
                                 "Number(invertConsumer) + Number(negated)")
    return source


def condition_anchors():
    return {
        'if (typeof test === "string") this.code.push(OP.if, VOID);':
            'if (typeof test === "string") this.branchIf(VOID);',
        'if (typeof test === "string") this.code.push(OP.eqz, 0x0d, 1);':
            'if (typeof test === "string") this.exitWhile();',
        'return typeof value === "string" ? { code: this.code.splice(start) } : value;':
            'if (typeof value !== "string") return value;\n'
            '        const comparison = this.capturePredicate?.(start);\n'
            '        return { code: this.code.splice(start), comparison };',
        '                for (const cell of plan.code) this.code.push(cell);\n'
        '                if (takenWhen !== null) {\n'
        '                    if (!takenWhen) this.code.push(OP.eqz);\n'
        '                    this.emitIndex(0x0d, depth);\n'
        '                }':
            '                const start = this.code.length;\n'
            '                for (const cell of plan.code) this.code.push(cell);\n'
            '                if (takenWhen !== null) {\n'
            '                    this.resumePredicate?.(plan.comparison, start);\n'
            '                    if (this.packPredicate?.(0x0d, depth, !takenWhen)) continue;\n'
            '                    if (!takenWhen) this.code.push(OP.eqz);\n'
            '                    this.emitIndex(0x0d, depth);\n'
            '                }',
    }


def backend(source, mode, registers=False):
    for before, after in {
        "const STACK_REGISTERS =": "const {TYPED_READ, TYPED_PREDICATE} = typedWasm;\n"
                                   f"const DIRECT_READ = {str(mode == 'direct').lower()};\n"
                                   + "const STACK_REGISTERS =",
        "class FunctionCode {": read_support("03-projection.js") + "\n\nclass FunctionCode {",
        "    step(op) {": read_support("04-direct-read.js") + "\n\n    step(op) {",
        "        switch (op) {\n        case 0x00:":
        "        switch (op) {\n        case TYPED_READ: this.textRead(this.cell()); break;\n        case 0x00:",
        "        targets.push({global: true});":
        "        if (options?.observeFunction) options.observeFunction(fn);\n"
        "        projectTypedOperations(fn);\n"
        "        targets.push({global: true});",
    }.items():
        source = require_replace(source, before, after)
    if registers:
        source = require_replace(source, read_support("04-direct-read.js"), read_support("08-register-read.js"))
        source = require_replace(source, "        switch (op) {\n        case 0x02:",
                                 """        switch (op) {
        case TYPED_READ: {
            const local = code[i++] >> 1;
            const weight = REGISTER_LOCALS === "loops" ? LOOP_WEIGHT[Math.min(loops, 3)] : 1;
            score[local] += 2 * weight;
            break;
        }
        case 0x02:""")
    return source


def apply_typed_ops(typed, mode, *, conditions=False, registers=False):
    """Apply study #3 to a staged bundle's typed directory."""
    if mode not in ("observe", "direct"):
        raise ValueError(mode)
    front = typed / "wasm.js"
    back = typed / "rv32.js"
    front.write_text(frontend(front.read_text(), mode, conditions))
    back.write_text(backend(back.read_text(), mode, registers))


def stage(work):
    work.mkdir(parents=True)
    script, = DAY.glob("PICOCALC-STAGED-RV32--*/scripts/01-stage.py")
    spec = importlib.util.spec_from_file_location("staged_rv32", script)
    staged = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(staged)
    for path in [
        script,
        script.parent / "02-staged-lowering.patch",
        *DAY.glob("PICOCALC-RV32-BRANCH--*/scripts/02-predicate-fusion.patch"),
    ]:
        if frozen(path.relative_to(REPO).as_posix()) != path.read_bytes():
            raise ValueError(f"staged reconstruction input differs from dbe26be: {path}")
    staged.stage(work / "staged")
    lanes = work / "lanes"
    lanes.mkdir()
    shutil.copytree(work / "staged/lanes/staged", lanes / "staged")
    for name in ("observe", "direct"):
        shutil.copytree(lanes / "staged", lanes / name)
        apply_typed_ops(lanes / name / "typed", name)
    receipt = {}
    for lane in ("staged", "observe", "direct"):
        receipt[lane] = {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted((lanes / lane / "typed").glob("*.js"))
        }
    (work / "compiler-hashes.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    stage(parser.parse_args().work.resolve())
