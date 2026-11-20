// Post-holdout manual upper-bound comparator. The sealed extractor is unmodified.
const {assert,read,write,output,ui,genericApp,fixture}=require('./04-harness.cjs');
const {diff}=require('./13-comparisons.cjs');
const g=genericApp('keys');
const cases=JSON.parse(read(output+'/keys-holdout.json')).states;
function keyValues(s){
  if(!s.focused)return [1,0];
  const hex=c=>'0x'+c.toString(16).padStart(2,'0'),e=s.last;
  return [1,1,e?(e.ch&&e.ch!==' '?e.ch:e.key):'–',e?hex(e.code)+' '+e.state:'press a key',
    s.stats?[String(s.stats.polls),String(s.stats.events),String(s.stats.errors)]:null,!!(e&&e.caps),
    s.events.slice().reverse().map(x=>[Math.round(x.t),hex(x.code),x.key,x.state])];
}
function build(v){
  if(v[0]!==1)throw Error('unknown Keys version');
  if(v[1]===0)return ui.text('');
  const stats=v[4]||['?','?','?'];
  return ui.col({gap:6},ui.row({gap:10},ui.box({w:110,pad:6,border:'ink',bg:'#ffffff'},
    ui.text(v[2],{font:'xl',align:'center'}),ui.text(v[3],{font:'s',align:'center',color:'muted'})),
    ui.kv([['polls',stats[0]],['events',stats[1]],['i2c errors',stats[2]],['caps lock',v[5]?'on':'off'],['poll period','20 ms']],{keyW:80,lead:3})),
    ui.table([{label:'t ms',w:62,align:'right'},{label:'code',w:46},{label:'key',w:74},{label:'state'}],
      v[6].map(([t,c,k,s])=>[t,c,k,{s,color:s==='down'?'accent':s==='hold'?'blue':'muted'}]),{font:'s',lead:3}));
}
const m={make:s=>JSON.stringify({v:keyValues(s),hints:'what the driver reads, newest first'}),
  open:w=>{const x=JSON.parse(w);return {tree:build(x.v),hints:x.hints};}};
const control=fixture(g,'keys',cases,'generic',false),manual=fixture(m,'keys',cases,'manual-posthoc');
assert.deepEqual(manual.rows,control.rows);assert.deepEqual(manual.records.map(r=>r.enqueued),control.records.map(r=>r.enqueued));
function pathBytes(reset){
  let state=null,previous='';
  return control.records.reduce((sum,r,i)=>{
    const next=JSON.parse(r.wire),full=Buffer.byteLength(r.wire),initial=!state||i===reset;
    const n=initial?full:previous===r.wire?0:Math.min(full,Buffer.byteLength(JSON.stringify(diff(state,next))));
    state=next;previous=r.wire;return sum+n;
  },0);
}
const bytes=rs=>rs.filter(x=>x.enqueued).reduce((n,x)=>n+x.bytes,0);
const G=bytes(control.records),M=bytes(manual.records),A=bytes(read(output+'/keys-auto-wire.ndjson').trim().split('\n').map(JSON.parse));
const s1=pathBytes(13);
write('keys-normalization.json',JSON.stringify({frozenRules:'958d760',postHocManualControl:true,matchedTrees:cases.length,G,M,A,
  S1:s1,S1ResetFrame:13,S1NoReset:pathBytes(-1),recoveredVsG:(G-A)/(G-M),recoveredVsS1:(s1-A)/(s1-M)},null,2)+'\n');
