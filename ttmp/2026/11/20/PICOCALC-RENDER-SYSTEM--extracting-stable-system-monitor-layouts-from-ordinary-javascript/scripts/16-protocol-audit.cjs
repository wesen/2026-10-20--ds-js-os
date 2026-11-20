const {assert,read,write,output,src,scripts,systemCases,genericApp,fixture,ui}=require('./04-harness.cjs');
const {manualApp}=require('./07-manual-study.cjs');
const {autoApp}=require('./10-auto-study.cjs');
const cases=systemCases(),g=genericApp('sysmon'),m=manualApp(),a=autoApp('sysmon');
const rec=tag=>read(output+'/sysmon-'+tag+'-wire.ndjson').trim().split('\n').map(JSON.parse);
const [G,M,A]=['generic','manual','auto'].map(rec),S1=JSON.parse(read(output+'/generic-diff.json')).frames;
function counted(r){return r.enqueued?r.bytes:0;}
function group(prefix){
 const indexes=cases.map((c,i)=>c.id.startsWith(prefix)?i:-1).filter(i=>i>=0);
 return Object.fromEntries([['G',G],['M',M],['A',A],['S1',S1]].map(([k,rows])=>[k,indexes.reduce((sum,i)=>sum+(k==='S1'?rows[i].bytes:counted(rows[i])),0)]));
}
const manualResident=Buffer.byteLength(read(scripts+'/06-manual-receiver.js'));
const autoResident=JSON.parse(read(output+'/summary.json')).costs.sysmonA.residentSource;
const totals=Object.fromEntries([['G',G],['M',M],['A',A],['S1',S1]].map(([k,rows])=>[k,rows.reduce((sum,r)=>sum+(k==='S1'?r.bytes:counted(r)),0)]));
const perTabBreakEven={};
for(const tab of [0,1,2]){
  let saving=-manualResident,count=0,first=null;
  for(const [i,f] of cases.entries())if(f.state.tab===tab&&f.state.focused){
    count++;saving+=S1[i].bytes-counted(M[i]);
    if(first===null&&saving>=0)first=count;
  }
  perTabBreakEven[tab]={first,netBalanceAtEnd:saving};
}
const archives={};
for(const [arm,codec,version] of [['M',m,1],['A',a,a.catalog.version]]){
  let retained=null;
  const decode=(w)=>arm==='M'&&w[0]==='{'&&Object.hasOwn(JSON.parse(w),'tree')?g.open(w):codec.open(w);
  function admit(w){const x=decode(w);if(!x||typeof x.tree!=='object')throw Error('missing tree');retained=w;return x;}
  function make(s,known){
    if(known===version)return codec.make(s);
    // M carries the same resident reconstruction code in its producer on a miss,
    // so this path needs the manual packer and shared catalog but no duplicate app.
    return arm==='M'?JSON.stringify(codec.open(codec.make(s))):g.make(s);
  }
  const s=cases[6].state,view=admit(make(s,version)),accepted=retained;
  const obj=JSON.parse(accepted);
  if(arm==='M')obj.v[0]=901;else obj[0]='mismatch';
  assert.throws(()=>admit(JSON.stringify(obj)),/unknown/);assert.equal(retained,accepted);
  const fresh=arm==='M'?manualApp():autoApp('sysmon');
  assert.deepEqual(fresh.open(retained),view);
  const unknown=make(cases[7].state,'uninstalled');
  assert.equal(unknown,g.make(cases[7].state));
  assert.deepEqual(admit(unknown),g.open(g.make(cases[7].state)));
  const ok=admit(make(cases[8].state,version));assert.deepEqual(JSON.parse(JSON.stringify(ok)),g.open(g.make(cases[8].state)));
  archives[arm]={oldId:cases[6].id,invalidRejected:true,idleFreshReceiverMatches:true,catalogMiss:'generic',acceptedNext:cases[8].id};
}
const nodes=x=>x!==null&&typeof x==='object'?1+Object.values(x).reduce((n,c)=>n+nodes(c),0):0;
const counts={};for(const [k,rows,codec] of [['G',G,g],['M',M,m],['A',A,a]]){
  counts[k]=rows.reduce((n,r)=>n+(r.enqueued?nodes(codec.open(r.wire)):0),0);
}
const example=Object.fromEntries([['G',G],['M',M],['A',A],['S1',S1]].map(([k,r])=>[k,r[6].bytes]));
write('protocol-audit.json',JSON.stringify({groups:{refresh:group('refresh-'),select:group('select-'),unrelated:group('unrelated-'),title:group('title-')},
 exampleWorldsLast:example,perTabBreakEven,finalObjectAndArrayCounts:counts,
 wireIncludingTwoLogicalInstalls:{G:totals.G,M:totals.M+2*manualResident,A:totals.A+2*autoResident,S1:totals.S1},
 archiveReplay:archives},null,2)+'\n');
