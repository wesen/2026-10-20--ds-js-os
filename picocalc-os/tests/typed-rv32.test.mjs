import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createContext, runInContext} from "node:vm";

function compiler() {
    const ctx = createContext({});
    for (const file of ["typed-wasm.js", "typed-rv32.js"]) {
        runInContext(readFileSync(new URL("../compiler/" + file, import.meta.url), "utf8"), ctx,
            {filename: file});
    }
    return ctx;
}

function words(program, name) {
    const start = program.entries[name];
    const end = Object.values(program.entries).find(offset => offset > start) ?? program.image.length;
    const view = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    return Array.from({length: (end - start) / 4}, (_, i) => view.getUint32(start + 4 * i, true));
}

const opcode = word => word & 127;
const destination = word => (word >>> 7) & 31;
const sourceRegister = word => (word >>> 15) & 31;
const adjustsStack = word => opcode(word) === 0x13 && destination(word) === 2 && sourceRegister(word) === 2;

test("frameless scalar leaves keep arguments live through division and branches", () => {
    const {typedRv32} = compiler();
    const source = `
        function divide(n: i32, d: i32): i32 { return n / d + n; }
        function choose(n: i32, flag: bool): i32 { if (flag) return 7; return n; }
    `;
    const program = typedRv32.compile(source);
    for (const name of ["divide", "choose"]) {
        const code = words(program, name);
        assert(!code.some(adjustsStack));
        assert.equal(code.at(-1), 0x00008067);
    }
    const division = words(program, "divide");
    assert(division.includes(0x00100073));
    assert.equal(division.filter(word => destination(word) === 10 &&
        [0x13, 0x33, 0x37].includes(opcode(word))).length, 1,
        "only the return writes a0, which holds n throughout the function");
    assert.deepEqual(typedRv32.compile(source, [], undefined, {streamFunctions:false}).image, program.image);
});

test("buffer accesses, calls and scalar spills still use the framed backend", () => {
    const {typedRv32} = compiler();
    const source = `
        function readValue(text: string, at: i32): i32 { return text.charCodeAt(at); }
        function callImport(x: i32): i32 { return increment(x); }
        function deep(x: i32): i32 { return 1 + (2 + (3 + (4 + (5 + (6 + x))))); }
    `;
    const imports = [{name:"increment", params:["i32"], result:"i32"}];
    const program = typedRv32.compile(source, imports);
    for (const name of ["readValue", "callImport", "deep"]) {
        assert(adjustsStack(words(program, name)[0]), name);
    }
    assert.equal(program.importCount, 1);
    assert.equal(program.relocations.length, 1);
    assert.equal(program.relocations[0].index, 0);
});

test("the framed backend still diagnoses an unsupported numeric operation", () => {
    const {typedRv32, typedWasm} = compiler();
    const compileFunctions = typedWasm.compileFunctions;
    typedWasm.compileFunctions = (source, base, imports, limit, numeric, onFunction, onSignatures, options) =>
        compileFunctions(source, base, imports, limit, numeric, fn => {
            const add = fn.code.indexOf(0x6a);
            assert(add >= 0);
            fn.code[add] = 0xff;
            onFunction(fn);
        }, onSignatures, options);
    assert.throws(() => typedRv32.compile("function scalar(n: i32): i32 { return n + n; }"),
        /unsupported RV32 operator 255/);
});

test("checked UTF-16 addresses branch directly and literal stores reuse the destination", () => {
    const {typedRv32, typedWasm} = compiler();
    const source = `
        function copy(out: buffer, at: i32): i32 { return out.writeLiteral(at, "a☺🐈"); }
    `;
    const code = words(typedRv32.compile(source), "copy");
    const check = code.findIndex(word => opcode(word) === 0x63 && ((word >>> 12) & 7) === 6);
    assert(check >= 0);
    assert.equal(code[check + 1], 0x00100073);
    const stores = code.filter(word => opcode(word) === 0x23 && ((word >>> 12) & 7) === 1);
    assert.equal(stores.length, 4);
    assert(stores.every(word => sourceRegister(word) === 30));
    assert.deepEqual(stores.map(word => ((word >>> 25) << 5) | destination(word)), [4, 6, 8, 10]);

    const wasm = new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(source).bytes)).exports;
    const memory = new DataView(wasm.memory.buffer);
    memory.setUint32(16, 4, true);
    assert.throws(() => wasm.copy(16, 1), WebAssembly.RuntimeError);
    assert.equal(memory.getUint16(20, true), 0);
    assert.equal(wasm.copy(16, 0), 4);
    assert.deepEqual(Array.from({length: 4}, (_, i) => memory.getUint16(20 + 2 * i, true)),
        [0x61, 0x263a, 0xd83d, 0xdc08]);
});
