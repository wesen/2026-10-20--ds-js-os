// Decode a held-out native game's published picture, recover its visible fields,
// and prove which private best values the witness can and cannot distinguish.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {encode,decode,template} from './06-semantic.mjs';
const [file,outDir]=process.argv.slice(2);
const f=JSON.parse(readFileSync(file,'utf8'));
const [header,canvas]=f.tree.kids;
const score=Number(/^score (\d+)$/.exec(header.kids[0].s)[1]);
const [,auto,len,best]=/^(auto · )?length (\d+) · best (\d+)$/.exec(header.kids[1].s);
const n=Number(len), shownBest=Number(best);
assert.equal(canvas.ops.length,n+2,'living source capture');
const body=canvas.ops.slice(0,n).reverse().map(([,x,y])=>(x-1)/13+22*((y-1)/13));
const [,fx,fy]=canvas.ops[n];
const food=(fx-3)/13+22*((fy-3)/13);
const v={alive:true,auto:!!auto,food,body,score,best:shownBest};
const accepted=[];
let candidate;
for(let previous=0;previous<=shownBest;previous+=10) {
  const packet=encode({...v,best:previous});
  const output=template(decode(packet));
  if(JSON.stringify(output)===JSON.stringify(f)) {
    accepted.push(previous);candidate=output;
  }
}
assert(candidate);
const row=frame=>JSON.stringify({id:'native-published',app:'snake',title:'Snake',...frame})+'\n';
writeFileSync(join(outDir,'native.ndjson'),row(f));
writeFileSync(join(outDir,'native-template.ndjson'),row(candidate));
writeFileSync(join(outDir,'live-witness.json'),JSON.stringify({input:'instrumented native CJI game retained screen JSON',
  genericBodyUtf8:Buffer.byteLength(JSON.stringify(f)),rawSemantic:encode(v).byteLength,
  visible:{alive:true,auto:!!auto,food,body,score,shownBest},indistinguishableHistoricalBest:accepted,
  contentSha256:createHash('sha256').update(JSON.stringify(f)).digest('hex')},null,2)+'\n');
