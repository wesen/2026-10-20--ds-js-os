import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
for (const name of ["typed-wasm", "typed-rv32"]) {
    vm.runInContext(fs.readFileSync("picocalc-os/compiler/" + name + ".js", "utf8"), ctx);
}
const source = `
function mixChannel(a: i32,b: i32,t: i32): i32 { return (a*(256-t)+b*t)/256; }
function exprMix(pool: buffer,at: i32,a: i32,b: i32,t: i32): i32 {
    pool.setCharCodeAt(at,3); pool.setCharCodeAt(at+1,a);
    pool.setCharCodeAt(at+2,b); pool.setCharCodeAt(at+3,t); return at;
}`;
const wasm = ctx.typedWasm.compile(source).bytes;
const rv = ctx.typedRv32.compile(source).image;
const api = new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
const data = new DataView(api.memory.buffer);
data.setUint32(64,20,true);
assert.equal(api.exprMix(64,8,1,2,3),8);
assert.deepEqual([0,1,2,3].map(i => data.getUint16(68+(8+i)*2,true)),[3,1,2,3]);
assert.deepEqual([0,128,256].map(t => api.mixChannel(32,224,t)),[32,128,224]);
console.log({wasmBytes:wasm.length, rv32InstructionBytes:rv.length});
