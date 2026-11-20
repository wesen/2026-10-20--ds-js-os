import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import "../../../../../../../picocalc-os/compiler/typed-wasm.js";

const dir = process.argv[2];
assert(dir, "usage: node 02-paint.mjs MATCH_DIR");
const source = readFileSync(new URL("../../../../../../../picocalc-os/worlds/chess/painter-3d.typed", import.meta.url), "utf8");
const {memory, paintChess} = new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(source).bytes)).exports;
const scenes = JSON.parse(readFileSync(join(dir,"match.json")));
const u32 = new DataView(memory.buffer);
const input = new Uint16Array(memory.buffer,4,91), cap = 12288;
const output = new Uint16Array(memory.buffer,260,cap+1);
u32.setUint32(0,91,true); u32.setUint32(256,cap,true);
const final = scenes.find(s => s.label === "turn-4");
for (let phase = 0; phase < 32; phase++) {
  scenes.push({...final, phase, label:"phase-" + String(phase).padStart(2,"0")});
}
const hashes = {};
for (const scene of scenes) {
  const {board,masks,fields,yaw,label} = scene;
  input.set([...board].map(c => parseInt(c,16)),0);
  input.set(Buffer.from(masks,"hex"),64);
  fields.forEach((field,i) => {input[72+i*2]=field; input[73+i*2]=field>>16;});
  input[90] = scene.phase ?? yaw * 8;
  output.fill(0xdead);
  const count = paintChess(0,256);
  assert(count > 0 && count <= cap && output[count] === 0xdead, label);
  const bytes = Buffer.from(output.buffer,output.byteOffset,2*count);
  writeFileSync(join(dir,label+".words"),bytes);
  hashes[label] = createHash("sha256").update(bytes).digest("hex");
}
assert.equal(hashes["turn-4"],hashes["yaw-4"]);
assert.equal(new Set([1,2,3,4].map(i=>hashes["yaw-"+i])).size,4);
assert.equal(hashes["phase-00"], hashes["turn-4"]);
assert.equal(hashes["phase-08"], hashes["yaw-1"]);
assert.equal(new Set(Object.entries(hashes).filter(([k])=>k.startsWith("phase-")).map(([,v])=>v)).size,32);
