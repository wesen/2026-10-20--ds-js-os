// The reference interpreter's opening frame under Node, for the working-tree compiler: the fixture of
// pkg/traceapi/rv32_test.go (TestRV32OpeningFrameMatchesReference) and the Node timing in the diary.
// usage: node 01-node-reference-frame.mjs REPO_ROOT
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

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
let src = "(function () {\nconst globalThis = Object.create(null);\nlet " + files.map(f => f[0]).join(", ") + ";\n";
for (const [name, path] of files) src += readFileSync(repo + "/" + path, "utf8") + "\n;" + name + " = globalThis." + name + ";\n";
src += "return globalThis;\n})()";
const realm = vm.createContext({});
const c = vm.runInContext(src, realm);
const ray = readFileSync(repo + "/picocalc-os/worlds/raytrace/raytrace.typed", "utf8");
const sha = b => createHash("sha256").update(b).digest("hex");
for (const [arm, opts] of [["default", undefined], ["stock", {policy: "stock"}]]) {
    const p = c.typedRv32.compile(ray, [], 65536, opts);
    const t = performance.now();
    const f = c.typedRayBench.openingFrame(p);
    const ms = performance.now() - t;
    const counts = Buffer.from(f.counts.buffer, f.counts.byteOffset, f.counts.byteLength);
    console.log(JSON.stringify({arm, imageBytes: p.image.length, imageSHA: sha(p.image), steps: f.steps, result: f.result,
        bytesSHA: sha(f.bytes), fnv: c.typedRayBench.fnv1a(f.bytes), countsSHA: sha(counts), ms: Math.round(ms),
        registersSHA: sha(Buffer.from(f.registers.buffer))}));
}
