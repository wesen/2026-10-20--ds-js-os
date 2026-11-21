// Generate a single initial buffer and 160 full-buffer checksum witnesses for
// each scene by running the actual Typed source through the Wasm backend.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import {crc32} from 'node:zlib';
const out = process.argv[2];
runInThisContext(readFileSync('picocalc-os/compiler/typed-wasm.js','utf8'));
const src = readFileSync('picocalc-os/worlds/raytrace/raytrace.typed','utf8');
const wasm = new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(src).bytes)).exports;
const word = new DataView(wasm.memory.buffer);
const ptr = 64, buf = new Uint8Array(wasm.memory.buffer, ptr, 4100);
const output = ['// Exact opening/dense/sparse fixtures and Wasm reference CRCs.', '#include <stdint.h>'];
for (const [scene,radii] of [['opening',[26,32,23]],['dense',[32,32,32]],['sparse',[9,6,7]]]) {
  buf.fill(0xa5); word.setUint32(ptr,2048,true);
  assert.equal(wasm.typedRayPrepare(ptr,68,61,31,25),1);
  for(let i=0;i<3;i++) word.setUint16(ptr+4+(4+5*i)*2,radii[i],true);
  const before=buf.slice(), checks=[];
  for(let y=0;y<160;y++) {
    buf.set(before);
    assert.equal(wasm.typedRayComputeRow(ptr,y),1);
    checks.push(crc32(buf));
  }
  output.push('static const uint8_t '+scene+'_raw[4100] = {'+before.join(',')+'};',
              'static const uint32_t '+scene+'_crc[160] = {'+checks.map(cv=>cv+'u').join(',')+'};');
}
writeFileSync(out,output.join('\n')+'\n');
