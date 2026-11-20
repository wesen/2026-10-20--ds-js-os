// node 11-reader-replay.cjs output-dir app=frames.ndjson [...]
const fs=require('fs'), path=require('path'), vm=require('vm'), crypto=require('crypto');
const {performance}=require('perf_hooks'), assert=require('node:assert/strict');
const [out,...files]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const reader=fs.readFileSync(path.join(__dirname,'10-index-reader.js'),'utf8');
const index=vm.runInThisContext('(function(){'+reader+';return indexScreen})()');
const source=fs.readFileSync('picocalc-os/js/system/compositor.js','utf8');
const builder=new Proxy({}, {get:()=>()=>builder});
const metrics={};
const fonts={s:[6,12],m:[8,16],mb:[8,16],l:[12,24],lb:[12,24],sb:[6,12],xl:[16,32]};
const layout=`
let seenN=[],seenW=[],seenR=[],calls=0,hits=0;
function measure(n,w){
  calls++;
  for(let j=0;j<seenN.length;j++) if(seenN[j]===n && seenW[j]===w){
    hits++; return seenR[j];
  }
  const r=measureBody(n,w);
  if(seenN.length<96){seenN.push(n);seenW.push(w);seenR.push(r);}
  return r;
}
`;
function painter(memo){
    const checked=source.replace('catch (e) {   // a malformed tree','catch (e) {throw e;   // a malformed tree');
    const code=memo?checked.replace('function measure(n, w) {',layout+'function measureBody(n, w) {'):checked;
    return vm.runInNewContext(code+'\nF=fonts; (s)=>{'+(memo?'seenN=[];seenW=[];seenR=[];calls=hits=0;':'')+'paint(s);'+(memo?'return [calls,hits,seenN.length]':'return [0,0,0]')+'}',{service:()=>builder,fonts,clock:{set:()=>false}});
}
const original=painter(false), cached=painter(true);
function draw(paint,row,tree){
    const ops=[];
    const fb={};for(const k of ['text','fill','rect','line']) fb[k]=(...args)=>ops.push([k,...args]);
    const counts=paint({apps:{[row.app]:{tree,hints:row.hints||'',title:row.title||row.app}},focus:row.app,
        battery:row.battery??null,banner:row.banner??null,crashed:{},fb});
    return {ops:JSON.stringify(ops),counts};
}
const defs=files.map(spec=>{const pos=spec.indexOf('=');return [spec.slice(0,pos),spec.slice(pos+1)];});
const bench={};
for(const [app,file] of defs){
    const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
    let nops=0,ncalls=0,hits=0,maxSlots=0,maxTokens=0,maxBytes=0;
    const h=crypto.createHash('sha256');
    for(const row of rows){
        const s=JSON.stringify(row.tree), ix=index(s);
        const plain=draw(original,row,row.tree), indexed=draw(original,row,ix.view()), saved=draw(cached,row,row.tree);
        assert.equal(indexed.ops,plain.ops,app+'/'+row.id+' lazy');
        assert.equal(saved.ops,plain.ops,app+'/'+row.id+' layout');
        assert.equal(JSON.stringify(ix.material()),s);
        h.update(plain.ops+'\n');nops+=JSON.parse(plain.ops).length;
        ncalls+=saved.counts[0];hits+=saved.counts[1];maxSlots=Math.max(maxSlots,saved.counts[2]);
        maxTokens=Math.max(maxTokens,ix.used);maxBytes=Math.max(maxBytes,Buffer.byteLength(s));
    }
    const ordered=rows.slice().sort((a,b)=>JSON.stringify(a.tree).length-JSON.stringify(b.tree).length);
    const sample=ordered[Math.floor(rows.length*.75)]; bench[app]=JSON.stringify(sample.tree);
    const htimes={};
    for(const arm of ['material','indexed','cached']) {
        const runs=[];
        for(let i=0;i<26;i++){
            const t=performance.now();const tree=arm==='indexed'?index(bench[app]).view():JSON.parse(bench[app]);
            const x=draw(arm==='cached'?cached:original,sample,tree);
            if(i>0) runs.push((performance.now()-t)*1000);
        }
        htimes[arm]=runs;
    }
    metrics[app]={frames:rows.length,nops,ncalls,hits,maxSlots,maxTokens,maxBytes,commandSHA256:h.digest('hex'),sampleId:sample.id,hostMicroseconds:htimes};
}
const eq=(s)=>assert.equal(JSON.stringify(index(s).material()),JSON.stringify(JSON.parse(s)));
for(const s of ['{"\\u0074ype":"t","a":[-0,2.5e-3,"\\ud83d\\ude00","\\u0000","日本🙂"]}','{"a":0,"a":4}','{"__proto__":1}']) eq(s);
for(const s of ['[1,]','{"k":}','01','true x','[','"\\uDDDg"','["\\x33"]']) assert.throws(()=>index(s));
for(const [s,r,l] of [['[1,2]',new Uint16Array(8),{bytes:99,depth:5,string:10}],['[[0]]',new Uint16Array(100),{bytes:99,depth:1,string:100}],['"é"',new Uint16Array(99),{bytes:3,depth:3,string:3}],['"abcd"',new Uint16Array(8),{bytes:10,depth:2,string:3}]]) assert.throws(()=>index(s,r,l));
fs.writeFileSync(path.join(out,'reader-layout.json'),JSON.stringify(metrics,null,2)+'\n');
const stage=fs.readFileSync(path.join(__dirname,'12-device-reader.js'),'utf8');
fs.writeFileSync(path.join(out,'reader.js'),reader+'\nconst labFrames='+JSON.stringify(bench)+';\n'+stage);
console.log(Object.entries(metrics).map(([k,v])=>[k,v.frames,v.maxTokens,v.hits,v.ncalls]));
