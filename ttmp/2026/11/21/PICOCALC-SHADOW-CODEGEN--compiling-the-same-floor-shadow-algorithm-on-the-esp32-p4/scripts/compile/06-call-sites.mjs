// Verify the exact words attributed to the repeated operation in each image.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {decode} from '../../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';
const [prefix,out]=process.argv.slice(2);
assert(prefix && out,'supply the vendor executable prefix and output path');
for(const js of ['typed-wasm','typed-rv32','typed-pie-loops'])runInThisContext(readFileSync('picocalc-os/compiler/'+js+'.js','utf8'));
const source=readFileSync('picocalc-os/worlds/raytrace/raytrace.typed','utf8');
const answer={};
for(const arm of ['baseline','shadow']){
    const events=[];
    const opts={pieLoops:'pie-empty',inlineGuardedReturns:arm==='baseline'?false:n=>n==='typedRayInShadow',
        inspect:{function:'typedRayInShadow',emit:e=>events.push(e)}};
    const program=typedRv32.compile(source,[],undefined,opts),dis=decode(program.image,prefix);
    const shadow=events.find(e=>e.kind==='emission'&&e.target==='rv32');
    const format=(lo,hi)=>Array.from({length:(hi-lo)/4},(_,i)=>{
        const pc=lo+4*i,w=dis.get(pc);return {pc,hex:w.word.toString(16).padStart(8,'0'),text:w.op+' '+w.args.join(',')};
    });
    const calls=shadow.ranges.filter(r=>r.decisions?.length && r.decisions.some(d=>d.includes('across call') || d.includes('guarded return')));
    assert.equal(calls.length,2);
    answer[arm]={imageSHA:createHash('sha256').update(program.image).digest('hex'),sites:calls.map(r=>({tapeOffset:r.inputStart,words:format(r.start,r.end)})),
        helper:format(program.entries.typedRayAbs,program.entries.typedRaySetObject)};
}
writeFileSync(out,JSON.stringify(answer,null,2)+'\n');
