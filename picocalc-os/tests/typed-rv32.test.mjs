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
        operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true, capacities: true, nested: true,
            constants: true, share: true, pointers: true, split: true},
        select: {immediates: true, divisions: true, branches: true, results: true, leafParams: true, commute: true, rotate: true,
            shortBranches: true, version: true}};
    const image = options => typedRv32.compile(src, [], 65536, options).image;
    // The default with some qualified fields switched off.
    const without = (select, locations, rest = {}) => ({...rest,
        select: {...qualified.select, ...Object.fromEntries(select.map(k => [k, false]))},
        operandLocations: {...qualified.operandLocations, ...Object.fromEntries(locations.map(k => [k, false]))}});
    assert.deepEqual(image(), image({policy: "stock", ...qualified}));
    assert.deepEqual(image({policy: "default"}), image());
    assert.notDeepEqual(image({policy: "stock"}), image());
    // Explicit fields override the policy, and an explicit undefined leaves it unchanged.
    assert.deepEqual(image({operandLocations: false, inlineGuardedReturns: false, select: false, inline: false}), image({policy: "stock"}));
    assert.deepEqual(image({operandLocations: undefined}), image());
    assert.equal(image({policy: "stock"}).length, 9564);
    const sha = options => createHash("sha256").update(image(options)).digest("hex");
    // PICOCALC-RAY-PARITY Step 13 timed this image on the P4 (board mode 2: 16.26 ms per frame).
    assert.equal(sha(), "d9c25ef928d70c4ca46f065a18396c6f3df6fafaaf021bd2e840318be844b8f3");
    // Step 11's image (19.31 ms): without versioned loops and split locals.
    assert.equal(sha(without(["version"], ["split"])), "4fa61ed11a0c1f940b8a4e8ff74c27e443d432184ec3eac8e3dac4831ce2d984");
    // Step 10's image (20.20 ms): also without pointer homes.
    assert.equal(sha(without(["version"], ["split", "pointers"])), "e7e33cd0c2cb8fcea41c7a2143a031b62dc8ba827814c83cdf503479e799d1e7");
    // Step 8's image (22.43 ms): also without shared homes and short forward branches.
    assert.equal(sha(without(["version", "shortBranches"], ["split", "pointers", "share"])),
        "7c660e876a8c1211b853e9c8b7aff4b2fd400b2431500fce753fa7e55d5ab201");
    // Step 7's image (24.18 ms): also without loop rotation and constant homes.
    assert.equal(sha(without(["version", "shortBranches", "rotate"], ["split", "pointers", "share", "constants"])),
        "4e7eb52aee07cf8fd5e6a3a96733d100241b10fe445030793a73513229fb676c");
    // Step 6's image (31.51 ms): also without inlining and the Step 7 options.
    assert.equal(sha(without(["version", "shortBranches", "rotate", "commute"],
        ["split", "pointers", "share", "constants", "capacities", "nested"], {inline: false})),
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
            nested: true, constants: true, share: true}};
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

test("short forward branches fall back to the long form beyond the conditional-branch range", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // The if-arm in `far` is longer than 4 KiB of code, so its exit branch cannot be short.
    const body = Array.from({length: 300}, (_, i) => `        s = s * 3 + ${i} - (s >> 4);`).join("\n");
    const src = `function near(n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) { if (i % 3 === 0) { s = s + i; } }
    return s;
}
function far(n: i32): i32 {
    let s = n;
    if (n > 5) {
${body}
    }
    return s;
}`;
    const options = {select: {immediates: true, divisions: true, branches: true, results: true, leafParams: true,
        commute: true, rotate: true, shortBranches: true}};
    const stock = typedRv32.compile(src, [], undefined, {policy: "stock"});
    const short = typedRv32.compile(src, [], undefined, options);
    const long = typedRv32.compile(src, [], undefined, {...options, select: {...options.select, shortBranches: false}});
    const run = (p, f, n) => typedRv32Interp.run(p, f, [n], new Uint8Array(64)).result;
    for (const n of [0, 1, 5, 6, 17, 100]) {
        assert.equal(run(short, "near", n), run(stock, "near", n), "near " + n);
        assert.equal(run(short, "far", n), run(stock, "far", n), "far " + n);
    }
    // near uses short branches; far fell back and matches the long form exactly.
    assert(words(short, "near").length < words(long, "near").length);
    assert.deepEqual(words(short, "far"), words(long, "far"));
});

test("pointer homes keep checked accesses, stores and traps identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // r[x + k] with an increment, r[i + k] with a recomputed index, r[b + k] from a
    // parameter, r[h + x] from two locals, and stores through a pointer.
    const src = `function sum(work: buffer, n: i32): i32 {
    let s = 0;
    for (let x = 0; x < n; x = x + 1) { s = s + work.charCodeAt(3 + x) + work.charCodeAt(5 + x); }
    return s;
}
function four(work: buffer, n: i32): i32 {
    let s = 0;
    for (let k = 0; k < n; k = k + 1) {
        const i = 2 + 4 * k;
        s = s + work.charCodeAt(i) - work.charCodeAt(i + 2);
        if (work.charCodeAt(i + 1) > 70) { s = s + work.charCodeAt(i + 3); }
    }
    return s;
}
function param(work: buffer, b: i32): i32 {
    let s = 0;
    for (let k = 0; k < 3; k = k + 1) { s = s + work.charCodeAt(b) * 3 + work.charCodeAt(b + 1) + work.charCodeAt(b + 2); }
    return s;
}
function rows(work: buffer, n: i32): i32 {
    let s = 0;
    for (let r = 0; r < 3; r = r + 1) {
        const h = 1 + r * n;
        for (let x = 0; x < n; x = x + 1) { s = s + work.charCodeAt(h + x); }
    }
    return s;
}
function fill(work: buffer, n: i32): i32 {
    for (let x = 0; x < n; x = x + 1) {
        work.setCharCodeAt(10 + x, work.charCodeAt(x) + 1);
        work.setCharCodeAt(11 + x, x);
    }
    return work.charCodeAt(10 + n);
}`;
    const L = {forward: true, capacity: true, homes: true, saved: true, direct: true, capacities: true, nested: true,
        constants: true, share: true};
    // Without versioned loops: in their fast copies these small loops need no pointer homes.
    const select = {immediates: true, divisions: true, branches: true, results: true, leafParams: true, commute: true,
        rotate: true, shortBranches: true};
    const plain = typedRv32.compile(src, [], undefined, {operandLocations: L, select});
    const pointed = typedRv32.compile(src, [], undefined, {operandLocations: {...L, pointers: true}, select});
    assert.notDeepEqual(pointed.image, plain.image);
    const cells = 40;
    function run(p, f, n) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        view.setUint32(1024, cells, true);
        for (let i = 0; i < cells; i++) view.setUint16(1028 + 2 * i, 60 + (i * 7) % 23, true);
        const out = typedRv32Interp.run(p, f, [1024, n], mem);
        return {result: out.result, trap: Boolean(out.trap), bytes: Array.from(out.bytes.subarray(1024, 1028 + 2 * cells))};
    }
    for (const [f, sizes] of [["sum", [0, 1, 10, 34, 35, 36]], ["four", [0, 1, 9, 10, 11]], ["param", [0, 5, 37, 38, 39]],
                              ["rows", [0, 5, 13, 14]], ["fill", [0, 5, 28, 29, 30]]])
        for (const n of sizes) assert.deepEqual(run(pointed, f, n), run(plain, f, n), f + " " + n);
    // Some sizes trap, so the comparison covered the trap point and the memory written before it.
    assert.equal(run(plain, "sum", 36).trap, true);
    assert.equal(run(plain, "fill", 30).trap, true);
    assert.equal(run(plain, "fill", 29).trap, false);
});

test("versioned loops and split locals keep results, stores and traps identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // Every index form select.version proves: k + c, c + k, k, a*k + b with offsets, an
    // invariant base plus k, constants; with a non-constant start, an early return, nested
    // loops and stores. Each size list crosses the point where the guard fails.
    const src = `function sum(work: buffer, n: i32): i32 {
    let s = 0;
    for (let x = 0; x < n; x = x + 1) { s = s + work.charCodeAt(3 + x) + work.charCodeAt(x + 5) + work.charCodeAt(x); }
    return s;
}
function affine(work: buffer, n: i32): i32 {
    let s = 0;
    for (let k = 0; k < n; k = k + 1) {
        const i = 2 + 4 * k;
        s = s + work.charCodeAt(i) - work.charCodeAt(i + 2);
        if (work.charCodeAt(i + 1) > 70) {
            const j = 5 * k + 1;
            s = s + work.charCodeAt(i + 3) + work.charCodeAt(j + 2);
        }
    }
    return s;
}
function shifted(work: buffer, h: i32): i32 {
    let s = 0;
    for (let x = 0; x < 6; x = x + 1) { s = s + work.charCodeAt(h + x) + work.charCodeAt(16); }
    return s;
}
function start(work: buffer, x0: i32): i32 {
    let s = 0;
    for (let x = x0; x < 12; x = x + 1) { s = s + work.charCodeAt(x + 1); }
    return s;
}
function early(work: buffer, n: i32): i32 {
    for (let x = 0; x < n; x = x + 1) { if (work.charCodeAt(x + 2) === 71) { return x; } }
    return 0 - 1;
}
function nested(work: buffer, n: i32): i32 {
    let s = 0;
    for (let y = 0; y < 3; y = y + 1) {
        const row = y * n;
        for (let x = 0; x < n; x = x + 1) { s = s + work.charCodeAt(row + x); work.setCharCodeAt(30 + x, s); }
    }
    return s;
}
function fill(work: buffer, n: i32): i32 {
    for (let x = 0; x < n; x = x + 1) { work.setCharCodeAt(10 + x, work.charCodeAt(x) + 1); }
    return work.charCodeAt(10);
}`;
    const select = {immediates: true, divisions: true, branches: true, results: true, leafParams: true, commute: true,
        rotate: true, shortBranches: true};
    const locations = {forward: true, capacity: true, homes: true, saved: true, direct: true, capacities: true, nested: true,
        constants: true, share: true, pointers: true};
    const unchecked = {};
    const candidate = typedRv32.compile(src, [], undefined, {select: {...select, version: true},
        operandLocations: {...locations, split: true},
        observeTape: (name, phase, code) => { if (phase === "split") unchecked[name] = code.includes(0xf3); }});
    const plain = typedRv32.compile(src, [], undefined, {});
    const stock = typedRv32.compile(src, [], undefined, {policy: "stock"});
    const cells = 40;
    function run(p, f, args) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        view.setUint32(1024, cells, true);
        for (let i = 0; i < cells; i++) view.setUint16(1028 + 2 * i, 60 + (i * 7) % 23, true);
        const out = typedRv32Interp.run(p, f, [1024, ...args], mem);
        return {result: out.result, trap: Boolean(out.trap), bytes: Array.from(out.bytes.subarray(1024, 1028 + 2 * cells))};
    }
    const cases = [["sum", [0, 1, 35, 36, 37]], ["affine", [0, 1, 8, 9, 10, 11]], ["shifted", [0, 30, 34, 35, -1, 1 << 30]],
        ["start", [0, 5, 11, 12, -3, -(1 << 30)]], ["early", [0, 5, 37, 38, 39]], ["nested", [0, 4, 10, 11, 13, 14]],
        ["fill", [0, 5, 29, 30, 31]]];
    let traps = 0;
    for (const [f, sizes] of cases) for (const n of sizes) {
        const expected = run(stock, f, [n]);
        assert.deepEqual(run(plain, f, [n]), expected, "plain " + f + " " + n);
        assert.deepEqual(run(candidate, f, [n]), expected, "versioned " + f + " " + n);
        traps += expected.trap;
    }
    assert(traps >= 8, "the sizes reach the trapping bound");
    for (const f of ["sum", "affine", "shifted", "start", "early", "nested", "fill"]) assert(unchecked[f], f + " has an unchecked copy");
});
