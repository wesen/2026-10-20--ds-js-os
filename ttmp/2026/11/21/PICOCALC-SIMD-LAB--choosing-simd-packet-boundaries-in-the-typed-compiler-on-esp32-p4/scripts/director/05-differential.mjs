// Compare whole Typed buffers and trap occurrence, using compiled Wasm
// as the value/prefix oracle. Vendor disassembly selects the instruction semantics.
import assert from "node:assert/strict";
import {readFileSync as read,writeFileSync as write} from "node:fs";
import {execFileSync} from "node:child_process";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import vm from "node:vm";
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,"../../../../../../..");
const out=resolve(process.argv[2]),prefix=process.argv[3];
const old=join(root,"ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review");
const {decode}=await import(pathToFileURL(join(old,"decode.mjs")));
// Preserve the original emulator plus this investigator's independent instruction
// semantics even after another research lane adds its own decoder support.
const relative=old.slice(root.length+1)+"/packed.mjs";
const packed=execFileSync("git",["show","acbb1ec:"+relative],{cwd:root,encoding:"utf8"}),line="        assert.match(first,/^q[0-7]$/);";
assert.equal(packed.split(line).length,2);
write(join(out,"packed.mjs"),packed.replace(line,`        if (op==="esp.min.u16.a" || op==="esp.max.u16.a" || op==="esp.movi.16.a") {
            const reg=Number(first.slice(1));
            const lanes=Array.from(target,v=>v&65535);
            x[reg]=op==="esp.min.u16.a"?Math.min(...lanes):op==="esp.max.u16.a"?Math.max(...lanes):lanes[Number(second)];
            return;
        }
`+line));
write(join(out,"run-rv32.mjs"),read(join(old,"run-rv32.mjs")));
const {runRv32}=await import(pathToFileURL(join(out,"run-rv32.mjs")));
const realm=vm.createContext({});
for(const f of ["typed-wasm","typed-rv32"])vm.runInContext(read(join(root,"picocalc-os/compiler",f+".js"),"utf8"),realm);
vm.runInContext(read(join(out,"packet-candidate.js"),"utf8"),realm);
const source=read(join(root,"picocalc-os/worlds/raytrace/raytrace.typed"),"utf8");
function prepare(src) {
    const wasm=new WebAssembly.Instance(new WebAssembly.Module(realm.typedWasm.compile(src).bytes)).exports;
    const arms={};
    for(const v of ["baseline","empty","full"]){
        realm.packetResearchVariant=v;
        const image=realm.typedRv32.compile(src,[],undefined,{pieLoops:"pie"});
        arms[v]={image,dis:decode(image.image,prefix)};
    }
    return {wasm,arms};
}
const ray=prepare(source), cases=[], groups={};
function compare(suite,name,args,initial,group){
    const mem=new Uint8Array(suite.wasm.memory.buffer,0,initial.length);
    mem.set(initial);
    let trap=false,gold;
    try{gold=suite.wasm[name](...args)}catch(e){if(!(e instanceof WebAssembly.RuntimeError))throw e;trap=true}
    let counts=groups[group]??={calls:0,traps:0,steps:{},packedStores:{},reductions:{},extractions:{}};
    counts.calls++;counts.traps+=+trap;
    for(const [mode,{image,dis}] of Object.entries(suite.arms)){
        let reds=0,exts=0;
        const r=runRv32(image,name,args,[],{},initial,dis,5e6,pc=>{
            const op=dis.get(pc)?.op;
            if(op==="esp.min.u16.a"||op==="esp.max.u16.a")reds++;
            if(op==="esp.movi.16.a")exts++;
        });
        assert.equal(r.trap,trap);assert.equal(r.result,gold);
        assert.deepEqual(Buffer.from(r.bytes),Buffer.from(mem));
        for(const [key,delta] of [["steps",r.steps],["packedStores",r.packed.stores],["reductions",reds],["extractions",exts]])
            counts[key][mode]=(counts[key][mode]||0)+delta;
    }
}
function scene(pose){
    const a=64;const mem=new Uint8Array(ray.wasm.memory.buffer,0,4164);mem.fill(0xa5);
    const d=new DataView(mem.buffer);d.setUint32(a,2048,true);ray.wasm.typedRayPrepare(a,...pose);return mem.slice();
}
const opening=scene([68,61,31,25]);
for(let y=0;y<160;y++)compare(ray,"typedRayComputeRow",[64,y],opening,"opening");
for(const [name,cap,index,value] of [["partial",1710,null,0],["alias",2048,16,12],["highHalf",2048,42,65535]]){
    const m=opening.slice();const d=new DataView(m.buffer);d.setUint32(64,cap,true);
    if(index!==null)d.setUint16(68+index*2,value,true);
    compare(ray,"typedRayComputeRow",[64,61],m,name);
}
// This transfer fixture writes memory before a possible trap. Each comparison
// therefore covers every visible write preceding that exception as well as its value.
const transfer=prepare(`function fill(a:buffer, first:i32, n:i32, ceiling:i32):i32 {
    let sum=0;
    for(let i=0;i<n;i=i+1){
        let diff=ceiling-a.charCodeAt(first+i);
        if(diff>=0){sum=sum+diff; a.setCharCodeAt(32+i,diff);}
    }
    return sum;
}`);
for(const n of [0,1,2,3,4,5,6,7,8,9,15,16,17,24,31]) for(const ceiling of [-1,0,4,32766,32767,32768,65535]) for(const cap of [34,96]){
    const m=new Uint8Array(260),d=new DataView(m.buffer);d.setUint32(64,cap,true);
    for(let i=0;i<96;i++)d.setUint16(68+2*i,[0,1,4,32766,32767,32768,65534,65535][i%8],true);
    compare(transfer,"fill",[64,6,n,ceiling],m,"boundaries");
}
write(join(out,"differential.json"),JSON.stringify({groups},null,2)+"\n");
