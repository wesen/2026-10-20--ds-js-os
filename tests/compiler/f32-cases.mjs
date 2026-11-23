// The f32 differential cases (PICOCALC-TYPED-F32), shared by tests/compiler/typed-f32.test.mjs (WebAssembly in Node
// against RV32 on the reference interpreter and a JavaScript model) and by the Go machine's fixture
// (tools/trace-repl/pkg/traceapi/testdata/f32-differential.json, written by typed-f32-fixture.mjs).
//
// A case is a function of a Typed program and its arguments; an f32 travels as its bits. Results compare bit for bit,
// except that every NaN equals every NaN: Typed leaves NaN payloads unspecified (WebAssembly's are nondeterministic,
// RV32F's canonical).
import {readFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";

export function realm() {
    const ctx = createContext({});
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js",
        "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    return ctx;
}

export const POLICIES = ["stock", "interactive", "balanced", "default", "kernel"];
const F = new Float32Array(1), U = new Uint32Array(F.buffer);
export const bits = x => { F[0] = x; return U[0]; };
export const float = n => { U[0] = n; return F[0]; };
export const fround = Math.fround;
const isNaNBits = n => (n & 0x7f800000) === 0x7f800000 && (n & 0x7fffff) !== 0;
// Two results of type `type` (an f32 as bits, an i32 as a number) agree.
export const same = (type, x, y) => type === "f32" ? (x >>> 0) === (y >>> 0) || (isNaNBits(x >>> 0) && isNaNBits(y >>> 0)) : x === y;

// A deterministic generator (xorshift32).
export function random(seed) {
    let s = seed | 0 || 1;
    const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
    return {next, below: n => next() % n, pick: list => list[next() % list.length]};
}

// Special f32 inputs: zeros, the subnormal boundary, the integral boundary 2^23, halves, the largest finite values,
// infinities and NaN.
export const SPECIALS = [0, -0, 1, -1, 0.5, -0.5, 1.5, -2.5, 2.5, 0.1, -7.25, 1e-45, -1e-45, 1.1754943508222875e-38,
    8388608, 8388607.5, -8388607.5, 8388609, 16777217, 2147483520, 2147483648, -2147483648, -2147483904, 3.4028234663852886e38,
    -3.4028234663852886e38, Infinity, -Infinity, NaN, 3.14159, 123456.789, -0.0001].map(fround);
export function floatInput(r) {
    switch (r.below(4)) {
    case 0: return r.pick(SPECIALS);
    case 1: return fround((r.next() / 2 ** 32 - 0.5) * 2 ** (r.below(20) - 4));
    case 2: return float(r.next());
    default: return fround(r.below(200) / 8 - 12.5);
    }
}
export const intInput = r => r.pick([() => 0, () => 1, () => -1, () => r.below(64) - 32, () => r.next() | 0, () => 2147483647])();

// Generated expressions. A tree is ["param", name] | ["literal", text] | ["int", tree] (f32 of an i32 term) |
// ["unary", op, tree] | ["binary", op, left, right] | ["call", name, ...trees].
const BINARY = {"+": 9, "-": 9, "*": 10, "/": 10};
const UNARY = ["-", "Math.abs", "Math.sqrt", "Math.floor", "Math.ceil", "Math.trunc"];
const FUNCTIONS = ["Math.min", "Math.max", "Math.copysign"];
const LITERALS = ["0.0", "1.0", "0.5", "2.0", "3.5", "1e-3", "2.5e2", "1e30", "6.2831853", "0.15915494", "1e-40", "8388608.0"];
const PARAMS = ["a", "b", "c"];

function tree(r, depth) {
    if (depth === 0 || r.below(6) === 0) {
        const k = r.below(8);
        return k < 5 ? ["param", r.pick(PARAMS)] : k < 7 ? ["literal", r.pick(LITERALS)] : ["int", r.pick(["n", "n * 3", "n - 7"])];
    }
    const k = r.below(12);
    if (k < 3) return ["unary", r.pick(UNARY), tree(r, depth - 1)];
    // copysign's sign operand is a parameter or a literal: an arithmetic NaN's sign bit is unspecified.
    if (k < 5) {
        const f = r.pick(FUNCTIONS);
        return ["call", f, tree(r, depth - 1), f === "Math.copysign" ? tree(r, 0) : tree(r, depth - 1)];
    }
    if (k < 6) return ["call", r.pick(["h1", "h2"]), tree(r, depth - 1), tree(r, depth - 1)];
    return ["binary", r.pick(Object.keys(BINARY)), tree(r, depth - 1), tree(r, depth - 1)];
}

function print(t, r) {
    switch (t[0]) {
    case "param": case "literal": return t[1];
    case "int": return "f32(" + t[1] + ")";
    case "unary": {
        const inner = print(t[2], r);
        return t[1] === "-" ? "-" + (t[2][0] === "param" || t[2][0] === "literal" ? inner : "(" + inner + ")") : t[1] + "(" + inner + ")";
    }
    case "call": return t[1] === "h1" ? "h1(" + print(t[2], r) + ")" :
        t[1] + "(" + print(t[2], r) + ", " + print(t[3], r) + (t[1] === "h2" ? ", n" : "") + ")";
    }
    const [, op, left, right] = t, p = BINARY[op];
    const wrap = (child, needed) => { const text = print(child, r); return needed || r.below(8) === 0 ? "(" + text + ")" : text; };
    return wrap(left, left[0] === "binary" && BINARY[left[1]] < p) + " " + op + " " + wrap(right, right[0] === "binary" && BINARY[right[1]] <= p);
}

// The JavaScript model of Typed's f32: every operation rounded with Math.fround (exact for + - * / and sqrt, whose
// double result rounds once more to the correctly rounded f32), min and max by RV32F's rule, i32 -> f32 rounded.
const minNum = (x, y, max) => Number.isNaN(x) ? (Number.isNaN(y) ? NaN : y) : Number.isNaN(y) ? x :
    x === y ? (max ? (Object.is(x, -0) ? y : x) : (Object.is(x, -0) ? x : y)) : max ? Math.max(x, y) : Math.min(x, y);
export const MODEL = {
    "+": (x, y) => fround(x + y), "-": (x, y) => fround(x - y), "*": (x, y) => fround(x * y), "/": (x, y) => fround(x / y),
    "Math.abs": Math.abs, "Math.sqrt": x => fround(Math.sqrt(x)), "Math.floor": Math.floor, "Math.ceil": Math.ceil,
    "Math.trunc": Math.trunc, "Math.min": (x, y) => minNum(x, y, false), "Math.max": (x, y) => minNum(x, y, true),
    "Math.copysign": (x, y) => (Object.is(y, -0) || y < 0 || (Number.isNaN(y) && bits(y) >>> 31)) ? -Math.abs(x) : Math.abs(x),
    h1: x => fround(fround(x * x) - 0.5), h2: (x, y, n) => n > 0 ? fround(x - y) : fround(x * fround(y + 1)),
};
// f32 -> i32: truncate toward zero, saturate, NaN gives 2^31 - 1.
export const toI32 = x => Number.isNaN(x) ? 2147483647 : x >= 2147483648 ? 2147483647 : x <= -2147483649 ? -2147483648 : Math.trunc(x) | 0;

function evaluate(t, env) {
    switch (t[0]) {
    case "param": return env[t[1]];
    case "literal": return fround(Number(t[1]));
    case "int": { const n = env.n, v = t[1] === "n" ? n : t[1] === "n * 3" ? Math.imul(n, 3) : (n - 7) | 0; return fround(v); }
    case "unary": { const x = evaluate(t[2], env); return t[1] === "-" ? -x : MODEL[t[1]](x); }
    case "call": return t[1] === "h1" ? MODEL.h1(evaluate(t[2], env)) : MODEL[t[1]](evaluate(t[2], env), evaluate(t[3], env), env.n);
    default: return MODEL[t[1]](evaluate(t[2], env), evaluate(t[3], env));
    }
}

const HELPERS = `function h1(x: f32): f32 { return x * x - 0.5; }
function h2(x: f32, y: f32, n: i32): f32 { if (n > 0) { return x - y; } return x * (y + 1.0); }
`;

// count generated functions: f32 results (g<i>), and i32 results through a comparison and a conversion (k<i>).
export function generated(seed, count) {
    const r = random(seed);
    const functions = [];
    let source = HELPERS;
    for (let i = 0; i < count; i++) {
        const t = tree(r, 1 + r.below(7)), u = tree(r, 1 + r.below(3));
        if (i % 4 === 3) {
            const op = r.pick(["<", "<=", ">", ">=", "===", "!=="]);
            source += `function k${i}(a: f32, b: f32, c: f32, n: i32): i32 {\n    let x = ${print(t, r)};\n` +
                `    if (x ${op} ${print(u, r)}) { return i32(x); }\n    return 0 - i32(x * 0.5);\n}\n`;
            const cmp = {"<": (x, y) => x < y, "<=": (x, y) => x <= y, ">": (x, y) => x > y, ">=": (x, y) => x >= y,
                "===": (x, y) => x === y, "!==": (x, y) => x !== y}[op];
            functions.push({name: "k" + i, params: ["f32", "f32", "f32", "i32"], result: "i32", model: env => {
                const x = evaluate(t, env);
                return cmp(x, evaluate(u, env)) ? toI32(x) : (0 - toI32(fround(x * 0.5))) | 0;
            }});
        } else {
            source += `function g${i}(a: f32, b: f32, c: f32, n: i32): f32 {\n    return ${print(t, r)};\n}\n`;
            functions.push({name: "g" + i, params: ["f32", "f32", "f32", "i32"], result: "f32", model: env => evaluate(t, env)});
        }
    }
    return {source, functions};
}

// Inputs for a generated function: a, b, c, n.
export function generatedInputs(r, count) {
    return Array.from({length: count}, () => [floatInput(r), floatInput(r), floatInput(r), intInput(r)]);
}

// Hand-written programs: loops with homes, spills across calls, records with f32 fields in memory, f32 buffer
// elements, value ifs, conversions, the bit casts on finite values, f32 locals in a frameless leaf's caller.
export const HAND = `record V { x: f32; y: f32; z: f32; tag: i32; }
function dot(p: V, q: V): f32 { return p.x * q.x + p.y * q.y + p.z * q.z; }
function scale(p: V, s: f32): i32 { p.x = p.x * s; p.y = p.y * s; p.z = p.z * s; p.tag = p.tag + 1; return p.tag; }
function lerp(a: f32, b: f32, t: f32): f32 { return a + (b - a) * t; }
function poly(x: f32, n: i32): f32 {
    let s: f32 = 0.0;
    let p: f32 = 1.0;
    for (let i = 0; i < n; i = i + 1) { s = s + p * lerp(x, 1.0, 0.25); p = p * x; }
    return s;
}
function spill(a: f32, b: f32): f32 {
    return a + (b - (a * (b + (a - (b * (a + (b - (a * lerp(b, a, 0.5)))))))));
}
function sumBuf(buf: buffer, n: i32): f32 {
    let s: f32 = 0.0;
    for (let i = 0; i < n; i = i + 1) { s = s + buf.getF32(i); }
    return s;
}
function fillBuf(buf: buffer, n: i32, x: f32): i32 {
    for (let i = 0; i < n; i = i + 1) { buf.setF32(i, x * f32(i)); }
    return n;
}
function pick(a: f32, b: f32, n: i32): f32 { if (n > 0 && a < b) { return Math.min(a, b) * 2.0; } return Math.max(a, b) - 1.0; }
function conv(a: f32): i32 { return i32(a) + i32(Math.floor(a)) * 3 + i32(Math.ceil(a)) * 5; }
function bits(a: f32): i32 { return Math.bitsOf(Math.min(Math.abs(a), 1e30) + 1.0) + Math.bitsOf(Math.fromBits(1065353216) * Math.max(a, 0.0)); }
function count(a: f32, b: f32): i32 {
    let k = 0;
    if (a < b) { k = k + 1; }
    if (a <= b) { k = k + 2; }
    if (a > b) { k = k + 4; }
    if (a >= b) { k = k + 8; }
    if (a === b) { k = k + 16; }
    if (a !== b) { k = k + 32; }
    if (!(a < b) && !(a >= b)) { k = k + 64; }
    return k;
}
function many(a: f32, b: f32, c: f32, d: f32, e: f32, f: f32, g: f32, h: f32, n: i32, m: i32): f32 {
    return (a - b) * (c - d) + (e - f) * (g - h) + f32(n - m);
}
function callMany(a: f32, n: i32): f32 { return many(a, 1.0, a, 2.0, -a, 3.0, a * a, 4.0, n, 7) + lerp(a, -a, 0.75); }
`;
export const HAND_FUNCTIONS = {
    lerp: ["f32", "f32", "f32"], poly: ["f32", "i32"], spill: ["f32", "f32"], pick: ["f32", "f32", "i32"], conv: ["f32"],
    count: ["f32", "f32"], callMany: ["f32", "i32"], bits: ["f32"],
};

// The math library (compiler/typed/lib/math.typed): every public function, with inputs over its domain and edges.
export const MATH = readFileSync(new URL("../../compiler/typed/lib/math.typed", import.meta.url), "utf8");
export const MATH_FUNCTIONS = {
    sinf: 1, cosf: 1, tanf: 1, expf: 1, exp2f: 1, logf: 1, log2f: 1, powf: 2, atanf: 1, atan2f: 2, asinf: 1, acosf: 1,
    fract: 1, mix: 3, clamp: 3, saturate: 1, step: 2, sign: 1, smoothstep: 3, ldexpf: 1,
};
export function mathInputs(r, name, count) {
    const scale = {sinf: 60, cosf: 60, tanf: 3, expf: 90, exp2f: 130, logf: 1e4, log2f: 1e4, powf: 8, asinf: 1.2, acosf: 1.2}[name] ?? 20;
    return Array.from({length: count}, (_, k) => Array.from({length: MATH_FUNCTIONS[name]}, () =>
        k % 5 === 0 ? floatInput(r) : fround((r.next() / 2 ** 32 * 2 - (name.startsWith("log") ? 0.1 : 1)) * scale)))
        .map(args => name === "ldexpf" ? [args[0], (intInput(r) % 300)] : args);
}

// The three Candela fragments (PICOCALC-CANDELA-P4 scripts/09-numeric-bench.c, arm F32), as in the ticket's
// scripts/fragments.typed: the instruction counts the RV32 build must keep (typed-f32.test.mjs).
export const FRAGMENTS = `record V3 { x: f32; y: f32; z: f32; }

function sphere(o: V3, d: V3, r: f32): f32 {
    const a = d.x * d.x + d.y * d.y + d.z * d.z;
    const b = o.x * d.x + o.y * d.y + o.z * d.z;
    const c = o.x * o.x + o.y * o.y + o.z * o.z - r * r;
    const disc = b * b - a * c;
    if (disc < 0.0) { return 1e30; }
    const s = Math.sqrt(disc);
    let t = (-b - s) / a;
    if (t < 0.0002) { t = (-b + s) / a; }
    if (t < 0.0002) { return 1e30; }
    return t;
}

function lambda(w: V3, al: f32): f32 {
    const t = al * al * (w.x * w.x + w.y * w.y) / (w.z * w.z);
    return (-1.0 + Math.sqrt(1.0 + t)) * 0.5;
}

function ggx(wo: V3, wi: V3, al: f32): f32 {
    let hx = wo.x + wi.x;
    let hy = wo.y + wi.y;
    let hz = wo.z + wi.z;
    const l = Math.sqrt(hx * hx + hy * hy + hz * hz);
    hx = hx / l;
    hy = hy / l;
    hz = hz / l;
    const x = hx / al;
    const y = hy / al;
    const k = x * x + y * y + hz * hz;
    const D = 1.0 / (3.14159265 * al * al * k * k);
    const G = 1.0 / (1.0 + lambda(wo, al) + lambda(wi, al));
    return D * G / (4.0 * wo.z);
}

function norm3(v: V3): f32 {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    let k: f32 = 0.0;
    if (l > 1e-20) { k = 1.0 / l; }
    return v.x * k + 2.0 * v.y * k + 4.0 * v.z * k;
}
`;
