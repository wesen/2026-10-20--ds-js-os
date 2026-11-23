// Bitwise operators and hex literals (PICOCALC-TYPED-BITWISE): generated expressions over random inputs, compiled to
// WebAssembly (run in Node) and to RV32 under every policy (run on the reference interpreter), against JavaScript's
// own i32 semantics; Candela's pcgH; the language rules.
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

// A deterministic generator (xorshift32), so a failure names a reproducible seed.
function random(seed) {
    let s = seed | 0 || 1;
    const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
    return {next, below: n => next() % n, pick: list => list[next() % list.length]};
}

// JavaScript's binary precedences, which Typed follows.
const BINARY = {"|": 3, "^": 4, "&": 5, "<<": 8, ">>": 8, ">>>": 8, "+": 9, "-": 9, "*": 10};
const I32 = {
    "|": (x, y) => x | y, "^": (x, y) => x ^ y, "&": (x, y) => x & y,
    "<<": (x, y) => x << y, ">>": (x, y) => x >> y, ">>>": (x, y) => (x >>> y) | 0,
    "+": (x, y) => (x + y) | 0, "-": (x, y) => (x - y) | 0, "*": Math.imul,
};
const PARAMS = ["a", "b", "c"];

// A tree is ["param", name] | ["literal", text, value] | ["unary", op, tree] | ["binary", op, left, right].
function literal(r) {
    switch (r.below(5)) {
    case 0: { const v = r.below(33); return ["literal", String(v), v]; }                  // shift counts, small masks
    case 1: { const v = r.below(2048); return ["literal", String(v), v]; }                // the immediate range
    case 2: { const v = r.next() >>> 1; return ["literal", String(v), v]; }               // a large decimal
    case 3: { const v = r.next(); return ["literal", "0x" + v.toString(16), v | 0]; }     // any 32 bits, wrapped
    default: {
        const v = r.pick([0xff, 0xffff, 0x7ff, 0x800, 0x7fffffff, 0x80000000, 0xffffffff, 1, 31, 32]);
        const hex = r.below(2) ? "0x" + v.toString(16) : "0X" + v.toString(16).toUpperCase();
        return ["literal", v > 0x7fffffff || r.below(2) ? hex : String(v), v | 0];
    }
    }
}

function tree(r, depth) {
    if (depth === 0 || r.below(5) === 0) return r.below(3) ? ["param", r.pick(PARAMS)] : literal(r);
    if (r.below(7) === 0) return ["unary", r.pick(["~", "-"]), tree(r, depth - 1)];
    return ["binary", r.pick(Object.keys(BINARY)), tree(r, depth - 1), tree(r, depth - 1)];
}

// Minimal parentheses: a binary operand is parenthesized only where JavaScript's precedence (left associative)
// requires it, so the parser's precedence is under test; an operand of a prefix operator that is not a leaf is.
function print(t, r) {
    if (t[0] === "param" || t[0] === "literal") return t[1];
    if (t[0] === "unary") {
        const inner = print(t[2], r);
        return t[1] + (t[2][0] === "param" || t[2][0] === "literal" ? inner : "(" + inner + ")");
    }
    const [, op, left, right] = t, p = BINARY[op];
    const wrap = (child, needed) => {
        const text = print(child, r);
        return needed || r.below(8) === 0 ? "(" + text + ")" : text;
    };
    const l = wrap(left, left[0] === "binary" && BINARY[left[1]] < p);
    const rt = wrap(right, right[0] === "binary" && BINARY[right[1]] <= p);
    return l + " " + op + " " + rt;
}

function evaluate(t, env) {
    switch (t[0]) {
    case "param": return env[t[1]];
    case "literal": return t[2];
    case "unary": { const x = evaluate(t[2], env); return t[1] === "~" ? ~x : (-x) | 0; }
    default: return I32[t[1]](evaluate(t[2], env), evaluate(t[3], env));
    }
}

function input(r) {
    return r.pick([() => 0, () => -1, () => 1, () => -2147483648, () => 2147483647, () => r.below(64) - 32,
        () => r.next() | 0, () => r.next() | 0])();
}

const POLICIES = ["stock", "interactive", "balanced", "default", "kernel"];

test("generated bitwise expressions agree in WebAssembly, RV32 under every policy and JavaScript", async () => {
    const {typedWasm, typedRv32, typedRv32Interp} = realm();
    const r = random(0x5eed1234);
    const cases = [];
    for (let i = 0; i < 300; i++) {
        const t = tree(r, 1 + r.below(5));
        cases.push({name: "e" + i, tree: t, text: print(t, r)});
    }
    const source = cases.map(c => `function ${c.name}(a: i32, b: i32, c: i32): i32 {\n    return ${c.text};\n}\n`).join("");
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(source).bytes)).instance.exports;
    const images = POLICIES.map(policy => [policy, typedRv32.compile(source, [], 1 << 20, {policy})]);
    const memory = new Uint8Array(64);
    let checked = 0;
    for (const c of cases) {
        for (let k = 0; k < 12; k++) {
            const env = {a: input(r), b: input(r), c: input(r)};
            const args = [env.a, env.b, env.c];
            const expected = evaluate(c.tree, env);
            const where = `${c.name}(${args}) = ${c.text}`;
            assert.equal(wasm[c.name](...args), expected, "Wasm " + where);
            for (const [policy, program] of images)
                assert.equal(typedRv32Interp.run(program, c.name, args, memory).result, expected, policy + " " + where);
            checked++;
        }
        // Without + - *, JavaScript's own parser and operators are the oracle (all of them are exact on i32).
        if (!/[-+*]/.test(c.text.replace(/>>>|>>/g, ""))) {
            const js = new Function("a", "b", "c", "return (" + c.text + ") | 0;");
            const env = {a: input(r), b: input(r), c: input(r)};
            assert.equal(js(env.a, env.b, env.c), evaluate(c.tree, env), "JavaScript's parse of " + c.text);
        }
    }
    assert.equal(checked, 3600);
});

// Statements around the operators: locals the value-set pass folds, a loop the hoist and loop passes see, ranges
// from & and >>> that make a division by a constant non-negative, buffers.
const STATEMENTS = `function fnv(work: buffer, n: i32): i32 {
    let h = 0x811c9dc5;
    for (let i = 0; i < n; i = i + 1) {
        h = (h ^ work.charCodeAt(i)) * 16777619;
    }
    return h >>> 0;
}
function sets(a: i32): i32 {
    let k = 3;
    if (a > 0) { k = 0x70; }
    if (a > 100) { k = 0xff00; }
    return (k << 2) | (k >>> 1) ^ 0xf0f0;
}
function ranged(a: i32, d: i32): i32 {
    const low = a & 1023;
    const high = a >>> 20;
    return low / 8 + low % 8 + high / 3 + high % 5 + (a & 0x7fff) / d;
}
function masks(out: buffer, a: i32): i32 {
    for (let i = 0; i < 8; i = i + 1) {
        out.setCharCodeAt(i, (a >>> (4 * i)) & 15 | 0x30);
    }
    return ~a & 0xffff ^ 1 << 15;
}
function loop(a: i32, n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        const m = a & 0xff;
        s = s + (i & m) + (i | 3) - (i ^ m) + (m << 1);
    }
    return s;
}
`;

function statementsReference(name, args, bytes) {
    const [a, b] = args;
    switch (name) {
    case "fnv": {
        let h = 0x811c9dc5 | 0;
        for (let i = 0; i < b; i++) h = Math.imul(h ^ new DataView(bytes.buffer).getUint16(a + 4 + 2 * i, true), 16777619);
        return h >>> 0 | 0;
    }
    case "sets": { const k = a > 100 ? 0xff00 : a > 0 ? 0x70 : 3; return (k << 2) | (k >>> 1) ^ 0xf0f0; }
    case "ranged": {
        const low = a & 1023, high = a >>> 20;
        return (((low / 8) | 0) + low % 8 + ((high / 3) | 0) + high % 5 + (((a & 0x7fff) / b) | 0)) | 0;
    }
    case "masks": return ~a & 0xffff ^ 1 << 15;
    case "loop": {
        let s = 0;
        const m = a & 0xff;
        for (let i = 0; i < b; i++) s = (s + (i & m) + (i | 3) - (i ^ m) + (m << 1)) | 0;
        return s;
    }
    }
}

test("bitwise statements agree with JavaScript in WebAssembly and RV32 under every policy", async () => {
    const {typedWasm, typedRv32, typedRv32Interp} = realm();
    const r = random(77);
    const buffer = 256, cells = 40;
    const fresh = () => {
        const bytes = new Uint8Array(1024), view = new DataView(bytes.buffer);
        view.setUint32(buffer, cells, true);
        for (let i = 0; i < cells; i++) view.setUint16(buffer + 4 + 2 * i, (i * 7919) & 0xffff, true);
        return bytes;
    };
    const module = await WebAssembly.instantiate(typedWasm.compile(STATEMENTS).bytes);
    const wasm = module.instance.exports;
    const images = POLICIES.map(policy => [policy, typedRv32.compile(STATEMENTS, [], 1 << 20, {policy})]);
    for (let k = 0; k < 40; k++) {
        const a = input(r);
        const calls = {
            fnv: [buffer, r.below(cells + 1)], sets: [[a, 50, 500, -7][k % 4]], ranged: [a, 1 + r.below(100)],
            masks: [buffer, a], loop: [a, r.below(20)],
        };
        for (const [name, args] of Object.entries(calls)) {
            const bytes = fresh();
            const expected = name === "masks" ? ~a & 0xffff ^ 1 << 15 : statementsReference(name, args, bytes);
            new Uint8Array(wasm.memory.buffer).set(bytes);
            assert.equal(wasm[name](...args), expected, `Wasm ${name}(${args})`);
            const wasmBytes = new Uint8Array(wasm.memory.buffer).slice(0, bytes.length);
            for (const [policy, program] of images) {
                const run = typedRv32Interp.run(program, name, args, fresh());
                assert.equal(run.result, expected, `${policy} ${name}(${args})`);
                assert.deepEqual(Array.from(run.bytes), Array.from(wasmBytes), `${policy} ${name} memory`);
            }
            if (name === "masks") for (let i = 0; i < 8; i++)
                assert.equal(new DataView(wasmBytes.buffer).getUint16(buffer + 4 + 2 * i, true), ((a >>> (4 * i)) & 15) | 0x30);
        }
    }
});

// Candela's random-number hash (firmware/third_party/candela/kernel/cdl_kernel.cpp), u32 arithmetic in Typed's i32:
// the C's unsigned >> is >>>; 2891336453u is a hex literal above 0x7fffffff.
const PCG = `function pcgH(v: i32): i32 {
    const st = v * 747796405 + 0xac564b05;
    const w = ((st >>> ((st >>> 28) + 4)) ^ st) * 277803737;
    return (w >>> 22) ^ w;
}
function rndBits(state: i32): i32 {
    return pcgH(state) >>> 8;
}
`;

// The C source's pcgH, transcribed: u32 multiply and add wrap, >> on u32 is logical.
function pcgReference(v) {
    const st = (Math.imul(v, 747796405) + 2891336453) >>> 0;
    const w = Math.imul(((st >>> ((st >>> 28) + 4)) ^ st) >>> 0, 277803737) >>> 0;
    return ((w >>> 22) ^ w) >>> 0;
}

test("a Typed pcgH equals Candela's on 10,000 inputs", async () => {
    const source = readFileSync(new URL("../../firmware/third_party/candela/kernel/cdl_kernel.cpp", import.meta.url), "utf8");
    // The transcription is of this exact C text.
    assert(source.includes(`static u32 pcgH(u32 v) {
  const u32 st = v * 747796405u + 2891336453u;
  const u32 w = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u;
  return (w >> 22u) ^ w;
}`));
    assert.equal(0xac564b05, 2891336453);
    const {typedWasm, typedRv32, typedRv32Interp} = realm();
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(PCG).bytes)).instance.exports;
    const images = ["stock", "kernel"].map(policy => [policy, typedRv32.compile(PCG, [], 1 << 20, {policy})]);
    const memory = new Uint8Array(64);
    const r = random(4242);
    let state = 1;
    for (let i = 0; i < 10000; i++) {
        // Half chained like rnd() (rngS = pcgH(rngS)), half arbitrary.
        const v = i % 2 ? state : r.next() | 0;
        const expected = pcgReference(v) | 0;
        assert.equal(wasm.pcgH(v), expected, "Wasm pcgH(" + v + ")");
        for (const [policy, program] of images)
            assert.equal(typedRv32Interp.run(program, "pcgH", [v], memory).result, expected, policy + " pcgH(" + v + ")");
        if (i % 100 === 0) assert.equal(wasm.rndBits(v), pcgReference(v) >>> 8);
        if (i % 2) state = expected;
    }
});

test("RV32 lowers a literal operand to an immediate form and a variable count to a register shift", () => {
    const {typedRv32} = realm();
    const source = `function imm(a: i32): i32 { return ~(a & 255 | 0x700); }
function left(a: i32): i32 { return 0xff & a; }
function shifts(a: i32, n: i32): i32 { return (a << n) + (a >> n) + (a >>> n) + (a >>> 3); }
function wide(a: i32): i32 { return a & 0x12345; }
`;
    const program = typedRv32.compile(source, [], 1 << 20, {policy: "default"});
    const ops = name => words(program, name).filter(w => (w & 127) === 0x13 || (w & 127) === 0x33)
        .map(w => ((w & 127) === 0x13 ? "i" : "r") + ((w >>> 12) & 7) + ((w & 127) === 0x33 || ((w >>> 12) & 3) === 1 ? ":" + (w >>> 25) : ""));
    // andi 255, ori 0x700, xori -1 (~x is x ^ -1; a written -1 is 0 - 1, not a literal).
    assert.deepEqual(ops("imm").filter(op => op[0] === "i" && ["7", "6", "4"].includes(op[1])).slice(0, 3), ["i7", "i6", "i4"]);
    assert(!ops("imm").some(op => op.startsWith("r7") || op.startsWith("r6") || op.startsWith("r4")));
    // The commute pass moves the literal to the right: andi.
    assert(ops("left").includes("i7"));
    // sll, sra (funct7 0x20), srl, srli 3.
    const s = ops("shifts");
    assert(s.includes("r1:0") && s.includes("r5:32") && s.includes("r5:0") && s.includes("i5:0"), s.join(" "));
    // 0x12345 does not fit 12 bits: the register form.
    assert(ops("wide").includes("r7:0"));
});

test("the language rules: precedence, hex literals, distinct types, errors", async () => {
    const {typedWasm} = realm();
    const head = "type Flags = distinct i32;\nenum Side { Left = 0x10, Right = 0xffffffff }\n";
    const compile = body => typedWasm.compile(head + "function f(a: i32, b: i32, g: Flags): i32 { " + body + " }");
    const run = async (body, ...args) => (await WebAssembly.instantiate(compile(body).bytes)).instance.exports.f(...args);
    // JavaScript's precedences: | below ^ below & below equality; shifts below + and -; prefix operators tightest.
    assert.equal(await run("return 1 | 6 ^ 3 & 5;"), 1 | 6 ^ 3 & 5);
    assert.equal(await run("return a + b << 2;", 1, 2), 12);
    assert.equal(await run("return -a >>> 28;", 1), 15);
    assert.equal(await run("return ~a & 0xff;", 0x0f), 0xf0);
    assert.equal(await run("if ((a & 1) === 1 && a >> 1 === 2) { return 1; } return 0;", 5), 1);
    // Hex literals: 1 to 8 digits, either case; above 0x7fffffff they wrap to a negative i32.
    assert.equal(await run("return 0xFFFFFFFF;"), -1);
    assert.equal(await run("return 0x80000000;"), -2147483648);
    assert.equal(await run("return -0x80000000;"), -2147483648);
    assert.equal(await run("return 0Xab + 0x0;"), 0xab);
    assert.equal(await run("return i32(Side.Right) + i32(Side.Left);"), 15);
    // A distinct integer keeps its type through | ^ & with itself or a literal; shifts take i32.
    assert.equal(await run("const h: Flags = g | 4; return i32(h & 0xf ^ g);", 0, 0, 3), 4);
    const fails = (body, pattern) => assert.throws(() => compile(body), pattern, body);
    fails("return 0x;", /invalid hex literal 0x/);
    fails("return 0x123456789;", /invalid hex literal/);
    fails("return 0xfg;", /invalid hex literal/);
    fails("return 2147483648;", /i32 literal out of range/);
    fails("if (a & 1 === 1) { return 1; } return 0;", /expected i32, got bool/);
    fails("return i32(g << 1);", /expected i32, got Flags/);
    fails("return a & g;", /expected i32, got Flags/);
    fails("return i32(~g);", /expected i32, got Flags/);
    fails("return a & true;", /expected i32, got bool/);
});
