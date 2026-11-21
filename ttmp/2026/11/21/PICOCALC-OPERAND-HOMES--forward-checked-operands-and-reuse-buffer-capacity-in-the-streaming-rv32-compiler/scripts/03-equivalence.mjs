import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import {runRv32} from '../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
for(const name of ['typed-wasm','typed-rv32','typed-pie-loops'])runInThisContext(readFileSync('picocalc-os/compiler/'+name+'.js','utf8'));
const source=`
function bump(b:buffer):i32 { b.setCharCodeAt(0,b.charCodeAt(0)+1);return 17; }
function walk(b:buffer,c:buffer,i:i32,k:i32):i32 {
 let sum=b.charCodeAt(0);let j=0;
 while(j<k){let old=sum;sum=b.charCodeAt(j)+old+c.charCodeAt(j);j=j+1;}
 return sum+b.length+b.charCodeAt(i);
}
function assigned(b:buffer,c:buffer,i:i32,k:i32):i32 {
 let current=b; let sum=current.charCodeAt(0); if(k>0){current=c;} return sum+current.charCodeAt(i)+current.length;
}
function lazy(b:buffer,c:buffer,i:i32,k:i32):i32 {
 if(k===0)return 41;
 return b.charCodeAt(i)+b.charCodeAt(0);
}
function effects(b:buffer,c:buffer,i:i32,k:i32):i32 {
 c.setCharCodeAt(1,1234); b.setCharCodeAt(i,bump(c));return c.charCodeAt(0);
}
function deep(b:buffer,c:buffer,i:i32,k:i32):i32 {
 return k+(i+(k+(i+(k+(i+(b.charCodeAt(i)+b.charCodeAt(0)))))));
}
function constants(b:buffer,c:buffer,i:i32,k:i32):i32 {
 return b.charCodeAt(0)+b.charCodeAt(1021)+b.charCodeAt(1022);
}`;
const wasm=new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(source).bytes)).exports;
let cases=0;
for(let bits=0;bits<8;bits++){
 const o={inlineGuardedReturns:true,operandLocations:{forward:!!(bits&1),capacity:!!(bits&2),homes:!!(bits&4)}};
 const img=typedRv32.compile(source,[],undefined,o);
 assert.deepEqual(img.image,typedRv32.compile(source,[],undefined,{...o,streamFunctions:false}).image);
 for(const name of ['walk','assigned','lazy','effects','deep','constants'])for(const capacity of [0,2,1023])
 for(const i of [-1,0,1,3])for(const k of [0,2])for(const c of [32,2088]){
   const mem=new Uint8Array(4200),dv=new DataView(mem.buffer);
   for(const base of [32,2088]){dv.setUint32(base,base===32?capacity:2,true);for(let j=0;j<1023;j++)dv.setUint16(base+4+2*j,j+19,true);}
   const bytes=new Uint8Array(wasm.memory.buffer);bytes.set(mem);let trap=false,result;
   try{result=wasm[name](32,c,i,k);}catch(e){assert(e instanceof WebAssembly.RuntimeError);trap=true;}
   const n=runRv32(img,name,[32,c,i,k],[],{},mem);
   assert.equal(n.trap,trap,name);assert.equal(n.result,result,name);assert.deepEqual(n.bytes,bytes.slice(0,mem.length),name);cases++;
 }
}
console.log(JSON.stringify({comparisons:cases,policyCombinations:8}));
