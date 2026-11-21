import {readFileSync as read,writeFileSync as write, readdirSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,"../../../../../../.."), out=resolve(process.argv[2]);
const realm=vm.createContext({}), base=join(root,"picocalc-os/compiler");
for(const f of [join(base,"typed-wasm.js"),join(base,"typed-rv32.js"),join(out,"packet-candidate.js")])vm.runInContext(read(f,"utf8"),realm);
const source=read(join(root,"picocalc-os/worlds/raytrace/raytrace.typed"),"utf8");
const sha=b=>createHash("sha256").update(b).digest("hex");
let assembly='.section .text.simd_frames,"ax",@progbits\n.option push\n.option norvc\n';
const identities=JSON.parse(read(join(out,"packet-images.json")));
for(const arm of ["baseline","empty","full"]) {
    realm.packetResearchVariant=arm;
    const compiled=realm.typedRv32.compile(source,[],undefined,{pieLoops:"pie"});
    assert.equal(compiled.relocations.length,0);
    const bytes=Buffer.from(compiled.image); assert.equal(sha(bytes),identities.arms[arm].imageSHA);
    assembly+=".balign 16\n";
    for(let offset=0;offset<bytes.length;offset+=4){
        for(const [entry,alias] of [["typedRayFrame","clean"],["typedRayTrace","primary"]]){
            if(offset===compiled.entries[entry]) assembly+=".global lab_"+arm+"_"+alias+"\nlab_"+arm+"_"+alias+":\n";
        }
        assembly+=".4byte 0x"+bytes.readUInt32LE(offset).toString(16)+"\n";
    }
}
write(join(out,"frame.S"),assembly+".option pop\n");
const wasm=realm.typedWasm.compile(source).bytes;
let patched=false;
for(let i=8;i<wasm.length;){
    const id=wasm[i++];let n=0, shift=0, b;
    do{b=wasm[i++];n+=(b&127)*2**shift;shift+=7;}while(b&128);
    if(id===5){assert.deepEqual([...wasm.slice(i,i+n)],[1,1,1,1]);wasm[i+3]=8;patched=true;break;}
    i+=n;
}
assert(patched);
const ref=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
ref.memory.grow(7);
const oldDir=join(root,"ttmp/2026/11/20"), study=readdirSync(oldDir).find(n=>n.startsWith("PICOCALC-TYPED-RAY--"));
const old=JSON.parse(read(join(oldDir,study,"various/device/rows.json")));
const inputs=old.filter(r=>r.program===0 && r.rep===0);
assert.equal(inputs.length,12);
const fixtures=[];
function hash(bytes){let x=2166136261;for(const b of bytes)x=Math.imul(x^b,16777619);return x>>>0;}
const work=64,rgb=8192,depth=131072,id=262144;
for(const r of inputs){
    const {stride,pose,fixture}=r, n=159*stride+160, buf=ref.memory.buffer, view=new DataView(buf);
    for(const [ptr,size] of [[work,2048],[rgb,n],[depth,n],[id,n]]){
        view.setUint32(ptr,size,true);new Uint8Array(buf,ptr+4,size*2).fill(ptr===work?0:0x55);
    }
    view.setUint16(work+4,stride,true);
    assert.equal(ref.typedRayFrame(rgb,work,...pose),1);
    assert.equal(ref.typedRayTrace(depth,id,work,pose[0],pose[1]),1);
    const hashes=[rgb,depth,id].map(p=>hash(new Uint8Array(buf,p+4,n*2)));
    fixtures.push({fixture,pose,stride,hashes});
}
write(join(out,"frame-fixtures.json"),JSON.stringify(fixtures,null,2)+"\n");
const rows=fixtures.map(({fixture,pose,stride,hashes})=>'{'+JSON.stringify(fixture)+','+[...pose,stride,...hashes.map(n=>n+'u')].join(',')+'}');
write(join(out,"frame_inputs.h"),'static const frame_case frames[]={\n'+rows.join(',\n')+'\n};\n');
