// Additional 30-block host timing, same scientific candidate. Wrappers time compiler and ELF linker separately.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {compiler,run} from './05-host.mjs';
const [dir,out]=process.argv.slice(2),arms=['clean','global','precise'],stats={};
const contexts=Object.fromEntries(arms.map(a=>[a,compiler(dir,a)]));
for(const [arm,c] of Object.entries(contexts)){
    c.clockPhases={};
    for(const key of ['compile','linkSlot']){
        const fn=c.typedRv32[key];c.typedRv32[key]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{c.clockPhases[key]=performance.now()-t;}};
    }
}
for(const app of ['editor','chess']){
    const src=fs.readFileSync(path.join(dir,app+'.typed'),'utf8'),elf=fs.readFileSync(path.join(dir,app+'.elf'));
    const edits=contexts.clean.incrementalEdits(app,src),cells=stats[app]={};
    for(const [parent,edit] of [['base','body'],['body','signature'],['signature','layout']]){
        const initial={},samples=[];for(const arm of arms)initial[arm]=run(contexts[arm],arm,edits[parent],null,elf).root;
        const expected=run(contexts.clean,'clean',edits[edit],null,elf).artifact;
        for(let block=0;block<30;block++)for(let j=0;j<3;j++){
            const arm=arms[(j+block)%3],c=contexts[arm];c.clockPhases={};
            const r=run(c,arm,edits[edit],initial[arm],elf);
            assert.deepEqual(r.artifact,expected);
            samples.push({arm,block,total:r.ms,compile:c.clockPhases.compile,link:c.clockPhases.linkSlot});
        }
        cells[edit]=samples;
    }
}
fs.writeFileSync(out,JSON.stringify(stats,null,2)+'\n');
