import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runInThisContext} from 'node:vm';
import {join} from 'node:path';
const out=process.argv[2]; mkdirSync(out,{recursive:true});
runInThisContext(readFileSync('picocalc-os/compiler/typed-wasm.js','utf8'));
const src=readFileSync('picocalc-os/worlds/raytrace/raytrace.typed','utf8');
const wasm=new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(src).bytes)).exports;
const work=64, memory=new Uint8Array(wasm.memory.buffer,work,4100);
memory.fill(0xa5);
new DataView(memory.buffer).setUint32(work,2048,true);
assert.equal(wasm.typedRayPrepare(work,68,61,31,25),1);
const start=memory.slice();
for(let y=0;y<160;y++){
    memory.set(start);
    const header=Buffer.alloc(4); header.writeInt32LE(y);
    writeFileSync(join(out,y+'.in'),Buffer.concat([header,start]));
    assert.equal(wasm.typedRayComputeRow(work,y),1);
    writeFileSync(join(out,y+'.gold'),memory);
}
