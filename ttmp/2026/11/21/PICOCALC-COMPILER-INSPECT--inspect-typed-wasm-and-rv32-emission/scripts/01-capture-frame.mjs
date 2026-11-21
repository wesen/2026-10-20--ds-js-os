// Record a sparse PC profile for the exact image; include initialization that fixes the scene.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {runRv32} from '../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
const [out,backend='picocalc-os/compiler/typed-rv32.js',source='picocalc-os/worlds/raytrace/raytrace.typed']=process.argv.slice(2);
assert(out,'usage: node 01-capture-frame.mjs OUTPUT [BACKEND [SOURCE]]');
const ctx=vm.createContext({});
for(const file of ['picocalc-os/compiler/typed-wasm.js','picocalc-os/compiler/typed-async.js',backend])
    vm.runInContext(readFileSync(file,'utf8'),ctx,{filename:file});
const image=ctx.typedRv32.compile(readFileSync(source,'utf8'));
const memory=new Uint8Array(56000), headers=new DataView(memory.buffer);
const pixels=32,work=pixels+4+51200;
headers.setUint32(pixels,25600,true);headers.setUint32(work,2048,true);
const counts=new Float64Array(image.image.length/4);
const run=runRv32(image,'typedRayFrame',[pixels,work,68,61,31,25],[],{},memory,undefined,200_000_000,
    pc=>{counts[pc/4]++;});
assert(!run.trap && run.result===1);
let checksum=2166136261;
for(const b of run.bytes.subarray(pixels+4,pixels+4+51200)) checksum=Math.imul(checksum^b,16777619)>>>0;
assert.equal(checksum,0x2f75a8a5);
const pairs=[];
counts.forEach((n,i)=>{if (n) pairs.push([4*i,n]);});
assert.equal(pairs.reduce((total,p)=>total+p[1],0),run.steps);
writeFileSync(out,JSON.stringify({imageSha256:createHash('sha256').update(image.image).digest('hex'),
    fixture:'default 160x160 clean typedRayFrame',frameFnv:checksum.toString(16),steps:run.steps,counts:pairs})+'\n');
