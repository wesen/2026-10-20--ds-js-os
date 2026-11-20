const zlib=require('node:zlib');
const {fs,assert,read,write,src,scripts,output,ui,capture,systemCases,genericApp,fixture,timings}=require('./04-harness.cjs');
const {manualSource,manualApp}=require('./07-manual-study.cjs');
const {extract}=require('./08-extract.cjs');
const {autoApp}=require('./10-auto-study.cjs');
const gzip=s=>zlib.gzipSync(s,{level:9}).length, bytes=Buffer.byteLength;
const mean=a=>a.reduce((v,n)=>v+n,0)/a.length;
function pct(a,q){return a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(q*a.length))];}
function interval(a,q){
  let seed=7751;
  function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
  const boot=Array.from({length:2000},()=>pct(Array.from(a,()=>a[Math.floor(rand()*a.length)]),q));
  return [pct(boot,.025),pct(boot,.975)];
}
function paired(blocks,names){
  const out={};
  for(const n of names){
    const pairs=blocks.map(x=>[x.trials.find(t=>t.arm==='G'),x.trials.find(t=>t.arm===n)]);
    out[n]={};
    for(const [metric,get] of Object.entries({producer:x=>x.producerUsPerTrace,receiver:x=>x.receiverUsPerTrace,total:x=>x.producerUsPerTrace+x.receiverUsPerTrace})){
      const a=pairs.map(([g,c])=>get(c)),ratios=pairs.map(([g,c])=>get(c)/get(g));
      out[n][metric]={medianUs:pct(a,.5),p95Us:pct(a,.95),medianPairedRatio:pct(ratios,.5),p95PairedRatio:pct(ratios,.95),p95RatioCI:interval(ratios,.95)};
    }
  }
  return out;
}
// Researcher's extra benchmark comparator, prior snapshot + replace operations.
// Equal-size arrays and same-key objects descend; all other values replace as a unit.
// Minimize at each changed root, avoiding a full diff larger than its replacement.
function diff(prev,cur,path=[]){
  if(prev===cur)return [];
  const replace=[[path,cur]];
  if(!prev||!cur||typeof prev!=='object'||typeof cur!=='object'||Array.isArray(prev)!==Array.isArray(cur))return replace;
  const keys=Object.keys(cur), prevKeys=Object.keys(prev);
  if(keys.length!==prevKeys.length||keys.some((k,i)=>k!==prevKeys[i]))return replace;
  const edits=[];
  for(const k of keys)edits.push(...diff(prev[k],cur[k],[...path,Array.isArray(cur)?+k:k]));
  return JSON.stringify(edits).length<JSON.stringify(replace).length?edits:replace;
}
function diffTrace(g,cases) {
  let old=null,receiver=null,prev='', pu=0,ru=0;
  const records=[];
  for(const [i,{state,id}] of cases.entries()){
    const t0=process.hrtime.bigint(), raw=g.make(state), next=JSON.parse(raw), reset=i===50;
    let packet='';
    if(raw!==prev||reset){
      const patch=old&&!reset?JSON.stringify(diff(old,next)):null;
      packet=patch&&bytes(patch)<bytes(raw)?patch:raw;
    }
    old=next;prev=raw;pu+=Number(process.hrtime.bigint()-t0);
    if(packet){
      const start=process.hrtime.bigint();
      const item=JSON.parse(packet);
      if(packet[0]==='{')receiver=item;
      else for(const [path,value] of item){if(!path.length)receiver=value;else{let p=receiver;for(const k of path.slice(0,-1))p=p[k];p[path.at(-1)]=value;}}
      ru+=Number(process.hrtime.bigint()-start);
      assert.deepEqual(receiver,next);
    }
    records.push({id,reset,bytes:bytes(packet),mode:packet[0]==='{'?'full':packet?'delta':'dedup'});
  }
  return {records,producerUsPerTrace:pu/1e3,receiverUsPerTrace:ru/1e3};
}
function artifacts(arm,app,catalog){
  const runtime=read(scripts+'/09-auto-runtime.js');
  const spec=JSON.stringify({version:catalog.version,entries:catalog.entries});
  const p=arm==='M'?manualSource():src(app), r=arm==='M'?read(scripts+'/06-manual-receiver.js'):arm==='A'?runtime+'\nconst catalog='+spec+';':'';
  return {producerSource:bytes(p),residentSource:bytes(r),catalog:arm==='A'?bytes(spec):0,total:bytes(p+r),gzip9:gzip(p+r)};
}
function live(){
  const base=systemCases()[2].state;let tick=0;
  const sys={worlds:()=>structuredClone(base.worlds),handles:()=>structuredClone(base.handles),stats:()=>({t_ms:500*(++tick),
    lane_busy_ms:17*tick,buses:base.last.buses.map(b=>({...b,busy_ms:b.busy_ms*tick}))})};
  const app=capture(src('sysmon'),{},sys),s=structuredClone(app.state),cases=[];
  const step=(name,fn,arg)=>{fn(s,arg);cases.push({id:name,state:structuredClone(s)});};
  step('start',app.onStart);step('focus',app.events.focus);
  for(let i=0;i<50;i++)step('refresh-'+i,app.timers[0]);
  for(let tab=0;tab<3;tab++){
    for(let i=0;i<40;i++)step('tab-'+tab+'-down-'+i,app.events.key,{key:'down'});
    step('tab-'+tab+'-advance',app.events.key,{key:'tab'});
  }
  step('blur',app.events.blur);return cases;
}
const cases=systemCases(), g=genericApp('sysmon'),m=manualApp(),a=autoApp('sysmon');
const blocks=timings({G:g,M:m,A:a},cases,16,30);
write('timing-system.json',JSON.stringify({node:process.version,reps:16,blocks},null,2)+'\n');
const s1=diffTrace(g,cases), s1Trials=Array.from({length:30},()=>{const {records,...v}=diffTrace(g,cases);return v;});
write('generic-diff.json',JSON.stringify({frames:s1.records,trials:s1Trials},null,2)+'\n');
const casesLive=live(),gLive=fixture(g,'sysmon',casesLive,'handlers',false);
for(const [name,arm] of [['M',m],['A',a]]){
  const t=fixture(arm,'sysmon',casesLive,name,false);assert.deepEqual(JSON.parse(JSON.stringify(t.rows)),gLive.rows);
}
const controlAA=JSON.parse(read(output+'/control-aa.json')).blocks;
const summary={traceFrames:cases.length,realEventStates:casesLive.length,systemTimings:paired(blocks,['G','M','A']),
 aaTimings:paired(controlAA,['AA']),tabs:{},studies:{},pixel:{},
 S1:{totalBytes:s1.records.reduce((z,r)=>z+r.bytes,0),medianProducerUs:pct(s1Trials.map(x=>x.producerUsPerTrace),.5),
 medianReceiverUs:pct(s1Trials.map(x=>x.receiverUsPerTrace),.5),resetAt:50},
 costs:{},keysTimings:paired(JSON.parse(read(output+'/keys-holdout.json')).blocks,['G','A'])};
for(const [name,arm,tag] of [['sysmon','G','generic'],['sysmon','M','manual'],['sysmon','A','auto'],['keys','G','generic'],['keys','A','auto']]){
  const wires=read(output+'/'+name+'-'+tag+'-wire.ndjson').trim().split('\n').map(JSON.parse);
  const total=(a)=>a.reduce((z,r)=>z+(r.enqueued?r.bytes:0),0);
  const key=name+arm;summary.studies[key]={frames:wires.length,published:wires.filter(r=>r.enqueued).length,
    attempted:wires.reduce((z,r)=>z+r.bytes,0),enqueued:total(wires),max:Math.max(...wires.map(r=>r.bytes)),
    compressed:wires.filter(r=>r.wire[0]==='[').length};
  const ee=extract(src(name)), times=[];
  if(arm==='A')for(let j=0;j<30;j++){const a=process.hrtime.bigint();extract(src(name));times.push(Number(process.hrtime.bigint()-a)/1e3);}
  summary.costs[key]={...artifacts(arm,name,ee),...(arm==='A'?{buildUsMedian:pct(times,.5),buildUsP95:pct(times,.95),sites:ee.sites.length,
    catalogSites:ee.sites.filter(x=>x.decision==='catalog').length}: {})};
  const ref=JSON.parse(read('/tmp/render-system-'+name+'-generic/receipt.json')), receipts=JSON.parse(read('/tmp/render-system-'+name+'-'+tag+'/receipt.json'));
  let byteCompared=0;
  for(let i=0;i<ref.length;i++){assert.deepEqual(receipts[i],ref[i]);
    const raw=fs.readFileSync('/tmp/render-system-'+name+'-'+tag+'/'+ref[i].filename), expected=fs.readFileSync('/tmp/render-system-'+name+'-generic/'+ref[i].filename);
    assert(raw.equals(expected));byteCompared+=raw.length;}
  summary.pixel[key]={frames:receipts.length,bytesCompared:byteCompared,skippedFlushes:receipts.filter(r=>r.recoveredSkippedFlush).length,
    maxCommands:Math.max(...receipts.map(r=>r.commands))};
  if(arm==='G')write(name+'-pixel-receipt.json',JSON.stringify(ref,null,2)+'\n');
  if(name==='sysmon')for(const tab of [0,1,2]){const ws=wires.filter((_,i)=>cases[i].state.tab===tab);
    (summary.tabs[tab]||={})[arm]={frames:ws.length,bytes:total(ws)};}
}
write('summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
