// Freeze the two real unmodified guest binaries and the expected syscall bytes for the P4.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {worldBytes,guest,scripts} from './03-guest.mjs';
import {id,hash} from './06-runner.mjs';
const dir=process.argv[2];assert(dir);
const producer=readFileSync(join(scripts,'04-semantic-producer.typed'),'utf8').replace('__DIGEST__',id);
const keys=['left','right','enter','left','right','esc'];
const header=[],receipts={};
function fnv(parts) {
    let value=2166136261;
    for(const part of parts) for(const byte of part)value=Math.imul(value^byte,16777619)>>>0;
    return value;
}
for(const arm of ['generic','semantic']){
    const b=worldBytes(arm==='generic'?null:producer),g=guest(b);
    const name='chess_prod_'+arm;
    header.push('static const uint8_t '+name+'[] = {');
    for(let i=0;i<b.length;i+=24) header.push('  '+[...b.slice(i,i+24)].join(',')+',');
    header.push('};');
    const events=[g.launch(),...keys.map(k=>g.key(k))].map(r=>[r.screen[0].length,r.screen[1].length,fnv(r.screen)]);
    const next=keys.map(k=>g.key(k)).map(r=>[r.screen[0].length,r.screen[1].length,fnv(r.screen)]);
    assert.deepEqual(next,events.slice(1));
    header.push('static const uint32_t '+name+'_checks[][3] = {'+events.map(r=>'{'+r.map(x=>x+'u').join(',')+'}').join(',')+'};');
    receipts[arm]={bytes:b.length,moduleSha256:hash(b),events};
}
writeFileSync(join(dir,'chess_producer_modules.h'),header.join('\n')+'\n');
writeFileSync(join(dir,'producer-fixtures.json'),JSON.stringify({events:['launch',...keys],arms:receipts},null,2)+'\n');
console.log(JSON.stringify(receipts));
