// Experiment: does the guide's W1 scope wrapper isolate two compiler revisions in one realm?
// usage: node 01-w1-wrapper-check.mjs REPO_ROOT
import {execFileSync} from "node:child_process";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const repo = process.argv[2];
const files = [
    ["typedWasm", "picocalc-os/compiler/typed-wasm.js"],
    ["typedAsync", "picocalc-os/compiler/typed-async.js"],
    ["typedWorld", "picocalc-os/compiler/typed-world.js"],
    ["typedRv32", "picocalc-os/compiler/typed-rv32.js"],
    ["typedPieLoops", "picocalc-os/compiler/typed-pie-loops.js"],
    ["typedRv32Interp", "picocalc-os/tools/rv32-interp.js"],
    ["typedRayBench", "picocalc-os/tools/typed-ray-bench.js"],
];
const show = (rev, path) => execFileSync("git", ["cat-file", "blob", rev + ":" + path], {cwd: repo, encoding: "utf8", maxBuffer: 1 << 26});
function wrapper(rev) {
    let src = "(function () {\n\"use strict\";\nconst globalThis = Object.create(null);\nlet " + files.map(f => f[0]).join(", ") + ";\n";
    for (const [name, path] of files) src += show(rev, path) + "\n;" + name + " = globalThis." + name + ";\n";
    return src + "return globalThis;\n})()";
}
const realm = vm.createContext({});
const before = new Set(vm.runInContext("Object.getOwnPropertyNames(globalThis)", realm));
const base = vm.runInContext(wrapper("eaf0872"), realm, {filename: "compiler@eaf0872"});
const work = vm.runInContext(wrapper("3213028"), realm, {filename: "compiler@3213028"});
const leaked = vm.runInContext("Object.getOwnPropertyNames(globalThis)", realm).filter(n => !before.has(n));
const ray = readFileSync(repo + "/picocalc-os/worlds/raytrace/raytrace.typed", "utf8");
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const arms = {
    stock: {policy: "stock"},
    default: undefined,
    savedDirect: {operandLocations: {forward: true, capacity: true, homes: true, saved: true, direct: true}},
};
const out = {leakedGlobals: leaked, exports: Object.keys(work), sameModuleObject: base.typedRv32 === work.typedRv32, arms: {}};
for (const [arm, opts] of Object.entries(arms)) {
    const a = base.typedRv32.compile(ray, [], 96 * 1024, opts).image;
    const b = work.typedRv32.compile(ray, [], 96 * 1024, opts).image;
    out.arms[arm] = {base: a.length, work: b.length, identical: same(a, b)};
}
// The interpreter and ray bench from the candidate revision run the candidate's default image.
const program = work.typedRv32.compile(ray, [], 96 * 1024);
const profile = work.typedRayBench.frameProfile(program);
out.frame = {steps: profile.steps, digest: profile.digest, imageBytes: profile.imageBytes};
// A world compile goes through typed-world.js's late bare reference to typedRv32.
const chess = readFileSync(repo + "/picocalc-os/worlds/chess/source.list", "utf8").split("\n").filter(Boolean)
    .map(p => readFileSync(repo + "/picocalc-os/worlds/chess/" + p, "utf8")).join("\n");
out.chessWorld = {base: base.typedRv32.compile(chess, base.typedWorld.imports, 96 * 1024).image.length,
    work: work.typedRv32.compile(chess, work.typedWorld.imports, 96 * 1024).image.length,
    worldExports: typeof work.compileTypedWorldRv32 + "/" + typeof work.compileTyped};
// PIE loops go through typed-rv32's globalThis.typedPieLoops check plus the bare typedPieLoops name.
out.pie = work.typedRv32.compile(ray, [], 96 * 1024, {pieLoops: "pie-empty"}).image.length;
console.log(JSON.stringify(out, null, 1));
