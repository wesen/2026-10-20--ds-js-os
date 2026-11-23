// Shared by typed-values*.test.mjs (PICOCALC-TYPED-VALUES): the compiler and the reference interpreter in a fresh realm,
// a seeded generator, and a differential check of WebAssembly and RV32 under every policy against a model.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";

export function realm() {
    const ctx = createContext({});
    for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js",
        "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
        runInContext(readFileSync(new URL("../../" + file, import.meta.url), "utf8"), ctx, {filename: file});
    return ctx;
}
export const {typedWasm, typedRv32, typedRv32Interp} = realm();
export const POLICIES = ["stock", "interactive", "balanced", "default", "kernel"];

// A deterministic generator (xorshift32), so a failure names a reproducible seed.
export function random(seed) {
    let s = seed | 0 || 1;
    const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
    return {next, below: n => next() % n, pick: list => list[next() % list.length]};
}

const F32_BITS = new Int32Array(1), F32_VIEW = new Float32Array(F32_BITS.buffer);
export const bits = value => { F32_VIEW[0] = value; return F32_BITS[0]; };
export const fromBits = word => { F32_BITS[0] = word; return F32_VIEW[0]; };

// Run `name` of an RV32 program with ilp32f's register arguments (i32 in a0..., f32 in fa0...); the result as a number
// (f32) or an i32.
export function runRv32(program, name, params, result, args, memory = new Uint8Array(64)) {
    const x = [], f = new Uint32Array(32);
    let k = 10;
    params.forEach((type, i) => { if (type === "f32") f[k++] = bits(args[i]); else x.push(args[i] | 0); });
    const run = typedRv32Interp.run(program, name, x, memory, {fregisters: f});
    if (run.trap) return {trap: true};
    return {value: result === "f32" ? fromBits(run.fregisters[10]) : run.result, run};
}

// Compile once for WebAssembly and for every policy; check(name, args, expected) compares all of them.
export async function differential(source, signatures) {
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
