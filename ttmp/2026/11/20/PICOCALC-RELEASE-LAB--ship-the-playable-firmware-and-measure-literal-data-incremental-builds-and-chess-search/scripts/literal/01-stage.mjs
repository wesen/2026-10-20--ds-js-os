import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "../../../../../../..");
const compiler = resolve(root, "picocalc-os/compiler");

function exact(source, old, replacement, count = 1) {
    assert.equal(source.split(old).length - 1, count, "compiler anchor changed");
    return source.replaceAll(old, replacement);
}

export function stage() {
    let frontend = readFileSync(resolve(compiler, "typed-wasm.js"), "utf8");
    frontend = exact(frontend, `        for (let i = 0; i < value.length; i++) {
            this.emitIndex(OP.get, address);
            this.emitConst(value.charCodeAt(i));
            this.emitMemory(0x3b, 1, 4 + 2 * i);
        }
        return value.length;
    }`, `        this.emitLiteralWrite(address, value);
        return value.length;
    }

    emitLiteralWrite(address, value) {
        for (let i = 0; i < value.length; i++) {
            this.emitIndex(OP.get, address);
            this.emitConst(value.charCodeAt(i));
            this.emitMemory(0x3b, 1, 4 + 2 * i);
        }
    }`);
    frontend = exact(frontend, "    finish(fn) { return fn; }", `    emitLiteralWrite(address, value) {
        if (!this.literalPool || value.length < 16) {
            super.emitLiteralWrite(address, value);
            return;
        }
        this.literals ??= [];
        this.code.push(0xf0, address, this.literals.push(value) - 1);
    }

    finish(fn) {
        if (this.literals) fn.literals = this.literals;
        return fn;
    }`);
    frontend = exact(frontend,
        "emitSpanFunctions(lowered, functionBase, imported, numericOperands, onFunction, onSignatures)",
        "emitSpanFunctions(lowered, functionBase, imported, numericOperands, onFunction, onSignatures, options)", 2);
    frontend = exact(frontend,
        "emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures);",
        "emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures, undefined, options);");
    frontend = exact(frontend,
        "function emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures, lowered)",
        "function emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures, lowered, options)");
    frontend = exact(frontend,
        "new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct).function(fn);",
        `const emitter = new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct);
        emitter.literalPool = options?.literalPool === true;
        emitter.function(fn);`, 2);

    let backend = readFileSync(resolve(compiler, "typed-rv32.js"), "utf8");
    backend = exact(backend, "class FunctionCode {", `class LiteralPool {
    constructor(deduplicate, wordCopy) {
        this.deduplicate = deduplicate ? new Map() : null;
        this.wordCopy = wordCopy;
        this.entries = [];
        this.bytes = 0;
        this.references = 0;
    }

    add(text) {
        this.references++;
        const existing = this.deduplicate?.get(text);
        if (existing !== undefined) return existing;
        const entry = {text, offset: this.bytes};
        this.entries.push(entry);
        this.bytes += 2 * text.length;
        this.deduplicate?.set(text, entry);
        return entry;
    }

    write(view, start) {
        for (const {text, offset} of this.entries) {
            for (let i = 0; i < text.length; i++) {
                view.setUint16(start + offset + 2 * i, text.charCodeAt(i), true);
            }
        }
    }
}

class FunctionCode {`);
    backend = exact(backend, "constructor(program, functions, starts) {",
        "constructor(program, functions, starts, pool) {\n        this.pool = pool;\n        this.literalRefs = [];");
    backend = exact(backend, "    step(op) {", `    copyLiteral(address, value) {
        const data = this.pool.add(value);
        this.load(T5, 4 * address);
        this.emit(instruction.i(0x13, T5, 0, T5, 4)); // skip capacity
        this.literalRefs.push({from: this.words.length, data});
        this.emit(0);        // auipc
        this.emit(0);        // addi
        const end = {};
        if (this.pool.wordCopy && data.offset % 4 === 0) {
            const halfwords = {};
            this.emit(instruction.i(0x13, A0, 7, T5, 3));
            this.branch(1, A0, ZERO, halfwords);
            this.copyUnits(4, 2 * (value.length & -2));
            if (value.length & 1) {
                this.load(A0 + 1, 0, T6, 5);
                this.store(A0 + 1, 0, T5, 1);
            }
            this.jump(end);
            this.mark(halfwords);
        }
        this.copyUnits(2, 2 * value.length);
        this.mark(end);
    }

    copyUnits(unit, bytes) {
        const A1 = A0 + 1;
        this.emit(instruction.i(0x13, A0, 0, T6, bytes));
        const loop = this.words.length;
        // A0/A1 and t5/t6 carry no live operand-stack values.
        this.load(A1, 0, T6, unit === 2 ? 5 : 2);
        this.store(A1, 0, T5, unit === 2 ? 1 : 2);
        this.emit(instruction.i(0x13, T6, 0, T6, unit));
        this.emit(instruction.i(0x13, T5, 0, T5, unit));
        this.emit(instruction.b(1, T6, A0, 4 * (loop - this.words.length)));
    }

    step(op) {`);
    backend = exact(backend, "        case 0x00:", `        case 0xf0: this.copyLiteral(this.cell(), this.program.literals[this.cell()]); break;
        case 0x00:`);
    backend = exact(backend, "    const code = [];",
        "    const code = [];\n    const pool = new LiteralPool(options?.literalDedupe !== false, options?.literalWordCopy === true);");
    backend = exact(backend, "new FunctionCode(fn, callables, targets)", "new FunctionCode(fn, callables, targets, pool)");
    backend = exact(backend, "        fn.code = null;", "        fn.code = null;\n        fn.literals = null;");
    backend = exact(backend,
        "    const image = new Uint8Array(words * 4);",
        `    const codeBytes = words * 4;
    const padding = (4 - pool.bytes % 4) % 4;
    const image = new Uint8Array(codeBytes + pool.bytes + padding);`);
    backend = exact(backend, "        for (let j = 0; j < fn.words.length; j++)",
        `        for (const {from, data} of fn.literalRefs) {
            const delta = codeBytes + data.offset - 4 * (start + from);
            const low = (delta << 20) >> 20;
            fn.words[from] = ((delta - low) & 0xfffff000) | (T6 << 7) | 0x17;
            fn.words[from + 1] = instruction.i(0x13, T6, 0, T6, low);
        }
        for (let j = 0; j < fn.words.length; j++)`);
    backend = exact(backend, "    return {image, entries, records:",
        `    pool.write(view, codeBytes);
    if (options?.literalMetrics) Object.assign(options.literalMetrics, {
        codeBytes, dataBytes: pool.bytes, padding, totalBytes: image.length,
        literals: pool.references, uniqueLiterals: pool.entries.length,
    });
    return {image, entries, records:`);
    return {"typed-wasm.js":frontend, "typed-rv32.js":backend};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [target] = process.argv.slice(2);
    assert(target && !resolve(target).startsWith(root + "/"),
        "usage: node 01-stage.mjs ISOLATED_COMPILER_DIRECTORY");
    for (const [name, source] of Object.entries(stage())) writeFileSync(resolve(target, name), source);
}
