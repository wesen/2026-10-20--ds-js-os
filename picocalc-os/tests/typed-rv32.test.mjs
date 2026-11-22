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
    // Step 11's image (19.31 ms): without versioned loops and split locals. The named "balanced"
    // policy, which Chess compiles with on the device, is exactly this set.
    assert.equal(sha(without(["version"], ["split"])), "4fa61ed11a0c1f940b8a4e8ff74c27e443d432184ec3eac8e3dac4831ce2d984");
    assert.equal(sha({policy: "balanced"}), "4fa61ed11a0c1f940b8a4e8ff74c27e443d432184ec3eac8e3dac4831ce2d984");
    // Step 10's image (20.20 ms): also without pointer homes.
    assert.equal(sha(without(["version"], ["split", "pointers"])), "e7e33cd0c2cb8fcea41c7a2143a031b62dc8ba827814c83cdf503479e799d1e7");
    // Step 8's image (22.43 ms): also without shared homes and short forward branches.
    assert.equal(sha(without(["version", "shortBranches"], ["split", "pointers", "share"])),
        "7c660e876a8c1211b853e9c8b7aff4b2fd400b2431500fce753fa7e55d5ab201");
    // Step 7's image (24.18 ms): also without loop rotation and constant homes.
    assert.equal(sha(without(["version", "shortBranches", "rotate"], ["split", "pointers", "share", "constants"])),
        "4e7eb52aee07cf8fd5e6a3a96733d100241b10fe445030793a73513229fb676c");
    // Step 6's image (31.51 ms): also without inlining and the Step 7 options. The named
    // "interactive" policy, which the device's boot worlds compile with, is exactly this set.
    assert.equal(sha(without(["version", "shortBranches", "rotate", "commute"],
        ["split", "pointers", "share", "constants", "capacities", "nested"], {inline: false})),
        "6b8545125fa8d2d004a57135125ebe0bf77bb6a2763e8de97336d17b2350451f");
    assert.equal(sha({policy: "interactive"}), "6b8545125fa8d2d004a57135125ebe0bf77bb6a2763e8de97336d17b2350451f");
    // The "kernel" policy adds division facts (board run 10 timed that image at 15.27 ms, Step 15),
    // value sets (board run 11: 13.84 ms, Step 17), hoisted loop invariants (board run 12:
    // 12.45 ms, Step 18), and fused conjunctions with loads into homes (below).
    const kernel = typedRv32.policies.kernel, before = {...kernel.operandLocations, pointerOnly: false, reuseArgs: false};
    const step19 = {...kernel.select, induction: false}, step18 = {...step19, conjunctions: false, loadHomes: false};
    const old = select => sha({policy: "kernel", select, operandLocations: before});
    assert.equal(old({...step18, sets: false, hoist: false}), "22c20887acf2f0c8931e58978aee9399fb45b9e1558eeacd59bb98095feafebc");
    assert.equal(old({...step18, hoist: false}), "a5eb06b25026ea4f3fa85f8941fd062718b6fed3665ca38ba70944b73b122dc3");
    assert.equal(old(step18), "3e18e5099c990fb168e24f8637ddf7110f931edf980b92b4f7383dda6adbf6d7");
    // Fused conjunctions and loads into homes (board run 13: 11.43 ms, Step 19).
    assert.equal(old(step19), "245edbc1333519b3d78baa792e2317a6ba407f36fff682b078dd653bc5f097a0");
    // Induction variables and pointer-only sources (board run 14: 11.17 ms, Step 20).
    assert.equal(sha({policy: "kernel", operandLocations: {...kernel.operandLocations, reuseArgs: false}}),
        "8eaa40605e4bca96872b309aa87a39bfaf6312079822f9c1e4a134a63398fcdc");
    // Locals in the argument registers of unhomed parameters (board run 15: 10.99 ms, Step 21).
    assert.equal(sha({policy: "kernel"}), "4323938e38a4ef2a44c80103bf43680b506195762d6faa0f5834b41c86e9d2a5");
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

test("division facts change code only for dividends proven non-negative, and keep results identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // proven: a counter from 0, a local whose writes are 117, 177 and level / 3, a buffer read.
    // not proven: a counter from -9, a local written -3, a read minus 32, a counter stepping by 2
    // to a parameter bound (k + 2 could wrap).
    const fns = {
        counter: [true, `function counter(n: i32): i32 {
    let s = 0;
    for (let k = 0; k < n; k = k + 1) { s = s + k / 4 + k % 8 + k / 255; }
    return s;
}`],
        thirds: [true, `function thirds(c: i32): i32 {
    let level = 117;
    if (c > 3) { level = 177; }
    if (c > 5) { level = level / 3; }
    return level / 8 + level * 105 / 255;
}`],
        read: [true, `function read(work: buffer, i: i32): i32 {
    const v = work.charCodeAt(i);
    return v / 16 + v % 16 + v / 10;
}`],
        negative: [false, `function negative(n: i32): i32 {
    let s = 0;
    for (let k = 0 - 9; k < n; k = k + 1) { s = s + k / 4 + k % 8 + k / 7; }
    return s;
}`],
        flip: [false, `function flip(c: i32): i32 {
    let t = 5;
    if (c > 0) { t = 0 - 3; }
    return t / 2 + t % 4 + t / 3;
}`],
        biased: [false, `function biased(work: buffer, i: i32): i32 {
    const w = work.charCodeAt(i) - 32;
    return w / 16 + w % 16 + w / 10;
}`],
        stride: [false, `function stride(n: i32): i32 {
    let s = 0;
    for (let k = 0; k < n; k = k + 2) { s = s + k / 4 + k % 8; }
    return s;
}`],
    };
    const select = {immediates: true, divisions: true, branches: true, results: true, leafParams: true, commute: true,
        rotate: true, shortBranches: true, version: true};
    const withFacts = {select: {...select, facts: true}};
    for (const [name, [proven, src]] of Object.entries(fns)) {
        const a = typedRv32.compile(src, [], undefined, {}), b = typedRv32.compile(src, [], undefined, withFacts);
        assert.equal(Buffer.compare(Buffer.from(a.image), Buffer.from(b.image)) !== 0, proven, name);
    }
    const all = Object.values(fns).map(([, src]) => src).join("\n");
    const stock = typedRv32.compile(all, [], undefined, {policy: "stock"}), facts = typedRv32.compile(all, [], undefined, withFacts);
    function run(p, f, args) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        view.setUint32(1024, 40, true);
        for (let i = 0; i < 40; i++) view.setUint16(1028 + 2 * i, (i * 13) % 61, true);
        const out = typedRv32Interp.run(p, f, [1024, ...args].slice(f === "read" || f === "biased" ? 0 : 1), mem);
        return {result: out.result, trap: Boolean(out.trap)};
    }
    const cases = [["counter", [0, 1, 7, 100, -5]], ["thirds", [0, 4, 6]], ["read", [0, 1, 2, 3, 39, 40]],
        ["negative", [-20, -9, -1, 0, 5, 30]], ["flip", [0, 1]], ["biased", [0, 1, 2, 3, 5, 39, 40]], ["stride", [0, 5, 9, 31]]];
    for (const [f, inputs] of cases) for (const n of inputs)
        assert.deepEqual(run(facts, f, [n]), run(stock, f, [n]), f + " " + n);
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

test("value sets fold pure inlined blocks only over proven constant sets, and keep results and traps identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // folded: level is one of 117, 177, 39, 59 (the ray tracer's floor), right after the if that
    // divides it (sunk into both arms), beside a second copy of the same callee over a buffer
    // read, which shares its locals; the same not adjacent to the if (one tree of four values);
    // two arms with an else.
    // not folded: eight possible values, an unknown read, a loop-carried value, a division by zero.
    const fns = {
        floor: [true, `function floor(work: buffer, n: i32): i32 {
    let total = 0;
    for (let x = 0; x < n; x = x + 1) {
        let level = 117;
        if (work.charCodeAt(x) > 70) { level = 177; }
        if (work.charCodeAt(x + 1) > 75) { level = level / 3; }
        const c = scale(105, level);
        total = total + c + scale(3, work.charCodeAt(x + 2));
    }
    return total;
}`],
        spaced: [true, `function spaced(work: buffer, n: i32): i32 {
    let total = 0;
    for (let x = 0; x < n; x = x + 1) {
        let level = 117;
        if (work.charCodeAt(x) > 70) { level = 177; }
        if (work.charCodeAt(x + 1) > 75) { level = level / 3; }
        total = total + scale(105, level);
    }
    return total;
}`],
        arms: [true, `function arms(work: buffer, n: i32): i32 {
    let total = 0;
    for (let x = 0; x < n; x = x + 1) {
        let level = 5;
        if (work.charCodeAt(x) > 66) { level = 0 - 7; } else { work.setCharCodeAt(x + 3, 1); }
        total = total + scale(31, level);
    }
    return total;
}`],
        wide: [false, `function wide(work: buffer, n: i32): i32 {
    let total = 0;
    for (let x = 0; x < n; x = x + 1) {
        let level = 1;
        if (work.charCodeAt(x) > 64) { level = 2; }
        if (work.charCodeAt(x + 1) > 66) { level = level + 2; }
        if (work.charCodeAt(x + 2) > 68) { level = level * 5; }
        total = total + scale(7, level);
    }
    return total;
}`],
        read: [false, `function read(work: buffer, n: i32): i32 {
    let total = 0;
    for (let x = 0; x < n; x = x + 1) { total = total + scale(9, work.charCodeAt(x)); }
    return total;
}`],
        carried: [false, `function carried(work: buffer, n: i32): i32 {
    let level = 3;
    let total = 0;
    for (let x = 0; x < n; x = x + 1) {
        total = total + scale(11, level);
        level = 8;
    }
    return total;
}`],
        zero: [false, `function zero(work: buffer, n: i32): i32 {
    let total = 0;
    for (let x = 0; x < n; x = x + 1) {
        let d = 4;
        if (work.charCodeAt(x) > 80) { d = 0; }
        total = total + hundred(d);
    }
    return total;
}`],
    };
    const helpers = `function scale(v: i32, s: i32): i32 {
    const r = v * s / 255;
    return r / 8 + r * 3;
}
function hundred(d: i32): i32 { return 100 / d; }
`;
    const kernel = typedRv32.policies.kernel;
    const withSets = {policy: "kernel", select: {...kernel.select, sets: true}};
    const without = {policy: "kernel", select: {...kernel.select, sets: false}};
    const CELLS = {0x02: 1, 0x03: 1, 0x04: 1, 0x0c: 1, 0x0d: 1, 0x10: 1, 0x20: 1, 0x21: 1, 0x28: 2, 0x2f: 2, 0x36: 2, 0x3b: 2,
        0x41: 1, 0xf1: 2, 0xf2: 2, 0xf3: 3};
    const opcodes = code => { const out = []; for (let at = 0; at < code.length; at += 1 + (CELLS[code[at]] ?? 0)) out.push(code[at]); return out; };
    for (const [name, [folded, src]] of Object.entries(fns)) {
        const tapes = {};
        const b = typedRv32.compile(helpers + src, [], undefined, {...withSets,
            observeTape: (fn, phase, code) => { if (fn === name) tapes[phase] = code; }});
        const a = typedRv32.compile(helpers + src, [], undefined, without);
        assert.equal(Buffer.compare(Buffer.from(a.image), Buffer.from(b.image)) !== 0, folded, name);
        // Compared with the tape the pass receives (constants already commuted).
        assert.equal(tapes.sets.length !== tapes.commute.length || tapes.sets.some((c, i) => c !== tapes.commute[i]), folded, name + " tape");
        // The floor's sunk copies absorb level / 3, leaving the unfoldable copy's two multiplies
        // and two divisions; spaced keeps level / 3.
        const ops = opcodes(tapes.sets), count = op => ops.filter(x => x === op).length;
        if (name === "floor") assert.deepEqual([count(0x6c), count(0x6d)], [2, 2], "floor multiplies and divisions");
        if (name === "spaced") assert.deepEqual([count(0x6c), count(0x6d)], [0, 1], "spaced multiplies and divisions");
    }
    const all = helpers + Object.values(fns).map(([, src]) => src).join("\n");
    const stock = typedRv32.compile(all, [], undefined, {policy: "stock"});
    const candidate = typedRv32.compile(all, [], undefined, withSets);
    const cells = 40;
    function run(p, f, n) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        view.setUint32(1024, cells, true);
        for (let i = 0; i < cells; i++) view.setUint16(1028 + 2 * i, 60 + (i * 7) % 23, true);
        const out = typedRv32Interp.run(p, f, [1024, n], mem);
        return {result: out.result, trap: Boolean(out.trap), bytes: Array.from(out.bytes.subarray(1024, 1028 + 2 * cells))};
    }
    let traps = 0;
    for (const f of Object.keys(fns)) for (const n of [0, 1, 5, 17, 30, 37, 38, 39]) {
        const expected = run(stock, f, n);
        assert.deepEqual(run(candidate, f, n), expected, f + " " + n);
        traps += expected.trap;
    }
    assert(traps >= 4, "the inputs reach the division by zero and the buffer bound");
});

test("hoisted loop invariants keep results, stores and traps identical, including aliased buffers", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // moved: invariant loads (with the out == work guard), an invariant pure statement, y / 16
    // inside a larger expression, and an inner loop's guard over a loaded count.
    // kept: loads from the stored buffer, a statement whose local is read after the loop, a
    // loop-carried local, a division by a parameter (could trap), loads past a storing call.
    const fns = {
        light: [true, `function light(out: buffer, work: buffer, y: i32): i32 {
    for (let x = 0; x < 12; x = x + 1) {
        if (work.charCodeAt(x) > 70) {
            const lx = work.charCodeAt(30) - 32;
            const sy = 4096 + 32 * y;
            out.setCharCodeAt(x, lx + sy + (x / 4 + y / 16) % 2);
        }
    }
    return out.charCodeAt(3);
}`],
        shadow: [true, `function shadow(out: buffer, work: buffer, y: i32): i32 {
    for (let x = 0; x < 10; x = x + 1) {
        const count = work.charCodeAt(31) % 5;
        let hits = 0;
        for (let s = 0; s < count; s = s + 1) { hits = hits + work.charCodeAt(2 + 3 * s); }
        out.setCharCodeAt(x + 20, hits + y);
    }
    return out.charCodeAt(22);
}`],
        same: [false, `function same(out: buffer, work: buffer, y: i32): i32 {
    for (let x = 0; x < 12; x = x + 1) {
        const v = work.charCodeAt(30) + 1;
        work.setCharCodeAt(x, v + y);
    }
    return work.charCodeAt(11);
}`],
        after: [false, `function after(out: buffer, work: buffer, y: i32): i32 {
    let v = 0;
    for (let x = 0; x < 12; x = x + 1) {
        if (work.charCodeAt(x) > 75) { v = work.charCodeAt(30) * 3; }
        out.setCharCodeAt(x, v);
    }
    return v;
}`],
        carried: [false, `function carried(out: buffer, work: buffer, y: i32): i32 {
    let v = 1;
    for (let x = 0; x < 12; x = x + 1) {
        out.setCharCodeAt(x, v);
        v = work.charCodeAt(30) + y;
    }
    return out.charCodeAt(5);
}`],
        divide: [false, `function divide(out: buffer, work: buffer, d: i32): i32 {
    for (let x = 0; x < 12; x = x + 1) {
        if (d !== 0) { const q = 1000 / d; out.setCharCodeAt(x, q + x); }
    }
    return out.charCodeAt(4);
}`],
        storing: [false, `function storing(out: buffer, work: buffer, y: i32): i32 {
    for (let x = 0; x < 12; x = x + 1) {
        const v = work.charCodeAt(30) + y * 7;
        poke(work, x);
        out.setCharCodeAt(x, v);
    }
    return out.charCodeAt(6);
}`],
    };
    const helpers = `function poke(b: buffer, i: i32): i32 { b.setCharCodeAt(30, i); return 0; }
`;
    const kernel = typedRv32.policies.kernel;
    const withHoist = {policy: "kernel", select: {...kernel.select, hoist: true}};
    const without = {policy: "kernel", select: {...kernel.select, hoist: false}};
    for (const [name, [moved, src]] of Object.entries(fns)) {
        const tapes = {};
        const options = observe => ({observeTape: (fn, phase, code) => { if (fn === name && phase === "version") tapes[observe] = code; }});
        typedRv32.compile(helpers + src, [], undefined, {...withHoist, ...options("on")});
        typedRv32.compile(helpers + src, [], undefined, {...without, ...options("off")});
        assert.equal(tapes.on.length !== tapes.off.length || tapes.on.some((c, i) => c !== tapes.off[i]), moved, name);
    }
    const all = helpers + Object.values(fns).map(([, src]) => src).join("\n");
    const stock = typedRv32.compile(all, [], undefined, {policy: "stock"});
    const candidate = typedRv32.compile(all, [], undefined, withHoist);
    function run(p, f, args, cells, alias) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        for (const base of [1024, 2048]) {
            view.setUint32(base, cells, true);
            for (let i = 0; i < cells; i++) view.setUint16(base + 4 + 2 * i, 60 + ((i + base) * 7) % 23, true);
        }
        const out = typedRv32Interp.run(p, f, [alias ? 1024 : 2048, 1024, ...args], mem);
        return {result: out.result, trap: Boolean(out.trap), bytes: Array.from(out.bytes.subarray(1024, 2048 + 4 + 2 * cells))};
    }
    let traps = 0;
    for (const f of Object.keys(fns)) for (const y of [0, -37, 5, 160]) for (const cells of [40, 31, 8]) for (const alias of [false, true]) {
        const expected = run(stock, f, [y], cells, alias);
        assert.deepEqual(run(candidate, f, [y], cells, alias), expected, `${f} y=${y} cells=${cells} alias=${alias}`);
        traps += expected.trap;
    }
    assert(traps >= 8, "short buffers reach the bounds");
});

test("fused conjunctions and loads into homes keep results, stores and traps identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // band: && in two ifs, one body with an early return. pick: an inlined callee whose return
    // inside a fused body becomes a branch out of it. flag: && kept as a value (not fused).
    const src = `function pick(v: i32): i32 {
    if (v > 65 && v < 75) { return v * 2; }
    return 1;
}
function band(work: buffer, n: i32): i32 {
    let s = 0;
    for (let x = 0; x < n; x = x + 1) {
        const v = work.charCodeAt(x);
        if (v > 65 && v < 75) { s = s + v; if (v === 70) { return s; } }
        if (v > 60 && v % 3 === 0) { s = s - 1; }
    }
    return s;
}
function inline(work: buffer, n: i32): i32 {
    let s = 0;
    for (let x = 0; x < n; x = x + 1) { s = s + pick(work.charCodeAt(x)); work.setCharCodeAt(x, s); }
    return s;
}
function flag(work: buffer, n: i32): i32 {
    let s = 0;
    for (let x = 0; x < n; x = x + 1) {
        const v = work.charCodeAt(x);
        const ok = v > 62 && v < 80;
        let add = 1;
        if (ok) { add = 3; }
        s = s + add;
    }
    return s;
}`;
    const kernel = typedRv32.policies.kernel;
    const tapes = {};
    const candidate = typedRv32.compile(src, [], undefined, {policy: "kernel",
        observeTape: (fn, phase, code) => { if (phase === "commute" || phase === "conjunctions") (tapes[fn] ??= {})[phase] = code; }});
    const fused = name => tapes[name].conjunctions.length !== tapes[name].commute.length ||
        tapes[name].conjunctions.some((c, i) => c !== tapes[name].commute[i]);
    assert(kernel.select.conjunctions && kernel.select.loadHomes, "kernel fuses conjunctions and loads into homes");
    assert(fused("band") && fused("inline"), "band and inline fuse");
    assert(!fused("flag"), "a conjunction kept as a value is not fused");
    const stock = typedRv32.compile(src, [], undefined, {policy: "stock"});
    const cells = 40;
    function run(p, f, n) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        view.setUint32(1024, cells, true);
        for (let i = 0; i < cells; i++) view.setUint16(1028 + 2 * i, 58 + (i * 7) % 25, true);
        const out = typedRv32Interp.run(p, f, [1024, n], mem);
        return {result: out.result, trap: Boolean(out.trap), bytes: Array.from(out.bytes.subarray(1024, 1028 + 2 * cells))};
    }
    let traps = 0;
    for (const f of ["band", "inline", "flag"]) for (const n of [0, 1, 6, 17, 39, 40, 41]) {
        const expected = run(stock, f, n);
        assert.deepEqual(run(candidate, f, n), expected, f + " " + n);
        traps += expected.trap;
    }
    assert(traps >= 2, "the inputs reach the buffer bound");
});

test("induction variables and pointer-only sources keep results, stores and traps identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // [induction, pointer-only]: rows and nested (InShadow's shape) both; mixed reads its affine
    // local in arithmetic too (induction only); start's counter begins at a parameter and
    // after's local is read after the loop (neither).
    const fns = {
        rows: [true, true, `function rows(work: buffer, n: i32): i32 {
    let s = 0;
    for (let k = 0; k < n; k = k + 1) {
        const i = 3 + 4 * k;
        s = s + work.charCodeAt(i) + work.charCodeAt(i + 1) - work.charCodeAt(i + 2);
    }
    return s;
}`],
        nested: [true, true, `function nested(work: buffer, m: i32): i32 {
    let s = 0;
    for (let y = 0; y < m; y = y + 1) {
        const count = work.charCodeAt(1) % 6;
        for (let t = 0; t < count; t = t + 1) {
            const at = 5 + 3 * t;
            if (work.charCodeAt(at) > 70 && work.charCodeAt(at + 1) < 75) { s = s + t + y; }
        }
    }
    return s;
}`],
        mixed: [true, false, `function mixed(work: buffer, n: i32): i32 {
    let s = 0;
    for (let k = 0; k < n; k = k + 1) {
        const i = 2 + 3 * k;
        s = s + work.charCodeAt(i) + i;
    }
    return s;
}`],
        start: [false, false, `function start(work: buffer, k0: i32): i32 {
    let s = 0;
    for (let k = k0; k < 9; k = k + 1) { const i = 1 + 2 * k; s = s + work.charCodeAt(i); }
    return s;
}`],
        after: [false, false, `function after(work: buffer, n: i32): i32 {
    let i = 0;
    let s = 0;
    for (let k = 0; k < n; k = k + 1) { i = 4 + 2 * k; s = s + work.charCodeAt(i); }
    return s + i;
}`],
    };
    const kernel = typedRv32.policies.kernel;
    assert(kernel.select.induction && kernel.operandLocations.pointerOnly, "kernel uses induction and pointer-only sources");
    for (const [name, [reduced, pointerOnly, src]] of Object.entries(fns)) {
        const tapes = {}, skips = [];
        const observe = key => ({observeTape: (fn, phase, code) => { if (fn === name && phase === "version") tapes[key] = code; },
            observePlan: (fn, plan) => { if (fn === name && key === "on") skips.push(plan.skips?.size ?? 0); }});
        typedRv32.compile(src, [], undefined, {policy: "kernel", ...observe("on")});
        typedRv32.compile(src, [], undefined, {policy: "kernel", select: {...kernel.select, induction: false}, ...observe("off")});
        assert.equal(tapes.on.length !== tapes.off.length || tapes.on.some((c, i) => c !== tapes.off[i]), reduced, name + " induction");
        assert.equal(skips.some(n => n > 0), pointerOnly, name + " pointer-only");
    }
    const all = Object.values(fns).map(([, , src]) => src).join("\n");
    const stock = typedRv32.compile(all, [], undefined, {policy: "stock"});
    const candidate = typedRv32.compile(all, [], undefined, {policy: "kernel"});
    function run(p, f, n, cells) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        view.setUint32(1024, cells, true);
        for (let i = 0; i < cells; i++) view.setUint16(1028 + 2 * i, 60 + (i * 7) % 23, true);
        const out = typedRv32Interp.run(p, f, [1024, n], mem);
        return {result: out.result, trap: Boolean(out.trap), bytes: Array.from(out.bytes.subarray(1024, 1028 + 2 * cells))};
    }
    let traps = 0;
    for (const f of Object.keys(fns)) for (const n of [0, 1, 3, 7, 9, 12, -2]) for (const cells of [40, 12, 6]) {
        const expected = run(stock, f, n, cells);
        assert.deepEqual(run(candidate, f, n, cells), expected, `${f} n=${n} cells=${cells}`);
        traps += expected.trap;
    }
    assert(traps >= 6, "short buffers reach the bounds");
});

test("locals in the argument registers of unhomed parameters keep results, stores and traps identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"])
        runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp} = ctx;
    // Each function reads some parameters once, outside its loop (no home), and keeps more
    // values live in the loop than there are spare registers. late reads its parameters after
    // the loop, from their slots; early before; both and stored mix them with stores.
    const src = `function late(w: buffer, n: i32, b: i32, c: i32): i32 {
    let s = 0;
    let t = 1;
    let u = 2;
    let v = 3;
    let z = 5;
    for (let i = 0; i < n; i = i + 1) {
        const p = w.charCodeAt(i);
        const q = w.charCodeAt(i + 1);
        s = s + p * t - q * u;
        t = t + v;
        u = u + z;
        v = 1 - v;
        z = z + p - q;
    }
    return s + b * 7 - c + t + u + v + z;
}
function early(w: buffer, n: i32, b: i32, c: i32): i32 {
    const base = b + c;
    let s = base;
    let t = 0;
    let u = 9;
    let v = 2;
    let x = 7;
    let y = 1;
    for (let i = 0; i < n; i = i + 1) {
        const p = w.charCodeAt(i);
        const q = w.charCodeAt(i + 2);
        const r = w.charCodeAt(i + 1);
        s = s + p * q - r + t * u - v * x + y;
        t = t + p;
        u = u - r;
        v = v + q;
        x = x - p + 1;
        y = y + v - x;
    }
    return s + t - u + v - x + y;
}
function stored(w: buffer, n: i32, b: i32, c: i32): i32 {
    let s = 0;
    let t = 4;
    for (let i = 0; i < n; i = i + 1) {
        const p = w.charCodeAt(i);
        const q = w.charCodeAt(i + 1);
        w.setCharCodeAt(i, p + q + t);
        s = s + p - q * t;
        t = t + 3;
    }
    w.setCharCodeAt(0, b);
    return s + c;
}`;
    const kernel = typedRv32.policies.kernel;
    assert(kernel.operandLocations.reuseArgs, "kernel reuses argument registers");
    const reusing = new Set();
    const candidate = typedRv32.compile(src, [], undefined, {policy: "kernel", observePlan: (fn, plan) => {
        // a1..a3 (11..13) holding a plain local while parameter 1..3 lives elsewhere (or in its slot).
        for (const [id, reg] of plan.homes) if (typeof id === "number" && id >= 4 && reg >= 11 && reg <= 13 && plan.homes.get(reg - 10) !== reg) reusing.add(fn);
    }});
    assert.deepEqual([...reusing].sort(), ["early", "late", "stored"], "every function puts a local in a parameter's register");
    const stock = typedRv32.compile(src, [], undefined, {policy: "stock"});
    function run(p, f, n, cells, b, c) {
        const mem = new Uint8Array(4096), view = new DataView(mem.buffer);
        view.setUint32(1024, cells, true);
        for (let i = 0; i < cells; i++) view.setUint16(1028 + 2 * i, 40 + (i * 11) % 29, true);
        const out = typedRv32Interp.run(p, f, [1024, n, b, c], mem);
        return {result: out.result, trap: Boolean(out.trap), bytes: Array.from(out.bytes.subarray(1024, 1028 + 2 * cells))};
    }
    let traps = 0;
    for (const f of ["late", "early", "stored"]) for (const n of [0, 1, 5, 9, -3]) for (const cells of [30, 8, 3])
        for (const [b, c] of [[0, 0], [17, -4], [-123456, 99]]) {
            const expected = run(stock, f, n, cells, b, c);
            assert.deepEqual(run(candidate, f, n, cells, b, c), expected, `${f} n=${n} cells=${cells} b=${b} c=${c}`);
            traps += expected.trap;
        }
    assert(traps >= 6, "short buffers reach the bounds");
});

test("compiler/typed-rv32.js is the current build of compiler/rv32/", async () => {
    const {bundle} = await import(new URL("../compiler/rv32/build.mjs", import.meta.url));
    assert(readFileSync(new URL("../compiler/typed-rv32.js", import.meta.url), "utf8") === bundle(),
        "compiler/typed-rv32.js differs from the build of compiler/rv32/: edit the files there, never the bundle, then run node compiler/rv32/build.mjs");
});
