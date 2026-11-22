import assert from "node:assert/strict";
import {createHash} from "node:crypto";
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
        function deep(x: i32): i32 { return 1 - (2 - (3 - (4 - (5 - (6 - x))))); }
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

test("named options preserve written evaluation order and receiver calls emit direct functions", () => {
    const {typedWasm, typedRv32} = compiler();
    const lib = `
type Ball = distinct i32;
record Options { magnitude: i32; invert: bool; }
namespace ball { make = make; }
methods Ball { adjust(Options) = adjust; plain = plain; }
function make(value: i32): Ball { return Ball(value); }
function adjust(b: Ball, magnitude: i32, invert: bool): Ball {
    if (invert) return b - Ball(magnitude);
    return b + Ball(magnitude);
}
function plain(b: Ball, x: i32): Ball { return b + Ball(x); }
function mark(out: buffer, n: i32): i32 {
    out.setCharCodeAt(0, out.charCodeAt(0) * 10 + n);
    return n;
}
`;
    const from = `function sample(out: buffer): i32 {
        return i32(ball.make(mark(out,1)).adjust({invert: mark(out,2) === 2, magnitude: mark(out,3)}).plain(5));
    }`;
    const direct = `function sample(out: buffer): i32 {
        const b = make(mark(out,1));
        const inverted = mark(out,2) === 2;
        return i32(plain(adjust(b,mark(out,3),inverted),5));
    }`;
    for (const definition of [from, direct]) {
        const module = new WebAssembly.Module(typedWasm.compile(lib + definition).bytes);
        const guest = new WebAssembly.Instance(module).exports;
        const memory = new DataView(guest.memory.buffer);
        memory.setUint32(32, 1, true);
        assert.equal(guest.sample(32), 3);
        assert.equal(memory.getUint16(36, true), 123);
        const p = typedRv32.compile(lib + definition);
        assert.deepEqual(p.image, typedRv32.compile(lib + definition, [], undefined, {streamFunctions:false}).image);
    }
    const body = expr => lib + "function f():i32 {return i32(" + expr + ");}";
    const canon = body("ball.make(8).adjust({magnitude:3,invert:false}).plain(5)");
    const flat = body("plain(adjust(make(8),3,false),5)");
    assert.deepEqual(typedWasm.compile(canon).bytes, typedWasm.compile(flat).bytes);
    assert.deepEqual(typedRv32.compile(canon).image, typedRv32.compile(flat).image);
    for (const [expr, message] of [
        ["ball.unknown()", /unknown member ball\.unknown/],
        ["ball.make(1).lost()", /unknown member Ball\.lost/],
        ["ball.make(1).adjust({magnitude:1})", /missing option Options\.invert/],
        ["ball.make(1).adjust({invert:false, width:1})", /unknown option Options\.width/],
        ["ball.make(1).adjust({invert:false,invert:true,magnitude:1})", /duplicate option Options\.invert/],
        ["ball.make(1).adjust({magnitude:0,invert:0})", /expected bool/],
    ]) {
        assert.throws(() => typedWasm.compile(body(expr)), message);
        assert.throws(() => typedRv32.compile(body(expr)), message);
    }
});

test("guarded scalar returns are proved from an earlier body and applied to selected callers", () => {
    const {typedRv32} = compiler();
    const source = `
        function early(x:i32):i32 {return normalize(x);}
        function normalize(x:i32):i32 {if(x<0)return -x;return x;}
        function selected(x:i32):i32 {return normalize(x);}
        function ordinary(x:i32):i32 {return normalize(x);}
    `;
    const events = [];
    const control = typedRv32.compile(source, [], undefined, {policy: "stock"});
    // select changes every function, including normalize; this test isolates the guarded inliner.
    const options = {inlineGuardedReturns: name => name === "selected" || name === "early", select: false,
        inspect:{function:"selected",emit:e => events.push(e)}};
    const candidate = typedRv32.compile(source, [], undefined, options);
    const calls = (p, fn) => words(p, fn).filter(w => opcode(w) === 0x6f && destination(w) === 1).length;
    assert.equal(calls(control, "selected"), 1);
    assert.equal(calls(candidate, "selected"), 0);
    assert.equal(calls(candidate, "ordinary"), 1);
    assert.equal(calls(candidate, "early"), 1);
    assert.deepEqual(words(control, "normalize"), words(candidate, "normalize"));
    const emission = events.find(e => e.target === "rv32" && e.kind === "emission");
    assert(emission.ranges.some(r => r.decisions?.some(d => d.includes("guarded return"))));
    assert.deepEqual(candidate.image, typedRv32.compile(source, [], undefined, {...options, streamFunctions:false}).image);
    assert.deepEqual(control.image, typedRv32.compile(source, [], undefined, {inlineGuardedReturns:false, select:false}).image);
    // The default policy inlines every proved helper; the explicit selector narrows it.
    assert.equal(calls(typedRv32.compile(source), "ordinary"), 0);
});

test("a checked constant read can use a halfword displacement and a dominating capacity", () => {
    const {typedRv32} = compiler();
    const src = "function read(b:buffer):i32 { return b.charCodeAt(0)+b.charCodeAt(19); }";
    const emit = operandLocations => words(typedRv32.compile(src, [], undefined, {policy: "stock", operandLocations}), "read");
    const control = emit(undefined);
    assert.deepEqual(emit({}), control);
    const optimized = emit({forward:true, capacity:true, homes:true});
    assert(optimized.length < control.length);
    const headerLoads = optimized.filter(w => (w & 0x707f) === 0x2003 && ((w >>> 15) & 31) !== 2);
    assert.equal(headerLoads.length, 1);
    assert.equal(optimized.filter(w => w === 0x00100073).length, 2);
    assert(optimized.some(w => (w & 0x707f) === 0x5003 && (w >>> 20) === 42));
});

test("the default policy applies the qualified options and stock reproduces the earlier default", () => {
    const {typedRv32} = compiler();
    const src = readFileSync(new URL("../worlds/raytrace/raytrace.typed", import.meta.url), "utf8");
    const qualified = {inlineGuardedReturns: true, inline: true,
        operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true, capacities: true, nested: true},
        select: {immediates: true, divisions: true, branches: true, results: true, leafParams: true, commute: true}};
    const image = options => typedRv32.compile(src, [], 65536, options).image;
    assert.deepEqual(image(), image({policy: "stock", ...qualified}));
    assert.deepEqual(image({policy: "default"}), image());
    assert.notDeepEqual(image({policy: "stock"}), image());
    // Explicit fields override the policy, and an explicit undefined leaves it unchanged.
    assert.deepEqual(image({operandLocations: false, inlineGuardedReturns: false, select: false, inline: false}), image({policy: "stock"}));
    assert.deepEqual(image({operandLocations: undefined}), image());
    assert.equal(image({policy: "stock"}).length, 9564);
    // PICOCALC-RAY-PARITY Step 7 timed this image on the P4 (board mode 3: 24.18 ms per frame).
    assert.equal(createHash("sha256").update(image()).digest("hex"),
        "4e7eb52aee07cf8fd5e6a3a96733d100241b10fe445030793a73513229fb676c");
    // Step 6's image (31.51 ms): the same policy without inlining and the Step 7 options.
    assert.equal(createHash("sha256").update(image({inline: false, select: qualified.select && {...qualified.select, commute: false},
        operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true}})).digest("hex"),
        "6b8545125fa8d2d004a57135125ebe0bf77bb6a2763e8de97336d17b2350451f");
    assert.throws(() => typedRv32.compile(src, [], 65536, {policy: "fast"}), /unknown RV32 code-generation policy/);
});

test("saved homes and direct reads keep the ABI and reproduce stock results", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js", "tools/typed-ray-bench.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp, typedRayBench} = ctx;
    // Inlining would turn mix into a leaf without callee-saved homes; this test keeps the calls.
    const candidate = {inline: false, operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true}};
    // A framed caller keeps four hot locals across calls; the interpreter faults if any
    // callee-saved register differs at a return, or if sp or ra is wrong.
    const src = `function step(x: i32, k: i32): i32 { return (x * 5 + k) % 9973; }
function mix(n: i32): i32 {
    let a = 1;
    let b = 2;
    let c = 3;
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        a = step(a, i);
        b = step(b + a, c);
        c = step(c, b - a);
        if (i % 3 === 0) { s = s + a; } else { s = s - b + c; }
    }
    return s + a * 3 + b * 7 + c;
}`;
    const result = options => typedRv32Interp.run(typedRv32.compile(src, [], undefined, options), "mix", [200],
        new Uint8Array(64)).result;
    const savedProgram = typedRv32.compile(src, [], undefined, candidate);
    const mix = words(savedProgram, "mix");
    assert(mix.some(word => opcode(word) === 0x23 && sourceRegister(word) === 2 && [9, 18, 19, 20].includes((word >>> 20) & 31)),
        "mix saves a callee-saved register");
    assert.equal(result(candidate), result({policy: "stock"}));
    // The opening ray frame is byte-identical to the C-verified reference, with fewer instructions.
    const sha = typedRayBench.fnv1a;
    const frame = options => typedRayBench.openingFrame(typedRv32.compile(
        readFileSync(new URL("../worlds/raytrace/raytrace.typed", import.meta.url), "utf8"), [], 65536, options));
    const stock = frame({policy: "stock"}), saved = frame(candidate);
    const leafHomes = frame({inline: false, operandLocations: {forward: true, capacity: true, homes: true}});
    assert.equal(sha(saved.bytes), sha(stock.bytes));
    assert.equal(sha(leafHomes.bytes), sha(stock.bytes));
    assert(saved.steps < leafHomes.steps, "saved homes and direct reads reduce the frame's instructions");
});

test("instruction selection matches stock code on constant division, immediates and fused branches", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    const all = {select: {immediates: true, divisions: true, branches: true, results: true, leafParams: true}};
    const divisors = [2, 3, 4, 5, 7, 8, 10, 16, 25, 32, 100, 128, 183, 255, 256, 1000, 2048, 4096, 12345, 65536,
        1 << 30, 2147483647];
    const dividends = [0, 1, -1, 2, -2, 7, -7, 254, 255, 256, -255, -256, 1000000, -1000000, 2147483647,
        -2147483648, -2147483647, 123456789, -987654321];
    for (let i = 0; i < 40; i++) dividends.push((Math.imul(i + 1, 2654435761) ^ (i << 7)) | 0);
    // Every operator appears with a literal right operand, in a leaf and in a framed function.
    const body = divisors.map((d, i) => `    s = s + (n / ${d}) * ${i + 1} + (n % ${powerOf2(d) ? d : 2}) * ${i + 7};`).join("\n");
    function powerOf2(d) { return (d & (d - 1)) === 0; }
    const src = `function cmp(n: i32): i32 {
    let s = 0;
    if (n < 2047) { s = s + 1; }
    if (n <= 2046) { s = s + 2; }
    if (n <= -2049) { s = s + 4; }
    if (n >= -2048) { s = s + 8; }
    if (n === 255) { s = s + 16; }
    if (n > 0) { s = s + 32; }
    if (n !== 0) { s = s + 64; }
    if (n < 0) { s = s + 128; }
    if (n >= 2047) { s = s + 256; }
    if (n === -2048) { s = s + 512; }
    return s + (n - 2048) + (n + 2047) - n * 8 + (n >> 3) + (n >> 31) + (n >> 0);
}
function div(n: i32): i32 {
    let s = 0;
${body}
    return s;
}
function leaf(a: i32, b: i32): i32 { return (a - b) * 4 + a / 8 - b % 4 + a / 3; }`;
    const stock = typedRv32.compile(src, [], undefined, {policy: "stock"});
    const selected = typedRv32.compile(src, [], undefined, all);
    const run = (program, entry, args) => typedRv32Interp.run(program, entry, args, new Uint8Array(64)).result;
    for (const n of [...dividends, 2046, 2047, 2048, -2048, -2049, -2050]) {
        assert.equal(run(selected, "cmp", [n]), run(stock, "cmp", [n]), "cmp " + n);
        assert.equal(run(selected, "div", [n]), run(stock, "div", [n]), "div " + n);
        assert.equal(run(selected, "leaf", [n, 3 - n]), run(stock, "leaf", [n, 3 - n]), "leaf " + n);
    }
    // No divide instruction remains: every divisor above is a positive constant.
    const divides = words(selected, "div").filter(w => opcode(w) === 0x33 && (w >>> 25) === 1 && ((w >>> 12) & 7) >= 4);
    assert.equal(divides.length, 0);
});

test("inlining, capacity and constant homes, commutation and loop rotation match stock code", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    const src = `function clamp(v: i32, lo: i32, hi: i32): i32 {
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
}
function weight(buf: buffer, i: i32, k: i32): i32 {
    const kk = k + 1;
    let s = 0;
    for (let j = 0; j < 3; j = j + 1) { s = s + buf.charCodeAt(i + j) * kk; }
    return clamp(s, 3, 9000);
}
function first(buf: buffer, n: i32): i32 {
    for (let i = 0; i < n; i = i + 1) {
        if (buf.charCodeAt(i) === 7) { return i; }
    }
    return 0 - 1;
}
function fill(out: buffer, buf: buffer, n: i32): i32 {
    let total = 0;
    for (let i = 0; i < n; i = i + 1) {
        const w = weight(buf, i, 2) + clamp(5 * i, 10, 40) + 3 * first(buf, i);
        out.setCharCodeAt(i, w % 65536);
        total = total + w;
    }
    return total;
}`;
    const all = {inline: true, select: {immediates: true, divisions: true, branches: true, results: true,
        leafParams: true, commute: true, rotate: true},
        operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true, capacities: true,
            nested: true, constants: true}};
    const stock = typedRv32.compile(src, [], undefined, {policy: "stock"});
    const candidate = typedRv32.compile(src, [], undefined, all);
    assert.deepEqual(candidate.image, typedRv32.compile(src, [], undefined, {...all, streamFunctions: false}).image);
    const words32 = (p, name) => words(p, name);
    // fill's loop inlines weight (with clamp inside it), clamp and first: no call remains.
    assert.equal(words32(candidate, "fill").filter(w => opcode(w) === 0x6f && destination(w) === 1).length, 0);
    const memory = n => {
        const bytes = new Uint8Array(4096), view = new DataView(bytes.buffer);
        view.setUint32(0, 400, true); view.setUint32(1024, 64, true);
        for (let i = 0; i < 64; i++) view.setUint16(1028 + 2 * i, (i * 37 + n) % 11, true);
        return bytes;
    };
    for (const n of [0, 1, 2, 5, 17, 40, 62]) {
        const a = typedRv32Interp.run(stock, "fill", [0, 1024, n], memory(n));
        const b = typedRv32Interp.run(candidate, "fill", [0, 1024, n], memory(n));
        assert.equal(b.result, a.result, "fill " + n);
        assert.deepEqual(b.bytes, a.bytes, "memory after fill " + n);
    }
    // An out-of-range access still traps at the same point.
    const trapStock = typedRv32Interp.run(stock, "fill", [0, 1024, 63], memory(3));
    const trapCandidate = typedRv32Interp.run(candidate, "fill", [0, 1024, 63], memory(3));
    assert.equal(trapStock.trap, true);
    assert.equal(trapCandidate.trap, true);
    assert.deepEqual(trapCandidate.bytes, trapStock.bytes);
});
