// Run once after verifying the frozen hashes. Registration and the frozen event
// sequence drive the real Keys callbacks; save their state for independent timing.
const {assert,capture,src,keysActions,fixture,genericApp,timings,write}=require('./04-harness.cjs');
const {autoApp}=require('./10-auto-study.cjs');
const {qualify}=require('./07-manual-study.cjs');
async function run(){
let tick=0;
const app=capture(src('keys'),{now:()=>tick*20,ask:async()=>({polls:tick+1,events:tick,errors:0})}),s=structuredClone(app.state);
const cases=[],handlers=[];
for(const [i,[action,payload]] of keysActions.entries()){
  tick=i;
  const event=action==='key'?'keys':action;
  const f=action==='start'?app.onStart:action==='tick'?app.timers[0]:app.events[event];
  if(f)await f(s,payload?{...payload,state:'down'}:undefined);
  cases.push({id:action+'-'+i,state:structuredClone(s)});
  handlers.push({action,handled:!!f});
}
const g=genericApp('keys'),a=autoApp('keys');
fixture(g,'keys',cases,'generic');qualify(g,a,'keys',cases,'auto');
write('auto-catalog-keys.json',JSON.stringify(a.catalog,null,2)+'\n');
write('keys-holdout.json',JSON.stringify({actions:handlers,states:cases,reps:24,blocks:timings({G:g,A:a},cases,24,30)},null,2)+'\n');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
