// Post-freeze deterministic development corpus, independent from the director's one held-out application.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {compiler,run} from './05-host.mjs';
const [dir,out]=process.argv.slice(2),clean=compiler(dir,'clean'),test=compiler(dir,'precise');
let state=20261120;
function rand(limit){state=(Math.imul(1664525,state)+1013904223)>>>0;return state%limit;}
const aggregate={seed:state,sources:0,results:{}};
for(let k=0;k<64;k++){
    const size=4+rand(8);
    const defs=[];
    for(let i=0;i<size;i++){
        const term=!i?'x':('f'+rand(i)+'(p,x)');
        const field=['first','second','third'][rand(3)];
        defs.push('function f'+i+'(p: Row, x: i32): i32 {return '+term+'+p.'+field+'+'+rand(67)+';}');
    }
    const source='record Row { first: i32; second: i32; third: i32; }\n'+defs.join('\n');
    const old=run(test,'precise',source);assert(old.artifact,old.error);aggregate.sources++;
    const newHead=defs[0].replace('x: i32)','x: i32, bias: i32)').replace('return x+','return x+bias+');
    const sig=source.replace(defs[0],newHead).replaceAll('f0(p,x)','f0(p,x,0)');
    for(const [name,text] of [
        ['layout',source.replace('first: i32; second: i32;','second: i32; first: i32;')],
        ['signature',sig],
        ['declaration order',source.slice(0,source.indexOf('function'))+defs.slice().reverse().join('\n')],
        ['body',source.replace(defs.at(-1),defs.at(-1).replace('return ','return 3+'))],
        ['undefined local',source.replace(defs.at(-1),defs.at(-1).replace('return ','return missing+'))],
        ['additional field',source.replace('third: i32;', 'third: i32; fourth: i32;')]
    ]) {
        const stock=run(clean,'clean',text),r=run(test,'precise',text,old.root);
        assert.deepEqual(r.artifact,stock.artifact);assert.equal(r.error,stock.error);
        const row=aggregate.results[name]??={compared:0,reused:0,rebuilt:0,rejected:0};
        row.compared++;row.reused+=r.stats.reused;row.rebuilt+=r.stats.rebuilt;row.rejected+=Number(!!r.error);
    }
}
fs.writeFileSync(out,JSON.stringify(aggregate,null,2)+'\n');
