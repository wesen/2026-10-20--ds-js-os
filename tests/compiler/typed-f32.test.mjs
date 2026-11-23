// f32 in Typed (PICOCALC-TYPED-F32): generated float expressions and hand-written programs, compiled to WebAssembly
// (run in Node) and to RV32 under every policy (run on the reference interpreter), bit for bit, and the generated
// ones against a JavaScript model of Typed's f32 rules; the language rules; the shape of the RV32F code.
import assert from "node:assert/strict";
import test from "node:test";
import {words} from "./rv32-helpers.mjs";
import {FRAGMENTS, HAND, HAND_FUNCTIONS, MATH, MATH_FUNCTIONS, POLICIES, bits, float, floatInput, generated, generatedInputs, intInput, mathInputs,
    random, realm, same} from "./f32-cases.mjs";

const {typedWasm, typedRv32, typedRv32Interp} = realm();

// Run function `name` of an RV32 program: i32 arguments in a0..., f32 in fa0... (as bits); the result as bits or i32.
export function runRv32(program, name, params, result, args, memory = new Uint8Array(64)) {
    const x = [], f = new Uint32Array(32);
    let k = 10;
    params.forEach((type, i) => { if (type === "f32") f[k++] = bits(args[i]); else x.push(args[i]); });
    const run = typedRv32Interp.run(program, name, x, memory, {fregisters: f});
    if (run.trap) throw new Error(name + " trapped");
    return {value: result === "f32" ? run.fregisters[10] : run.result, bytes: run.bytes};
}
const wasmValue = (result, value) => result === "f32" ? bits(value) : value;
const show = (type, v) => type === "f32" ? float(v) + " (0x" + (v >>> 0).toString(16) + ")" : String(v);

test("generated f32 expressions agree in WebAssembly, RV32 under every policy and the JavaScript model", async () => {
    const {source, functions} = generated(0xf32f32, 240);
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(source).bytes)).instance.exports;
    const images = POLICIES.map(policy => [policy, typedRv32.compile(source, [], 1 << 20, {policy})]);
    const r = random(77);
    let checked = 0;
    for (const fn of functions) {
        for (const args of generatedInputs(r, 12)) {
            const [a, b, c, n] = args;
            const w = wasmValue(fn.result, wasm[fn.name](...args));
            const model = wasmValue(fn.result, fn.model({a, b, c, n}));
            const where = fn.name + "(" + args.join(", ") + ")";
            assert(same(fn.result, w, model), where + ": wasm " + show(fn.result, w) + ", model " + show(fn.result, model));
            for (const [policy, program] of images) {
                const v = runRv32(program, fn.name, fn.params, fn.result, args).value;
                assert(same(fn.result, v, w), policy + " " + where + ": rv32 " + show(fn.result, v) + ", wasm " + show(fn.result, w));
                checked++;
            }
        }
    }
    assert(checked >= 14000);
});

test("hand-written f32 programs agree in WebAssembly and RV32 under every policy", async () => {
    const compiled = typedWasm.compile(HAND);
    const wasm = (await WebAssembly.instantiate(compiled.bytes)).instance.exports;
    const result = name => compiled.signatures.find(s => s.name === name).result;
    const images = POLICIES.map(policy => [policy, typedRv32.compile(HAND, [], 1 << 20, {policy})]);
    const r = random(5);
    for (const [name, params] of Object.entries(HAND_FUNCTIONS)) {
        for (let k = 0; k < 60; k++) {
            const args = params.map(type => type === "f32" ? floatInput(r) : r.below(9));
            const w = wasmValue(result(name), wasm[name](...args));
            for (const [policy, program] of images) {
                const v = runRv32(program, name, params, result(name), args).value;
                assert(same(result(name), v, w), policy + " " + name + "(" + args.join(", ") + "): " + show(result(name), v) + " vs " + show(result(name), w));
            }
        }
    }
    // Memory: records with f32 fields at 64 and 96, an f32 buffer (capacity in UTF-16 units) at 256.
    for (let k = 0; k < 40; k++) {
        const bytes = new Uint8Array(1024), view = new DataView(bytes.buffer);
        for (let i = 0; i < 3; i++) { view.setFloat32(64 + 4 * i, floatInput(r), true); view.setFloat32(96 + 4 * i, floatInput(r), true); }
        view.setInt32(76, intInput(r), true);
        const n = r.below(12), capacity = 2 * n + r.below(3);
        view.setInt32(256, capacity, true);
        for (let i = 0; i < n; i++) view.setFloat32(260 + 4 * i, floatInput(r), true);
        const s = floatInput(r);
        for (const [name, args, params] of [["dot", [64, 96], ["i32", "i32"]], ["scale", [64, s], ["i32", "f32"]],
            ["sumBuf", [256, n], ["i32", "i32"]], ["fillBuf", [256, n], ["i32", "i32", "f32"]]]) {
            if (name === "fillBuf") args.push(s);
            new Uint8Array(wasm.memory.buffer).set(bytes);
            const w = wasmValue(result(name), wasm[name](...args));
            const after = new Uint8Array(wasm.memory.buffer).slice(0, bytes.length);
            for (const [policy, program] of images) {
                const run = runRv32(program, name, params, result(name), args, bytes);
                assert(same(result(name), run.value, w), policy + " " + name + " " + k);
                // NaN payloads may differ in memory too; compare each word as an f32.
                const a = new DataView(run.bytes.buffer, run.bytes.byteOffset), b = new DataView(after.buffer);
                for (let at = 0; at < bytes.length; at += 4)
                    assert(same("f32", a.getUint32(at, true), b.getUint32(at, true)), policy + " " + name + " memory at " + at);
            }
        }
    }
    // An index past the buffer's capacity traps in both (getF32(i) checks unit 2i + 1).
    const bytes = new Uint8Array(1024);
    new DataView(bytes.buffer).setInt32(256, 5, true);
    new Uint8Array(wasm.memory.buffer).set(bytes);
    assert.throws(() => wasm.sumBuf(256, 3), WebAssembly.RuntimeError);
    for (const [policy, program] of images) {
        const run = typedRv32Interp.run(program, "sumBuf", [256, 3], bytes);
        assert(run.trap, policy + " traps");
        assert(!typedRv32Interp.run(program, "sumBuf", [256, 2], bytes).trap);
    }
});

test("the math library agrees in WebAssembly and RV32 under every policy, with its documented edge results", async () => {
    const compiled = typedWasm.compile(MATH);
    const wasm = (await WebAssembly.instantiate(compiled.bytes)).instance.exports;
    const signature = name => compiled.signatures.find(s => s.name === name);
    const images = POLICIES.map(policy => [policy, typedRv32.compile(MATH, [], 1 << 20, {policy})]);
    const r = random(2026);
    let checked = 0;
    for (const name of Object.keys(MATH_FUNCTIONS)) {
        const {params, result} = signature(name);
        for (const args of mathInputs(r, name, 150)) {
            const w = wasmValue(result, wasm[name](...args));
            for (const [policy, program] of images) {
                const v = runRv32(program, name, params, result, args).value;
                assert(same(result, v, w), policy + " " + name + "(" + args.join(", ") + "): " + show(result, v) + " vs " + show(result, w));
                checked++;
            }
        }
    }
    assert(checked > 14000);
    // The edges README.md documents.
    const near = (x, y) => Object.is(x, y) || Math.abs(x - y) <= 2e-7 * Math.abs(y);
    for (const [name, args, want] of [["sinf", [-0], -0], ["sinf", [8388608], 0], ["cosf", [8388608], 1], ["sinf", [Infinity], NaN],
        ["expf", [-200], 0], ["expf", [100], Infinity], ["expf", [NaN], NaN], ["logf", [0], -Infinity], ["logf", [-1], NaN],
        ["log2f", [8], 3], ["powf", [0, -1], Infinity], ["powf", [-2, 2], NaN], ["atan2f", [0, -0], Math.fround(Math.PI)],
        ["atan2f", [-0, -1], -Math.fround(Math.PI)], ["acosf", [1.5], NaN], ["fract", [-0.25], 0.75], ["clamp", [NaN, 0, 1], 0]])
        assert(near(wasm[name](...args.map(Math.fround)), want), name + "(" + args.join(", ") + ") = " + wasm[name](...args));
});

test("the f32 language rules", () => {
    const fails = (source, pattern) => assert.throws(() => typedWasm.compile(source), pattern, source);
    const body = expr => "function f(a: f32, b: f32, n: i32): f32 { return " + expr + "; }";
    fails(body("a + 1"), /expected f32, got i32/);
    fails(body("a + n"), /expected f32, got i32/);
    fails(body("a % b"), /operator % is not defined on f32/);
    fails(body("a & b"), /operator & is not defined on f32/);
    fails(body("1e39"), /f32 literal out of range/);
    fails(body("f32(a < b)"), /f32 conversion requires an i32/);
    fails(body("Math.sqrt(n)"), /expected f32, got i32/);
    fails(body("Math.min(a, n)"), /expected f32, got i32/);
    fails(body("Math.sin(a)"), /unknown Math function sin/);
    fails("function f(a: f32): i32 { return a; }", /expected i32, got f32/);
    fails("function f(a: f32): bool { return a; }", /expected bool, got f32/);
    // Literals: a fraction or an exponent makes an f32; an integer literal stays i32; f32(literal) folds.
    const tape = source => {
        let code;
        typedWasm.compileFunctions(source, 0, [], undefined, undefined, fn => { code = fn.code; });
        return Array.from(code);
    };
    const T = globalThis.typedTape ?? realm().typedTape;
    assert.deepEqual(tape("function f(): f32 { return 2e-3; }"), [T.F32_CONST, bits(0.002) | 0, T.END]);
    assert.deepEqual(tape("function f(): f32 { return -1.5; }"), [T.F32_CONST, bits(-1.5) | 0, T.END]);
    assert.deepEqual(tape("function f(): f32 { return f32(3); }"), [T.F32_CONST, bits(3) | 0, T.END]);
    assert.deepEqual(tape("function f(a: f32): f32 { return -a; }"), [T.LOCAL_GET, 0, T.F32_NEG, T.END]);
    assert.deepEqual(tape("function f(a: f32): i32 { return i32(a); }"), [T.LOCAL_GET, 0, T.I32_TRUNC_F32, T.END]);
    // -0.0 is negative zero; 1.0e2 and 5E-1 are literals.
    for (const [text, value] of [["-0.0", -0], ["1.0e2", 100], ["5E-1", 0.5], ["0.1", Math.fround(0.1)]]) {
        const program = typedRv32.compile(body(text), [], 1 << 20, {policy: "kernel"});
        assert.equal(bits(float(runRv32(program, "f", ["f32", "f32", "i32"], "f32", [0, 0, 0]).value)), bits(value), text);
    }
});

test("RV32F code: frameless f32 leaves, no fused multiply-add, f32 arguments in fa registers", () => {
    const program = typedRv32.compile(HAND, [], 1 << 20, {policy: "kernel"});
    const lerp = words(program, "lerp");
    // fsub.s, fmul.s, fadd.s into fa0 and ret: no frame, no move.
    assert.equal(lerp.length, 4);
    assert.deepEqual(lerp.slice(0, 3).map(w => w >>> 27), [1, 2, 0]);
    for (const policy of POLICIES) {
        const image = typedRv32.compile(HAND, [], 1 << 20, {policy}).image, view = new DataView(image.buffer);
        for (let at = 0; at < image.length; at += 4) {
            const w = view.getUint32(at, true);
            assert(![0x43, 0x47, 0x4b, 0x4f].includes(w & 0x7f), policy + ": a fused multiply-add at " + at);
            if ((w & 0x7f) === 0x53 && (w >>> 27) <= 3) assert.equal((w >>> 12) & 7, 0, policy + ": a dynamic or directed rounding mode");
        }
    }
});

// Instructions per call under "kernel" on inputs like 09-numeric-bench.c's, where GCC -O2 executes 25.45 (sphere),
// 58 (ggx) and 23 (norm3): the ticket's target is 1.5 times those; these bounds keep the counts it reached.
test("the Candela fragments stay within 1.5 times GCC -O2's instruction counts", () => {
    const program = typedRv32.compile(FRAGMENTS, [], 1 << 20, {policy: "kernel"});
    const r = random(9), bytes = new Uint8Array(512), view = new DataView(bytes.buffer);
    const totals = {sphere: 0, ggx: 0, norm3: 0}, n = 64;
    const u = () => r.next() / 2 ** 32;
    for (let i = 0; i < n; i++) {
        const unit = () => { const v = [u() - 0.5, u() - 0.5, u() - 0.5], l = Math.hypot(...v); return v.map(x => x / l); };
        const [o, d, wo, wi] = [[16 * u() - 8, 16 * u() - 8, 16 * u() - 8], unit(), unit(), unit()];
        wo[2] = Math.abs(wo[2]) + 0.05;
        wi[2] = Math.abs(wi[2]) + 0.05;
        [o, d, wo, wi].forEach((v, k) => v.forEach((x, c) => view.setFloat32(64 + 16 * k + 4 * c, x, true)));
        for (const [name, x, f] of [["sphere", [64, 80], [0.3 + 1.7 * u()]], ["ggx", [96, 112], [0.05 + 0.9 * u()]], ["norm3", [64], []]]) {
            const fregisters = new Uint32Array(32);
            f.forEach((v, k) => { fregisters[10 + k] = bits(v); });
            totals[name] += typedRv32Interp.run(program, name, x, bytes, {fregisters, counts: false}).steps;
        }
    }
    for (const [name, gcc] of [["sphere", 25.45], ["ggx", 58], ["norm3", 23]])
        assert(totals[name] / n <= 1.5 * gcc + 0.5, name + ": " + totals[name] / n + " per call");
});
