// Value types in Typed (PICOCALC-TYPED-VALUES): continue, the conditional expression, u32, stack parameters, value
// records, record results and local arrays. Each is compiled to WebAssembly (run in Node) and to RV32 under every policy
// (run on the reference interpreter) and compared with a JavaScript model; the language rules and their errors; the
// shape of the RV32 code.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createContext, runInContext} from "node:vm";
import {words} from "./rv32-helpers.mjs";

function realm() {
    const ctx = createContext({});
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js",
        "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    return ctx;
}
const {typedWasm, typedRv32, typedRv32Interp} = realm();
const POLICIES = ["stock", "interactive", "balanced", "default", "kernel"];

// A deterministic generator (xorshift32), so a failure names a reproducible seed.
function random(seed) {
    let s = seed | 0 || 1;
    const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
    return {next, below: n => next() % n, pick: list => list[next() % list.length]};
}

const F32_BITS = new Int32Array(1), F32_VIEW = new Float32Array(F32_BITS.buffer);
const bits = value => { F32_VIEW[0] = value; return F32_BITS[0]; };
const fromBits = word => { F32_BITS[0] = word; return F32_VIEW[0]; };

// Run `name` of an RV32 program with ilp32f's register arguments (i32 in a0..., f32 in fa0...); the result as a number
// (f32) or an i32.
function runRv32(program, name, params, result, args, memory = new Uint8Array(64)) {
    const x = [], f = new Uint32Array(32);
    let k = 10;
    params.forEach((type, i) => { if (type === "f32") f[k++] = bits(args[i]); else x.push(args[i] | 0); });
    const run = typedRv32Interp.run(program, name, x, memory, {fregisters: f});
    if (run.trap) return {trap: true};
    return {value: result === "f32" ? fromBits(run.fregisters[10]) : run.result, run};
}

// Compile once for WebAssembly and for every policy; check(name, args, expected) compares all of them.
async function differential(source, signatures) {
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(source).bytes)).instance.exports;
    const images = POLICIES.map(policy => [policy, typedRv32.compile(source, [], 1 << 20, {policy})]);
    return (name, args, expected, memory) => {
        const {params, result} = signatures[name];
        const where = name + "(" + args.join(", ") + ")";
        const normal = v => result === "f32" ? bits(v) : result === "u32" ? v >>> 0 : v;
        if (memory) new Uint8Array(wasm.memory.buffer).set(memory);
        assert.equal(normal(wasm[name](...args)), normal(expected), "Wasm " + where);
        for (const [policy, program] of images) {
            const {value, trap} = runRv32(program, name, params, result, args, memory);
            assert(!trap, policy + " " + where + " trapped");
            assert.equal(normal(value), normal(expected), policy + " " + where);
        }
    };
}

// ---- continue ----

const CONTINUES = `enum Kind { Skip, Add, Double }
function evens(n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        if (i % 2 === 1) { continue; }
        s = s + i;
    }
    return s;
}
function nested(n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        for (let j = 0; j < n; j = j + 1) {
            if (j > i) { continue; }
            if ((i + j) % 3 === 0) { continue; }
            s = s + i * j;
        }
        if (i === 4) { continue; }
        s = s + 1;
    }
    return s;
}
function whiles(n: i32): i32 {
    let i = 0;
    let s = 0;
    while (i < n) {
        i = i + 1;
        if (i % 3 === 0) { continue; }
        s = s + i;
        if (s > 1000) { break; }
    }
    return s;
}
function kinds(n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        const k = i % 3 === 0 ? Kind.Skip : i % 3 === 1 ? Kind.Add : Kind.Double;
        match (k) {
            Skip: { continue; }
            Add: { s = s + i; }
            Double: { s = s + 2 * i; }
        }
        s = s + 1;
    }
    return s;
}
function spaces(work: buffer, n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        const c = work.charCodeAt(i);
        if (c % 5 === 0) { continue; }
        s = s + c;
    }
    return s;
}
function floats(n: i32): f32 {
    let s = 0.0;
    for (let i = 0; i < n; i = i + 1) {
        if (i === 2) { continue; }
        s = s + f32(i) * 0.5;
    }
    return s;
}
`;

const CONTINUE_MODEL = {
    evens: n => { let s = 0; for (let i = 0; i < n; i++) { if (i % 2 === 1) continue; s += i; } return s; },
    nested: n => {
        let s = 0;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) { if (j > i) continue; if ((i + j) % 3 === 0) continue; s += i * j; }
            if (i === 4) continue;
            s += 1;
        }
        return s;
    },
    whiles: n => { let i = 0, s = 0; while (i < n) { i++; if (i % 3 === 0) continue; s += i; if (s > 1000) break; } return s; },
    kinds: n => { let s = 0; for (let i = 0; i < n; i++) { if (i % 3 === 0) continue; s += i % 3 === 1 ? i : 2 * i; s += 1; } return s; },
    floats: n => { let s = 0; for (let i = 0; i < n; i++) { if (i === 2) continue; s = Math.fround(s + Math.fround(i * 0.5)); } return s; },
};

test("continue runs a for loop's update and re-tests the condition, in WebAssembly and RV32 under every policy", async () => {
    const signatures = Object.fromEntries(["evens", "nested", "whiles", "kinds"].map(name => [name, {params: ["i32"], result: "i32"}]));
    signatures.floats = {params: ["i32"], result: "f32"};
    signatures.spaces = {params: ["i32", "i32"], result: "i32"};
    const check = await differential(CONTINUES, signatures);
    for (const n of [0, 1, 2, 3, 5, 9, 17, 40]) for (const name of Object.keys(CONTINUE_MODEL))
        check(name, [n], CONTINUE_MODEL[name](n));
    // A buffer at 64: capacity 30, units i * 7.
    const memory = new Uint8Array(256), view = new DataView(memory.buffer);
    view.setInt32(64, 30, true);
    for (let i = 0; i < 30; i++) view.setUint16(68 + 2 * i, i * 7, true);
    for (const n of [0, 1, 7, 30]) {
        let s = 0;
        for (let i = 0; i < n; i++) if ((i * 7) % 5 !== 0) s += i * 7;
        check("spaces", [64, n], s, memory);
    }
});

test("a loop without continue keeps its tape; one with continue gets a block around its body", () => {
    const tape = source => {
        let code;
        typedRv32.compile(source, [], 1 << 20, {policy: "stock", observeTape(name, phase, c) { code = c; }});
        return code;
    };
    const plain = tape("function f(n: i32): i32 { let s = 0; for (let i = 0; i < n; i = i + 1) { s = s + i; } return s; }");
    const skip = tape("function f(n: i32): i32 { let s = 0; for (let i = 0; i < n; i = i + 1) { if (i === 2) { continue; } s = s + i; } return s; }");
    // After the loop's condition (eqz; br_if 1), the body: block void (2, 64) only in the second.
    const body = code => {
        const at = code.findIndex((cell, k) => cell === 69 && code[k + 1] === 13 && code[k + 2] === 1);
        return code.slice(at + 3, at + 5).join(",");
    };
    assert.equal(body(plain), "32,1");
    assert.equal(body(skip), "2,64");
    // The block and its end, and if (i === 2) { continue; }: get, const, eq, if, br 1, end.
    assert.equal(skip.length, plain.length + 3 + 10);
});

// ---- the conditional expression ----

// i32 trees with comparisons and ?: (and the exact operators & | ^), printed with minimal parentheses.
const PRECEDENCE = {"?:": 0, "|": 3, "^": 4, "&": 5, "<": 7, ">=": 7, "===": 6, "+": 9, "*": 10};
function conditionalTree(r, depth) {
    if (depth === 0 || r.below(4) === 0) return r.below(3) ? ["param", r.pick(["a", "b", "c"])] : ["literal", r.below(200) - 100];
    if (r.below(3) === 0) {
        const op = r.pick(["<", ">=", "==="]);
        return ["?:", ["binary", op, conditionalTree(r, depth - 1), conditionalTree(r, depth - 1)],
            conditionalTree(r, depth - 1), conditionalTree(r, depth - 1)];
    }
    return ["binary", r.pick(["|", "^", "&", "+", "*"]), conditionalTree(r, depth - 1), conditionalTree(r, depth - 1)];
}
function printConditional(t) {
    const level = t => t[0] === "?:" ? 0 : t[0] === "binary" ? PRECEDENCE[t[1]] : 20;
    const show = (child, needed) => needed ? "(" + printConditional(child) + ")" : printConditional(child);
    switch (t[0]) {
    case "param": return t[1];
    case "literal": return t[1] < 0 ? "(" + t[1] + ")" : String(t[1]);
    case "?:": // the condition binds tighter than ?: (a comparison); the arms are whole expressions, the else arm unparenthesized
        return show(t[1], level(t[1]) <= 0) + " ? " + show(t[2], false) + " : " + show(t[3], false);
    default: {
        const p = PRECEDENCE[t[1]];
        return show(t[2], level(t[2]) < p) + " " + t[1] + " " + show(t[3], level(t[3]) <= p);
    }
    }
}
function evaluateConditional(t, env) {
    switch (t[0]) {
    case "param": return env[t[1]];
    case "literal": return t[1];
    case "?:": return evaluateConditional(t[1], env) ? evaluateConditional(t[2], env) : evaluateConditional(t[3], env);
    default: {
        const x = evaluateConditional(t[2], env), y = evaluateConditional(t[3], env);
        switch (t[1]) {
        case "|": return x | y; case "^": return x ^ y; case "&": return x & y;
        case "+": return (x + y) | 0; case "*": return Math.imul(x, y);
        case "<": return x < y; case ">=": return x >= y; case "===": return x === y;
        }
    }
    }
}

test("generated conditional expressions agree in WebAssembly, RV32 under every policy and JavaScript", async () => {
    const r = random(0xc0ffee);
    const cases = [];
    while (cases.length < 200) {
        const t = conditionalTree(r, 1 + r.below(4));
        if (t[0] === "binary" && ["<", ">=", "==="].includes(t[1])) continue;
        cases.push({name: "c" + cases.length, tree: t, text: printConditional(t)});
    }
    const source = cases.map(c => `function ${c.name}(a: i32, b: i32, c: i32): i32 {\n    return ${c.text};\n}\n`).join("");
    const signatures = Object.fromEntries(cases.map(c => [c.name, {params: ["i32", "i32", "i32"], result: "i32"}]));
    const check = await differential(source, signatures);
    let javascript = 0;
    for (const c of cases) {
        for (let k = 0; k < 8; k++) {
            const env = {a: r.below(9) - 4, b: r.next() | 0, c: r.below(300) - 150};
            check(c.name, [env.a, env.b, env.c], evaluateConditional(c.tree, env));
        }
        // Without + and *, JavaScript's parser and operators are the oracle of the printed text's meaning.
        if (!/[+*]/.test(c.text)) {
            const env = {a: r.below(9) - 4, b: r.next() | 0, c: r.below(300) - 150};
            const js = new Function("a", "b", "c", "return (" + c.text + ") | 0;");
            assert.equal(js(env.a, env.b, env.c), evaluateConditional(c.tree, env) | 0, "JavaScript's parse of " + c.text);
            javascript++;
        }
    }
    assert(javascript > 20);
});

const CHOICES = `type Id = distinct i32;
enum Color { Red, Green, Blue }
function fsel(a: f32, b: f32, k: i32): f32 { return k > 0 ? a * b : k < -5 ? a - b : 0.5; }
function ids(a: Id, k: i32): Id { return k > 0 ? a : 7; }
function colors(k: i32): i32 { const c = k > 1 ? Color.Blue : k > 0 ? Color.Green : Color.Red; return i32(c); }
function flags(a: i32, b: i32): bool { return a > b ? a > 0 : b > 0; }
function nest(a: i32): i32 { return (a > 0 ? a : -a) + (a > 10 ? 1 : 2) * 3; }
function inloop(n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) { s = s + (i % 2 === 0 ? i : 0 - i); }
    return s;
}
`;

test("conditional expressions on f32, distinct, enum and bool values, nested and in loops", async () => {
    const check = await differential(CHOICES, {
        fsel: {params: ["f32", "f32", "i32"], result: "f32"}, ids: {params: ["i32", "i32"], result: "i32"},
        colors: {params: ["i32"], result: "i32"}, flags: {params: ["i32", "i32"], result: "i32"},
        nest: {params: ["i32"], result: "i32"}, inloop: {params: ["i32"], result: "i32"},
    });
    const r = random(31);
    for (let k = 0; k < 30; k++) {
        const a = Math.fround((r.below(2000) - 1000) / 7), b = Math.fround((r.below(2000) - 1000) / 13), n = r.below(21) - 10;
        check("fsel", [a, b, n], n > 0 ? Math.fround(a * b) : n < -5 ? Math.fround(a - b) : 0.5);
        check("ids", [n * 3, n], n > 0 ? n * 3 : 7);
        check("colors", [n], n > 1 ? 2 : n > 0 ? 1 : 0);
        check("flags", [n, k - 15], Number(n > k - 15 ? n > 0 : k - 15 > 0));
        check("nest", [n * 3], (Math.abs(n * 3)) + (n * 3 > 10 ? 1 : 2) * 3);
        let s = 0;
        for (let i = 0; i < k; i++) s += i % 2 === 0 ? i : -i;
        check("inloop", [k], s);
    }
});

// ---- u32 ----

// u32 trees over + - * / % & | ^ << >>> and the unsigned comparisons (as ?: conditions), with decimal literals below
// and above 2^31 and hex literals; a divisor is made non-zero with | 1.
const U32_OPS = ["+", "-", "*", "/", "%", "&", "|", "^", "<<", ">>>"];
const U32_PRECEDENCE = {"|": 3, "^": 4, "&": 5, "<<": 8, ">>>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10};
function u32Literal(r) {
    switch (r.below(4)) {
    case 0: { const v = r.below(40); return ["literal", String(v), v]; }
    case 1: { const v = 2147483648 + r.below(2147483647); return ["literal", String(v), v]; }
    case 2: { const v = r.next(); return ["literal", "0x" + v.toString(16), v]; }
    default: { const v = r.pick([1, 2, 3, 7, 8, 1024, 4294967295, 2147483648]); return ["literal", String(v), v]; }
    }
}
function u32Tree(r, depth) {
    if (depth === 0 || r.below(4) === 0) return r.below(3) ? ["param", r.pick(["a", "b", "c"])] : u32Literal(r);
    if (r.below(6) === 0) return ["~", u32Tree(r, depth - 1)];
    if (r.below(6) === 0)
        return ["?:", r.pick(["<", "<=", ">", ">=", "===", "!=="]), u32Tree(r, depth - 1), u32Tree(r, depth - 1),
            u32Tree(r, depth - 1), u32Tree(r, depth - 1)];
    return ["binary", r.pick(U32_OPS), u32Tree(r, depth - 1), u32Tree(r, depth - 1)];
}
function printU32(t) {
    switch (t[0]) {
    case "param": case "literal": return t[1];
    case "~": return "~(" + printU32(t[1]) + ")";
    case "?:": return "((" + printU32(t[2]) + ") " + t[1] + " (" + printU32(t[3]) + ") ? " + printU32(t[4]) + " : " + printU32(t[5]) + ")";
    default: {
        const right = t[1] === "/" || t[1] === "%" ? "(" + printU32(t[3]) + " | 1)" : "(" + printU32(t[3]) + ")";
        // A literal divided by a literal is signed (an i32): u32(...) makes the dividend unsigned.
        const left = t[1] === "/" || t[1] === "%" ? "u32(" + printU32(t[2]) + ")" : "(" + printU32(t[2]) + ")";
        return left + " " + t[1] + " " + right;
    }
    }
}
function evaluateU32(t, env) {
    switch (t[0]) {
    case "param": return env[t[1]];
    case "literal": return t[2] >>> 0;
    case "~": return ~evaluateU32(t[1], env) >>> 0;
    case "?:": {
        const x = evaluateU32(t[2], env), y = evaluateU32(t[3], env);
        const holds = {"<": x < y, "<=": x <= y, ">": x > y, ">=": x >= y, "===": x === y, "!==": x !== y}[t[1]];
        return holds ? evaluateU32(t[4], env) : evaluateU32(t[5], env);
    }
    default: {
        const x = evaluateU32(t[2], env), y = evaluateU32(t[3], env), d = (y | 1) >>> 0;
        switch (t[1]) {
        case "+": return (x + y) >>> 0; case "-": return (x - y) >>> 0; case "*": return Math.imul(x, y) >>> 0;
        case "/": return Math.floor(x / d) >>> 0; case "%": return (x % d) >>> 0;
        case "&": return (x & y) >>> 0; case "|": return (x | y) >>> 0; case "^": return (x ^ y) >>> 0;
        case "<<": return (x << (y & 31)) >>> 0; case ">>>": return x >>> (y & 31);
        }
    }
    }
}

test("generated u32 expressions agree in WebAssembly, RV32 under every policy and an unsigned model", async () => {
    const r = random(0x3232);
    const cases = Array.from({length: 240}, (_, i) => {
        const t = u32Tree(r, 1 + r.below(4));
        return {name: "x" + i, tree: t, text: printU32(t)};
    });
    const source = cases.map(c => `function ${c.name}(a: u32, b: u32, c: u32): u32 {\n    return ${c.text};\n}\n`).join("");
    const signatures = Object.fromEntries(cases.map(c => [c.name, {params: ["u32", "u32", "u32"], result: "u32"}]));
    const check = await differential(source, signatures);
    const input = () => r.pick([() => 0, () => 1, () => 0xffffffff, () => 0x80000000, () => 0x7fffffff, () => r.below(100),
        () => r.next(), () => r.next()])();
    for (const c of cases) for (let k = 0; k < 10; k++) {
        const env = {a: input(), b: input(), c: input()};
        check(c.name, [env.a | 0, env.b | 0, env.c | 0], evaluateU32(c.tree, env));
    }
});

const U32_PROGRAMS = `record Box { n: u32; w: i32; }
function toF(a: u32): f32 { return f32(a); }
function fromF(x: f32): u32 { return u32(x); }
function bitsOf(a: u32): i32 { return i32(a); }
function ofBits(a: i32): u32 { return u32(a); }
function smaller(a: u32, b: u32): u32 { return Math.min(a, b) + Math.max(a, 5) - Math.min(7, b); }
function field(box: Box): u32 { box.n = box.n / 3 + 4000000000; return box.n % 1000; }
function pcg(v: u32): u32 {
    const st = v * 747796405 + 2891336453;
    const w = ((st >>> ((st >>> 28) + 4)) ^ st) * 277803737;
    return (w >>> 22) ^ w;
}
function shifts(a: u32, n: i32): u32 { return a << n >>> 3; }
function counts(a: u32): i32 {
    let n = 0;
    let x = a;
    while (x !== 0) { n = n + i32(x & 1); x = x >>> 1; }
    return n;
}
`;

test("u32 conversions, records, Math.min and max, pcg and loops", async () => {
    const check = await differential(U32_PROGRAMS, {
        toF: {params: ["u32"], result: "f32"}, fromF: {params: ["f32"], result: "u32"}, bitsOf: {params: ["u32"], result: "i32"},
        ofBits: {params: ["i32"], result: "u32"}, smaller: {params: ["u32", "u32"], result: "u32"},
        pcg: {params: ["u32"], result: "u32"}, shifts: {params: ["u32", "i32"], result: "u32"}, counts: {params: ["u32"], result: "i32"},
    });
    const r = random(0x5157);
    const u = () => r.pick([0, 1, 5, 7, 0x7fffffff, 0x80000000, 0xffffffff, r.next(), r.next()]);
    for (let k = 0; k < 60; k++) {
        const a = u(), b = u();
        check("toF", [a | 0], Math.fround(a));
        check("bitsOf", [a | 0], a | 0);
        check("ofBits", [a | 0], a);
        check("smaller", [a | 0, b | 0], (Math.min(a, b) + Math.max(a, 5) - Math.min(7, b)) >>> 0);
        const st = (Math.imul(a, 747796405) + 2891336453) >>> 0;
        const w = Math.imul(((st >>> ((st >>> 28) + 4)) ^ st) >>> 0, 277803737) >>> 0;
        check("pcg", [a | 0], ((w >>> 22) ^ w) >>> 0);
        const n = r.below(40);
        check("shifts", [a | 0, n], ((a << (n & 31)) >>> 0) >>> 3);
        let ones = 0;
        for (let x = a; x; x >>>= 1) ones += x & 1;
        check("counts", [a | 0], ones);
    }
    // f32 -> u32 truncates and saturates; NaN gives 2^32 - 1 (fcvt.wu.s).
    for (const [x, expected] of [[0.5, 0], [-0.5, 0], [-7, 0], [3.9, 3], [4294967040, 4294967040], [5e9, 4294967295],
        [-Infinity, 0], [Infinity, 4294967295], [NaN, 4294967295], [2147483648, 2147483648]])
        check("fromF", [x], expected);
    // A u32 record field.
    const memory = new Uint8Array(64), view = new DataView(memory.buffer);
    const wasmModule = await WebAssembly.instantiate(typedWasm.compile(U32_PROGRAMS).bytes);
    for (const n of [0, 7, 0xffffffff, 3000000000]) {
        view.setUint32(16, n, true);
        const expected = ((Math.floor(n / 3) + 4000000000) >>> 0) % 1000;
        new Uint8Array(wasmModule.instance.exports.memory.buffer).set(memory);
        assert.equal(wasmModule.instance.exports.field(16) >>> 0, expected);
        for (const policy of POLICIES) {
            const program = typedRv32.compile(U32_PROGRAMS, [], 1 << 20, {policy});
            const run = typedRv32Interp.run(program, "field", [16], memory.slice());
            assert.equal(run.result >>> 0, expected, policy + " field(" + n + ")");
            assert.equal(new DataView(run.bytes.buffer, run.bytes.byteOffset).getUint32(16, true), (Math.floor(n / 3) + 4000000000) >>> 0);
        }
    }
});

test("RV32 lowers u32 comparisons to sltu and fused bltu/bgeu, division to divu/remu or a shift", () => {
    const source = `function lt(a: u32, b: u32): bool { return a < b; }
function le(a: u32, b: u32): bool { return a <= b; }
function branch(a: u32, b: u32): i32 { if (a > b) { return 1; } return 2; }
function imm(a: u32): bool { return a < 100; }
function div(a: u32, b: u32): u32 { return a / b + a % b; }
function pow2(a: u32): u32 { return a / 8 + a % 16; }
`;
    const program = typedRv32.compile(source, [], 1 << 20, {policy: "default"});
    const r = w => (w & 127) === 0x33, i = w => (w & 127) === 0x13, b = w => (w & 127) === 0x63;
    const f3 = w => (w >>> 12) & 7, f7 = w => w >>> 25;
    assert(words(program, "lt").some(w => r(w) && f3(w) === 3 && f7(w) === 0), "sltu");
    assert(words(program, "le").some(w => r(w) && f3(w) === 3) && words(program, "le").some(w => i(w) && f3(w) === 4), "sltu, xori");
    assert(words(program, "branch").some(w => b(w) && (f3(w) === 6 || f3(w) === 7)), "bltu or bgeu");
    assert(words(program, "imm").some(w => i(w) && f3(w) === 3 && (w >> 20) === 100), "sltiu 100");
    assert(words(program, "div").some(w => r(w) && f7(w) === 1 && f3(w) === 5), "divu");
    assert(words(program, "div").some(w => r(w) && f7(w) === 1 && f3(w) === 7), "remu");
    const p = words(program, "pow2");
    assert(!p.some(w => r(w) && f7(w) === 1), "no divide by a power of two");
    assert(p.some(w => i(w) && f3(w) === 5 && (w >>> 20) === 3) && p.some(w => i(w) && f3(w) === 7 && (w >> 20) === 15), "srli 3, andi 15");
});

test("the language rules of continue, ?: and u32", async () => {
    const compile = body => typedWasm.compile("type Id = distinct i32;\nfunction f(a: i32, b: u32, x: f32, g: Id): i32 { " + body + " }");
    const run = async (body, ...args) => (await WebAssembly.instantiate(compile(body).bytes)).instance.exports.f(...args);
    // ?: is right-associative and looser than || (JavaScript's grammar).
    assert.equal(await run("return a > 0 ? 1 : a < 0 ? 2 : 3;", -5, 0, 0, 0), 2);
    assert.equal(await run("return a > 0 || a < -10 ? 1 : 0;", -20, 0, 0, 0), 1);
    assert.equal(await run("return (a > 0 ? 10 : 20) + 1;", 1, 0, 0, 0), 11);
    // A literal takes the other arm's type; a decimal literal above 2^31 - 1 is a u32.
    assert.equal(await run("const c: u32 = a > 0 ? b : 3000000000; return i32(c >>> 28);", 0, 0, 0, 0), 11);
    assert.equal(await run("const c = 4294967295; return i32(c / 2);", 0, 0, 0, 0), 2147483647);
    assert.equal(await run("return i32(b >>> 1);", 0, -1, 0, 0), 2147483647);
    assert.equal(await run("return i32(~b);", 0, 0, 0, 0), -1);
    const fails = (body, pattern) => assert.throws(() => compile(body), pattern, body);
    fails("continue; return 0;", /continue outside a loop/);
    fails("return a > 0 ? 1 : 1.0;", /conditional arms have different types: i32 and f32/);
    fails("return a > 0 ? x : 1;", /conditional arms have different types: f32 and i32/);
    fails("return a ? 1 : 2;", /expected bool, got i32/);
    fails("return a > 0 ? g : a;", /conditional arms have different types: Id and i32/);
    fails("return i32(b >> 1);", /operator >> is not defined on u32; use >>>/);
    fails("return i32(b + a);", /expected u32, got i32/);
    fails("return a + i32(b) + b;", /expected i32, got u32/);
    fails("return 3000000000;", /i32 literal out of range/);
    fails("return a < 3000000000 ? 1 : 0;", /i32 literal out of range/);
    fails("return 4294967296;", /integer literal out of range/);
    fails("return i32(-b);", /expected i32, got u32/);
    fails("return i32(u32(true));", /u32 conversion requires an integer or an f32, got bool/);
    fails("const continue = 1; return 0;", /expected identifier/);
});
