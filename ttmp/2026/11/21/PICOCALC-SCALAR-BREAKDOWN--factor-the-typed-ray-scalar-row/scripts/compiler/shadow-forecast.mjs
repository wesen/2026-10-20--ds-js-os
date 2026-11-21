// Count actual machine instructions in the unchanged shadow routine during a
// full default frame. The hypothetical replacement guard below is a prediction.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const [file,out]=process.argv.slice(2);
const ctx=createContext({});
for(const name of ['typed-wasm','typed-rv32']) runInContext(readFileSync('picocalc-os/compiler/'+name+'.js','utf8'),ctx);
const p=ctx.typedRv32.compile(readFileSync(file,'utf8'));
const here=resolve('ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review');
let text=readFileSync(join(here,'run-rv32.mjs'),'utf8').replace("'./packed.mjs'",JSON.stringify(pathToFileURL(join(here,'packed.mjs')).href))
    .replace('const stackTop = 65536;','const stackTop = 131072;');
const anchor='        let next = at + 4;';
assert.equal(text.split(anchor).length,2);
text=text.replace(anchor,`        if(at>=program.entries.typedRayInShadow && at<program.entries.typedRaySphereScale){
            const s=globalThis.shadowCount;s.retired++;
            if(at===program.entries.typedRayInShadow) s.calls++;
            if(op===0x63 && code.getUint32(at+4,true)===0x00100073) s.boundsTests++;
            if(op===0x03 && ((w>>>15)&31)===2) s.stackLoads++;
            if(op===0x23 && ((w>>>15)&31)===2) s.stackStores++;
        }
        `+anchor);
const {runRv32}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
const pixels=64,work=pixels+4+2*25600+8;
const bytes=new Uint8Array(work+4+2*2048+8).fill(0xa5),dv=new DataView(bytes.buffer);
dv.setUint32(pixels,25600,true);dv.setUint32(work,2048,true);dv.setUint16(work+4,160,true);
const stats={retired:0,calls:0,boundsTests:0,stackLoads:0,stackStores:0};
globalThis.shadowCount=stats;
const r=runRv32(p,'typedRayFrame',[pixels,work,68,61,31,25],[],{},bytes,undefined,20000000);
assert.equal(r.trap,false);assert.equal(r.result,1);
assert.equal(stats.retired,5528397);assert.equal(stats.calls,19477);
const saved=2*stats.boundsTests-6*stats.calls;
const result={observed:{pose:[68,61,31,25],stride:160,frameRetired:r.steps,...stats},
    hypothetical:{entryGuard:'length >= 33 and work[16] <= 3, identical generic fallback',entryFastInstructions:6,
        savedRetired:saved,predictedShadowRetired:stats.retired-saved,predictedFullFrameRetired:r.steps-saved,
        predictedFullFrameReductionPercent:100*saved/r.steps}};
writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(result);
