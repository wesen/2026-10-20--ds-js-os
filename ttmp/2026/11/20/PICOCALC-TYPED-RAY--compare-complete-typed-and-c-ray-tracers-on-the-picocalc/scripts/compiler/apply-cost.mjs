// Separate backend evaluation from one cold streamed compilation in a fresh JS
// realm. Cyclic arm order balances the five possible slots over 15 rounds.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {createHash} from 'node:crypto';
const [typed,div,explicit,inferred,matched,output]=process.argv.slice(2);
const read=file=>readFileSync(file,'utf8');
const sha=data=>createHash('sha256').update(data).digest('hex');
const front=read('picocalc-os/compiler/typed-wasm.js'),source=read(typed);
const backends=Object.fromEntries(Object.entries({stock:'picocalc-os/compiler/typed-rv32.js',
    div,explicit,inferred,matched}).map(([key,file])=>[key,read(file)]));
const us=(a,b)=>Number(b-a)/1000;
const samples=[],hashes={},order=Object.keys(backends);
for(let round=0;round<15;round++){
    for(let slot=0;slot<order.length;slot++){
        const arm=order[(round+slot)%order.length];
        const ctx=createContext({});
        runInContext(front,ctx);
        const a=process.hrtime.bigint();
        runInContext(backends[arm],ctx);
        const b=process.hrtime.bigint();
        const result=ctx.typedRv32.compile(source);
        const c=process.hrtime.bigint();
        const digest=sha(result.image);
        if(hashes[arm]!==undefined) assert.equal(hashes[arm],digest);
        hashes[arm]=digest;
        samples.push({arm,round,slot,evaluateUs:us(a,b),compileUs:us(b,c)});
    }
}
const medians={};
for(const arm of order){
    const rows=samples.filter(row=>row.arm===arm);
    const median=field=>rows.map(r=>r[field]).sort((a,b)=>a-b)[Math.floor(rows.length/2)];
    medians[arm]={backendSourceBytes:Buffer.byteLength(backends[arm]),evaluateUs:median('evaluateUs'),compileUs:median('compileUs')};
}
writeFileSync(output,JSON.stringify({runtime:process.version,sourceSHA256:sha(source),images:hashes,medians,samples},null,2)+'\n');
console.log(JSON.stringify(medians));
