import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createHash} from "node:crypto";

const [oracle, variant] = process.argv.slice(2);
const ctx = vm.createContext({});
for (const name of ["typed-wasm", "typed-rv32"]) {
    vm.runInContext(fs.readFileSync("picocalc-os/compiler/" + name + ".js","utf8"),ctx);
}
const worlds = "picocalc-os/worlds/";
const units = ["candela/builders.typed", "candela/materials.typed", "raytrace/raytrace.typed",
    "raytrace/material-frame.typed"];
const source = units.map(name => fs.readFileSync(
    name === "raytrace/raytrace.typed" && variant ? variant : worlds + name, "utf8")).join("\n");
const wasm = ctx.typedWasm.compile(source);
const rv = ctx.typedRv32.compile(source);
const api = new WebAssembly.Instance(new WebAssembly.Module(wasm.bytes)).exports;
const stride = 163;
const data = new DataView(api.memory.buffer);
let base = 64;
function buffer(cells) {
    const addr = base;
    base += (4 + 2 * cells + 3) & ~3;
    data.setUint32(addr, cells, true);
    return addr;
}
const pixels = buffer(stride * 160), work = buffer(2048), graph = buffer(303);
const shader = buffer(192), ids = buffer(160), colors = buffer(320);
const cell = (base, i, value) => data.setUint16(base + 4 + 2*i, value, true);
cell(work, 0, stride);
const cases = JSON.parse(fs.readFileSync(path.join(oracle, "cases.json")));
const results = [];
for (const sample of cases) {
    for (let i = 0; i < sample.graph.length; i++) cell(graph, i, sample.graph[i]);
    for (let i = 0; i < stride*160; i++) cell(pixels, i, 0xa55a);
    const code = api.typedRayMaterialFrame(pixels,work,graph,shader,ids,colors,...sample.light);
    assert.equal(code,1);
    const expected = fs.readFileSync(path.join(oracle,sample.pixels));
    for (let y = 0; y < 160; y++) {
        const row = pixels + 4 + 2*stride*y;
        assert.deepEqual(Buffer.from(api.memory.buffer,row,320),expected.subarray(320*y,320*(y+1)),
            sample.scene + " row " + y);
        for (let x = 160; x < stride; x++) assert.equal(data.getUint16(row+2*x,true),0xa55a);
    }
    results.push({scene:sample.scene, weight:sample.weight, light:sample.light, pixels:25600,
        sha256:createHash("sha256").update(expected).digest("hex")});
}
console.log(JSON.stringify({executed:"WebAssembly",compiledRv32Bytes:rv.image.length,
    wasmBytes:wasm.bytes.length, stride, cases:results},null,2));
