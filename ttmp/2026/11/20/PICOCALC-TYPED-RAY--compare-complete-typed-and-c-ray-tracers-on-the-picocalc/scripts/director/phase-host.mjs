import assert from "node:assert/strict";
import fs from "node:fs";
import {crc32} from "node:zlib";
import vm from "node:vm";

const [file] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(new URL("../../various/director/phase-oracles.json",import.meta.url)));
const source = fs.readFileSync(file,"utf8");
const ctx=vm.createContext({});
for (const name of ["typed-wasm","typed-rv32","raytrace-material"])
    vm.runInContext(fs.readFileSync("picocalc-os/compiler/"+name+".js","utf8"),ctx);
const api=new WebAssembly.Instance(new WebAssembly.Module(ctx.typedWasm.compile(source).bytes)).exports;
const mem=new DataView(api.memory.buffer);
let end=64;
function buf(n) { const addr=end; end+=(4+2*n+3)&~3; mem.setUint32(addr,n,true); return addr; }
const graph=buf(303),work=buf(2048),shader=buf(192),ids=buf(160),visible=buf(160),shadow=buf(160),color=buf(320);
for (const c of cases) {
    assert.equal(api.typedMatBuild(graph,c.fixture,c.weight),1);
    assert.equal(api.typedMatRowPhase(work,graph,ids,visible,shadow,0,0),1);
    let mask=0,output=0,pixels=0;
    for(let y=0;y<160;y++){
        assert.equal(api.typedMatRowPhase(work,graph,ids,visible,shadow,y,1),1);
        assert.equal(api.typedMatRowPhase(work,graph,ids,visible,shadow,y,2),1);
        assert.equal(api.candelaShadeRow(graph,shader,ids,y,color),160);
        mask=crc32(new Uint8Array(mem.buffer,shadow+4,320),mask);
        output=crc32(new Uint8Array(mem.buffer,color+4,640),output);
        for(let x=0;x<160;x++)pixels+=mem.getUint16(shadow+4+2*x,true);
    }
    assert.equal(mask.toString(16).padStart(8,"0"),c.shadowCRC);
    assert.equal(output.toString(16).padStart(8,"0"),c.materialCRC);
    assert.equal(pixels,c.shadowPixels);
}
if (process.argv[3]){
    const elf=fs.readFileSync(process.argv[3]);
    assert.equal(ctx.linkTypedMaterial(source,elf).length,elf.length);
}
console.log("Qualified all",cases.length,"unlit material and shadow masks.");
