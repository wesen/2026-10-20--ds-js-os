/* Distinguish a synchronous error, a fresh resumption buffer and a canceled stale completion. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const lane=process.argv[2], ctx=vm.createContext({});
for(const s of ['async','wasm']) vm.runInContext(readFileSync(join(lane,'typed',s+'.js'),'utf8'),ctx);
const source=`record WorldEvent {kind:i32;ask:bool;token:i32;ok:bool;}
record WorldState {done:i32;}
function typedSdkFileRead(handle:i32):i32 {return handle;}
async function sample(event:WorldEvent,state:WorldState,output:buffer,hints:buffer,handle:i32):i32 {
    const value:i32 = 7;
    const ok = await typedSdkFileRead(handle);
    if (!ok) return -5;
    output.setCharCodeAt(0,value);
    state.done = state.done + 1;
    return 13;
}`;
const lowered=ctx.typedAsync.lower(source);
const program=ctx.typedWasm.compile(lowered.source);
const {instance:{exports:e}}=await WebAssembly.instantiate(program.bytes);
const m=new DataView(e.memory.buffer);
const E=32,S=96,B=224,C=288;
m.setUint32(B,2,true); m.setUint32(C,2,true);
const check=(expected,actual)=>{assert.equal(actual,expected);return actual;};
function resume(token,kind=4) {
  m.setInt32(E,kind,true);m.setInt32(E+8,token,true);m.setInt32(E+12,1,true);
  return e.sampleResume(E,S,C,0);
}
const returns={};
returns.synchronousFailure=check(-5,e.sampleStart(E,S,B,0,0));
returns.start=check(1,e.sampleStart(E,S,B,0,21));
returns.wrongToken=check(0,resume(22));
returns.wrongKind=check(0,resume(21,3));
returns.pending=check(1,e.samplePending(S));
returns.cancel=check(21,e.sampleCancel(S));
returns.late=check(0,resume(21));
returns.reopen=check(1,e.sampleStart(E,S,B,0,22));
returns.stale=check(0,resume(21));
returns.success=check(13,resume(22));
returns.duplicate=check(0,resume(22));
assert.equal(m.getInt32(S,true),1);
assert.equal(m.getUint16(B+4,true),0);
assert.equal(m.getUint16(C+4,true),7);
const real=readFileSync(join(lane,'world.typed'),'utf8');
const realLowered=ctx.typedAsync.lower(real);
assert.equal(realLowered.source,readFileSync(join(lane,'lowered.typed'),'utf8'));
const body='const ok = await typedSdkFileRead(handle);';
assert(real.includes(body));
const invalid=real.replace(body,body+'\n    const held:i32 = scratch.length;');
let rejection;
try {ctx.typedAsync.lower(invalid);} catch(e){rejection=e.message;}
assert.match(rejection,/reference scratch is live across await/);
const [, , , nativePath,wasmPath,oraclePath]=process.argv;
const oracle=JSON.parse(readFileSync(oraclePath,'utf8')).oracle.await;
for(const s of ['rv32','world']) vm.runInContext(readFileSync(join(lane,'typed',s+'.js'),'utf8'),ctx);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const linked={native:digest(ctx.compileTypedWorldRv32(real,readFileSync(nativePath))),
  wasm:digest(ctx.compileTypedWorld(real,readFileSync(wasmPath)))};
assert.equal(linked.native,oracle.nativeSha256);
assert.equal(linked.wasm,oracle.wasmSha256);
console.log(JSON.stringify({returns,linked,smallFrame:lowered.layout,editorFrame:realLowered.layout,
  originalOutput:m.getUint16(B+4,true),resumeOutput:m.getUint16(C+4,true),rejection},null,2));
