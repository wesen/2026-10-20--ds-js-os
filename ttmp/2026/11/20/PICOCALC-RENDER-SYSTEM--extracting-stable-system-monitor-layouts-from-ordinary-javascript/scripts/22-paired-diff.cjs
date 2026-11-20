// Follow-up directly tests the blind S1 p95 receiver gate. The host implementation
// and choices of full vs patch are exactly those from 13; only the measurement schedule changes.
const {read,write,output,assert,genericApp,systemCases}=require('./04-harness.cjs');
const {manualApp}=require('./07-manual-study.cjs');
const g=genericApp('sysmon'),m=manualApp(),cases=systemCases();
const {diff,paired}=require('./13-comparisons.cjs');
const expected=JSON.parse(read(output+'/generic-diff.json')).frames;
const counts=()=>({parsedContainers:0,appliedPathWrites:0});
function containers(x){return !x||typeof x!=='object'?0:1+Object.values(x).reduce((n,v)=>n+containers(v),0);}
function run(arm,reps){
  let p=0,r=0,bytes=0;const work=counts();
  for(let rep=0;rep<reps;rep++){
    let old=null,cur=null,prev='';
    for(const [i,f] of cases.entries()){
      let packet='';
      const start=process.hrtime.bigint();
      const raw=arm==='M'?m.make(f.state):g.make(f.state);
      if(arm==='S1'){
        const next=JSON.parse(raw);
        if(raw!==prev||i===50){
          const patch=old&&i!==50?JSON.stringify(diff(old,next)):null;
          packet=patch&&Buffer.byteLength(patch)<Buffer.byteLength(raw)?patch:raw;
        }
        old=next;
      }else if(raw!==prev)packet=raw;
      prev=raw;p+=Number(process.hrtime.bigint()-start);
      if(!packet)continue;
      const time=process.hrtime.bigint();
      if(arm==='M')cur=m.open(packet);
      else {
        const item=JSON.parse(packet);
        if(packet[0]==='{')cur=item;
        else for(const [path,v] of item){
          if(!path.length)cur=v;else{let parent=cur;for(const k of path.slice(0,-1))parent=parent[k];parent[path.at(-1)]=v;}
        }
      }
      r+=Number(process.hrtime.bigint()-time);
      bytes+=Buffer.byteLength(packet);
      if(reps===1){
        if(arm==='S1'){assert.equal(expected[i].bytes,Buffer.byteLength(packet));assert.deepEqual(cur,old);}
        work.parsedContainers+=containers(JSON.parse(packet));
        if(arm==='S1'&&packet[0]==='[')work.appliedPathWrites+=JSON.parse(packet).length;
      }
    }
  }
  return {arm,producerUsPerTrace:p/reps/1e3,receiverUsPerTrace:r/reps/1e3,bytes:bytes/reps,...work};
}
const checks=['M','S1'].map(a=>run(a,1));
const blocks=[];
for(let i=0;i<30;i++){
  const names=i%2?['M','S1']:['S1','M'];
  blocks.push({block:i,order:names,trials:names.map(x=>run(x,6))});
}
const relative=blocks.map(b=>({...b,trials:b.trials.map(t=>({...t,arm:t.arm==='S1'?'G':t.arm}))}));
write('paired-diff.json',JSON.stringify({checks,reps:6,blocks,relativeMOverS1:paired(relative,['M']).M},null,2)+'\n');
