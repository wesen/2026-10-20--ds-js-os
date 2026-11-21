import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {compiler} from './05-host.mjs';
const [stage,fixture,out]=process.argv.slice(2);
const gold=compiler(stage,'clean'),test=compiler(stage,'precise'),results=[];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function build(c,text,elf,root,precise){
    const s=precise?c.dependencySession(root):null;c.activeFragments=s;
    try {
        const p=c.typedRv32.compile(text,elf?c.typedWorld.imports:[],96*1024,{asyncSource:true});
        const {image,...metadata}=p;
        const linked=elf?c.typedRv32.linkSlot(p,elf,c.typedWorld.entries):null;
        return {data:{image:digest(image),metadata:digest(JSON.stringify(metadata)),keys:Object.keys(metadata),elf:linked&&digest(linked)},root:s?.commit()};
    } catch(e){return {data:{error:String(e)}};}
    finally{c.activeFragments=null;}
}
function compare(app,key,source,elf,root){
    const a=build(gold,source,elf,null,false),b=build(test,source,elf,root,true);assert.deepEqual(b.data,a.data);
    results.push({app,key,...b.data});return b.root;
}
for(const app of ['editor','chess']){
    const elf=fs.readFileSync(path.join(stage,app+'.elf')),source=fs.readFileSync(path.join(stage,app+'.typed'),'utf8'),edits=gold.incrementalEdits(app,source);let prior;
    for(const key of ['base','body','bad','signature','layout','base'])prior=compare(app,key,edits[key],elf,prior)||prior;
}
const src=fs.readFileSync(path.join(fixture,'burst.typed'),'utf8'),parent=compare('burst','base',src,null,null);
for(const [key,from,to] of JSON.parse(fs.readFileSync(path.join(fixture,'manifest-input.json'))).edits)compare('burst',key,src.replace(from,to),null,parent);
fs.writeFileSync(out,JSON.stringify(results,null,2)+'\n');
