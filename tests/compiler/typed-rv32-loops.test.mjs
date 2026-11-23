// Division facts, versioned loops with split locals, value sets.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createContext, runInContext, runInThisContext} from "node:vm";
import {adjustsStack, compiler, destination, opcode, sourceRegister, words} from "./rv32-helpers.mjs";

test("division facts change code only for dividends proven non-negative, and keep results identical", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
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
    const withFacts = {enable: ["ranges", "facts"]};
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
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp, typedTape} = ctx;
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
    const select = {immediates: true, divisions: true, branches: true, results: true, leafParams: true, shortBranches: true};
    const locations = {forward: true, capacity: true, homes: true, saved: true, direct: true, capacities: true, nested: true,
        constants: true, share: true, pointers: true};
    const unchecked = {};
    const candidate = typedRv32.compile(src, [], undefined, {select, passes: ["inline", "commute", "rotate", "version", "split"],
        operandLocations: locations,
        observeTape: (name, phase, code) => { if (phase === "split") unchecked[name] = typedTape.decode(code).some(o => o.opcode === typedTape.UNCHECKED_ADDRESS); }});
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
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    const {typedRv32, typedRv32Interp, typedTape} = ctx;
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
    const withSets = {policy: "kernel"};
    const without = {policy: "kernel", disable: ["sets"]};
    const opcodes = code => typedTape.decode(code).map(o => o.opcode);
    const {I32_MUL, I32_DIV_S} = typedTape;
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
        if (name === "floor") assert.deepEqual([count(I32_MUL), count(I32_DIV_S)], [2, 2], "floor multiplies and divisions");
        if (name === "spaced") assert.deepEqual([count(I32_MUL), count(I32_DIV_S)], [0, 1], "spaced multiplies and divisions");
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
