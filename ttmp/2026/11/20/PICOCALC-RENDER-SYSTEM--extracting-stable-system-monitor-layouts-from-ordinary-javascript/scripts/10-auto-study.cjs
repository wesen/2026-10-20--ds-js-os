const {extract}=require('./08-extract.cjs');
const {manualApp,qualify}=require('./07-manual-study.cjs');
const {src,assert,read,scripts,write,systemCases,genericApp,fixture,timings}=require('./04-harness.cjs');
const runtime=read(scripts+'/09-auto-runtime.js');
const makeCodec=Function(runtime+';return makeAutoCodec;')();
function autoApp(name) {
  const g=genericApp(name),catalog=extract(src(name)),codec=makeCodec(catalog);
  return {make:s=>codec.encode(g.make(s)),open:codec.decode,catalog};
}
function effectControls(){
  const cases=[
    'ui.table([{label:"fixed column",w:55}],read("rows"),read("opts"))',
    'ui.kv([[read("x"),read("y")]],{keyW:55})',
    'ui.text("a literal string with an embedded dictionary value [{\\"label\\":\\"fixed column\\",\\"w\\":55}]",{})',
    'ui.text("static text spans a full node")',
    'ui.text(({get label(){log.push("get");return {toString(){log.push("coerce");return "done";}};}}).label)',
    'ui.table([{label:"fixed column",w:55}],[],{get lead(){log.push("getter");return 1;}})',
    'ui.table([{label:"fixed column",w:55}],[],{meta:{"$r":0}})'
  ];
  const source=cases.join(';\n');
  const spec=extract(source),codec=makeCodec(spec);
  const runs=[];
  for(const expr of cases){
    const once=()=>{
      const log=[];const read=k=>{log.push(k);return k==='rows'?[]:{};};
      const node=Function('ui','read','log','return '+expr)(require('./04-harness.cjs').ui, read,log);
      return {raw:JSON.stringify({tree:node,hints:''}),log};
    };
    const a=once(),b=once(),packet=codec.encode(b.raw);assert.deepEqual(a.log,b.log);
    assert.deepEqual(codec.decode(packet),JSON.parse(a.raw));runs.push({log:a.log,wireMode:packet[0]==='['?'template':'generic'});
  }
  const unsupported=['ui.table([{get a(){return 3}}],v,o)','ui.table([{__proto__: x}],v,o)','ui.table([{[key]:3}],v,o)',
   'ui.table([{w:-0}],v,o)','ui.table([{w:1e400}],v,o)','ui.table([,null],v,o)','ui.table([{w:3,w:4}],v,o)',
   'ui.table([{...x}],v,o)','function f(ui){return ui.gap(123456789)}','ui.table(cols,v,o)'];
  for(const bad of unsupported)assert.equal(extract(bad).entries.length,0);
  const mutation=()=>{const c=[{label:'fixed column',w:55}],t={t:'table',cols:c};c[0].w=72;
    return JSON.stringify({tree:t,hints:''});};
  assert.deepEqual(codec.decode(codec.encode(mutation())),JSON.parse(mutation()));
  const ok=codec.encode(JSON.stringify({tree:{t:'col',kids:Array(3).fill({t:'text',s:'static text spans a full node'})},hints:''}));
  assert.equal(ok[0],'[');assert.throws(()=>codec.decode(ok.replace(spec.version,'bad')),/unknown automatic/);
  assert.throws(()=>codec.decode(ok.replace(/"\$r":\d+/,'"\$r":98765')),/unknown automatic/);
  return {guardsRejected:unsupported.length,effectCases:runs,postConstructionMutation:true,wrongVersionAndSlotRejected:true};
}
if(require.main===module){
  const cases=systemCases(),a=autoApp('sysmon');
  qualify(genericApp('sysmon'),a,'sysmon',cases,'auto');
  const checks=effectControls();
  write('auto-catalog-system.json',JSON.stringify(a.catalog,null,2)+'\n');
  write('auto-controls.json',JSON.stringify(checks,null,2)+'\n');
}
module.exports={makeCodec,autoApp};
