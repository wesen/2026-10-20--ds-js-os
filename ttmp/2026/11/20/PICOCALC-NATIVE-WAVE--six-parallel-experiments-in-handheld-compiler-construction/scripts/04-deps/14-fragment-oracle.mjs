// Observation of clean emission, before the linker changes relative call distances.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {compiler,run} from './05-host.mjs';
const [dir,out]=process.argv.slice(2),c=compiler(dir,'clean'),selective=compiler(dir,'precise');
let code=fs.readFileSync(path.join(dir,'typed-rv32.js'),'utf8');
const anchor='function lower(fn) { code.push(new FunctionCode(fn, callables, targets).lower()); }';
assert.equal(code.split(anchor).length,2);
code=code.replace(anchor,`function lower(fn) {
    const built = new FunctionCode(fn,callables,targets).lower();
    globalThis.capture(fn.name,built.words,built.calls.map(({from,target,rd}) => {
        const i=targets.indexOf(target);
        return [from,rd,i<0?['local',target.at]:[i<imported.length?'import':'function',callables[i].name]];
    }));
    code.push(built);
}`);
vm.runInContext(code,c);
function fingerprint(source,elf){
    const items={};c.capture=(name,words,labels)=>{items[name]=crypto.createHash('sha256').update(JSON.stringify([words,labels])).digest('hex');};
    const result=run(c,'clean',source,null,elf);assert(result.artifact,result.error);return items;
}
const evidence={};
for(const app of ['editor','chess']){
    const source=fs.readFileSync(path.join(dir,app+'.typed'),'utf8'),elf=fs.readFileSync(path.join(dir,app+'.elf'));
    const edit=c.incrementalEdits(app,source);evidence[app]={};
    for(const [parent,key] of [['base','body'],['body','signature'],['signature','layout']]){
        const old=fingerprint(edit[parent],elf),now=fingerprint(edit[key],elf);
        const root=run(selective,'precise',edit[parent],null,elf).root;
        const actual=run(selective,'precise',edit[key],root,elf);
        const unchanged=Object.keys(now).filter(n=>now[n]===old[n]);
        const retained=actual.events.filter(pair=>pair[1]).map(pair=>pair[0]);
        assert(retained.every(n=>unchanged.includes(n)));
        evidence[app][key]={unchanged:unchanged.length,retained:retained.length,conservativelyRebuilt:unchanged.filter(n=>!retained.includes(n)),changed:Object.keys(now).filter(n=>!unchanged.includes(n))};
    }
}
fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
