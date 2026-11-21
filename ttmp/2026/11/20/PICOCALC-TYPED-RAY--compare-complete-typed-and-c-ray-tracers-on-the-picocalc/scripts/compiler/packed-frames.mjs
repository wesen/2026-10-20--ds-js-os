// Run the complete compiled images in the independent PIE instruction model. Its
// original 64 KiB fixture space is enlarged to hold three 51,200-byte planes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {decode} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';
const model=new URL('../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const memoryDeclaration='const stackTop = 65536;';
const original=readFileSync(model,'utf8');
assert.equal(original.split(memoryDeclaration).length,2);
const expanded=original.replace(memoryDeclaration,'const stackTop = 262144;')
    .replace("'./packed.mjs'",JSON.stringify(new URL('./packed.mjs',model).href));
const {runRv32}=await import('data:text/javascript;base64,'+Buffer.from(expanded).toString('base64'));
const [prefix,source,packedJs,matchedJs,output]=process.argv.slice(2);
const poses=[[68,61,31,25],[76,61,31,17],[127,32,159,0]];
const work=mkdtempSync(join(tmpdir(),'ray-packed-full-'));
writeFileSync(join(work,'poses.json'),JSON.stringify(poses));
execFileSync('node',[fileURLToPath(new URL('./frame-images.mjs',import.meta.url)),source,work]);
const report={sourceSHA256:sha(readFileSync(source)),modelSHA256:sha(original),arms:{}};
const capacities=[25600,25600,25600,2048];
const addresses=[];let end=64;
for(const cap of capacities){addresses.push(end);end+=4+2*cap+8;}
for(const [name,backend] of Object.entries({packed:packedJs,matched:matchedJs})){
    const ctx=createContext({});
    runInContext(readFileSync('picocalc-os/compiler/typed-wasm.js','utf8'),ctx);
    runInContext(readFileSync(backend,'utf8'),ctx);
    const prog=ctx.typedRv32.compile(readFileSync(source,'utf8'));
    const decoded=name==='packed'?decode(prog.image,prefix):undefined;
    const rows=[];
    for(const [i,pose] of poses.entries()){
        const gold=readFileSync(join(work,'wasm-'+i+'.bin'));
        for(const audit of [false,true]){
            const initial=new Uint8Array(end).fill(0xa5);
            const view=new DataView(initial.buffer);
            for(const [j,p] of addresses.entries()) view.setUint32(p,capacities[j],true);
            view.setUint16(addresses[3]+4,0,true);
            const args=audit?addresses:[addresses[0],addresses[3]];
            const entry=audit?'typedRayRender':'typedRayFrame';
            const result=runRv32(prog,entry,[...args,...pose],[],{},initial,decoded,24000000);
            assert.equal(result.trap,false);assert.equal(result.result,1);
            for(const [j,p] of addresses.entries()){
                assert.deepEqual(result.bytes.slice(p,p+4),initial.slice(p,p+4));
                const tail=p+4+2*capacities[j];
                assert(result.bytes.slice(tail,tail+8).every(v=>v===0xa5));
                if(j===3) continue;
                const payload=Buffer.from(result.bytes.slice(p+4,tail));
                if(j===0 || audit) assert(payload.equals(gold.subarray(j*51200,(j+1)*51200)));
                else assert(payload.every(v=>v===0xa5));
            }
            rows.push({pose,entry,retired:result.steps,packetStores:result.packed.stores});
        }
    }
    report.arms[name]={imageSHA256:sha(prog.image),rows};
}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
