// Instructions per call of the three Candela fragments: Typed (fragments.typed, under each policy) against GCC -O2
// (fragments.c, the arm F32 of PICOCALC-CANDELA-P4 scripts/09-numeric-bench.c), both counted by the reference
// interpreter (bench/host/rv32-interp.js) on the same inputs, one call at a time. GCC builds for rv32imaf (no C
// extension, which the interpreter does not run and which does not change counts), with its default contraction
// (fmadd) and with -ffp-contract=off (Typed never contracts, so then the results must be equal bit for bit).
//
//   node 05-fragments.mjs [N] [--json OUT]
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createContext, runInContext} from "node:vm";

const here = new URL(".", import.meta.url).pathname;
const root = new URL("../../../../../../", import.meta.url);
const ctx = createContext({});
for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js",
    "compiler/typed/typed-rv32-inline.js", "compiler/typed/typed-rv32-loops.js", "bench/host/rv32-interp.js"])
    runInContext(readFileSync(new URL(file, root), "utf8"), ctx, {filename: file});
const {typedRv32, typedRv32Interp, typedWasm} = ctx;
const N = Number(process.argv[2]) || 2000;
const GCC = process.env.P4_GCC ?? "/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-gcc";
const tool = name => GCC.replace(/gcc$/, name);

// Inputs as 09-numeric-bench.c generates them (its LCG and distributions): origin, direction, radius, wo, alpha, wi.
let seed = 12345;
const u01 = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };
function unit(upper) {
    const z = upper ? 0.05 + 0.95 * u01() : 2 * u01() - 1, ph = 2 * Math.PI * u01() - Math.PI, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(ph), r * Math.sin(ph), z];
}
const rows = [];
for (let i = 0; i < N; i++) {
    const o = [0, 0, 0].map(() => 16 * u01() - 8), radius = 0.3 + 1.7 * u01(), j = unit(false);
    const t = o.map((x, k) => -x + 1.6 * radius * j[k]), l = Math.hypot(...t);
    const wo = unit(true), a = u01();
    rows.push({o, d: t.map(x => x / l), r: radius, wo, al: 0.05 + 0.95 * a * a});
}
for (const row of rows) row.wi = unit(true);

// Guest memory: per input, o d wo wi at 0x9000 + 64 i (each vector 16 bytes); GCC's constants at 0x8000.
const BASE = 0x9000, memory = new Uint8Array(BASE + 64 * N + 64), view = new DataView(memory.buffer);
rows.forEach((row, i) => [row.o, row.d, row.wo, row.wi].forEach((v, k) => v.forEach((x, c) => view.setFloat32(BASE + 64 * i + 16 * k + 4 * c, x, true))));
const F = new Float32Array(1), U = new Uint32Array(F.buffer);
const bits = x => { F[0] = x; return U[0]; };
// [entry, x arguments, f arguments] of input i.
const CALLS = {
    sphere: i => [[BASE + 64 * i, BASE + 64 * i + 16], [rows[i].r]],
    ggx: i => [[BASE + 64 * i + 32, BASE + 64 * i + 48], [rows[i].al]],
    norm3: i => [[BASE + 64 * i], []],
};

function measure(program, memoryImage) {
    const out = {};
    for (const [name, call] of Object.entries(CALLS)) {
        let steps = 0;
        const results = [];
        for (let i = 0; i < N; i++) {
            const [x, f] = call(i), fregisters = new Uint32Array(32);
            f.forEach((v, k) => { fregisters[10 + k] = bits(v); });
            const run = typedRv32Interp.run(program, name, x, memoryImage, {fregisters, counts: false});
            if (run.trap) throw new Error(name + " trapped");
            steps += run.steps;
            results.push(run.fregisters[10]);
        }
        out[name] = {perCall: steps / N, results};
    }
    return out;
}

// GCC: link the three functions at 0 with their constants at 0x8000.
const scratch = mkdtempSync(join(tmpdir(), "f32-fragments-"));
writeFileSync(join(scratch, "link.ld"), "SECTIONS { .text 0 : { *(.text*) } .rodata 0x8000 : { *(.rodata*) *(.srodata*) *(.sdata*) *(.sbss*) *(.bss*) } }\n");
function gcc(label, flags) {
    const elf = join(scratch, label + ".elf");
    execFileSync(GCC, ["-O2", "-fno-math-errno", "-march=rv32imaf_zicsr", "-mabi=ilp32f", "-msmall-data-limit=0", "-mno-relax",
        "-nostdlib", "-ffreestanding", "-T", join(scratch, "link.ld"), ...flags, join(here, "fragments.c"), "-o", elf]);
    execFileSync(tool("objcopy"), ["-O", "binary", "-j", ".text", elf, join(scratch, label + ".text")]);
    execFileSync(tool("objcopy"), ["-O", "binary", "-j", ".rodata", elf, join(scratch, label + ".rodata")]);
    const symbols = execFileSync(tool("nm"), [elf], {encoding: "utf8"});
    const entries = {};
    for (const line of symbols.split("\n")) {
        const [address, kind, name] = line.trim().split(/\s+/);
        if ((kind === "T" || kind === "t") && name in CALLS) entries[name] = parseInt(address, 16);
    }
    const image = new Uint8Array(readFileSync(join(scratch, label + ".text")));
    const mem = memory.slice();
    mem.set(new Uint8Array(readFileSync(join(scratch, label + ".rodata"))), 0x8000);
    const sizes = {}, sorted = Object.entries(entries).sort((a, b) => a[1] - b[1]);
    sorted.forEach(([name, at], k) => { sizes[name] = ((sorted[k + 1]?.[1] ?? image.length) - at) / 4; });
    return {program: {image, entries, relocations: []}, mem, sizes};
}

const source = readFileSync(join(here, "fragments.typed"), "utf8");
const arms = {};
for (const [label, flags] of [["gcc -O2", []], ["gcc -O2 -ffp-contract=off", ["-ffp-contract=off"]]]) {
    const {program, mem, sizes} = gcc(label.replace(/\W+/g, "-"), flags);
    arms[label] = {...measure(program, mem), sizes};
}
for (const policy of ["stock", "interactive", "balanced", "default", "kernel"]) {
    const program = typedRv32.compile(source, [], 1 << 20, {policy});
    const sorted = Object.entries(program.entries).sort((a, b) => a[1] - b[1]), sizes = {};
    sorted.forEach(([name, at], k) => { sizes[name] = ((sorted[k + 1]?.[1] ?? program.image.length) - at) / 4; });
    arms["typed " + policy] = {...measure(program, memory), sizes};
}
// WebAssembly equals the RV32 build; GCC without contraction equals both.
const wasm = (await WebAssembly.instantiate(typedWasm.compile(source).bytes)).instance.exports;
const report = {N, arms: {}};
for (const [label, arm] of Object.entries(arms)) {
    report.arms[label] = {};
    for (const name of Object.keys(CALLS)) report.arms[label][name] = {perCall: arm[name].perCall, words: arm.sizes[name]};
}
const equal = (a, b) => a.every((v, i) => v === b[i]);
report.typedEqualsGccNoContract = Object.fromEntries(Object.keys(CALLS).map(name => [name, equal(arms["typed kernel"][name].results, arms["gcc -O2 -ffp-contract=off"][name].results)]));
report.typedEqualsGccDefault = Object.fromEntries(Object.keys(CALLS).map(name => [name, equal(arms["typed kernel"][name].results, arms["gcc -O2"][name].results)]));
// WebAssembly's one page holds one input at a time, at 0x100.
const mem = new Uint8Array(wasm.memory.buffer);
report.typedEqualsWasm = Object.fromEntries(Object.keys(CALLS).map(name => [name, arms["typed kernel"][name].results.every((v, i) => {
    const [x, f] = CALLS[name](i), from = BASE + 64 * i;
    mem.set(memory.subarray(from, from + 64), 0x100);
    return v === bits(wasm[name](...x.map(a => a - from + 0x100), ...f));
})]));
const json = process.argv.indexOf("--json");
if (json > 0) writeFileSync(process.argv[json + 1], JSON.stringify(report, null, 1) + "\n");
console.log("| Arm | sphere | ggx | norm3 | words (sphere, ggx, norm3) |\n|---|---:|---:|---:|---|");
for (const [label, arm] of Object.entries(report.arms))
    console.log(`| ${label} | ${arm.sphere.perCall.toFixed(2)} | ${arm.ggx.perCall.toFixed(2)} | ${arm.norm3.perCall.toFixed(2)} | ${arm.sphere.words}, ${arm.ggx.words}, ${arm.norm3.words} |`);
const base = report.arms["gcc -O2"];
console.log("\nratio typed kernel / gcc -O2: " + Object.keys(CALLS).map(n => n + " " + (report.arms["typed kernel"][n].perCall / base[n].perCall).toFixed(2)).join(", "));
console.log("typed = gcc -ffp-contract=off bit for bit:", JSON.stringify(report.typedEqualsGccNoContract), " typed = wasm:", JSON.stringify(report.typedEqualsWasm));
