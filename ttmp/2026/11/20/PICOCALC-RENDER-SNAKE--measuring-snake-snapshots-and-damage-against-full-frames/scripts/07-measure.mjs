// Usage: node path/to/07-measure.mjs RESULTS_DIR [--timings]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {serialize,deserialize} from 'node:v8';
import {capture, prelude, appSource} from './05-replay.mjs';
import {project,encode,decode,template} from './06-semantic.mjs';
const output=process.argv[2];
if(!output) throw Error('Missing output directory');
mkdirSync(output,{recursive:true});
const put=(name,s)=>writeFileSync(join(output,name),s);
const json=(name,v)=>put(name,JSON.stringify(v,null,2)+'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const {game,frames,actions}=capture();
const repeat=capture();
assert.deepEqual(repeat.actions,actions);
assert.deepEqual(repeat.frames,frames);
const rows=[], arms={control:[],aa:[],semantic:[]};
const envelope=frame=>`{"app":"snake","title":"Snake","frame":${frame}}`;
const encoded=frames.map(({id,group,state,frame},i)=>{
  const v=project(state), t=encode(v), sj=JSON.stringify(v), parsed=JSON.parse(frame);
  const templateFrame=template(decode(t));
  const b=serialize(parsed);
  assert.deepEqual(templateFrame,parsed);
  assert.deepEqual(template(JSON.parse(sj)),parsed);
  assert.deepEqual(deserialize(b),parsed);
  for(const [arm,body] of [['control',parsed],['aa',JSON.parse(repeat.frames[i].frame)],['semantic',templateFrame]]) {
    arms[arm].push(JSON.stringify({id, app:'snake',title:'Snake',...body}));
  }
  const sjBox=envelope(JSON.stringify({schema:'snake-v1',state:v}));
  const tBox=envelope(JSON.stringify({schema:'snake-v1',base64:Buffer.from(t).toString('base64')}));
  const jBox=envelope(frame);
  const row={id, group,n:v.body.length,j:Buffer.byteLength(frame),b:b.length,sj:Buffer.byteLength(sj),t:t.length,
    jEnvelope:Buffer.byteLength(jBox),sjEnvelope:Buffer.byteLength(sjBox),tEnvelope:Buffer.byteLength(tBox),
    sourceSha:hash(frame),sent:i===0 || frame!==frames[i-1].frame};
  rows.push(row);
  return {id,frame,state,sj,t,b,view:v};
});
for(const [arm,lines] of Object.entries(arms)) put(arm+'.ndjson',lines.join('\n')+'\n');
json('events.json',{seed:5172,intervalMs:110,actions});
put('states.ndjson',encoded.map(r=>JSON.stringify({id:r.id,...r.view})).join('\n')+'\n');
const cases=[];
function refuse(name,edit) {
  const current=encoded[0].t;
  const before=hash(current), trial=Buffer.from(current);
  const candidate=edit(trial) || trial;
  let error;
  try { decode(candidate); } catch(e) { error=e.message; }
  assert(error,name); assert.equal(hash(current),before); cases.push({name,error});
}
refuse('truncated',b=>b.subarray(0,-1));
refuse('trailing byte',b=>Buffer.concat([b,Buffer.of(0)]));
refuse('over cap',()=>Buffer.alloc(802));
refuse('unknown version',b=>{b[0]=2});
refuse('reserved flags',b=>{b[1]=4});
refuse('count too small',b=>{b.writeUInt16LE(3,2)});
refuse('count too large',b=>{b.writeUInt16LE(396,2)});
refuse('food outside board',b=>{b.writeUInt16LE(396,4)});
refuse('score inconsistent with body',b=>{b.writeUInt16LE(10,6)});
refuse('best too large',b=>{b.writeUInt16LE(3920,8)});
refuse('fractional best unit',b=>{b.writeUInt16LE(1,8)});
refuse('invalid body cell',b=>{b.writeUInt16LE(400,10)});
refuse('body overlaps food',b=>{b.writeUInt16LE(b.readUInt16LE(4),10)});
refuse('repeated body cell',b=>{b.writeUInt16LE(b.readUInt16LE(10),12)});
refuse('disconnected body',b=>{b.writeUInt16LE(100,10)});
for(const i of [2,12,14,105,203]) {
  assert.deepEqual(template(decode(encoded[i].t)),JSON.parse(frames[i].frame));
}
json('replay.json',{seed:5172,sha256:{reference:hash(appSource),prelude:hash(prelude),
  template:hash(readFileSync(new URL('./06-semantic.mjs',import.meta.url)))},
  bytes:'J producer frame; B V8 generic object serialization; SJ unwrapped semantic JSON; T semantic binary; envelopes include app and title',
  observations:rows,refusals:cases,independentRestarts:[2,12,14,105,203],
  aa:rows.length,templateMatches:rows.length});
if(process.argv.includes('--timings')) {
  const tests={
    Jproduce:r=>JSON.stringify(game.screenOf(r.state)),
    Jreceive:r=>JSON.parse(r.frame),
    Bproduce:r=>serialize(game.screenOf(r.state)),
    Breceive:r=>deserialize(r.b),
    SJproduce:r=>JSON.stringify(project(r.state)),
    SJreceive:r=>template(JSON.parse(r.sj)),
    Tproduce:r=>encode(project(r.state)),
    Treceive:r=>template(decode(r.t)),
    Tvalidate:r=>decode(r.t),
    JproduceAA:r=>JSON.stringify(game.screenOf(r.state))
  };
  const blocks={};
  const cohorts={
    source:encoded.filter((_,i)=>rows[i].group!=='constructed' && rows[i].sent),
    short:[encoded[0]],long300:[encoded.at(-2)],nearCap395:[encoded.at(-1)]};
  const timings=[];
  let sink;
  for(const [group,samples] of Object.entries(cohorts)) {
    const repeats=group==='source'?6:group==='short'?1000:250;
    const labels=Object.keys(tests);
    function time(label) {
      const run=tests[label],count=samples.length*repeats;
      const start=process.hrtime.bigint();
      for(let r=0;r<repeats;r++) for(const s of samples) sink=run(s);
      return Number(process.hrtime.bigint()-start)/count/1000;
    }
    blocks[group]={sampleCount:samples.length,repeats};
    for(let i=0;i<4;i++) for(const label of labels) time(label);
    for(let i=0;i<20;i++) {
      const order=labels.slice(i%labels.length).concat(labels.slice(0,i%labels.length));
      if(i%2) order.reverse();
      for(const label of order) timings.push({group,block:i,label,us:time(label)});
    }
  }
  assert(sink!==undefined);
  json('timings.json',{node:process.version,engine:process.versions.v8,clock:'process.hrtime.bigint',unit:'microseconds per operation in each block',warmupBlocks:4,blocks,timings});
}
