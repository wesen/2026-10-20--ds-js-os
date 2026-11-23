// Candela's pcgH, compiled from its C++ source text by the host's g++, against a Typed pcgH in WebAssembly and in
// RV32 (stock and kernel policies, the reference interpreter) on 10,000 inputs: 5,000 chained as rnd() chains them
// (rngS = pcgH(rngS)) and 5,000 from a generator.
//   node 03-pcg-against-gcc.mjs SCRATCH_DIR        (from the repository root)
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createContext, runInContext} from "node:vm";

const scratch = process.argv[2];
if (!scratch) throw new Error("usage: node 03-pcg-against-gcc.mjs SCRATCH_DIR");
const kernel = readFileSync("firmware/third_party/candela/kernel/cdl_kernel.cpp", "utf8");
const match = kernel.match(/static u32 pcgH\(u32 v\) \{[\s\S]*?\n\}/);
if (!match) throw new Error("pcgH not found in cdl_kernel.cpp");
const program = `#include <cstdint>
#include <cstdio>
typedef uint32_t u32;
${match[0]}
int main() {
    u32 v;
    while (std::scanf("%u", &v) == 1) std::printf("%u\\n", pcgH(v));
}
`;
writeFileSync(join(scratch, "pcg.cpp"), program);
execFileSync("g++", ["-O2", "-o", join(scratch, "pcg"), join(scratch, "pcg.cpp")]);

const ctx = createContext({});
for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js",
    "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
    runInContext(readFileSync(file, "utf8"), ctx, {filename: file});
const source = `function pcgH(v: i32): i32 {
    const st = v * 747796405 + 0xac564b05;
    const w = ((st >>> ((st >>> 28) + 4)) ^ st) * 277803737;
    return (w >>> 22) ^ w;
}
`;
const wasm = (await WebAssembly.instantiate(ctx.typedWasm.compile(source).bytes)).instance.exports;
const images = ["stock", "kernel"].map(policy => [policy, ctx.typedRv32.compile(source, [], 1 << 20, {policy})]);

let seed = 0x1234567, state = 1;
const inputs = [];
for (let i = 0; i < 10000; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    if (i % 2) { inputs.push(state >>> 0); state = wasm.pcgH(state); }
    else inputs.push(seed >>> 0);
}
const expected = execFileSync(join(scratch, "pcg"), {input: inputs.join("\n") + "\n"}).toString().trim().split("\n").map(Number);
if (expected.length !== inputs.length) throw new Error("g++ pcgH printed " + expected.length + " values");
let differ = 0;
const memory = new Uint8Array(64);
for (let i = 0; i < inputs.length; i++) {
    const v = inputs[i] | 0, want = expected[i] | 0;
    const got = [["wasm", wasm.pcgH(v)], ...images.map(([policy, p]) => [policy, ctx.typedRv32Interp.run(p, "pcgH", [v], memory).result])];
    for (const [lane, value] of got) if (value !== want) { if (differ++ < 5) console.log("DIFFERS", lane, v >>> 0, value >>> 0, want >>> 0); }
}
console.log(differ ? differ + " differences" : "pcgH: g++, Wasm, RV32 stock and kernel agree on " + inputs.length + " inputs");
process.exit(differ ? 1 : 0);
