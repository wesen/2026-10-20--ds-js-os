// Prototype the kernel ownership contract in one-thread order. Permit one deferred draw.
const {readFileSync,writeFileSync}=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const reader=vm.runInThisContext('(function(){'+readFileSync(path.join(__dirname,'10-index-reader.js'),'utf8')+';return indexScreen})()');
class ScreenStore {
    constructor(owners){
        this.owners=new Map(owners.map(name=>[name,{epoch:1,current:null,pending:false}]));
        this.slots=Array.from({length:owners.length+2},()=>({refs:0,index:null,records:new Uint16Array(4096*4)}));
        this.pinned=null; this.maximum=0;
    }
    release(slot){if(slot && --slot.refs===0)slot.index=null;}
    admit(name,epoch,envelope,check=()=>{}){
        const w=this.owners.get(name);
        if(!w || epoch!==w.epoch || envelope.publisher!==name) return 'owner';
        const slot=this.slots.find(s=>s.refs===0);
        if(!slot) return 'capacity';
        slot.refs=1;this.maximum=Math.max(this.maximum,this.slots.filter(s=>s.refs>0).length);
        try {
            slot.index=reader(envelope.text,slot.records);
            check(slot.index.view());
        } catch(e){this.release(slot);return e.message;}
        const old=w.current;w.current=slot;w.pending=true;this.release(old);
        return 'accepted';
    }
    draw(name) {
        if(this.pinned) throw Error('draw in progress');
        const w=this.owners.get(name);
        if(!w.current) return null;
        this.pinned=w.current;this.pinned.refs++;w.pending=false;
        return this.pinned.index.view();
    }
    finish(){this.release(this.pinned);this.pinned=null;}
    restartConsumer(){this.finish();for(const w of this.owners.values())w.pending=!!w.current;}
    removePublisher(name){
        const w=this.owners.get(name);w.epoch++;this.release(w.current);w.current=null;w.pending=false;
    }
}
const store=new ScreenStore(['editor','sysmon','chess','snake']);
const post=(owner,text,epoch=1)=>store.admit(owner,epoch,{publisher:owner,text},v=>{
    // One worked schema. Production widgets each need their own bounded shape check.
    if(v.t!=='text'||typeof v.s!=='string')throw Error('schema');
});
const text=s=>JSON.stringify({t:'text',s});
for(const name of store.owners.keys()) assert.equal(post(name,text(name)),'accepted');
const first=store.draw('editor');assert.equal(first.s,'editor');
assert.equal(post('editor',text('A')),'accepted');
const rejected=[];
for(const [cause,wire] of [['bytes',text('a'.repeat(16500))],['tokens','['+Array(4096).fill('0').join(',')+']'],['syntax','{"t"'],['depth','['.repeat(42)+'0'+']'.repeat(42)],['string',text('a'.repeat(8193))],['schema','{}']]){
    const result=post('editor',wire);assert.equal(result,cause);rejected.push(result);
}
for(let j=0;j<160;j++) assert.equal(post('snake',text('state'+j)),'accepted');
assert.equal(first.s,'editor');
assert.equal([...store.owners.values()].filter(w=>w.pending).length,4);
store.restartConsumer();assert.equal(store.draw('editor').s,'A');store.finish();
assert.equal(post('editor',text('C')),'accepted');assert.equal(store.draw('editor').s,'C');
store.removePublisher('editor');assert.equal(post('editor',text('old epoch'),1),'owner');
assert.equal(store.admit('snake',1,{publisher:'editor',text:text('wrong owner')}),'owner');
store.finish();assert.equal(store.draw('editor'),null);
assert.equal(post('editor',text('new epoch'),2),'accepted');
store.restartConsumer();assert.equal(store.draw('snake').s,'state159');store.finish();
const report={workload:'four publishers, one private candidate and at most one outstanding draw',slots:store.slots.length,
    maximumOccupied:store.maximum,tokenIndexReserved:store.slots.reduce((a,s)=>a+s.records.byteLength,0),encodedByteCapEach:16384,
    checks:{previousPinned:true,restartShowsA:true,nextShowsC:true,replacedNotifications:160,epochAndOwner:true,rejected},
    limit:'Encoded-byte caps apply to material already received as JS strings. VM heap, wire ingress, schema-specific work and other subscribers are outside this prototype.'};
writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
