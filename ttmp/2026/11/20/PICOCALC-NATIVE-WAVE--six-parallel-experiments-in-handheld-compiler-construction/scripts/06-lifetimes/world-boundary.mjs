// Qualification is limited to complete Typed worlds with scalar WorldState.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {context} from "./stage.mjs";

const [reactor]=process.argv.slice(2);
assert(reactor,"usage: node world-boundary.mjs NATIVE_WORLD_REACTOR_ELF");
const source=`
record WorldEvent {kind:i32; ask:bool; token:i32; ok:bool;}
record WorldState {sum:i32; stash:buffer;}
async function task(state:WorldState, chunk:buffer):i32 {
  const n=chunk.charCodeAt(0);
  state.stash=typedSdkBuffer(0);
  await typedSdkYield(); state.sum=n; return n;
}
function typedWorldMeta(query:i32,output:buffer):i32 {return 0;}
function typedWorldEvent(event:WorldEvent,state:WorldState,output:buffer,hints:buffer):i32 {
 if(resume()) {return state.sum;}
 if(start task(state,typedSdkBuffer(0))) {return 1;}
 return 0;
}`;
const vm=context("inferred");
const raw=vm.typedRv32.compile(source,vm.typedWorld.imports);
let message;
assert.throws(()=>vm.compileTypedWorldRv32(source,readFileSync(reactor)),error=>{
    message=error.message;
    return /WorldState supports up to 80 scalar fields/.test(message);
});
console.log(JSON.stringify({rawAccepted:true,rawBytes:raw.image.length,completeWorldAccepted:false,diagnostic:message},null,2));
