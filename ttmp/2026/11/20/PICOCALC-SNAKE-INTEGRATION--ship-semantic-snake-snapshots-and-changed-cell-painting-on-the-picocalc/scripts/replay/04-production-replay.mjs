// From anywhere inside the checkout: node .../scripts/replay/04-production-replay.mjs
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const old='e339b6a';
const source=(file,baseline)=>baseline ?
    execFileSync('git',['-C',root,'show',old+':'+file],{encoding:'utf8'}) : readFileSync(join(root,file),'utf8');
const previous='ttmp/2026/11/20/PICOCALC-RENDER-SNAKE--measuring-snake-snapshots-and-damage-against-full-frames/various';
const readFrozen=name=>JSON.parse(source(previous+'/'+name,true));
const trace=readFrozen('events.json'), pixels=readFrozen('pixels.json'), recordings=readFrozen('replay.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const js='picocalc-os/js/';
const fullscreenBytes=320*320*2;

function producer(baseline) {
    const prelude=source(js+'prelude.js',baseline), anchor='let S = {};';
    assert.equal(prelude.split(anchor).length,2);
    const math=Object.create(Math);
    const host={__k(k){if(k==='self')return 'snake';if(k==='seed')return trace.seed;throw Error(k);}};
    // Test-only access to install the two constructed states. Normal replay uses public entry points.
    new Function('globalThis','Math',prelude.replace(anchor,anchor+' g.testState = () => S;'))(host,math);
    new Function('app','ui','Math',source(js+'apps/snake.js',baseline))(host.app,host.ui,math);
    assert.deepEqual(host.__init().every,[trace.intervalMs]);
    const frames=[],projections=[],extra=new Map();
    function collect(target) {
        const state=host.testState();
        const cell=([x,y])=>22*y+x;
        const projection={t:'snake',v:1,body:state.body.map(cell),food:cell(state.food),score:state.score,
            best:state.best,alive:state.alive,auto:state.auto};
        const frame=JSON.parse(host.__render());
        if(target==='trace'){frames.push(frame);projections.push(projection);}
        else extra.set(target,frame);
    }
    for (const {kind,type,payload} of trace.actions) {
        host.__dispatch(kind,type,JSON.stringify(payload),'compositor',false);
        collect('trace');
    }
    const path=Array.from({length:396},(_,i)=>[Math.floor(i/22)%2?21-i%22:i%22,Math.floor(i/22)]);
    for (const n of [300,395,13,14,255,256]) {
        Object.assign(host.testState(),{body:path.slice(0,n),score:(n-4)*10,best:0,food:path[n],alive:true,auto:false});
        collect(n===300||n===395?'trace':n);
    }
    return {frames,projections,extra};
}

function world(sourceText,gfx) {
    const back=Buffer.alloc(fullscreenBytes),front=Buffer.alloc(fullscreenBytes),panel=Buffer.alloc(fullscreenBytes);
    const native=gfx.make(back,front);
    const controls={nextFlush:'ok',time:0,knownClock:false,minute:0};
    const latest={calls:[],flushes:0,flushRects:[],invalidations:0};
    const service={events:{},pending:false};
    const builder={
        needs(){return this;}, state(s){service.state=s;return this;},
        onStart(callback){service.start=callback;return this;},
        on(name,callback){service.events[name]=callback;return this;},
        every(ms,callback){service.tick=callback;return this;}
    };
    const fb={narrow(){return this;},invalidate(){latest.invalidations++;gfx.op(native,5);},
        commit(){return gfx.op(native,4);}};
    for(const [name,code] of [['fill',0],['rect',1],['line',2]]) {
        fb[name]=(x,y,w,h,color)=>{
            latest.calls.push([name,x,y,w,h]);
            gfx.op(native,code,x|0,y|0,w|0,h|0,color);
        };
    }
    fb.text=(x,y,text,font,color,width=0)=>{
        latest.calls.push(['text',x,y]);
        return gfx.op(native,3,x|0,y|0,width|0,0,color,font||'m',String(text));
    };
    const ask=async(to,kind,{rects})=>{
        assert.equal(to,'display');assert.equal(kind,'flush');
        latest.flushes++; latest.flushRects=Array.from(rects,r=>Array.from(r));
        const mode=controls.nextFlush;controls.nextFlush='ok';
        if(mode==='throw')throw Error('injected display timeout');
        if(mode==='skip')return {skipped:true};
        for(const [x,y,w,h] of rects){
            assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=320&&y+h<=320);
            for(let dy=0;dy<h;dy++) {
                const at=((y+dy)*320+x)*2;
                front.copy(panel,at,at,at+w*2);
            }
        }
        return {skipped:false};
    };
    class ClockDate {getHours(){return 13;}getMinutes(){return controls.minute;}}
    vm.runInNewContext(sourceText,{service:()=>builder,self:'compositor',ask,
        send:(to,kind)=>{if(to==='compositor'&&kind==='draw')service.pending=true;},
        now:()=>controls.time,clock:{set:()=>controls.knownClock},Date:ClockDate,
        gfx:{fonts:()=>JSON.parse(gfx.fonts())},dma:{alloc:()=>fb}});
    service.start(service.state);
    function event(kind,payload,from) {
        return service.events[kind](service.state,payload,{from});
    }
    async function draw() {
        latest.calls=[];latest.flushRects=[];
        if(!service.pending)return false;
        service.pending=false;
        await event('draw',null,'compositor');
        return true;
    }
    return {back,panel,controls,latest,event,draw,tick:()=>service.tick(service.state),
        retainedSnake:()=>service.state.apps.snake, accepted:()=>service.state.frames, queued:()=>service.pending};
}

async function run(gfx) {
    const a=producer(true),b=producer(false),originals=a.frames,candidates=b.frames;
    assert.deepEqual(a.projections,b.projections,'identical game state under both sources');
    assert.equal(originals.length,236);assert.equal(candidates.length,236);
    const controlSource=source(js+'system/compositor.js',true), candidateSource=source(js+'system/compositor.js',false);
    let control=world(controlSource,gfx), candidate=world(candidateSource,gfx);
    const witnesses={},cases=[],invalidCases=[];
    function both(fn){fn(control);fn(candidate);}
    function frame(w,f,title='Snake',app='snake',from=app) {w.event('frames',{title,app,frame:f},from);}
    function indexed(i,title='Snake'){frame(control,originals[i],title);frame(candidate,candidates[i],title);}
    function open(app){both(w=>w.event('open',{app},'launcher'));}
    const equals=(a,b,where)=>assert.ok(a.equals(b),where+' differs, rgb565 '+hash(a)+' versus '+hash(b));
    async function match(id,{present=true,expected=null}={}) {
        await Promise.all([control.draw(),candidate.draw()]);
        equals(control.back,candidate.back,id+' back');equals(control.panel,candidate.panel,id+' panel');
        if(present){equals(control.back,control.panel,id+' control presentation');equals(candidate.back,candidate.panel,id+' candidate presentation');}
        if(expected)assert.equal(hash(control.back),expected,id+' prior-lab pixels');
    }
    open('snake');
    let fullClears=0,partialChanges=0,sourceSends=0,candidateSends=0,sourceBytes=0,candidateBytes=0;
    for(let i=0;i<originals.length;i++) {
        const id=pixels[i].id, o=JSON.stringify(originals[i]),c=JSON.stringify(candidates[i]);
        assert.equal(hash(o),recordings.observations[i].sourceSha,id+' reference source');
        assert.equal(candidates[i].tree.t,'snake',id+' production producer must emit semantic JSON');
        assert.deepEqual(candidates[i].tree,a.projections[i],id+' state equals semantic projection, including hidden best');
        assert.equal(candidates[i].hints,originals[i].hints);
        if(i===0||o!==JSON.stringify(originals[i-1])){frame(control,originals[i]);sourceSends++;sourceBytes+=Buffer.byteLength(o);}
        if(i===0||c!==JSON.stringify(candidates[i-1])){frame(candidate,candidates[i]);candidateSends++;candidateBytes+=Buffer.byteLength(c);}
        await match(id,{expected:pixels[i].rgb565Sha256});
        const calls=candidate.latest.calls;
        const cleared=calls.some(([name,x,y,w,h])=>name==='fill'&&x===0&&y===0&&w===320&&h===320);
        assert.deepEqual(candidate.latest.flushRects,control.latest.flushRects,id+' exact damage rectangles');
        fullClears+=Number(cleared);
        if(!cleared&&pixels[i].changed>0)partialChanges++;
        if(['move-down','enter-vacated-tail','self-collision','restart','paused-timer','fixture-395'].includes(id))
            witnesses[id]={changedPixels:pixels[i].changed,calls:calls.length,fullClear:cleared,rects:candidate.latest.flushRects.length};
    }
    assert(partialChanges>0,'at least one changed frame uses changed-cell drawing');
    assert.equal(witnesses['move-down'].fullClear,false,'ordinary move must omit full-screen clearing');
    assert.equal(witnesses['enter-vacated-tail'].fullClear,false);
    assert.equal(witnesses['move-down'].calls,3);
    assert.equal(witnesses['enter-vacated-tail'].calls,2);
    const chase=pixels.findIndex(row=>row.id==='enter-vacated-tail');
    const chaseBodies=[candidates[chase-1].tree.body,candidates[chase].tree.body];
    assert.equal(witnesses['paused-timer'].changedPixels,0);
    assert.equal(witnesses['paused-timer'].calls,0);
    let recordedSends=0,recordedOldBytes=0,recordedNewBytes=0;
    for(let i=0;i<trace.actions.length;i++) if(recordings.observations[i].sent){
        recordedSends++;recordedOldBytes+=Buffer.byteLength(JSON.stringify(originals[i]));
        recordedNewBytes+=Buffer.byteLength(JSON.stringify(candidates[i]));
    }
    const test=async(id,fn)=>{await fn();await match(id);cases.push(id);};
    const idx=id=>pixels.findIndex(row=>row.id===id);
    await test('return from near-full fixture',()=>indexed(idx('eat')));
    await test('start nonadjacent sequence',()=>indexed(idx('auto-21')));
    await test('skip ten intermediate frames',()=>indexed(idx('auto-32')));
    await test('three replacement frames before draw',()=>{
        indexed(idx('auto-33'));indexed(idx('auto-34'));indexed(idx('auto-35'));
    });
    const other={tree:{t:'text',s:'Ordinary application',font:'mb'},hints:'close'};
    await test('open another ordinary app',()=>{both(w=>frame(w,other,'Editor','editor'));open('editor');});
    await test('unfocused Snake replaces its retained frame',()=>indexed(idx('auto-41')));
    await test('return to latest Snake frame',()=>open('snake'));
    await test('F1 keyboard focus moves to launcher',()=>both(w=>w.event('keys',{key:'f1',state:'down'},'keyboard')));
    await test('open Snake from launcher again',()=>open('snake'));
    await test('battery status and low-battery color',()=>both(w=>w.event('power',{pct:7,charging:true},'power')));
    await test('clock becomes valid',()=>both(w=>{w.controls.knownClock=true;w.controls.minute=42;w.tick();}));
    await test('clock minute advances with motion',()=>{both(w=>{w.controls.minute=43;w.tick();});indexed(idx('auto-42'));});
    await test('rename focused title',()=>indexed(idx('auto-43'),'Serpent'));
    await test('notification overlay during active game',()=>both(w=>w.event('notify',{text:'test overlay',sub:'still active'},'agenda')));
    await test('motion behind notification',()=>indexed(idx('auto-45'),'Serpent'));
    await test('banner expiration uncovers board',()=>both(w=>{w.controls.time+=9000;w.tick();}));
    await test('changed hints with same board',()=>{
        frame(control,{...originals[4],hints:'replacement hint'});
        frame(candidate,{...candidates[4],hints:'replacement hint'});
    });
    await test('kernel crash removes focused content',()=>both(w=>w.event('worlds.status',{state:'crashed',world:'snake',why:'injected',in_ms:50},null)));
    await test('kernel restart and retained publication',()=>{both(w=>w.event('worlds.status',{state:'running',world:'snake',restarts:1},null));indexed(idx('auto-50'));});
    await test('dismiss restarted banner',()=>both(w=>{w.controls.time+=7500;w.tick();}));
    await test('display restarts',()=>both(w=>w.event('worlds.status',{state:'running',world:'display',restarts:1},null)));
    await test('display notice expires',()=>both(w=>{w.controls.time+=1800;w.tick();}));
    for(const [mode,i] of [['skip',idx('auto-52')],['throw',idx('auto-58')]]) {
        both(w=>{w.controls.nextFlush=mode;});indexed(i);
        await match(mode+' drain',{present:false});
        assert(!candidate.back.equals(candidate.panel),mode+' must leave visible stale pixels');
        indexed(i); // same pixels, no other app or chrome invalidation to help repair the panel
        await match(mode+' retry');
        assert.deepEqual(candidate.latest.flushRects,[[0,0,320,320]],mode+' recovery repairs full panel');
        cases.push(mode+' failed transfer and next draw');
    }
    for(const n of [13,14,255,256]) {
        await test('constructed length '+n,()=>{frame(control,a.extra.get(n));frame(candidate,b.extra.get(n));});
    }
    // A malformed update should preserve the last accepted frame; valid recovery is checked afterward.
    indexed(idx('auto-60'));await match('seed for validation');
    const seed=candidates[idx('auto-60')];
    const violations=[
        ['unknown kind',t=>t.t='snake2'],['unknown version',t=>t.v=2],['nonboolean alive',t=>t.alive=1],['nonboolean auto',t=>t.auto=null],
        ['food past board',t=>t.food=396],['negative cell',t=>t.body[0]=-1],['fractional cell',t=>t.body[0]=1.5],
        ['food over segment',t=>t.food=t.body[0]],['duplicate body',t=>t.body[1]=t.body[0]],
        ['disconnected',t=>t.body[1]=(t.body[0]+100)%396],['three cells',t=>t.body=t.body.slice(0,3)],
        ['overlong',t=>t.body=Array(397).fill(0)],['string body',t=>t.body='hello'],
        ['row wrap',t=>{t.body=[20,21,22,23];t.food=88;t.score=0;}],
        ['best above permitted maximum',t=>t.best=3920],['score mismatch',t=>t.score++],['fractional best',t=>t.best=1.5],
    ];
    const retained=candidate.retainedSnake(), accepted=candidate.accepted(), flushes=candidate.latest.flushes;
    async function reject(name) {
        assert.equal(candidate.retainedSnake(),retained,name+' replaced last accepted frame');
        assert.equal(candidate.accepted(),accepted,name+' counted as accepted');
        assert.equal(candidate.queued(),false,name+' scheduled a draw');
        await match('reject '+name);
        assert.equal(candidate.latest.flushes,flushes,name+' caused a flush');
        invalidCases.push(name);
    }
    for(const [name,mutate] of violations) {
        const bad=structuredClone(seed);mutate(bad.tree);frame(candidate,bad);await reject(name);
    }
    frame(candidate,candidates[0],'Disguised','snake','editor');await reject('sender mismatch');
    candidate.event('frames',{app:'snake',frame:null},'snake');await reject('null frame');
    await test('fresh frame after refusals',()=>indexed(idx('auto-61')));
    // A restarted service begins with a fresh framebuffer, then receives the retained complete snapshot.
    for(const id of ['eat','self-collision','restart','auto-105','fixture-395']) {
        control=world(controlSource,gfx);candidate=world(candidateSource,gfx);open('snake');indexed(idx(id));
        await match('restart '+id,{expected:pixels[idx(id)].rgb565Sha256});cases.push('restart '+id);
    }
    return {baseline:old,sourceSha256:{baselineSnake:hash(source(js+'apps/snake.js',true)),candidateSnake:hash(source(js+'apps/snake.js',false)),
        baselineCompositor:hash(controlSource),candidateCompositor:hash(candidateSource)},
        observations:originals.length,recorded:trace.actions.length,constructed:2,sourceSends,candidateSends,
        sourceFrameBytes:sourceBytes,candidateFrameBytes:candidateBytes,
        recordedTraffic:{distinctConsecutiveSends:recordedSends,oldFrameBytes:recordedOldBytes,newFrameBytes:recordedNewBytes},
        fullClears,changedWithoutFullClear:partialChanges,
        witnesses,chaseBodies,lifecycleChecks:cases,malformedChecks:invalidCases};
}

const build=mkdtempSync(join(tmpdir(),'snake-production-replay-'));
try{
    const bin=join(build,'raster.node'), nucleus=join(root,'picocalc-os/nucleus');
    for(const name of ['gfx.c','util.c','nucleus.h','font_data.h']){
        const path='picocalc-os/nucleus/'+name;
        assert.equal(hash(source(path,true)),hash(source(path,false)),path+' raster source must match pinned baseline');
    }
    execFileSync('cc',['-shared','-fPIC','-O2','-fvisibility=hidden','-I/usr/include/node','-I',nucleus,
        '-ffunction-sections','-fdata-sections',join(here,'03-gfx.c'),join(nucleus,'gfx.c'),join(nucleus,'util.c'),
        '-Wl,--gc-sections','-o',bin]);
    console.log(JSON.stringify(await run(createRequire(import.meta.url)(bin)),null,2));
}finally{rmSync(build,{recursive:true,force:true});}
