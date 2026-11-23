// PICOCALC-TYPED-VALUES, part three: local arrays (`new Int32Array(n)`, `new Uint32Array(n)`, `new Float32Array(n)`),
// WebAssembly, RV32 under every policy and a JavaScript model.
import test from "node:test";
import assert from "node:assert/strict";
import {differential, random, typedRv32, typedWasm, typedRv32Interp} from "./values-helpers.mjs";
import {words} from "./rv32-helpers.mjs";

const fr = Math.fround;

const PROGRAMS = `function sieve(n: i32): i32 {
    const marks = new Int32Array(64);
    let count = 0;
    for (let i = 2; i < n; i = i + 1) {
        if (marks[i] === 1) { continue; }
        count = count + 1;
        for (let j = i * i; j < n; j = j + i) { marks[j] = 1; }
    }
    return count * 100 + marks.length;
}
// A depth-first walk of the implicit tree 1..n (children 2k and 2k + 1) with an explicit stack, like a BVH traversal.
function walk(n: i32, skip: i32): i32 {
    const stack = new Int32Array(48);
    let sp = 0;
    let sum = 0;
    stack[sp] = 1;
    sp = sp + 1;
    while (sp > 0) {
        sp = sp - 1;
        const node = stack[sp];
        if (node % skip === 0) { continue; }
        sum = sum + node;
        if (2 * node <= n) { stack[sp] = 2 * node; sp = sp + 1; }
        if (2 * node + 1 <= n) { stack[sp] = 2 * node + 1; sp = sp + 1; }
    }
    return sum;
}
function window(n: i32, x: f32): f32 {
    const ring = new Float32Array(8);
    let at = 0;
    let best = 0.0;
    for (let i = 0; i < n; i = i + 1) {
        ring[at] = x * f32(i % 5) - f32(i);
        at = (at + 1) & 7;
        let s = 0.0;
        for (let k = 0; k < ring.length; k = k + 1) { s = s + ring[k]; }
        best = Math.max(best, s * 0.125);
    }
    return best + ring[0] + ring[7];
}
function sortBits(seed: u32): u32 {
    const a = new Uint32Array(16);
    let s = seed;
    for (let i = 0; i < 16; i = i + 1) {
        s = s ^ (s << 13);
        s = s ^ (s >>> 17);
        s = s ^ (s << 5);
        a[i] = s;
    }
    for (let i = 1; i < 16; i = i + 1) {
        const v = a[i];
        let j = i - 1;
        while (j >= 0 && a[u32(j) & 15] > v) { a[j + 1] = a[j]; j = j - 1; }
        a[j + 1] = v;
    }
    return a[0] / 65536 + a[15] % 1000 + a[7] - a[8] / 2;
}
`;

function sieveModel(n) {
    const marks = new Int32Array(64);
    let count = 0;
    for (let i = 2; i < n; i++) {
        if (marks[i] === 1) continue;
        count++;
        for (let j = i * i; j < n; j += i) marks[j] = 1;
    }
    return count * 100 + 64;
}
function walkModel(n, skip) {
    const stack = [1];
    let sum = 0;
    while (stack.length) {
        const node = stack.pop();
        if (node % skip === 0) continue;
        sum += node;
        if (2 * node <= n) stack.push(2 * node);
        if (2 * node + 1 <= n) stack.push(2 * node + 1);
    }
    return sum;
}
function windowModel(n, x) {
    const ring = new Float32Array(8);
    let at = 0, best = 0;
    for (let i = 0; i < n; i++) {
        ring[at] = fr(fr(x * (i % 5)) - i);
        at = (at + 1) & 7;
        let s = 0;
        for (let k = 0; k < 8; k++) s = fr(s + ring[k]);
        best = Math.max(best, fr(s * 0.125));
    }
    return fr(fr(best + ring[0]) + ring[7]);
}
function sortBitsModel(seed) {
    const a = new Uint32Array(16);
    let s = seed >>> 0;
    for (let i = 0; i < 16; i++) {
        s = (s ^ (s << 13)) >>> 0;
        s = (s ^ (s >>> 17)) >>> 0;
        s = (s ^ (s << 5)) >>> 0;
        a[i] = s;
    }
    a.sort();
    return (Math.floor(a[0] / 65536) + a[15] % 1000 + a[7] - Math.floor(a[8] / 2)) >>> 0;
}

test("local arrays: a sieve, a traversal stack, a ring of f32 and an insertion sort of u32", async () => {
    const check = await differential(PROGRAMS, {
        sieve: {params: ["i32"], result: "i32"}, walk: {params: ["i32", "i32"], result: "i32"},
        window: {params: ["i32", "f32"], result: "f32"}, sortBits: {params: ["u32"], result: "u32"},
    });
    for (const n of [0, 2, 3, 17, 50, 64]) check("sieve", [n], sieveModel(n));
    for (const n of [1, 2, 7, 40, 300, 1000]) for (const skip of [3, 7, 1000000]) check("walk", [n, skip], walkModel(n, skip));
    const r = random(0xa77a);
    for (let k = 0; k < 30; k++) {
        const x = fr((r.below(2001) - 1000) / 37);
        check("window", [k, x], windowModel(k, x));
        const seed = r.next() | 1;
        check("sortBits", [seed], sortBitsModel(seed));
    }
});

// Arrays beside the rest of a frame: an outgoing stack-argument area, stack parameters, a large frame, a callee with
// its own arrays, an array declared in a loop (zeroed on every iteration) and one of 40 words (zeroed by a loop).
const FRAMES = `value record P { a: i32; b: i32; }
function many(a: i32, b: i32, c: i32, d: i32, e: i32, f: i32, g: i32, h: i32, i: i32, j: i32): i32 {
    const t = new Int32Array(3);
    t[0] = i; t[1] = j; t[2] = a + h;
    return t[0] * 100 + t[1] * 10 + t[2];
}
function inner(k: i32): i32 {
    const own = new Int32Array(5);
    for (let i = 0; i < 5; i = i + 1) { own[i] = k + i; }
    return own[k % 5];
}
function outer(n: i32): i32 {
    const mine = new Int32Array(5);
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        mine[i % 5] = mine[i % 5] + inner(i) + many(i, 1, 2, 3, 4, 5, 6, 7, 8, 9);
        const fresh = new Int32Array(4);
        fresh[i & 3] = i;
        s = s + fresh[0] + fresh[1] + fresh[2] + fresh[3];
        const p = P(i, i & 3);
        s = s + mine[p.b];
    }
    const big = new Int32Array(40);
    big[39] = s;
    return big[39] + big[0] + mine[0] + mine[4];
}
function large(n: i32): i32 {
    const a = new Int32Array(300);
    for (let i = 0; i < 300; i = i + 1) { a[i] = i * n; }
    let s = 0;
    for (let i = 0; i < 300; i = i + 3) { s = s + a[i]; }
    return s + a[299];
}
`;

function framesModel(n) {
    const many = (a, b, c, d, e, f, g, h, i, j) => i * 100 + j * 10 + a + h;
    const inner = k => [k, k + 1, k + 2, k + 3, k + 4][k % 5];
    const mine = new Int32Array(5);
    let s = 0;
    for (let i = 0; i < n; i++) {
        mine[i % 5] = mine[i % 5] + inner(i) + many(i, 1, 2, 3, 4, 5, 6, 7, 8, 9);
        s += i;
        s += mine[i & 3];
    }
    return s + mine[0] + mine[4];
}

test("local arrays with stack arguments, a large frame, callee arrays, a declaration in a loop and a zeroing loop", async () => {
    const check = await differential(FRAMES, {outer: {params: ["i32"], result: "i32"}, large: {params: ["i32"], result: "i32"}});
    for (const n of [0, 1, 4, 9, 23]) check("outer", [n], framesModel(n));
    for (const n of [0, 1, -3, 7]) {
        let s = 0;
        for (let i = 0; i < 300; i += 3) s += i * n;
        check("large", [n], s + 299 * n);
    }
});

test("an index outside an array traps on both targets; a literal one is a compile error", async () => {
    const source = `function get(i: i32): i32 {
    const a = new Int32Array(4);
    a[3] = 7;
    return a[i];
}
function put(i: u32, x: f32): f32 {
    const a = new Float32Array(10);
    a[i] = x;
    return a[9];
}
`;
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(source).bytes)).instance.exports;
    for (const policy of ["stock", "interactive", "balanced", "default", "kernel"]) {
        const program = typedRv32.compile(source, [], 1 << 20, {policy});
        for (const i of [4, -1, 1 << 30]) {
            assert.throws(() => wasm.get(i), /unreachable/);
            assert(typedRv32Interp.run(program, "get", [i], new Uint8Array(64)).trap, policy + " get(" + i + ")");
        }
        assert.equal(typedRv32Interp.run(program, "get", [3], new Uint8Array(64)).result, 7);
        assert(typedRv32Interp.run(program, "put", [10], new Uint8Array(64)).trap, policy + " put(10)");
    }
    assert.equal(wasm.get(3), 7);
    assert.throws(() => wasm.put(10, 1.5), /unreachable/);
    assert.equal(wasm.put(9, 1.5), 1.5);
    const fails = (body, pattern) => assert.throws(() => typedWasm.compile("function f(i: i32, x: f32): i32 { " + body + " }"),
        pattern, body);
    fails("const a = new Int32Array(4); return a[4];", /array index 4 out of range for length 4/);
    fails("const a = new Int32Array(4); return a[0x7fffffff];", /array index 2147483647 out of range/);
    fails("const a = new Int8Array(4); return 0;", /expected Int32Array, Uint32Array or Float32Array after new/);
    fails("const a = new Int32Array(0); return 0;", /an array's length is an integer literal from 1 to 1024/);
    fails("const a = new Int32Array(1025); return 0;", /from 1 to 1024/);
    fails("const a = new Int32Array(i); return 0;", /an array's length is an integer literal/);
    fails("const a = new Int32Array(4); const b = new Int32Array(4); a = b; return 0;", /an array is not assignable/);
    fails("const a = new Int32Array(4); return a;", /an array is not a value/);
    fails("const a = new Int32Array(4); return a.size;", /an array has only .length/);
    fails("const a = new Int32Array(4); return a[x];", /an array index is an i32 or a u32, got f32/);
    fails("const a = new Float32Array(4); a[0] = 1; return 0;", /expected f32/);
    fails("const a = new Int32Array(4); const a = new Int32Array(2); return 0;", /duplicate local a/);
    fails("let new = 1; return 0;", /expected identifier/);
    assert.equal(typedWasm.compile("function f(): i32 { const a = new Uint32Array(2); a[1] = 3000000000; return i32(a[1] / 2); }")
        .signatures[0].name, "f");
});

test("RV32: a literal index is one addi and a load; a variable index is checked; zeroing is stores or a loop", () => {
    const source = `function fixed(x: i32): i32 {
    const a = new Int32Array(4);
    a[2] = x;
    return a[2] + a[1];
}
function varying(i: i32): i32 {
    const a = new Int32Array(30);
    return a[i];
}
`;
    const program = typedRv32.compile(source, [], 1 << 20, {policy: "default"});
    const fixed = words(program, "fixed"), varying = words(program, "varying");
    const opcode = w => w & 127, funct3 = w => (w >>> 12) & 7, rs1 = w => (w >>> 15) & 31, rs2 = w => (w >>> 20) & 31;
    // Four sw zero, (sp): the declaration of four words.
    assert.equal(fixed.filter(w => opcode(w) === 0x23 && rs2(w) === 0 && rs1(w) === 2).length, 4);
    // No branch: no check.
    assert(!fixed.some(w => opcode(w) === 0x63), fixed.map(w => w.toString(16)).join(" "));
    // 30 words: a loop (a bne back over sw zero and addi).
    const loop = varying.findIndex(w => opcode(w) === 0x63 && funct3(w) === 1);
    assert(loop >= 2 && opcode(varying[loop - 2]) === 0x23 && rs2(varying[loop - 2]) === 0);
    // The index check: an unsigned branch (bltu or bgeu) and an ebreak.
    assert(varying.some(w => opcode(w) === 0x63 && (funct3(w) === 6 || funct3(w) === 7)));
    assert(varying.includes(0x00100073));
});
