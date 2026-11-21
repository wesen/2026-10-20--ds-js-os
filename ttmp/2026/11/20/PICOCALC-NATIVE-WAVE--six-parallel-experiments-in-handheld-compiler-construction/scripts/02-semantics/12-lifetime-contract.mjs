import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createContext,runInContext} from "node:vm";
import {root,stage} from "./01-stage.mjs";

const [output] = process.argv.slice(2);
assert(output,"provide a receipt path");
const repoDay=resolve(root,"ttmp/2026/11/20");
const review=readdirSync(repoDay).find(name=>name.startsWith("PICOCALC-TYPED-PIE--"));
const {runRv32}=await import(pathToFileURL(resolve(repoDay,review,"scripts/review/run-rv32.mjs")));
const compiler=stage();
const lengths=[0,1,7,8,511,1022];
const literals=lengths.map(length=>length < 3 ? "x".repeat(length) : "☺🐈"+"Z".repeat(length-3));
const tails=literals.map((text,i)=>`function write${i}(out: buffer, at: i32): i32 {
    return out.writeLiteral(at, ${JSON.stringify(text)});
}`);
const source=`function rhs(marker: buffer, source: string, at: i32): i32 {
    marker.setCharCodeAt(0, 515);
    return source.charCodeAt(at);
}
function guardOrder(out: buffer, marker: buffer, source: string, p: i32, q: i32): i32 {
    out.setCharCodeAt(0, 513);
    out.setCharCodeAt(p, rhs(marker, source, q));
    return 7;
}
function nested(source: string, position: i32): i32 {
    return 1 + (2 + (3 + (4 + (5 + (6 + source.charCodeAt(position))))));
}
`+tails.join("\n");

const sha=value=>createHash("sha256").update(value).digest("hex");
const input=new Uint8Array(4096).fill(0xaa);
const out=16, marker=2112, data=2208, outCapacity=1024;
const initial=new DataView(input.buffer);
initial.setUint32(out,outCapacity,true);
initial.setUint32(marker,1,true);
initial.setUint32(data,2,true);
initial.setUint16(data+4,0x1234,true);
initial.setUint16(data+6,0xfedc,true);
const results={};
for (const policy of ["early","late","selected"]) {
    const ctx=createContext({});
    for (const part of ["typed-wasm.js","typed-rv32.js"])
        runInContext(compiler[part] ?? readFileSync(resolve(root,"picocalc-os/compiler",part),"utf8"),ctx);
    const opts={semanticPolicy:policy,semanticStats:{addresses:0,literals:0}};
    const program=ctx.typedRv32.compile(source,[],undefined,opts);
    const wasm=ctx.typedWasm.compile(source).bytes;
    const guest=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
    const memory=new Uint8Array(guest.memory.buffer,0,input.length);
    const result=results[policy]={cases:0,traps:0,steps:0,bytes:program.image.length,
        wasmSHA256:sha(wasm),rv32SHA256:sha(program.image),kept:opts.semanticStats};
    if(policy!=="early") assert.equal(result.wasmSHA256,results.early.wasmSHA256);
    function check(name,args,value,write) {
        const expected=input.slice();
        if(write) write(new DataView(expected.buffer));
        const trap=value===undefined;
        memory.set(input);
        if(trap) assert.throws(()=>guest[name](...args),WebAssembly.RuntimeError);
        else assert.equal(guest[name](...args),value);
        const rv=runRv32(program,name,args,[],{},input);
        assert.equal(rv.trap,trap);
        assert.equal(rv.result,value);
        assert.deepEqual(memory,expected);
        assert.deepEqual(rv.bytes,expected);
        result.cases++;
        result.traps+=Number(trap);
        result.steps+=rv.steps;
    }
    for (const p of [-1,0,1,1023,1024]) {
        for(const q of [-1,0,1,2]) {
            const destValid=p>=0 && p<outCapacity;
            const srcValid=q>=0 && q<2;
            check("guardOrder",[out,marker,data,p,q],destValid && srcValid ? 7 : undefined,v=>{
                v.setUint16(out+4,513,true);
                if(destValid) {
                    v.setUint16(marker+4,515,true);
                    if(srcValid) v.setUint16(out+4+2*p,initial.getUint16(data+4+2*q,true),true);
                }
            });
        }
    }
    for (const pos of [-1,0,1,2])
        check("nested",[data,pos],pos>=0 && pos<2 ? 21+initial.getUint16(data+4+2*pos,true) : undefined);
    for (const [i,value] of literals.entries()) {
        const last=outCapacity-value.length;
        for (const pos of [-2147483648,-1,0,1,last,last+1,2147483647]) {
            const valid = value.length===0 || (pos>=0 && pos+value.length<=outCapacity);
            check("write"+i,[out,pos],valid ? value.length : undefined,valid ? v=>{
                for(let j=0;j<value.length;j++) v.setUint16(out+4+2*(pos+j),value.charCodeAt(j),true);
            } : null);
        }
    }
}
writeFileSync(output,JSON.stringify({sourceSHA256:sha(source),lengths,results},null,2)+"\n");
