// Run the emitted RV32 words through the existing instruction interpreter.
// Attach a counter to instruction fetch and retain its existing semantic checks.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createHash} from "node:crypto";
const interpreter = new URL("../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs",import.meta.url);
const scalar = process.argv[2] || "picocalc-os/worlds/raytrace/raytrace.typed";
const compiler = process.argv[3] || "picocalc-os/compiler/typed-rv32.js";
const ctx = vm.createContext({});
for (const file of ["picocalc-os/compiler/typed-wasm.js",compiler]) {
    vm.runInContext(fs.readFileSync(file,"utf8"),ctx,{filename:file});
}
const source = fs.readFileSync(scalar,"utf8");
const program = ctx.typedRv32.compile(source);
let machine = fs.readFileSync(interpreter,"utf8");
const fetch = "const w = code.getUint32(at, true);";
assert.equal(machine.split(fetch).length,2);
machine = machine.replace("'./packed.mjs'",JSON.stringify(new URL("packed.mjs",interpreter).href))
    .replace(fetch, fetch + " globalThis.profileRayInstruction(at,w);");
const {runRv32} = await import("data:text/javascript;base64,"+Buffer.from(machine).toString("base64"));
const names = Object.entries(program.entries).sort((a,b)=>a[1]-b[1]);
const owners = new Int32Array(program.image.byteLength/4);
const counts = names.map(([name,begin],i)=>{
    const end = names[i+1]?.[1] ?? program.image.length;
    owners.fill(i,begin/4,end/4);
    return {name, bytes:end-begin, instructions:0, loads:0, stores:0, spAccesses:0,
        branches:0, divRem:0};
});
globalThis.profileRayInstruction = (pc,w)=>{
    const row = counts[owners[pc>>>2]];
    row.instructions++;
    const op = w & 127;
    if (op===3 || op===35) {
        if (op===3) row.loads++; else row.stores++;
        if (((w>>>15)&31)===2) row.spAccesses++;
    }
    if (op===99) row.branches++;
    if (op===51 && (w>>>25)===1 && ((w>>>12)&7)>=4) row.divRem++;
};
const initial = new Uint8Array(56000), d = new DataView(initial.buffer);
const pixels = 32, scratch = pixels + 4 + 51200;
d.setUint32(pixels,25600,true); d.setUint32(scratch,2048,true);
const result = runRv32(program,"typedRayFrame",[pixels,scratch,68,61,31,25],[],{},initial,undefined,200_000_000);
assert(!result.trap && result.result===1);
let hash = 2166136261;
for (const b of result.bytes.subarray(pixels+4,pixels+4+51200)) hash = Math.imul(hash^b,16777619)>>>0;
assert.equal(hash.toString(16),"2f75a8a5","physical scene's C image");
assert.equal(counts.reduce((sum,r)=>sum+r.instructions,0),result.steps);
console.log(JSON.stringify({frameFnv:hash.toString(16),sourceSha256:createHash("sha256").update(source).digest("hex"),
    imageSha256:createHash("sha256").update(program.image).digest("hex"),instructions:result.steps,bytes:program.image.length,
    functions:counts.filter(r=>r.instructions).sort((a,b)=>b.instructions-a.instructions)},null,2));
