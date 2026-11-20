// Observe the release compiler independently of either candidate implementation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInThisContext} from 'node:vm';
import {resolve} from 'node:path';
const root=process.cwd();
const ids={};
for(const file of ['typed-wasm.js','typed-rv32.js']){
  const bytes=readFileSync(resolve(root,'picocalc-os/compiler',file));
  ids[file]=createHash('sha256').update(bytes).digest('hex');
  runInThisContext(bytes.toString(),{filename:file});
}
const rows=[];
for(const n of [1,8,32,128,512,1022]){
  for(const copies of [1,2,4]){
    const literal='x'.repeat(n);
    const source=Array.from({length:copies},(_,i)=>
      'function copy'+i+'(out: buffer): i32 { return out.writeLiteral(0,'+JSON.stringify(literal)+'); }').join('\n');
    const program=typedRv32.compile(source), wasm=typedWasm.compile(source).bytes;
    const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
    const view=new DataView(instance.memory.buffer);
    for(let i=0;i<copies;i++){
      view.setUint32(0,n,true);
      new Uint16Array(instance.memory.buffer,4,n+1).fill(0xabba);
      assert.equal(instance['copy'+i](0),n);
      const units=new Uint16Array(instance.memory.buffer,4,n+1);
      assert(units.subarray(0,n).every(c=>c===120));assert.equal(units[n],0xabba);
    }
    rows.push({units:n,copies,rv32Bytes:program.image.length,wasmModuleBytes:wasm.length});
  }
}
writeFileSync(process.argv[2],JSON.stringify({sourceSHA256:ids,rows},null,2)+'\n');
