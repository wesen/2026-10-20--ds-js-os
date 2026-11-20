const h=require('./04-harness.cjs');
const {assert,read,write,src,ui,capture,scripts,systemCases,fixture,genericApp,timings}=h;
function manualSource(){
  const prod=src('sysmon'), head=prod.slice(0,prod.indexOf('function worldsTab'));
  const compact=head.replace('ui.spark(values, { ...options, h: height, max, points: HISTORY })',
    '[values,max,options.label,options.right,options.color]').replace(
    'ui.spark(levels, { ...options, h: height, max: scale, points: HISTORY })',
    '[levels,scale,options.label,options.right,options.color]');
  assert(!compact.includes('ui.spark('));
  const registration=prod.slice(prod.indexOf('app("sysmon")'),prod.indexOf('.screen((s) =>'));
  return compact+read(scripts+'/05-manual-producer.js')+'\n'+registration+'.screen(manualScreen)\n'+prod.slice(prod.indexOf('.hints((s)'));
}
function manualApp(){
  const app=capture(manualSource()), fn=Function('ui',read(scripts+'/06-manual-receiver.js')+'\nreturn materializeManual;')(ui);
  return {make(s){const v=app.screen(s);return JSON.stringify({v,hints:app.hints(s)});},
    open(w){const x=JSON.parse(w);return {tree:fn(x.v),hints:x.hints};}};
}
function qualify(g,m,name,cases,tag){
  const control=fixture(g,name,cases,'generic',false),treatment=fixture(m,name,cases,tag);
  // JSON-normalizing both objects reproduces the wire semantics of omitted undefined properties.
  assert.deepEqual(JSON.parse(JSON.stringify(treatment.rows)),control.rows);
  assert.deepEqual(treatment.records.map(r=>r.enqueued),control.records.map(r=>r.enqueued));
  return treatment;
}
if(require.main===module){
  const g=genericApp('sysmon'),m=manualApp(), cases=systemCases();
  const data=qualify(g,m,'sysmon',cases,'manual');
  const accepted=data.records[6].wire;
  let retained=accepted, error;
  try {const bad=JSON.parse(accepted);bad.v[0]=2;const next=JSON.stringify(bad);m.open(next);retained=next;}catch(e){error=e.message;}
  assert.equal(error,'unknown System template');assert.equal(retained,accepted);
  assert.deepEqual(manualApp().open(retained),m.open(accepted));
  write('manual-study.json',JSON.stringify({node:process.version,baselineBytes:Buffer.byteLength(src('sysmon')),
    producerBytes:Buffer.byteLength(manualSource()),residentBytes:Buffer.byteLength(read(scripts+'/06-manual-receiver.js')),
    idleReplay:{acceptedId:data.records[6].id,refused:error,nextAccepted:data.records[7].id,
    identicalAfterRestart:JSON.stringify(m.open(retained))===JSON.stringify(manualApp().open(retained)),
    nextAcceptedMatches:JSON.stringify(m.open(data.records[7].wire))===JSON.stringify(manualApp().open(data.records[7].wire))},
    reps:100,blocks:timings({G:g,M:m},cases,100,12)},null,2)+'\n');
}
module.exports={manualSource,manualApp,qualify};
