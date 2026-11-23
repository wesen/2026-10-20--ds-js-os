// Value types in Typed (PICOCALC-TYPED-VALUES), part two: more than eight parameters per register class, value
// records and record results, compiled to WebAssembly (run in Node) and to RV32 under every policy (run on the
// reference interpreter) against JavaScript models; the language rules; the shape of the RV32 code.
import assert from "node:assert/strict";
import test from "node:test";
import {words} from "./rv32-helpers.mjs";
import {differential, random, typedRv32, typedWasm} from "./values-helpers.mjs";

// ---- more than eight parameters per register class: ilp32f's stack words ----

// ints(a0..a11): twelve i32 (eight in a0-a7, four on the stack); floats(f0..f17, k): eighteen f32 and an i32 (eight in
// fa0-fa7, eight in a0-a7, three on the stack); mixed: twenty of each class interleaved. Wrappers with few arguments
// call them (the interpreter passes register arguments only), also with calls among the arguments, from small and
// large frames, and into a callee with a large frame.
const range = n => Array.from({length: n}, (_, i) => i);
const intTerms = n => range(n).map(i => (i % 2 ? " - " : " + ") + "a" + i + " * " + (i + 1)).join("").slice(3);
const floatTerms = n => range(n).map(i => "f" + i + " * " + (i + 0.5).toFixed(1)).join(" + ");
const STACK_PARAMS = `function ints(${range(12).map(i => "a" + i + ": i32").join(", ")}): i32 {
    return ${intTerms(12)};
}
function floats(${range(18).map(i => "f" + i + ": f32").join(", ")}, k: i32): f32 {
    return ${floatTerms(18)} + f32(k);
}
function mixed(${range(20).map(i => "a" + i + ": i32, f" + i + ": f32").join(", ")}): f32 {
    return ${range(20).map(i => "f32(a" + i + ") * f" + i).join(" + ")};
}
function callInts(x: i32): i32 {
    return ints(${range(12).map(i => "x + " + i).join(", ")});
}
function nestInts(x: i32): i32 {
    return ints(ints(${range(12).map(i => "x * " + i).join(", ")}), ${range(10).map(i => "x - " + i).join(", ")}, callInts(x + 1));
}
function callFloats(x: f32, k: i32): f32 {
    return floats(${range(18).map(i => "x + " + i + ".0").join(", ")}, k);
}
function callMixed(x: i32, y: f32): f32 {
    return mixed(${range(20).map(i => "x + " + i + ", y * " + (i + 1) + ".0").join(", ")});
}
function bigCaller(x: i32): i32 {
${range(480).map(i => "    const v" + i + " = x + " + i + ";").join("\n")}
    return ints(${range(12).map(i => "v" + (i * 40)).join(", ")}) + v479;
}
function bigCallee(${range(12).map(i => "a" + i + ": i32").join(", ")}): i32 {
${range(480).map(i => "    const v" + i + " = a" + (i % 12) + " + " + i + ";").join("\n")}
    return v0 - v11 + v479 + a11;
}
function callBig(x: i32): i32 {
    return bigCallee(${range(12).map(i => "x * " + (i + 1)).join(", ")});
}
`;

const intsModel = a => a.reduce((s, v, i) => (i % 2 ? s - Math.imul(v, i + 1) : s + Math.imul(v, i + 1)) | 0, 0);
const floatsModel = (f, k) => Math.fround(f.reduce((s, v, i) => i ? Math.fround(s + Math.fround(v * (i + 0.5))) : Math.fround(v * 0.5), 0) + k);
const mixedModel = (a, f) => a.reduce((s, v, i) => {
    const term = Math.fround(Math.fround(v) * f[i]);
    return i ? Math.fround(s + term) : term;
}, 0);

test("more than eight parameters per class pass on the stack (ilp32f), from small and large frames", async () => {
    const check = await differential(STACK_PARAMS, {
        callInts: {params: ["i32"], result: "i32"}, nestInts: {params: ["i32"], result: "i32"},
        callFloats: {params: ["f32", "i32"], result: "f32"}, callMixed: {params: ["i32", "f32"], result: "f32"},
        bigCaller: {params: ["i32"], result: "i32"}, callBig: {params: ["i32"], result: "i32"},
    });
    const r = random(0x51ac);
    for (let k = 0; k < 25; k++) {
        const x = r.below(2001) - 1000, y = Math.fround((r.below(2001) - 1000) / 64);
        const callInts = v => intsModel(range(12).map(i => v + i));
        check("callInts", [x], callInts(x));
        check("nestInts", [x], intsModel([intsModel(range(12).map(i => Math.imul(x, i))), ...range(10).map(i => x - i), callInts(x + 1)]));
        check("callFloats", [y, x], floatsModel(range(18).map(i => Math.fround(y + i)), x));
        check("callMixed", [x, y], mixedModel(range(20).map(i => x + i), range(20).map(i => Math.fround(y * (i + 1)))));
        check("bigCaller", [x], (intsModel(range(12).map(i => x + i * 40)) + x + 479) | 0);
        const a = range(12).map(i => Math.imul(x, i + 1));
        check("callBig", [x], (a[0] - (a[11] + 11) + (a[479 % 12] + 479) + a[11]) | 0);
    }
    // Where the parameters arrive (ilp32f): floats' f8..f15 in a0-a7, f16, f17 and k in the stack words 0-2.
    const program = typedRv32.compile(STACK_PARAMS, [], 1 << 20, {policy: "stock"});
    assert.deepEqual(program.signatures.find(s => s.name === "floats").params.length, 19);
    const sw = w => (w & 0x707f) === 0x2023 || (w & 0x707f) === 0x2027, rs1 = w => (w >>> 15) & 31, offset = w => ((w >> 25) << 5) | ((w >>> 7) & 31);
    // callFloats stores three words at sp + 0, 4, 8 before its call (fsw, fsw, sw).
    const stores = words(program, "callFloats").filter(w => sw(w) && rs1(w) === 2).map(offset);
    for (const o of [0, 4, 8]) assert(stores.includes(o), "sw to " + o + "(sp): " + stores);
});

// ---- value records and record results ----

const VECTORS = `value record Vec3 { x: f32; y: f32; z: f32; }
methods Vec3 { dot = dot; plus = add; }
function add(a: Vec3, b: Vec3): Vec3 { return Vec3(a.x + b.x, a.y + b.y, a.z + b.z); }
function sub(a: Vec3, b: Vec3): Vec3 { return Vec3(a.x - b.x, a.y - b.y, a.z - b.z); }
function scale(a: Vec3, s: f32): Vec3 { return Vec3(a.x * s, a.y * s, a.z * s); }
function dot(a: Vec3, b: Vec3): f32 { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: Vec3, b: Vec3): Vec3 { return Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
function normalize(a: Vec3): Vec3 {
    const l = Math.sqrt(dot(a, a));
    return l > 0.0 ? scale(a, 1.0 / l) : a;
}
function reflect(d: Vec3, n: Vec3): Vec3 { return sub(d, scale(n, 2.0 * dot(d, n))); }
function shade(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32): f32 {
    const a = Vec3(ax, ay, az);
    let b = Vec3(bx, by, bz);
    b.z = b.z + 0.5;
    const r = reflect(normalize(a), normalize(b));
    const c = cross(a, b);
    return r.dot(c) + a.plus(b).y + cross(r, a).x + Vec3(ax, ay, az).z;
}
function walk(n: i32, x: f32): f32 {
    let acc = Vec3(0.0, 0.0, 0.0);
    for (let i = 0; i < n; i = i + 1) {
        if (i % 3 === 0) { continue; }
        const p = Vec3(f32(i), x, f32(i) * x);
        acc = add(acc, cross(p, normalize(acc.x > 1.0 ? acc : Vec3(1.0, 0.0, 0.0))));
    }
    return acc.x + acc.y * 2.0 + acc.z * 3.0;
}
`;

// The JavaScript model: every f32 operation rounded once, in the order Typed evaluates it.
const fr = Math.fround;
const V = {
    add: (a, b) => [fr(a[0] + b[0]), fr(a[1] + b[1]), fr(a[2] + b[2])],
    sub: (a, b) => [fr(a[0] - b[0]), fr(a[1] - b[1]), fr(a[2] - b[2])],
    scale: (a, s) => [fr(a[0] * s), fr(a[1] * s), fr(a[2] * s)],
    dot: (a, b) => fr(fr(fr(a[0] * b[0]) + fr(a[1] * b[1])) + fr(a[2] * b[2])),
    cross: (a, b) => [fr(fr(a[1] * b[2]) - fr(a[2] * b[1])), fr(fr(a[2] * b[0]) - fr(a[0] * b[2])), fr(fr(a[0] * b[1]) - fr(a[1] * b[0]))],
};
V.normalize = a => { const l = fr(Math.sqrt(V.dot(a, a))); return l > 0 ? V.scale(a, fr(1 / l)) : a; };
V.reflect = (d, n) => V.sub(d, V.scale(n, fr(2 * V.dot(d, n))));
function shadeModel(ax, ay, az, bx, by, bz) {
    const a = [ax, ay, az], b = [bx, by, fr(bz + 0.5)];
    const r = V.reflect(V.normalize(a), V.normalize(b)), c = V.cross(a, b);
    return fr(fr(fr(V.dot(r, c) + V.add(a, b)[1]) + V.cross(r, a)[0]) + az);
}
function walkModel(n, x) {
    let acc = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        if (i % 3 === 0) continue;
        const p = [i, x, fr(i * x)];
        acc = V.add(acc, V.cross(p, V.normalize(acc[0] > 1 ? acc : [1, 0, 0])));
    }
    return fr(fr(acc[0] + fr(acc[1] * 2)) + fr(acc[2] * 3));
}

test("value records: vector math with record results, methods, conditionals and loops", async () => {
    const vec = {params: Array(6).fill("f32"), results: ["f32", "f32", "f32"]};
    const check = await differential(VECTORS, {
        add: vec, cross: vec, reflect: vec, normalize: {params: ["f32", "f32", "f32"], results: ["f32", "f32", "f32"]},
        shade: {params: Array(6).fill("f32"), result: "f32"}, walk: {params: ["i32", "f32"], result: "f32"},
    });
    const r = random(0x7ec3);
    const f = () => fr((r.below(4001) - 2000) / 97);
    for (let k = 0; k < 40; k++) {
        const a = [f(), f(), f()], b = [f(), f(), f()];
        check("add", [...a, ...b], V.add(a, b));
        check("cross", [...a, ...b], V.cross(a, b));
        check("reflect", [...a, ...b], V.reflect(a, b));
        check("normalize", a, V.normalize(a));
        check("shade", [...a, ...b], shadeModel(...a, ...b));
        check("walk", [k, a[0]], walkModel(k, a[0]));
    }
    check("normalize", [0, 0, 0], [0, 0, 0]);
});

const ITEMS = `value record Vec3 { x: f32; y: f32; z: f32; }
enum Mode { A, B, C }
record Cell { v: i32; w: f32; }
value record Item { cell: Cell; mode: Mode; on: bool; n: u32; pos: Vec3; }
function bump(it: Item, k: i32): Item {
    let x = it;
    x.cell.v = x.cell.v + k;
    x.n = x.n * 3;
    x.pos.y = x.pos.y + f32(k);
    x.on = !x.on;
    return x;
}
function use(cell: Cell, k: i32): i32 {
    let it = Item(cell, k > 0 ? Mode.B : Mode.C, k > 2, u32(k) + 4000000000, Vec3(1.0, 2.0, 3.0));
    it = bump(it, k);
    bump(it, 1);
    const m = i32(it.mode);
    it.cell.w = it.pos.y;
    return it.cell.v + m * 100 + (it.on ? 1000 : 0) + i32(it.n % 1000) + i32(it.pos.y) + i32(bump(it, 2).pos.y * 10.0);
}
`;

test("value records with record references, enums, bool and u32 fields; dropped results; stores through a field", async () => {
    const check = await differential(ITEMS, {use: {params: ["i32", "i32"], result: "i32"}});
    for (const k of [-3, 0, 1, 2, 3, 7]) for (const v of [0, 5, -40]) {
        const memory = new Uint8Array(64), view = new DataView(memory.buffer);
        view.setInt32(16, v, true);
        // bump(it, k) and bump(it, 1) add to the cell's v before the return reads it; bump(it, 2) runs after the read.
        const cellV = v + k + 1;
        const n = Math.imul(((k >>> 0) + 4000000000) >>> 0, 3) >>> 0;
        const y = 2 + k, on = !(k > 2);
        const expected = (cellV + (k > 0 ? 1 : 2) * 100 + (on ? 1000 : 0) + n % 1000 + Math.trunc(y) + Math.trunc(fr((y + 2) * 10))) | 0;
        check("use", [16, k], expected, memory);
    }
});

// A record of 23 leaves (17 f32, 6 integers), like Candela's Hit: its result needs nine stack words, a function of two
// takes 46 parameters, most of them on the stack or as f32 in integer registers.
const HITS = `value record Vec3 { x: f32; y: f32; z: f32; }
value record Vec2 { u: f32; v: f32; }
value record Hit { ok: bool; t: f32; p: Vec3; n: Vec3; ng: Vec3; uv: Vec2; lp: Vec3; obj: i32; mat: i32; lit: i32;
    front: bool; irand: f32; iid: f32; face: i32; }
function makeHit(t: f32, k: i32): Hit {
    return Hit(k > 0, t, Vec3(t, t + 1.0, t + 2.0), Vec3(0.0, 1.0, 0.0), Vec3(1.0, 0.0, 0.0), Vec2(t * 0.5, t * 0.25),
        Vec3(t - 1.0, t - 2.0, t - 3.0), k, k * 2, k * 3, k % 2 === 0, t * 0.125, t * 0.0625, k + 7);
}
function nearer(a: Hit, b: Hit): Hit { return a.t < b.t ? a : b; }
function score(h: Hit): f32 {
    return h.t + h.p.x + h.n.y + h.ng.z + h.uv.v + h.lp.x + f32(h.obj + h.mat * 2 + h.lit * 3 + h.face) + h.irand + h.iid +
        (h.ok ? 1.0 : 0.0) + (h.front ? 2.0 : 0.0);
}
function trace(n: i32, t0: f32): f32 {
    let best = makeHit(1000.0, 0);
    for (let i = 0; i < n; i = i + 1) {
        const h = makeHit(t0 + f32((i * 7) % 5), i);
        best = nearer(best, h);
        if (best.obj === 3) { best.uv.v = best.uv.v + 100.0; }
    }
    return score(best) + makeHit(t0, n).lp.z;
}
`;

function makeHitModel(t, k) {
    return {ok: k > 0, t, p: [t, fr(t + 1), fr(t + 2)], n: [0, 1, 0], ng: [1, 0, 0], uv: [fr(t * 0.5), fr(t * 0.25)],
        lp: [fr(t - 1), fr(t - 2), fr(t - 3)], obj: k, mat: k * 2, lit: k * 3, front: k % 2 === 0, irand: fr(t * 0.125),
        iid: fr(t * 0.0625), face: k + 7};
}
function scoreModel(h) {
    let s = fr(h.t + h.p[0]);
    for (const v of [h.n[1], h.ng[2], h.uv[1], h.lp[0], h.obj + h.mat * 2 + h.lit * 3 + h.face, h.irand, h.iid, h.ok ? 1 : 0, h.front ? 2 : 0])
        s = fr(s + v);
    return s;
}
function traceModel(n, t0) {
    let best = makeHitModel(1000, 0);
    for (let i = 0; i < n; i++) {
        const h = makeHitModel(fr(t0 + (i * 7) % 5), i);
        best = best.t < h.t ? best : h;
        if (best.obj === 3) best = {...best, uv: [best.uv[0], fr(best.uv[1] + 100)]};
    }
    return fr(scoreModel(best) + makeHitModel(t0, n).lp[2]);
}

test("a record of 23 leaves: stack results, 46 parameters, a conditional and field writes in a loop", async () => {
    const check = await differential(HITS, {trace: {params: ["i32", "f32"], result: "f32"}});
    for (const n of [0, 1, 3, 4, 9]) for (const t0 of [0.5, 3.25, -7.5]) check("trace", [n, t0], traceModel(n, t0));
});

test("RV32: a vector add is a frameless leaf with its result in fa0-fa2; inlined, a loop of them makes no call", () => {
    const program = typedRv32.compile(VECTORS, [], 1 << 20, {policy: "default"});
    const add = words(program, "add");
    const opcode = w => w & 127, rd = w => (w >>> 7) & 31;
    // fadd.s three times into the operand stack, fmv.s into fa0-fa2, ret: no load, store or stack adjustment.
    assert.equal(add.length, 7, add.map(w => w.toString(16)).join(" "));
    assert(!add.some(w => [0x03, 0x07, 0x23, 0x27].includes(opcode(w))));
    assert.deepEqual(add.slice(3, 6).map(rd), [12, 11, 10]);
    // walk calls add, cross and normalize in its loop: all inlined under "default" (f32 callees), so no jal is left.
    const jal = w => opcode(w) === 0x6f && ((w >>> 7) & 31) === 1;
    assert(!words(program, "walk").some(jal));
    assert(words(typedRv32.compile(VECTORS, [], 1 << 20, {policy: "stock"}), "walk").some(jal));
});

test("the language rules of value records", async () => {
    const head = "value record Vec3 { x: f32; y: f32; z: f32; }\nrecord Mem { a: i32; }\n";
    const compile = body => typedWasm.compile(head + body);
    const fails = (body, pattern) => assert.throws(() => compile(body), pattern, body);
    const fn = body => "function f(m: Mem, x: f32): f32 { " + body + " }";
    fails(fn("const v = Vec3(1.0, 2.0, 3.0); v.x = 2.0; return v.x;"), /expected mutable local v/);
    fails(fn("return Vec3(1.0, 2.0).x;"), /expected ,/);
    fails(fn("return Vec3(1.0, 2.0, 3).x;"), /expected f32, got i32/);
    fails(fn("const v = Vec3(1.0, 2.0, 3.0); return v.w;"), /unknown field Vec3.w/);
    fails(fn("const v = Vec3(1.0, 2.0, 3.0); if (v === v) { return 1.0; } return 0.0;"), /expected scalar equality operands/);
    fails(fn("const v = Vec3(1.0, 2.0, 3.0); return v;"), /expected f32, got Vec3/);
    fails(fn("const v: Vec3 = 1.0; return x;"), /expected Vec3, got f32/);
    fails(fn("const v = x > 0.0 ? Vec3(1.0, 2.0, 3.0) : 1.0; return x;"), /expected Vec3, got f32/);
    assert.throws(() => compile("record Bad { v: Vec3; }\n" + fn("return x;")), /unknown type Vec3/);
    assert.throws(() => typedWasm.compile("value record A { a: A; }\nfunction f(): i32 { return 0; }"), /unknown type A/);
    assert.throws(() => typedWasm.compile("value record E { }\nfunction f(): i32 { return 0; }"), /empty value record E/);
    assert.throws(() => compile("function Vec3(): i32 { return 0; }"), /duplicate function Vec3/);
    // A parameter is immutable; a let copy is not, and copying is by value.
    fails("function g(v: Vec3): f32 { v.x = 1.0; return v.x; }", /expected mutable local v/);
    const run = async (body, ...args) => (await WebAssembly.instantiate(compile(body).bytes)).instance.exports.g(...args);
    assert.equal(await run("function g(x: f32): f32 { let a = Vec3(x, 2.0, 3.0); let b = a; b.x = 10.0; return a.x + b.x; }", 1.5), 11.5);
});
