// Node-only loader. Each render callback receives the real project's UI constructors.
const fs=require('node:fs'), path=require('node:path'),assert=require('node:assert/strict');
const {systemCases,keysActions}=require('./03-corpus.cjs');
const root=process.cwd(), scripts=__dirname, output=path.join(scripts,'../various');
const read=p=>fs.readFileSync(p,'utf8'), write=(p,v)=>fs.writeFileSync(path.join(output,p),v);
const prelude=read('picocalc-os/js/prelude.js');
const uiCode=prelude.slice(prelude.indexOf('  const isOpts = '),prelude.indexOf('  // ---- showing values')).replace('g.ui =','return');
const ui=Function(uiCode)();
function capture(source, helpers={}, sys={}) {
  const callbacks={events:{},timers:[]};
  const b=new Proxy({}, {get(_,key){return (...args)=>{
    if(key==='on') callbacks.events[args[0]]=args[1];
    else if(key==='every') callbacks.timers.push(args[1]);
    else callbacks[key]=args[0];
    return b;
  };}});
  Function('ui','app','sys',...Object.keys(helpers),source)(ui,()=>b,sys,...Object.values(helpers));
  return callbacks;
}
const src=name=>read('picocalc-os/js/apps/'+name+'.js');
function genericApp(name) {
  const app=capture(src(name));
  return {make(s){const tree=app.screen(s), hints=typeof app.hints==='function'?app.hints(s):app.hints;
    return JSON.stringify({tree,hints:hints||''});},open:JSON.parse};
}
function fixture(arm, name, cases, tag, save=true) {
  const rows=[],records=[];
  let prev;
  for(const {id,state,banner,title} of cases){
    const wire=arm.make(state), {tree,hints}=arm.open(wire);
    const row={id,app:name,title:title||(name==='sysmon'?'System':'Keys'),tree,hints};
    if(banner)row.banner={text:banner,sub:'',color:'#181818'};
    rows.push(row);
    records.push({id,bytes:Buffer.byteLength(wire),enqueued:prev!==wire,wire});
    prev=wire;
  }
  if(save){
    write(name+'-'+tag+'.ndjson',rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
    write(name+'-'+tag+'-wire.ndjson',records.map(x=>JSON.stringify(x)).join('\n')+'\n');
  }
  return {rows,records};
}
function timings(arms,cases,reps,blocks){
  const names=Object.keys(arms), out=[];
  function block(name) {
    const a=arms[name];
    const t0=process.hrtime.bigint(); let sink=0;
    for(let n=0;n<reps;n++){let prev;for(const {state} of cases){const w=a.make(state);if(w!==prev)sink+=w.length;prev=w;}}
    const t1=process.hrtime.bigint(), retained=cases.map(({state})=>a.make(state));
    const t2=process.hrtime.bigint();
    for(let n=0;n<reps;n++){let prev;for(const w of retained){if(w!==prev)sink+=a.open(w).tree.t.length;prev=w;}}
    const t3=process.hrtime.bigint();
    return {arm:name,producerUsPerTrace:Number(t1-t0)/reps/1e3,receiverUsPerTrace:Number(t3-t2)/reps/1e3,sink};
  }
  names.forEach(block);
  for(let i=0;i<blocks;i++) {
    const order=names.map((_,j)=>names[(i+j)%names.length]);if((Math.floor(i/names.length)&1)===1)order.reverse();
    out.push({block:i,order,trials:order.map(block)});
  }
  return out;
}
if(require.main===module){
  const cases=systemCases(), g=genericApp('sysmon');
  const a=fixture(g,'sysmon',cases,'generic');
  const b=fixture(genericApp('sysmon'),'sysmon',cases,'repeat',false);
  assert.deepEqual(a,b);
  write('control-aa.json',JSON.stringify({node:process.version,frames:cases.length,reps:100,blocks:timings({G:g,AA:genericApp('sysmon')},cases,100,12)},null,2)+'\n');
}
module.exports={fs,path,assert,ui,uiCode,scripts,output,read,write,capture,src,genericApp,fixture,timings,systemCases,keysActions};
