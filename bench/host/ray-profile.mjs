#!/usr/bin/env node
// Profile the opening ray-tracer frame under one or more compile policies on the host.
//
//   node bench/host/ray-profile.mjs                       # stock, default and kernel, table
//   node bench/host/ray-profile.mjs --policy kernel --json out.json
//   node bench/host/ray-profile.mjs --options '{"policy":"kernel","operandLocations":{"reuseArgs":false}}'
//
// Every arm must reproduce the reference frame: the SHA-256 of guest memory after the call
// equals OPENING_DIGEST (bench/reference/ray-opening.json), the digest recorded by the
// PICOCALC-SHADOW-CODEGEN and PICOCALC-OPERAND-HOMES profilers for the C-verified opening frame.
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {runInThisContext} from "node:vm";

const root = new URL("../../", import.meta.url);
for (const file of ["picocalc-os/compiler/typed-wasm.js", "picocalc-os/compiler/typed-rv32.js", "picocalc-os/tools/rv32-interp.js", "picocalc-os/tools/typed-ray-bench.js"])
    runInThisContext(readFileSync(new URL(file, root), "utf8"), {filename: file});

export const OPENING_DIGEST = JSON.parse(readFileSync(new URL("../reference/ray-opening.json", import.meta.url))).sha256;
const POLICIES = {stock: {policy: "stock"}, default: {}, kernel: {policy: "kernel"}};

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const arms = option("--options") ? {custom: JSON.parse(option("--options"))} :
    option("--policy") ? {[option("--policy")]: {policy: option("--policy")}} : POLICIES;
const source = readFileSync(new URL("picocalc-os/worlds/raytrace/raytrace.typed", root), "utf8");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

const results = {};
for (const [arm, options] of Object.entries(arms)) {
    if (!options) throw new Error("unknown policy " + arm);
    const program = typedRv32.compile(source, [], 65536, options);
    const p = typedRayBench.frameProfile(program);
    const outputSHA = sha(p.bytes);
    if (outputSHA !== OPENING_DIGEST) throw new Error(arm + ": opening frame differs from the reference (" + outputSHA + ")");
    delete p.bytes;
    results[arm] = {options, imageSHA: sha(program.image), outputSHA, ...p};
}

if (option("--json")) writeFileSync(option("--json"), JSON.stringify(results, null, 1) + "\n");
const fmt = n => String(n).padStart(11);
for (const [arm, r] of Object.entries(results)) {
    console.log(`\n${arm}: ${r.steps.toLocaleString()} instructions, ${r.imageBytes} B image, output ${r.outputSHA.slice(0, 12)} (reference)`);
    console.log("function".padEnd(24) + ["steps", "spLoad", "spStore", "capLoad", "bounds", "calls"].map(fmt).join(""));
    for (const row of [r.total, ...r.rows.slice(0, 10)])
        console.log(row.name.padEnd(24) + [row.steps, row.spLoad, row.spStore, row.capacityLoad, row.boundsTest, row.call].map(fmt).join(""));
}
