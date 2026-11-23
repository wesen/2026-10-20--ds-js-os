// The kernel policy's rows and coalesce passes (PICOCALC-CANDELA-KERNEL-CODEGEN): f32 row reads of a buffer share one
// range check and one address, and value-record copies of f32 locals disappear. Both against WebAssembly on random
// inputs, both traps at a buffer's end, and the shape of the tapes they leave.
import assert from "node:assert/strict";
import test from "node:test";
import {typedWasm, typedRv32, typedRv32Interp, random, bits, fromBits, POLICIES, realm} from "./values-helpers.mjs";

const {typedTape} = realm();

const ROWS = `
function rows(b: buffer, i: i32, s: f32): f32 {
    const a: i32 = i * 4;
    const x: f32 = b.getF32(a);
    const y: f32 = b.getF32(a + 1);
    const z: f32 = b.getF32(a + 2) * s;
    const w: f32 = b.getF32(a + 3);
    const u: f32 = b.getF32(1) + b.getF32(2) + b.getF32(0);
    return (x - y) * z + w * u;
}
function three(b: buffer, a: i32): f32 {
    return b.getF32(a) * 3.0 + b.getF32(a + 1) * 5.0 + b.getF32(a + 2);
}
function guarded(b: buffer, i: i32): f32 {
    const a: i32 = i * 4;
    let t: f32 = b.getF32(a);
    if (t > 0.0) { t = t + b.getF32(a + 1) + b.getF32(a + 2); }
    return t + b.getF32(a + 3);
}
`;

const COPIES = `
value record Big { a: f32; b: f32; c: f32; d: f32; k: i32; e: f32; f: f32; g: f32; h: f32; }
function none(): Big { return Big(0.0, 1.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0, 1.5); }
function make(x: f32, n: i32): Big {
    let v: Big = none();
    v.a = x; v.k = n;
    if (n > 2) { v.b = x * 2.0; v.e = x - 1.0; } else { v.c = x + 0.5; }
    return v;
}
function use(x: f32, n: i32): f32 {
    const v: Big = make(x, n);
    let w: Big = v;
    w.d = w.a * w.h;
    const z: Big = make(w.d, n + 1);
    return w.a + w.b + w.c + w.d + f32(w.k) + w.e + w.f + w.g + w.h + z.a + z.b + z.e;
}
`;

function runF32(program, name, x, f, memory) {
    const fr = new Uint32Array(32);
    f.forEach((v, k) => { fr[10 + k] = bits(v); });
    return typedRv32Interp.run(program, name, x, memory, {fregisters: fr});
}

test("rows: grouped f32 row reads agree with WebAssembly and trap at the buffer's end in both", async () => {
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(ROWS).bytes)).instance.exports;
    const images = POLICIES.map(policy => [policy, typedRv32.compile(ROWS, [], 1 << 20, {policy})]);
    const r = random(77);
    const at = 64, units = 2 * 4 * 6;           // a buffer of six rows of four f32
    const bytes = new Uint8Array(512), view = new DataView(bytes.buffer);
    view.setInt32(at, units, true);
    for (let k = 0; k < 24; k++) view.setFloat32(at + 4 + 4 * k, (r.below(2001) - 1000) / 37, true);
    for (let n = 0; n < 40; n++) {
        const i = r.below(6), s = (r.below(200) - 100) / 13;
        for (const name of ["rows", "guarded"]) {
            new Uint8Array(wasm.memory.buffer).set(bytes);
            const expected = name === "rows" ? wasm.rows(at, i, s) : wasm.guarded(at, i);
            for (const [policy, program] of images) {
                const run = runF32(program, name, name === "rows" ? [at, i] : [at, i], name === "rows" ? [s] : [], bytes);
                assert(!run.trap, policy + " " + name + " " + i);
                assert.equal(bits(fromBits(run.fregisters[10])), bits(expected), policy + " " + name + "(" + i + ")");
            }
        }
    }
    // Row 6 is past the end: the first read of it traps in WebAssembly, the group's check in RV32; row -1 too.
    for (const i of [6, -1, 0x3fffffff]) {
        new Uint8Array(wasm.memory.buffer).set(bytes);
        assert.throws(() => wasm.rows(at, i, 1.0), WebAssembly.RuntimeError);
        for (const [policy, program] of images) assert(runF32(program, "rows", [at, i], [1.0], bytes).trap, policy + " traps at " + i);
    }
    // three(a) reads a, a + 1, a + 2: a = -1 passes the group's second check (unit 5) and needs the first; 22 the second.
    for (let a = -3; a <= 23; a++) {
        new Uint8Array(wasm.memory.buffer).set(bytes);
        let expected;
        try { expected = wasm.three(at, a); } catch { expected = null; }
        assert.equal(expected === null, a < 0 || a > 21, "Wasm three(" + a + ")");
        for (const [policy, program] of images) {
            const run = runF32(program, "three", [at, a], [], bytes);
            assert.equal(run.trap, expected === null, policy + " three(" + a + ") traps");
            if (expected !== null) assert.equal(bits(fromBits(run.fregisters[10])), bits(expected), policy + " three(" + a + ")");
        }
    }
    // A buffer one unit short of the last row's last f32 traps in both, on the group's second check in RV32.
    view.setInt32(at, units - 1, true);
    new Uint8Array(wasm.memory.buffer).set(bytes);
    assert.throws(() => wasm.rows(at, 5, 1.0), WebAssembly.RuntimeError);
    for (const [policy, program] of images) assert(runF32(program, "rows", [at, 5], [1.0], bytes).trap, policy + " traps short");
});

test("rows: a group's reads become loads from one address; a read under a branch is not grouped", () => {
    const tapes = new Map();
    typedRv32.compile(ROWS, [], 1 << 20, {policy: "kernel", observeTape(name, phase, code) { tapes.set(name + ":" + phase, code); }});
    const checked = code => typedTape.decode(code).filter(o => o.op === "text.checked_address").length;
    assert(tapes.has("rows:rows"), "rows rewrote rows()");
    assert(!tapes.has("guarded:rows"), "guarded() has three reads of one row in two stretches");
    assert.equal(checked(tapes.get("rows:rows")), 0);
    assert.equal(checked(tapes.get("rows:split") ?? tapes.get("rows:inline")), 7);
});

test("coalesce: value-record copies agree with WebAssembly, and the kernel image is smaller than without the pass", async () => {
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(COPIES).bytes)).instance.exports;
    const images = POLICIES.map(policy => [policy, typedRv32.compile(COPIES, [], 1 << 20, {policy})]);
    const r = random(5);
    for (let n = 0; n < 60; n++) {
        const x = (r.below(4001) - 2000) / 17, k = r.below(6);
        const expected = wasm.use(x, k);
        for (const [policy, program] of images) {
            const run = runF32(program, "use", [k], [x], new Uint8Array(64));
            assert(!run.trap, policy);
            assert.equal(bits(fromBits(run.fregisters[10])), bits(expected), policy + " use(" + x + ", " + k + ")");
        }
    }
    const phases = [];
    const kernel = typedRv32.compile(COPIES, [], 1 << 20, {policy: "kernel", observeTape(name, phase) { phases.push(name + ":" + phase); }});
    const without = typedRv32.compile(COPIES, [], 1 << 20, {policy: "kernel", disable: ["coalesce"]});
    assert(phases.includes("use:coalesce"), phases.join(" "));
    assert(kernel.image.length < without.image.length, kernel.image.length + " < " + without.image.length);
});
