// Warm paired host costs through paint-ready input. Run after a passing pixel gate.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import os from 'node:os';
import {scripts,guest,worldBytes} from './03-guest.mjs';
import {id,source,wasm,admit,newRunner,transfer,installer,post,hash} from './06-runner.mjs';

const dir=process.argv[2];assert(dir);
const read=file=>readFileSync(join(dir,file),'utf8');
const replay=JSON.parse(read('replay.json')), gate=JSON.parse(read('pixel-gate.json'));
assert.equal(gate.orderedOutput,replay.orderedScreensSha256);
assert.equal(gate.aa,replay.screenCalls);assert.equal(gate.resident,replay.screenCalls);assert(gate.bodyRatioAfterMatchedDedup>=5);
const controls=read('control.ndjson').trimEnd().split('\n').map(x=>JSON.parse(x));
const states=read('states.ndjson').trimEnd().split('\n').map(s=>JSON.parse(s));
const producer=readFileSync(join(scripts,'04-semantic-producer.typed'),'utf8').replace('__DIGEST__',id);
const genericWorld=new WebAssembly.Module(worldBytes(null)),semanticWorld=new WebAssembly.Module(worldBytes(producer));
const t=()=>performance.now()*1000;
const keepNs = x=>Number(x.toFixed(3));
function summary(values) {
    const a=values.slice().sort((a,b)=>a-b);
    const at=q=>a[Math.max(0,Math.ceil(q*a.length)-1)];
    return {n:a.length,min:keepNs(a[0]),p50:keepNs(at(.5)),p95:keepNs(at(.95)),p99:keepNs(at(.99)),max:keepNs(a.at(-1))};
}
function stats(rows,field) {return summary(rows.map(row=>row[field]));}
const moduleMessage=transfer(1,wasm),sourceMessage=transfer(2,source);
const edited='// Receiver-side source revision with unchanged visible behavior.\n'+source;
const editedMessage=transfer(2,edited),install=installer(new Set([hash(source),hash(edited)]));
const m=install(moduleMessage),s=install(sourceMessage),e=install(editedMessage);
assert(!m.hit&&!s.hit&&!e.hit);assert(install(moduleMessage).hit && install(sourceMessage).hit && install(editedMessage).hit);
assert.deepEqual(Buffer.from(typedWasm.compile(edited).bytes),wasm);
assert.deepEqual(Buffer.from(typedWasm.compile(source).bytes),wasm);
const deniedAbi=Buffer.from(moduleMessage);deniedAbi[5]++;
const deniedWasm=Buffer.from(moduleMessage);deniedWasm[deniedWasm.length-1]^=1;
assert.throws(()=>install(deniedAbi),/invalid/);assert.throws(()=>install(deniedWasm),/unknown/);
const draw={R:newRunner(admit(wasm)),M:newRunner(m.module),S:newRunner(s.module)};
for(const arm of ['M','S']) {
    const out=states.map((state,i)=>{
        const {tree,hints}=draw[arm](state);assert.deepEqual(tree,controls[i].tree);assert.equal(hints,controls[i].hints);
        return JSON.stringify({...controls[i],tree,hints});
    });
    writeFileSync(join(dir,arm+'.ndjson'),out.join('\n')+'\n');
}
const installRows=[];
for (let i=-4;i<35;i++) {
    const order=i%2===0?['M','S']:['S','M'];
    for(const arm of order) {
        const fresh=installer(),packet=arm==='M'?moduleMessage:sourceMessage,start=t();
        const built=fresh(packet),installed=t(),draw=newRunner(built.module),instanced=t();
        const view=draw(states[0]),first=t();
        assert.equal(view.raw.length,4835);assert(!built.hit);
        const warmStart=t(),hit=fresh(packet),warm=t();
        assert(hit.hit);
        if(i>=0) installRows.push({i,arm,install:installed-start,instantiate:instanced-installed,first:first-start,cache:warm-warmStart});
    }
}
// Same runner/inputs after preinstalled, byte and source delivery, round-robin arm order.
const warmViewRows=[];
for(let n=-200;n<1200;n++) {
    const i=(n+282)%states.length, order=['R','M','S'], shift=(n+300)%3;
    for(let j=0;j<3;j++) {
        const arm=order[(j+shift)%3],start=t(),frame=draw[arm](states[i]),cost=t()-start;
        assert.equal(frame.tree.kids[0].s,controls[i].tree.kids[0].s);
        if(n>=0) warmViewRows.push({n,i,arm,view:cost});
    }
}
const samples=[];
for (const comparison of ['AA','GR']) for (const selected of [false,true]) {
    const arms={G:guest(genericWorld),R:guest(comparison==='AA'?genericWorld:semanticWorld)};
    for (const g of Object.values(arms)) {g.launch();if(selected)g.key('enter');}
    for(let i=-200;i<1200;i++) {
        const key=i%2===0?'left':'right';
        let canon;
        for(const arm of [0,3].includes((i+200)%4)?['G','R']:['R','G']) {
            const start=t(),result=arms[arm].key(key),afterEvent=t();
            const wire=post(result.screen),framed=t();
            const receive=JSON.parse(wire.toString('utf8')).frame;
            const frame=comparison==='GR' && arm==='R'?draw.R(receive.tree):receive,done=t();
            const check=JSON.stringify([frame.tree,frame.hints]);
            if(canon!==undefined) assert.equal(check,canon); else canon=check;
            if(i>=0) samples.push({comparison,selected,arm,i,guest:result.eventUs,dispatch:afterEvent-start,framing:framed-afterEvent,
                receiver:done-framed,total:done-start,bytes:wire.length});
        }
    }
}
// Node's competing setImmediate callback waits for same-thread installation to return.
const interference=[];
const deferred=()=>new Promise(resolve=>setImmediate(resolve));
for(let i=0;i<16;i++) {
    for(const arm of (i%2?['S','M','idle']:['idle','M','S'])) {
        await deferred();const start=t(),pending=new Promise(resolve=>setImmediate(()=>resolve(t()-start)));
        if(arm!=='idle') installer()(arm==='S'?sourceMessage:moduleMessage);
        interference.push({arm,i,wait:await pending});
    }
}
const host={platform:process.platform,arch:process.arch,node:process.version,model:os.cpus()[0].model};
const output={
    host,units:'microseconds',sourceBytes:Buffer.byteLength(source),moduleBytes:wasm.byteLength,
    installWire:{M:moduleMessage.byteLength,S:sourceMessage.byteLength},id,imports:WebAssembly.Module.imports(admit(wasm)),
    memoryBytes:65536,updatedSourceMissThenHit:true,abiAndByteMismatchRejected:true,
    install:{},warmView:{},key:{},pairedGain:{},interference:{}
};
for(const arm of ['M','S']) output.install[arm]=Object.fromEntries(['install','instantiate','first','cache'].map(k=>[k,stats(installRows.filter(r=>r.arm===arm),k)]));
for(const arm of ['R','M','S']) output.warmView[arm]=stats(warmViewRows.filter(r=>r.arm===arm),'view');
for(const arm of ['idle','M','S']) output.interference[arm]=stats(interference.filter(r=>r.arm===arm),'wait');
for(const comparison of ['AA','GR']) for (const selected of [false,true]) {
    const label=comparison+(selected?'Selected':'Plain');
    const byArm=['G','R'].map(arm=>samples.filter(r=>r.arm===arm&&r.selected===selected&&r.comparison===comparison));
    output.key[label]=Object.fromEntries(byArm.map(rows=>[rows[0].arm,Object.fromEntries(['guest','dispatch','framing','receiver','total'].map(k=>[k,stats(rows,k)]))]));
    output.pairedGain[label]=summary(byArm[0].map((g,i)=>g.total-byArm[1][i].total));
}
writeFileSync(join(dir,'host-timing.json'),JSON.stringify(output,null,2)+'\n');
writeFileSync(join(dir,'raw-timings.json.gz'),gzipSync(JSON.stringify({installRows,warmViewRows,samples,interference})));
console.log(JSON.stringify({bytes:output.installWire,sourceInstallP50:output.install.S.install.p50,pairedGain:output.pairedGain,warmP50:Object.fromEntries(Object.entries(output.warmView).map(([k,v])=>[k,v.p50]))}));
