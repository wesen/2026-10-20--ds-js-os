#!/usr/bin/env python3
"""Create exact control and two bounded-proof PicoCalc compiler overlays."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

REVISION = "40bcf850a5809ef6d839127869faa952596ed157"
HERE = Path(__file__).resolve().parent


def frozen(path):
    return subprocess.check_output(["git", "show", f"{REVISION}:picocalc-os/{path}"])


def replace(text, needle, replacement):
    if text.count(needle) != 1:
        raise ValueError(f"frozen patch location missing or ambiguous: {needle!r}")
    return text.replace(needle, replacement)


def frontend(base):
    base = replace(base, "                this.code.push(opcode);",
                   "                this.emitBinary(opcode);")
    base = replace(base, "    emitConst(value) {\n",
                   "    emitBinary(op) { this.code.push(op); }\n\n    emitConst(value) {\n")
    return replace(base, "    finish(fn) { return fn; }", """    emitBinary(op) {
        this.code.push(op);
        if (op === OP.div || op === 0x6f) this.hasDivision = true;
    }
    finish(fn) {
        fn.hasDivision = this.hasDivision === true;
        return fn;
    }""")


def backend(base, policy, proofs):
    base = replace(base, "class FunctionCode {",
                   f'const FACT_POLICY = "{policy}";\n{proofs}\nclass FunctionCode {{')
    base = replace(base, "    constructor(program, functions, starts) {", """
    constructor(program, functions, starts, proofs) {
        this.divisorProofs = proofs;
        this.nextDivisorProof = 0;""".lstrip("\n"))
    base = replace(base, """            if (op === 0x6d || op === 0x6f) {
                this.emit(instruction.b(1, b, ZERO, 8));
                this.emit(0x00100073);
            }
            if (op === 0x6d) {""", """            let guardFlags = 0;
            if (op === 0x6d || op === 0x6f) {
                const proofs = this.divisorProofs;
                const index = this.nextDivisorProof;
                if (proofs && index < proofs.count && proofs.offsets[index] === this.at - 1) {
                    guardFlags = proofs.flags[index];
                    this.nextDivisorProof++;
                }
                if (!(guardFlags & FACT_SKIP_ZERO)) {
                    this.emit(instruction.b(1, b, ZERO, 8));
                    this.emit(0x00100073);
                }
            }
            if (op === 0x6d && !(guardFlags & FACT_SKIP_OVERFLOW)) {""")
    base = replace(base, "        return this;\n    }\n}",
                   "        this.divisorProofs = null;\n        return this;\n    }\n}")
    return replace(base, """    const code = [];
    function lower(fn) {
        targets.push({global: true});
        callables.push(fn);
        code.push(new FunctionCode(fn, callables, targets).lower());
    }""", """    const code = [];
    let remainingFacts = FACT_MODULE_BUDGET;
    const observeFacts = options?.observeFacts;
    const factClock = options?.factClock;
    function lower(fn) {
        const cells = fn.code.length;
        const charge = 2 * cells;
        const admitted = cells <= FACT_FUNCTION_CAP &&
            (FACT_POLICY === "always" || (fn.hasDivision && charge <= remainingFacts));
        let proofs = null, analysisNs = 0;
        if (admitted) {
            if (FACT_POLICY === "select") remainingFacts -= charge;
            const start = factClock ? factClock() : 0;
            proofs = analyzeDivisors(fn);
            if (factClock) analysisNs = factClock() - start;
        }
        targets.push({global: true});
        callables.push(fn);
        const compiled = new FunctionCode(fn, callables, targets, proofs).lower();
        code.push(compiled);
        if (observeFacts) observeFacts({
            name: fn.name, cells, candidate: fn.hasDivision, admitted,
            chargedCells: admitted ? charge : 0,
            scratchBytes: admitted ? FACT_SCRATCH_BYTES : 0,
            analysisNs,
            removedZero: proofs?.zero ?? 0,
            removedOverflow: proofs?.overflow ?? 0,
            localProofs: proofs?.locals ?? 0,
            usedProofs: compiled.nextDivisorProof,
        });
    }""")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    output = parser.parse_args().output
    output.mkdir(parents=True, exist_ok=False)
    assets = {
        "typed/wasm.js": frozen("compiler/typed-wasm.js"),
        "typed/rv32.js": frozen("compiler/typed-rv32.js"),
        "typed/world.js": frozen("compiler/typed-world.js"),
        "files/compile.js": frozen("worlds/files/compile.js"),
        "agenda/compile.js": frozen("worlds/agenda/compile.js"),
    }
    manifest = {"revision": REVISION, "lanes": {}}
    proofs = (HERE / "02-divisor-facts.js").read_text()
    for policy in ("control", "always", "select"):
        files = dict(assets)
        if policy != "control":
            files["typed/wasm.js"] = frontend(assets["typed/wasm.js"].decode()).encode()
            files["typed/rv32.js"] = backend(assets["typed/rv32.js"].decode(), policy, proofs).encode()
        manifest["lanes"][policy] = {}
        for name, data in files.items():
            path = output / policy / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            manifest["lanes"][policy][name] = hashlib.sha256(data).hexdigest()
    (output / "compilers.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
