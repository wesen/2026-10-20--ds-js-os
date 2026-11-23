// Large frames (PICOCALC-CANDELA-TYPED): a function whose locals do not fit sp's 12-bit offsets takes the large-frame
// form (ra, s0 and the saved registers at the bottom, s0 = sp + 2032 as the base of the upper slots). Generated
// functions with many live f32 and i32 locals, called from a caller, agree in WebAssembly and RV32 under every policy
// and pass the reference interpreter's calling-convention checks; the WebAssembly module's memory size and source
// limit are options.
import assert from "node:assert/strict";
import test from "node:test";
import {POLICIES, bits, realm, same} from "./f32-cases.mjs";

const {typedWasm, typedRv32, typedRv32Interp} = realm();

// n locals, each read once at the end, so every one is live across the whole body.
function program(n) {
    const lines = [];
    for (let i = 0; i < n; i++) lines.push(`    const v${i}: f32 = a * ${i + 1}.5 + b;`, `    const w${i}: i32 = k * ${i + 3} + 7;`);
    lines.push("    let s: f32 = 0.0;", "    let t: i32 = 0;");
    for (let i = 0; i < n; i++) lines.push(`    s = s + v${i} * f32(w${i} & 255);`, ...(i % 7 === 0 ? [`    t = t ^ w${i};`] : []));
    return `function wide(a: f32, b: f32, k: i32): f32 {
${lines.join("\n")}
    return s + f32(t);
}
function outer(a: f32, k: i32): f32 {
    let s: f32 = 0.0;
    for (let i = 0; i < 3; i = i + 1) { s = s + wide(a + f32(i), s * 0.5, k + i); }
    return s;
}`;
}

test("functions with more locals than sp's offsets reach agree in WebAssembly and RV32 under every policy", async () => {
    const source = program(320);
    const wasm = (await WebAssembly.instantiate(typedWasm.compile(source).bytes)).instance.exports;
    for (const policy of POLICIES) {
        const image = typedRv32.compile(source, [], 1 << 20, {policy});
        for (const [a, k] of [[0.25, 3], [-1.5, 17], [3.75, -9]]) {
            const f = new Uint32Array(32);
            f[10] = bits(Math.fround(a));
            const run = typedRv32Interp.run(image, "outer", [k], new Uint8Array(64), {fregisters: f});
            assert(!run.trap, policy);
            assert(same("f32", run.fregisters[10], bits(wasm.outer(a, k))), `${policy} outer(${a}, ${k})`);
        }
    }
});

test("the WebAssembly module's memory and source limit are options", async () => {
    const source = "// padding\n".repeat(7000) + "function f(b: buffer): f32 { return b.getF32(0); }\n";
    assert.throws(() => typedWasm.compile(source), /input limit exceeded/);
    const {bytes} = typedWasm.compile(source, {maxSourceLength: 1 << 20, memoryPages: 4});
    const {memory} = (await WebAssembly.instantiate(bytes)).instance.exports;
    assert.equal(memory.buffer.byteLength, 4 << 16);
});
