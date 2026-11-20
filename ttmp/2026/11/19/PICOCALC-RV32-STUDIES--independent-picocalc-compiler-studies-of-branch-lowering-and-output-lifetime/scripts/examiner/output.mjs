// node output.mjs MODE CANDIDATE_DIR NATIVE_REACTOR_DIR
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {compiler, hash, revision} from './compiler.mjs';

const [mode,overlay,reactorDir]=process.argv.slice(2);
assert(['compact','direct'].includes(mode) && overlay && reactorDir,'pass mode, generated directory and native reactor directory');
const {realm:base}=compiler(), {realm:c,files}=compiler(overlay);
const source=(path)=>readFileSync(path,'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const imports=Array.from({length:132},(_,i)=>({name:'host'+i,params:['i32'],result:'i32'}));
const raw=(realm,src,im=imports,options)=>realm.typedRv32.compile(src,im,128*1024,options);
function assertSame(actual,expected) {
    const {image:e,...em}=expected, {image:a,...am}=actual;
    assert.deepEqual(plain(am),plain(em));
    assert.equal(Object.getPrototypeOf(actual.entries),null);
    assert.deepEqual(Buffer.from(a),Buffer.from(e));
    assert.equal(a.length,a.buffer.byteLength);
}
function error(fn) {
    try {fn();} catch(e) {assert.equal(e.name,'SyntaxError');return e.name+' '+e.message;}
    throw new Error('expected a SyntaxError');
}

const prefix=n=>Array.from({length:n},(_,i)=>'function p'+i+'():i32{return 1;}').join('\n');
const pad=n=>'function pad(x:i32):i32{let v=x;'+'v=v+1;'.repeat(n)+'return v;}';
const wordCount=s=>raw(base,s).image.length/4;
const step=wordCount(pad(1))-wordCount(pad(0));
let padded;
for(let n=0;n<step;n++) {
    const pre=prefix(n), remaining=1023-wordCount(pre+pad(0));
    if(remaining%step===0){padded=pre+pad(remaining/step);break;}
}
assert(padded);
const wide='record R{constructor:i32; __proto__:i32;}\n'+padded+'\n'+
    'function __proto__(x:i32):i32{if(x<9)return host131(x);return pad(x);}\n'+
    'function constructor(x:i32):i32{return __proto__(x)+host0(x);}\n'+
    Array.from({length:137},(_,i)=>'function fn'+i+'(x:i32):i32{return '+(i?'fn'+(i-1):'constructor')+'(x)+host131(x);}').join('\n');
const ref=raw(base,wide); assert.equal(ref.entries.__proto__/4,1023);
const saved=[];
for(const opts of [undefined,{streamFunctions:false},{streamFunctions:true}]) {
    const result=raw(c,wide,imports,opts);assertSame(result,ref);
    saved.push(result);
}
assert.equal(ref.relocations.length,139);
for(const {offset} of ref.relocations) assert.equal(new DataView(ref.image.buffer).getUint32(offset,true),0);

const outs={};
let lastBaselineImageBytes;
const baselineCompile=base.typedRv32.compile;
base.typedRv32.compile=function(...args){
    const p=baselineCompile(...args);lastBaselineImageBytes=p.image.length;return p;
};
const realApps=[
    ['Files','files',['files.typed'],'compileFilesRv32','files-reactor.elf'],
    ['Agenda','agenda',['reminder.typed','entry.typed'],'compileAgendaRv32','agenda-reactor.elf'],
    ['Editor','editor',source('picocalc-os/worlds/editor/source.list').trim().split(/\s+/),'compileTypedWorldRv32','typed-world-reactor.elf'],
];
for(const [name,dir,parts,fn,reactor] of realApps) {
    const src=parts.map(p=>source('picocalc-os/worlds/'+dir+'/'+p)+'\n').join('');
    const original=readFileSync(join(reactorDir,reactor));
    const surround=Buffer.alloc(original.length+29,0xa7);original.copy(surround,13);
    const input=surround.subarray(13,13+original.length);const before=hash(surround);
    const want=base[fn](src,input);
    const paths=[];
    for(const selector of ['compile','compileForSlot']){
        if(!c.typedRv32[selector]) continue;
        const original=c.typedRv32[selector];c.typedRv32[selector]=function(...args){paths.push(selector);return original(...args);};
    }
    // Count raw byte buffers separately from the Uint32Array slabs receiving emitted words.
    const allocations=[],slabs=[];
    c.noteBytes=(kind,length)=>allocations.push([kind,length]);
    c.noteWords=length=>slabs.push(length);
    vm.runInContext(`globalThis.SavedBytes=Uint8Array;
        globalThis.SavedWords=Uint32Array;
        globalThis.Uint8Array=new Proxy(SavedBytes,{construct(target,args){
            const a=Reflect.construct(target,args);noteBytes(typeof args[0],a.byteLength);return a;}});
        globalThis.Uint32Array=new Proxy(SavedWords,{construct(target,args){
            const a=Reflect.construct(target,args);noteWords(a.byteLength);return a;}});`,c);
    const actual=c[fn](src,input);
    vm.runInContext('globalThis.Uint8Array=SavedBytes;globalThis.Uint32Array=SavedWords',c);
    assert.deepEqual(Buffer.from(actual),Buffer.from(want));assert.equal(hash(surround),before);
    assert.equal(actual.length,input.length);
    assert.deepEqual(paths,[mode==='direct'?'compileForSlot':'compile']);
    const again=c[fn](src,input,{streamFunctions:false});assert.deepEqual(Buffer.from(again),Buffer.from(want));
    assert.notEqual(again.buffer,actual.buffer);
    const rawOutputs=allocations.filter(([kind])=>kind==='number').map(a=>a[1]);
    assert.deepEqual(rawOutputs,mode==='compact'?[lastBaselineImageBytes]:[]);
    assert.equal(slabs.length,Math.ceil(lastBaselineImageBytes/4096));
    assert(slabs.every(bytes=>bytes===4096));
    outs[name]={sourceSHA256:hash(src),reactorSHA256:hash(input),linkedSHA256:hash(actual),elfBytes:actual.length,
        imageBytes:lastBaselineImageBytes,slabs:slabs.length,unusedSlabBytes:slabs.length*4096-lastBaselineImageBytes,
        rawOutputs,objectArgumentByteArrayConstructions:allocations.filter(([kind])=>kind==='object').length,
        selected:paths[0]};
}

const world='record WorldEvent {kind:i32;ask:bool;token:i32;ok:bool;} record WorldState{x:i32;}\n'+
    'function typedWorldMeta(i:i32,b:buffer):i32{return typedSdkRelease(i);}\n'+
    'function typedWorldEvent(e:WorldEvent,s:WorldState,a:buffer,b:buffer):i32{return typedSdkReply(a,s.x);}';
const names=['typedWorldMeta','typedWorldEvent'];
const importCount=28;
function reactor(capacity) {
    const slot=84;
    const b=Buffer.alloc(slot+capacity+32,0x00);b.writeUInt32LE(0x464c457f);b[4]=1;b[5]=1;
    b.writeUInt16LE(3,16);b.writeUInt16LE(243,18);b.writeUInt32LE(52,28);b.writeUInt32LE(2,36);
    b.writeUInt16LE(32,42);b.writeUInt16LE(1,44);
    b.writeUInt32LE(1,52);b.writeUInt32LE(slot,56);b.writeUInt32LE(capacity,68);b.writeUInt32LE(1,76);
    [0x4147454e,0x44415256,0x3332534c,capacity,names.length+65536*importCount].forEach((v,i)=>b.writeUInt32LE(v,slot+4*i));
    for(let i=0;i<names.length;i++) b.writeUInt32LE(0x00100073,slot+20+4*i);
    for(let i=0;i<importCount;i++) b.writeUInt32LE(0x6f,slot+20+4*names.length+4*i);
    b.fill(0xb5,slot+capacity);
    return b;
}
let worldBytes;
const compileBase=base.typedRv32.compile;
base.typedRv32.compile=function(...args){const p=compileBase(...args);worldBytes=p.image.length;return p;};
base.compileTypedWorldRv32(world,reactor(4096));
const fit=20+4*(names.length+importCount)+worldBytes;
const fits=reactor(fit);
const complete=c.compileTypedWorldRv32(world,fits);
assert.deepEqual(Buffer.from(complete),Buffer.from(base.compileTypedWorldRv32(world,fits)));
const short=reactor(fit-4);
const checkErr=(name,fun,pat)=>{
    const candidate=error(()=>fun(c)),expected=error(()=>fun(base));
    assert.match(expected,pat);assert.equal(candidate,expected,name);return expected;
};
const diagnostics={};
const nine='function nine('+Array.from({length:9},(_,i)=>'a'+i+':i32').join(',')+'):i32{return 0;}';
const late='function wrong():i32{return false;}';
const literal='b.writeLiteral(0,"'+'漢'.repeat(1022)+'");';
const far='function far(x:i32,b:buffer):i32{if(x<0){'+literal.repeat(65)+'}return 0;}';
for(const [name,src,pat] of [
    ['farOnly',far,/jump exceeds/],
    ['farBeforeABI',far+nine,/eight register/],
    ['ABIBeforeFar',nine+far,/eight register/],
    ['parseAfterFarAndABI',far+nine+late,/expected i32, got bool/],
    ['parseAfterABIAndFar',nine+far+late,/expected i32, got bool/],
]) diagnostics[name]=checkErr(name,r=>raw(r,src,[]),pat);
for(const [name,src,elf,pat] of [
    ['shortSlot',world,short,/does not fit/],
    ['lateGrammar',world+late,short,/expected i32, got bool/],
    ['badSignature',world.replace('typedWorldEvent','otherEvent'),short,/requires typedWorldEvent/],
    ['badLayout','function f():i32{return 1;}',Buffer.alloc(0),/requires the shared WorldEvent/],
    ['smallRuntime',world,Buffer.alloc(0),/expected an ELF32/],
]) diagnostics[name]=checkErr(name,r=>r.compileTypedWorldRv32(src,elf),pat);
const invalidStub=Buffer.from(fits);invalidStub.writeUInt32LE(0,84+20+4*names.length+4*27);
diagnostics.invalidFinalImport=checkErr('invalidFinalImport',r=>r.compileTypedWorldRv32(world,invalidStub),/invalid RV32 runtime import trampoline/);
assertSame(raw(c,wide),ref);
for(const previous of saved) assertSame(previous,ref);
console.log(JSON.stringify({mode,revision,files,apps:outs,wide:{startWord:ref.entries.__proto__/4,wordBoundary:1024,
    inputSHA256:hash(wide),imageBytes:ref.image.length,imageSHA256:hash(ref.image),functions:ref.signatures.length,
    imports:imports.length,relocations:ref.relocations.length},fit:{capacity:fit,imageBytes:worldBytes,linkedSHA256:hash(complete)},
    farSourceCodeUnits:far.length,diagnostics},null,2));
