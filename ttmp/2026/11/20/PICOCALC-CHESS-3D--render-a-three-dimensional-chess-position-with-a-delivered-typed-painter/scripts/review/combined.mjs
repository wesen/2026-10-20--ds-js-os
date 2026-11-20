import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createCompiler} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/03-compile.mjs';
import {decode} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';
import {runRv32} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';

const [candidateFile,fixtureFile,outputFolder,binutils] = process.argv.slice(2);
assert(candidateFile && fixtureFile,'usage: node combined.mjs CANDIDATE_SOURCE SCALAR_FIXTURES [OUT] [BINUTILS_PREFIX]');
if(outputFolder) fs.mkdirSync(outputFolder,{recursive:true});
const prefix = binutils ?? '/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf';
const frozenSource=fs.readFileSync(new URL('../scene/isometric.typed',import.meta.url),'utf8');
const source=fs.readFileSync(candidateFile,'utf8');
const digest=data=>createHash('sha256').update(data).digest('hex');
assert.equal(digest(frozenSource),'d6c2dc3a6858dbf1571409a534f63c27d0d5ab116dd466fafbd7701fca7a81a4');
const {rv32,wasm}=createCompiler();
const oracle=new WebAssembly.Instance(new WebAssembly.Module(wasm.compile(frozenSource).bytes)).exports;
const batchedWasm = new WebAssembly.Instance(new WebAssembly.Module(wasm.compile(source).bytes)).exports;
const compile=options=>rv32.compile(source,[],undefined,options);
const frozenNative=rv32.compile(frozenSource);
const programs={stock:compile({}),guarded:compile({piePortable:true}),pie:compile({pie:true})};
const signature=programs.pie.signatures.find(f=>f.name==='paintChess');
assert.equal(signature.params.join(','),Array(8).fill('buffer').join(','));
assert.equal(signature.result,'i32');
assert.equal(programs.pie.importCount,0);
assert.equal(programs.pie.relocations.length,0);
const decoded=decode(programs.pie.image,prefix);
const ordered=Object.entries(programs.pie.entries).sort((a,b)=>a[1]-b[1]);
const owners=new Map();
for(let i=0;i<ordered.length;i++){
    const [name,start]=ordered[i];
    const end=ordered[i+1]?.[1]??programs.pie.image.length;
    for(let at=start;at<end;at+=4) owners.set(at,name);
}
const staticPie={};
for(const [at,instruction] of decoded){
    if(instruction.op.startsWith('esp.')){
        const name=owners.get(at);
        staticPie[name]=(staticPie[name]??0)+1;
    }
}
assert.deepEqual(Object.keys(staticPie),['project'],'only projection should contain PIE');
const statePtr=12,commandPtr=508,commandCapacity=4096,scratchCapacity=82,bytesTotal=14000;
const normalPtrs=Array.from({length:6},(_,i)=>11004+192*i);
const fixture=fs.readFileSync(fixtureFile);
const stride=4+180+4+8192;
assert.equal(fixture.length,stride*47);
const rows=Array.from({length:47},(_,i)=>{
    const row=fixture.subarray(i*stride,(i+1)*stride);
    assert.equal(row.readUInt32LE(),90);
    const count=row.readUInt32LE(184);
    return {id:'game-'+i,state:row.subarray(0,184),pitch:5,expected:row.subarray(188,188+2*count)};
});
function variant(id,change={}){
    return {...rows[0],expected:undefined,id,...change};
}
rows.push(variant('low',{pitch:3}),variant('high',{pitch:7}));
for (const [id,cursor] of [['e3',44],['f3',45]]) {
    const state=Buffer.from(rows[0].state);
    state.writeUInt16LE(cursor,4+72*2);
    rows.push(variant(id,{state}));
}
for(let k=0;k<6;k++) rows.push(variant('misalign-'+k,{misalign:k}));
rows.push(variant('alias-input-output',{alias:true}));
let warm=undefined;
const results=[];
for(const [idx,row] of rows.entries()){
    const label=row.id,pointers=normalPtrs.slice();
    if(row.misalign!==undefined) pointers[row.misalign]+=4;
    if(row.alias) pointers[3]=pointers[0];
    const initial=warm?.slice()??new Uint8Array(bytesTotal).fill(0xa9);
    initial.set(row.state,statePtr);
    const view=new DataView(initial.buffer);
    view.setUint32(commandPtr,commandCapacity,true);
    const args=[statePtr,commandPtr,...pointers];
    for(const p of pointers){
        view.setUint32(p,scratchCapacity,true);
        // Alternate stale prior-frame contents with distinct input and output poison.
        if(idx%2===0) for(let i=0;i<scratchCapacity;i++) view.setUint16(p+4+2*i,0xc510+i+idx,true);
    }
    view.setUint16(pointers[1]+4+2*81,row.pitch,true);
    const frozenArena=new Uint8Array(oracle.memory.buffer,0,bytesTotal);
    frozenArena.set(initial);
    const n=oracle.paintPose(statePtr,commandPtr,row.pitch);
    const end=commandPtr+4+2*n;
    const expected=frozenArena.slice(commandPtr+4,end);
    if(row.expected) assert.deepEqual(Buffer.from(expected),row.expected,label+' frozen game stream');
    const wasmArena=new Uint8Array(batchedWasm.memory.buffer,0,bytesTotal);
    wasmArena.set(initial);
    const batchedCount=batchedWasm.paintChess(...args);
    assert.equal(batchedCount,n,label+' batch vs point-at-a-time size');
    assert.deepEqual(wasmArena.slice(commandPtr+4,end),expected,label+' batch vs point-at-a-time contents');
    const mutable=new Uint8Array(bytesTotal);
    mutable.fill(1,commandPtr+4,end);
    for(const p of pointers) mutable.fill(1,p+4,p+4+2*81);
    for(let i=0;i<bytesTotal;i++) if(!mutable[i]) assert.equal(wasmArena[i],initial[i],label+' outside write regions at '+i);
    const frozenArgs=row.pitch===5?[statePtr,commandPtr]:[statePtr,commandPtr,row.pitch];
    const frozenEntry=row.pitch===5?'paintChess':'paintPose';
    const baseline=runRv32(frozenNative,frozenEntry,frozenArgs,[],{},initial,undefined,1000000);
    assert.equal(baseline.result,n);
    assert.deepEqual(baseline.bytes,frozenArena,label+' frozen scalar RV32');
    const counts={frozen:baseline.steps};
    let selectedStores, nativeCommand;
    const reached={};
    for(const [arm,program] of Object.entries(programs)){
        const trace=arm==='pie'?{get(at){
            const item=decoded.get(at);
            if(item.op.startsWith('esp.')){
                const owner=owners.get(at);
                reached[owner]=(reached[owner]??0)+1;
            }
            return item;
        }}:undefined;
        const executed=runRv32(program,'paintChess',args,[],{},initial,trace,1000000);
        assert.equal(executed.trap,false,label+' '+arm+' trap');
        assert.equal(executed.result,n,label+' '+arm+' return');
        assert.deepEqual(executed.bytes,wasmArena,label+' '+arm+' arena including 6 scratch columns');
        counts[arm]=executed.steps;
        if(arm==='pie') {
            selectedStores=executed.packed.stores;
            nativeCommand=executed.bytes.slice(commandPtr+4,end);
        }
    }
    const eligible=row.misalign===undefined && !row.alias;
    assert.equal(selectedStores,eligible?30:0,label+' actual three stores per group');
    assert.deepEqual(Object.keys(reached),eligible?['project']:[],label+' instruction ownership');
    const observed=new DataView(wasmArena.buffer);
    for(let i=0;i<=80;i++){
        const x=(i%9)*16,z=Math.floor(i/9)*16;
        const want=[x,0,z,384+x-z,640+x+z,x+z];
        for(let ch=0;ch<6;ch++){
            if(row.alias && ch===0) continue;
            assert.equal(observed.getUint16(pointers[ch]+4+2*i,true),want[ch],label+' scratch '+ch+' vertex '+i);
        }
    }
    if(outputFolder) fs.writeFileSync(outputFolder+'/'+label+'.words',nativeCommand);
    results.push({id:label,pitch:row.pitch,words:n,sha256:digest(expected),packedStores:selectedStores,packedByFunction:reached,instructions:counts});
    if(!row.alias && row.misalign===undefined) warm=wasmArena.slice();
}
const images=Object.fromEntries(Object.entries(programs).map(([arm,p])=>[arm,{bytes:p.image.length,sha256:digest(p.image)}]));
console.log(JSON.stringify({frozenSha256:digest(frozenSource),candidateSha256:digest(source),fixtureSha256:digest(fixture),images,staticPie,results},null,2));
