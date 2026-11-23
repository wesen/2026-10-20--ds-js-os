// Stage the fragments board study app into OUT: the app (scripts/board), fragments.c, the Typed fragments compiled
// under "kernel" (typed.S, typed.bin), and inputs.h: N inputs as 09-numeric-bench.c generates them and the Typed
// results the reference interpreter computes for them, which GCC -ffp-contract=off must also give on the board.
//
//   node 06-stage-board.mjs OUT [N]      then 07-build-board.sh OUT, 08-run-board.py OUT CAPTURE
import {cpSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join, resolve} from "node:path";
import {createContext, runInContext} from "node:vm";

const here = new URL(".", import.meta.url).pathname;
const root = new URL("../../../../../../", import.meta.url).pathname;
const out = resolve(process.argv[2]), N = Number(process.argv[3]) || 2000, BLOCKS = 6;
const ctx = createContext({});
for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js",
    "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
    runInContext(readFileSync(join(root, file), "utf8"), ctx, {filename: file});

mkdirSync(join(out, "main"), {recursive: true});
cpSync(join(here, "board"), out, {recursive: true});
cpSync(join(here, "fragments.c"), join(out, "main/fragments.c"));
cpSync(join(root, "firmware/port/esp32p4/partitions.csv"), join(out, "partitions.csv"));

// 09-numeric-bench.c's inputs: its LCG and distributions (05-fragments.mjs).
let seed = 12345;
const u01 = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };
const unit = upper => {
    const z = upper ? 0.05 + 0.95 * u01() : 2 * u01() - 1, ph = 2 * Math.PI * u01() - Math.PI, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(ph), r * Math.sin(ph), z];
};
// One input is 16 floats: o r, d alpha, wo 0, wi 0.
const rows = [];
for (let i = 0; i < N; i++) {
    const o = [0, 0, 0].map(() => 16 * u01() - 8), radius = 0.3 + 1.7 * u01(), j = unit(false);
    const t = o.map((x, k) => -x + 1.6 * radius * j[k]), l = Math.hypot(...t), wo = unit(true), a = u01();
    rows.push([...o, radius, ...t.map(x => x / l), 0.05 + 0.95 * a * a, ...wo, 0]);
}
for (const row of rows) row.push(...unit(true), 0);
const floats = new Float32Array(rows.flat());

const source = readFileSync(join(here, "fragments.typed"), "utf8");
const program = ctx.typedRv32.compile(source, [], 1 << 20, {policy: "kernel"});
if (program.relocations.length) throw new Error("the fragments import nothing");
writeFileSync(join(out, "main/typed.bin"), program.image);
writeFileSync(join(out, "main/typed.S"), [".section .text.typed_fragments,\"ax\",@progbits", ".option push", ".option norvc",
    ".balign 16", "typed_image:", ".incbin \"" + join(out, "main/typed.bin") + "\"",
    ...["sphere", "ggx", "norm3"].flatMap(name => [".global typed_" + name, ".set typed_" + name + ", typed_image + " + program.entries[name]]),
    ".option pop", ""].join("\n"));

// The Typed results on the reference interpreter, the inputs at 0x1000.
const memory = new Uint8Array(0x1000 + floats.byteLength);
memory.set(new Uint8Array(floats.buffer), 0x1000);
const F = new Float32Array(1), U = new Uint32Array(F.buffer);
const bits = x => { F[0] = x; return U[0]; };
const expected = {sphere: [], ggx: [], norm3: []};
for (let i = 0; i < N; i++) {
    const at = 0x1000 + 64 * i, v = floats.subarray(16 * i, 16 * i + 16);
    for (const [name, x, f] of [["sphere", [at, at + 16], [v[3]]], ["ggx", [at + 32, at + 48], [v[7]]], ["norm3", [at], []]]) {
        const fregisters = new Uint32Array(32);
        f.forEach((value, k) => { fregisters[10 + k] = bits(value); });
        const run = ctx.typedRv32Interp.run(program, name, x, memory, {fregisters, counts: false});
        expected[name].push(run.fregisters[10] >>> 0);
    }
}
const hex = n => "0x" + n.toString(16).padStart(8, "0") + "u";
const words = new Uint32Array(floats.buffer);
writeFileSync(join(out, "main/inputs.h"), [
    "#define N " + N, "#define BLOCKS " + BLOCKS,
    // The inputs' exact bits, read as floats through the union.
    "static const union { uint32_t u[N][16]; float f[N][16]; } input_bits __attribute__((aligned(16))) = {.u = {" +
        Array.from({length: N}, (_, i) => "{" + Array.from(words.subarray(16 * i, 16 * i + 16), hex).join(",") + "}").join(",\n") + "}};",
    "#define inputs input_bits.f",
    ...Object.entries(expected).map(([name, list]) => "static uint32_t expected_" + name + "[N] = {" + list.map(hex).join(",") + "};"), ""].join("\n"));
const fnv = list => list.reduce((h, b) => Math.imul(h ^ b, 16777619) >>> 0, 2166136261);
const manifest = {N, blocks: BLOCKS, image: createHash("sha256").update(program.image).digest("hex"), entries: program.entries,
    words: program.image.length / 4, hashes: Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, fnv(v).toString(16).padStart(8, "0")]))};
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(JSON.stringify(manifest));
