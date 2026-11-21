import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {createContext,runInContext} from "node:vm";
import {positiveDivisorCompiler} from "./positive-divisors.mjs";
import {runRv32} from "../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs";

const [output] = process.argv.slice(2);
assert(output, "usage: node edge-cases.mjs OUT.json");
const source = name=>readFileSync("picocalc-os/compiler/"+name+".js","utf8");
const backend=source("typed-rv32"), candidate=positiveDivisorCompiler(backend);
const sha=x=>createHash("sha256").update(x).digest("hex");
const divisors=[1,2,3,7,8,16,31,32,127,255,256,1024,2047,2048,4095,65535,65536,1073741824,2147483647];
let seed = 1193417;
const values=[-2147483648,-2147483647,-65536,-257,-255,-33,-32,-17,-2,-1,0,1,2,3,16,31,32,33,255,256,65535,2147483646,2147483647];
for(let i=0;i<30;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;values.push(seed);}
const cases=divisors.flatMap(d=>["q","r"].map(op=>{
    const symbol=op==="q"?"/":"%";
    return {name:op+d,source:"function "+op+d+"(v:i32):i32{return v"+symbol+d+";}",d,op};
}));
const extra=`
function effect(b:buffer,v:i32):i32 { b.setCharCodeAt(0,b.charCodeAt(0)+1); return v; }
function once(b:buffer,v:i32):i32 {return effect(b,v)%1 + effect(b,v)/1;}
function variable(v:i32,d:i32):i32{return v/d;}
function overflow(v:i32):i32{return v / (0 - 1);}
function zero(v:i32):i32{return v % 0;}
function deep(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32):i32{
    return a+(b+(c+(d+(e+(f+(g+h/255))))));
}
function observed(b:buffer):i32 {return effect(b,3)/0;}
function read(b:buffer,n:i32):i32 {return b.charCodeAt(n)/1;}
`;
const text=cases.map(c=>c.source).join("\n")+extra;
function setup(be) {
    const ctx=createContext({});
    runInContext(source("typed-wasm"),ctx); runInContext(be,ctx);
    const native=ctx.typedRv32.compile(text);
    assert.deepEqual(native.image,ctx.typedRv32.compile(text,[],undefined,{streamFunctions:false}).image);
    return {native,wasm:ctx.typedWasm.compile(text).bytes};
}
const stock=setup(backend), optimized=setup(candidate);
const metadata={originalBackend:sha(backend),candidateBackend:sha(candidate),divisors,values:values.length,
    stockImageBytes:stock.native.image.length,optimizedImageBytes:optimized.native.image.length,
    wasmSHA256:sha(stock.wasm),arithmeticCases:0,guardCases:0,effects:0};
assert.equal(sha(stock.wasm),sha(optimized.wasm));
const guest = new WebAssembly.Instance(new WebAssembly.Module(stock.wasm)).exports;
const memory=new Uint8Array(128), v=new DataView(memory.buffer);
v.setUint32(8,4,true); v.setUint16(12,0x8000,true);
function check(name,args,expected,edits=0) {
    const shouldTrap=expected===undefined;
    const wasmBytes = new Uint8Array(guest.memory.buffer,0,memory.length);
    wasmBytes.set(memory);
    if(shouldTrap) assert.throws(()=>guest[name](...args),WebAssembly.RuntimeError);
    else assert.equal(guest[name](...args),expected,name);
    const after=memory.slice(); new DataView(after.buffer).setUint16(12,0x8000+edits,true);
    assert.deepEqual(wasmBytes,after);
    for(const arm of [stock,optimized]) {
        const actual=runRv32(arm.native,name,args,[],{},memory);
        assert.equal(actual.trap,shouldTrap,name);assert.equal(actual.result,expected,name);
        assert.deepEqual(actual.bytes,after,name);
    }
}
for(const {name,d,op} of cases) for(const v of values){
    const a=BigInt(v),b=BigInt(d);
    check(name,[v],Number(op==="q"?a/b:a%b));
    metadata.arithmeticCases++;
}
for(const v of values){
    check("once",[8,v],v,2);
    check("deep",[1,2,3,4,5,6,7,v],28+Number(BigInt(v)/255n));
    check("variable",[v,0],undefined);
    check("zero",[v],undefined);
    check("overflow",[v],v===-2147483648?undefined:(-v|0));
    metadata.guardCases+=3;metadata.effects+=2;
}
check("observed",[8],undefined,1);
check("read",[8,4],undefined);
metadata.guardCases+=2;
writeFileSync(output,JSON.stringify(metadata,null,2)+"\n");
console.log(metadata);
