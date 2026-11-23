// Hoisting, fused conjunctions, induction variables, argument-register reuse.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createContext, runInContext, runInThisContext} from "node:vm";
import {adjustsStack, compiler, destination, opcode, sourceRegister, words} from "./rv32-helpers.mjs";

test("hoisted loop invariants keep results, stores and traps identical, including aliased buffers", () => {
    const ctx = createContext({});
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
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
    const withHoist = {policy: "kernel"};
    const without = {policy: "kernel", disable: ["hoist"]};
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
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
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
    assert(kernel.passes.includes("conjunctions") && kernel.select.loadHomes, "kernel fuses conjunctions and loads into homes");
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
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
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
    assert(kernel.passes.includes("induction") && kernel.operandLocations.pointerOnly, "kernel uses induction and pointer-only sources");
    for (const [name, [reduced, pointerOnly, src]] of Object.entries(fns)) {
        const tapes = {}, skips = [];
        const observe = key => ({observeTape: (fn, phase, code) => { if (fn === name && phase === "version") tapes[key] = code; },
            observePlan: (fn, plan) => { if (fn === name && key === "on") skips.push(plan.skips?.size ?? 0); }});
        typedRv32.compile(src, [], undefined, {policy: "kernel", ...observe("on")});
        typedRv32.compile(src, [], undefined, {policy: "kernel", disable: ["induction"], ...observe("off")});
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
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
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
