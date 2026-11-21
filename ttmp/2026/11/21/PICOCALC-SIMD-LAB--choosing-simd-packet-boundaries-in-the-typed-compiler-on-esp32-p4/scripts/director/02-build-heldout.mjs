// Generate identical host/device source variants and executable reference words.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
const here=dirname(fileURLToPath(import.meta.url)), out=resolve(process.argv[2]), repo=resolve(here,"../../../../../../..");
const load=p=>readFileSync(p,"utf8");
const sha=b=>createHash("sha256").update(b).digest("hex");
mkdirSync(out,{recursive:true});
const realm=vm.createContext({});
const bundle=["typed-wasm","typed-rv32","typed-pie-loops"].map(x=>execFileSync("git",["show","9a1ff99:picocalc-os/compiler/"+x+".js"],{cwd:repo,encoding:"utf8"})).concat(load(join(here,"selector.js"))).join("\n");
vm.runInContext(bundle,realm);
writeFileSync(join(out,"compiler.js"),bundle);
const source=load(join(here,"collision.typed"));
const cases=[], compiled={};
let assembly=".section .text.simd_heldout,\"ax\",@progbits\n.option push\n.option norvc\n";
for (const [label,bound] of [["short",8],["long",96],["dynamic",null]]) {
    const src=bound===null?source:source.replace("body < count","body < "+bound);
    assert(bound===null || src!==source);
    writeFileSync(join(out,label+".typed"),src);
    const oracle=new WebAssembly.Instance(new WebAssembly.Module(realm.typedWasm.compile(src).bytes)).exports;
    const view=new DataView(oracle.memory.buffer); view.setUint32(64,160,true);
    const images={};
    for (const mode of ["stock","scalar","pie","auto"]) {
        const calls=[];
        const choose=r=>{const d=realm.simdChoose(r); calls.push({facts:r,...d});return d;};
        const bin=realm.typedRv32.compile(src,[],undefined,{pieLoops:mode==="stock"?undefined:mode==="auto"?choose:mode});
        const bytes=Buffer.from(bin.image);
        images[mode]={sha:sha(bytes),len:bytes.length,fn:bin.entries.penalty,calls};
        if(mode!=="auto"){
            assert.equal(bin.entries.penalty,0);
            assembly+=".balign 16\n.global simd_"+label+"_"+mode+"\nsimd_"+label+"_"+mode+":\n";
            for(let at=0;at<bytes.length;at+=4) assembly+=".4byte 0x"+bytes.readUInt32LE(at).toString(16)+"\n";
        }
    }
    const call=images.auto.calls[0];
    assert.equal(images.auto.calls.length,1); assert.equal(call.facts.constantTrips,bound);
    assert.equal(images.auto.sha, images[call.plan].sha);
    compiled[label]=images;
    for(const n of bound===null?[3,17,96]:[bound]) for(const pop of [0,1,2]){
        for(let i=0;i<160;i++)view.setUint16(68+i*2,(i*37+11)%97,true);
        const reach=[0,35,96][pop], first=6;
        const expected=oracle.penalty(64,first,n,reach);
        let independent=0;
        for(let i=0;i<n;i++){const x=reach-((i+first)*37+11)%97;if(x>=0)independent+=x*x;}
        assert.equal(expected,independent);
        cases.push({label,n,reach,expected,plan:call.plan});
    }
}
writeFileSync(join(out,"director.S"),assembly+".option pop\n");
writeFileSync(join(out,"manifest.json"),JSON.stringify({bundleSHA:sha(bundle),compiled,cases},null,2)+"\n");
