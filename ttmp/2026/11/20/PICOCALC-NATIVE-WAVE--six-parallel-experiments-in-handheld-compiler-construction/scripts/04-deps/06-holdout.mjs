import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {compiler,run} from './05-host.mjs';
const [dir,fixture,out]=process.argv.slice(2);
const source=fs.readFileSync(path.join(fixture,'burst.typed'),'utf8'),{edits}=JSON.parse(fs.readFileSync(path.join(fixture,'manifest-input.json')));
const gold=JSON.parse(fs.readFileSync(path.join(fixture,'control.json')));
const clean=compiler(dir,'clean'),selective=compiler(dir,'precise'),conservative=compiler(dir,'global');
const baseP=run(selective,'precise',source),baseG=run(conservative,'global',source);
assert.equal(baseP.artifact.hash,gold.rv32SHA256);assert.deepEqual(baseP.artifact,baseG.artifact);
const result={base:baseP.artifact,edits:[]};
for(const [name,from,to] of edits){
    assert.equal(source.split(from).length,2);const text=source.replace(from,to),stock=run(clean,'clean',text);
    const b=run(selective,'precise',text,baseP.root),g=run(conservative,'global',text,baseG.root);
    for(const x of [b,g]){assert.deepEqual(x.artifact,stock.artifact);assert.equal(x.error,stock.error);}
    result.edits.push({name,artifact:b.artifact,error:b.error,global:g.stats,precise:b.stats,events:b.events});
}
const unchanged=run(selective,'precise',source,baseP.root);assert.equal(unchanged.stats.reused,10);assert.deepEqual(unchanged.artifact,baseP.artifact);
result.unchanged=unchanged.stats;
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
