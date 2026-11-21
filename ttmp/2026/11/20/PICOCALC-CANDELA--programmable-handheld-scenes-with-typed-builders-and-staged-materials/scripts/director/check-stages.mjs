import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {createContext,runInContext} from "node:vm";
import {runRv32} from "../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs";

const [output,...sources] = process.argv.slice(2);
assert(output && sources.length);
const ctx = createContext({});
for(const name of ["typed-wasm","typed-async","typed-rv32"])
    runInContext(readFileSync("picocalc-os/compiler/"+name+".js","utf8"),ctx);
const hash = a => createHash("sha256").update(a).digest("hex");
const results=[], controls=new Map();
for(const file of sources) {
    const source=readFileSync(file,"utf8");
    const wasm=ctx.typedWasm.compile(source).bytes, rv=ctx.typedRv32.compile(source);
    const api=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
    const rows=[];
    for(const fixture of [0,1]) {
        // Preserve all buffers between calls to match the ordinary loader.
        let bytes=new Uint8Array(4096);
        const graph=32,work=1024;
        const initial=new DataView(bytes.buffer);
        initial.setUint32(graph,303,true); initial.setUint32(work,192,true);
        new Uint8Array(api.memory.buffer).set(bytes);
        const call=(name,...args)=>{
            const ref=api[name](...args);
            const res=runRv32(rv,name,args,[],{},bytes,undefined,3000000);
            assert.equal(res.trap,false,name); assert.equal(res.result,ref,name);
            bytes=new Uint8Array(res.bytes);
            assert.deepEqual(bytes,new Uint8Array(api.memory.buffer).slice(0,bytes.length),name);
            return ref;
        };
        assert.equal(call("candelaBuildScene",graph,fixture),1);
        const material=(i)=>new DataView(bytes.buffer,bytes.byteOffset).getUint16(graph+4+2*i,true);
        const nodes=material(2), floor=material(6);
        for(const weight of fixture?[64,73,128]:[0,128,256]) {
            const before=bytes.slice(graph,graph+610);
            assert.equal(call("candelaSetParam",graph,0,weight),1);
            const after=bytes.slice(graph,graph+610);
            const offset=4+2*295;
            assert.deepEqual(before.slice(0,offset),after.slice(0,offset));
            assert.deepEqual(before.slice(offset+2),after.slice(offset+2));
            const ids=[material(284),material(289),floor];
            const samples=[];
            for(const id of ids)
                for(const [x,y] of [[0,0],[1,1],[7,9],[12,12],[40,63],[159,159]])
                    samples.push(call("candelaColorAt",graph,work,id,x,y));
            if(fixture===0) {
                assert.equal(samples[0],0x1e4696);
                if(weight===256) assert.equal(samples[6],0xdcaa28);
            }
            const key=fixture+"/"+weight;
            if(controls.has(key)) assert.deepEqual(samples,controls.get(key)); else controls.set(key,samples);
            rows.push({fixture,weight,nodes,graph:hash(after),samples});
        }
    }
    results.push({source:hash(source),wasmBytes:wasm.length,rv32Bytes:rv.image.length,rows});
}
writeFileSync(output,JSON.stringify(results,null,2)+"\n");
console.log("Qualified",results.length,"source stages across both targets");
