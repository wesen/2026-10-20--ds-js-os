// Run from the project root. The fixtures use only public compiler APIs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import {runRv32} from '../../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
for (const file of ['typed-wasm','typed-rv32']) runInThisContext(readFileSync('picocalc-os/compiler/'+file+'.js','utf8'));
const values=[-2147483648,-4097,-1,0,1,9,4096,4097,4098,2147483647];
const memory = new Uint8Array(128);
const compile = (source,on,imports=[])=>typedRv32.compile(source,imports,undefined,{inlineGuardedReturns:on});
const native = (p,entry,args,bytes=memory,imports=[],handlers={})=>runRv32(p,entry,args,imports,handlers,bytes);
const counts={truthTable:0,spill:0,trapAndPrefixWrites:0,shortCircuit:0,exactlyOnce:0,imports:0,forward:0,rejected:0};
function sites(program,entry){
    const start=program.entries[entry],end=Object.values(program.entries).find(a=>a>start)??program.image.length;
    const dv=new DataView(program.image.buffer,program.image.byteOffset,program.image.byteLength);
    let n=0;
    for(let pc=start;pc<end;pc+=4)if((dv.getUint32(pc,true)&4095)===239)n++;
    return n;
}
for(const guard of ['===','!==','<','>','<=','>=']){
    for(const k of [0,4097]){
        for(const rhs of ['0 - x','0','65000']){
            const src='function fold(x:i32):i32 { if(x '+guard+' '+k+') return '+rhs+'; return x; }\n'+
                'function caller(x:i32):i32 { return fold(x); }\n'+
                'function deep(x:i32):i32 { return x+(x+(x+(x+(x+(x+fold(x)))))); }';
            const wasm=new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(src).bytes)).exports;
            const a=compile(src,false),b=compile(src,true);
            assert.equal(sites(a,'caller'),1);
            assert.equal(sites(b,'caller'),0,'accepted '+guard+' '+k+' '+rhs);
            for(const x of values)for(const entry of ['caller','deep']){
                const expected=wasm[entry](x);
                for(const p of [a,b])assert.equal(native(p,entry,[x]).result,expected,[guard,k,rhs,entry,x].join(' '));
                counts[entry==='deep'?'spill':'truthTable']++;
            }
            assert.deepEqual(typedRv32.compile(src,[],undefined,{streamFunctions:false,inlineGuardedReturns:true}).image,b.image);
        }
    }
}
const leaf='function fold(x:i32):i32 {if(x<0)return -x;return x;}';
const delayed='function forward(x:i32):i32 {return fold(x);}'+leaf;
assert.equal(sites(compile(delayed,true),'forward'),1);
counts.forward++;
const effect=leaf+'function effect(dst:buffer, i:i32):i32 { dst.setCharCodeAt(0,41); return fold(0 - (dst.charCodeAt(i) / i)); }';
const libs=[compile(effect,false),compile(effect,true)];
for(const i of [-1,0,1,2]){
    const initial=memory.slice(),dv=new DataView(initial.buffer);
    dv.setUint32(32,2,true);dv.setUint16(38,60001,true);
    const wasm=new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(effect).bytes)).exports;
    const wasmMem=new Uint8Array(wasm.memory.buffer);wasmMem.set(initial);
    let result,trap=false;try{result=wasm.effect(32,i);}catch(error){if(!(error instanceof WebAssembly.RuntimeError))throw error;trap=true;}
    for(const lib of libs){
        const n=native(lib,'effect',[32,i],initial);
        assert.equal(n.trap,trap);assert.equal(n.result,result);assert.deepEqual(n.bytes,wasmMem.slice(0,initial.length));
    }
    counts.trapAndPrefixWrites++;
}
const gated=leaf+`
function bump(b:buffer, i:i32):i32 { b.setCharCodeAt(0,b.charCodeAt(0)+1);return b.charCodeAt(i); }
function guarded(b:buffer, i:i32, active:bool):bool { return active && fold(0-bump(b,i))>0; }
function either(b:buffer, i:i32, active:bool):bool { return active || fold(0-bump(b,i))>0; }`;
for(const entry of ['guarded','either'])for(const active of [0,1])for(const index of [-1,0]){
    const initial=memory.slice();new DataView(initial.buffer).setUint32(32,1,true);
    const wasm=new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(gated).bytes)).exports;
    const wasmMem=new Uint8Array(wasm.memory.buffer);wasmMem.set(initial);
    let trap=false,result;try{result=wasm[entry](32,index,active);}catch(error){if(!(error instanceof WebAssembly.RuntimeError))throw error;trap=true;}
    for(const flag of [false,true]){
        const n=native(compile(gated,flag),entry,[32,index,active],initial);
        assert.equal(n.trap,trap);assert.equal(n.result,result);assert.deepEqual(n.bytes,wasmMem.slice(0,initial.length));
    }
    const invoked=entry==='guarded'?active:1-active;
    assert.equal(new DataView(wasmMem.buffer).getUint16(36,true),invoked);
    counts.shortCircuit++;counts.exactlyOnce++;
}
const imp=[{name:'fromHost',params:['i32'],result:'i32',guardedReturn:{kind:'neg'},inlineGuardedReturns:true}];
const importApp='function fromApp(x:i32):i32 {return fromHost(x);}';
const imported=compile(importApp,true,imp);
let called=0;assert.equal(native(imported,'fromApp',[17],memory,imp,{fromHost:x=>{called++;return 2*x;}}).result,34);
assert.equal(called,1);assert.equal(imported.relocations.length,1);counts.imports++;
for(const shape of ['function f(x:i32):i32 {if(x<0)return 7/x;return x;}', 'function f(x:i32):i32 {if(x<0)return -x;return 11;}']){
    assert.equal(sites(compile(shape+'function app(x:i32):i32{return f(x);}',true),'app'),1);counts.rejected++;
}
const report={counts,total:Object.values(counts).reduce((x,y)=>x+y,0),engines:['RV32/PIE interpreter with ABI checks','host WebAssembly']};
console.log(report);
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
