// Replay the precise device payloads and the actual C runner's JS contract without a serial connection.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
const [main,stage,out]=process.argv.slice(2),gold=JSON.parse(fs.readFileSync(path.join(stage,'gold.json')));
const checks=[];
function crc(buffer,offset,bytes){let word=-1;for(const b of new Uint8Array(buffer,offset,bytes)){word^=b;for(let j=0;j<8;j++)word=word&1?(word>>>1)^0xedb88320:word>>>1;}return (~word)>>>0;}
for(const app of ['editor','chess']){
    const rows=[];const c=vm.createContext({micros:()=>performance.now()*1000,crc,emit:s=>rows.push(JSON.parse(s))});
    for(const name of ['stock','candidate','session'])vm.runInContext(fs.readFileSync(path.join(main,name+'.bin'),'utf8'),c);
    const source=fs.readFileSync(path.join(stage,app+'.typed'),'utf8'),binary=Uint8Array.from(fs.readFileSync(path.join(stage,app+'.elf')));
    c.runTrial(app,source,binary.buffer,null,gold[app]);assert.equal(rows.length,45);
    checks.push({app,rows:rows.length,controlCRC:gold[app],allAgreement:true});
}
fs.writeFileSync(out,JSON.stringify(checks,null,2)+'\n');
