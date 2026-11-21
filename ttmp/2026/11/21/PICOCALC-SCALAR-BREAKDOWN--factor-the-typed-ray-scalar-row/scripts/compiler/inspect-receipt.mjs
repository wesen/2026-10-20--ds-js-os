// Validate final image coverage against separately qualified physical-image hashes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
const [typed,dir,frozen,out]=process.argv.slice(2);
const source=readFileSync(typed,'utf8'),manifest=JSON.parse(readFileSync(frozen));
const frame='typedRayComputeRow',receipt={};
for(const [name,evidence] of Object.entries(manifest.variants)){
    const ctx=createContext({}),events=[];
    for(const js of ['picocalc-os/compiler/typed-wasm.js',join(dir,name+'.js')]) runInContext(readFileSync(js,'utf8'),ctx);
    const img=ctx.typedRv32.compile(source,[],undefined,{inspect:{function:frame,emit:e=>events.push(e)}}).image;
    const sha=createHash('sha256').update(img).digest('hex');assert.equal(sha,evidence.imageSHA256);
    const ev=events.find(e=>e.kind==='emission'&&e.target==='rv32');
    const words=Buffer.from(img);const bySegment={};let here=ev.start,synthetic=0;
    for(const r of ev.ranges){
        assert.equal(here,r.start);here=r.end;
        const s=bySegment[r.segment??'specialized code']??={bytes:0,checks:0,traps:0,registerReads:0};
        s.bytes+=r.end-r.start;
        for(let at=r.start;at<r.end;at+=4){
            if(words.readUInt32LE(at)===0x00100073)s.traps++;
        }
        if(r.inputStart!==undefined){assert(r.inputStart>=0&&r.inputEnd<=318&&r.inputEnd>=r.inputStart);}
        if(r.role==='synthetic skip'){assert.equal(r.inputStart,r.inputEnd);synthetic++;}
        if(r.decisions?.some(x=>x.includes('per-access check') || x.includes('checked UTF-16')))s.checks++;
        if(r.decisions?.some(x=>x.includes('from register')))s.registerReads++;
    }
    assert.equal(here,ev.end);
    assert.equal(bySegment.fallback.traps,11);
    assert.equal(bySegment.fast.traps,evidence.flags.hoist?0:11);
    assert.equal(synthetic,evidence.flags.skip?5:0);
    receipt[name]={imageSHA256:sha,rowStart:ev.start,rowEnd:ev.end,bySegment,syntheticOperations:synthetic};
}
writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
