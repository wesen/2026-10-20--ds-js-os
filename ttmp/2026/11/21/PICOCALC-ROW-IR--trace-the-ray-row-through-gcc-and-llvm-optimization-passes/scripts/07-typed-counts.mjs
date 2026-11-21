import assert from 'node:assert/strict';
import {readFileSync as read, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runInThisContext} from 'node:vm';
import {decode} from '../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';
import {runRv32} from '../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
const [out,prefix]=process.argv.slice(2);
for(const n of ['typed-wasm','typed-rv32','typed-pie-loops'])runInThisContext(read('picocalc-os/compiler/'+n+'.js','utf8'));
const src=read('picocalc-os/worlds/raytrace/raytrace.typed','utf8'), results={};
for(const mode of ['stock','scalar','pie']){
    const prog=typedRv32.compile(src,[],undefined,{pieLoops:mode==='stock'?undefined:mode});
    const decoded=mode==='pie'?decode(prog.image,prefix):undefined;
    const code=new DataView(prog.image.buffer,prog.image.byteOffset,prog.image.byteLength);
    const totals={instructions:0,stackLoads:0,stackStores:0,packets:0};
    const samples={};
    for(let y=0;y<160;y++){
        const init=new Uint8Array(8192);
        init.set(read(join(out,'fixtures',y+'.in')).subarray(4),64);
        const sample={instructions:0,stackLoads:0,stackStores:0,packets:0};
        const r=runRv32(prog,'typedRayComputeRow',[64,y],[],{},init,decoded,100000,pc=>{
            const w=code.getUint32(pc,true);
            if((w>>>15&31)===2){
                if((w&127)===3)sample.stackLoads++;
                if((w&127)===35)sample.stackStores++;
            }
        });
        assert(!r.trap && r.result===1 && read(join(out,'fixtures',y+'.gold')).equals(r.bytes.subarray(64,4164)));
        sample.instructions=r.steps;sample.packets=r.packed.stores;
        for(const k of Object.keys(totals))totals[k]+=sample[k];
        if([0,61,109].includes(y))samples[y]=sample;
    }
    results[mode]={totals,samples,rowsVerified:160};
}
writeFileSync(join(out,'typed-counts.json'),JSON.stringify(results,null,2)+'\n');
