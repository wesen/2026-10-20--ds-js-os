import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import "../compiler/typed-wasm.js";
import "../compiler/typed-rv32.js";
import "../compiler/typed-pie-loops.js";

const source = readFileSync(new URL("../worlds/raytrace/raytrace.typed",import.meta.url),"utf8");
function observe(text, name, pieLoops, streamFunctions=true) {
    const events=[];
    const options={pieLoops, streamFunctions, inspect:{function:name,emit:event=>events.push(event)}};
    const program=typedRv32.compile(text,[],undefined,options);
    const fn=events.find(e=>e.kind==="emission");
    let position=fn.start;
    for(const r of fn.ranges){assert.equal(position,r.start);position=r.end;}
    assert.equal(position,fn.end);
    return {program,fn};
}

test("optional loop lowering follows operations and records both machine copies",()=>{
    const name="typedRayComputeRow";
    const a=observe(source,name,"pie"),b=observe(source,name,"scalar",false);
    const selected=a.fn.loops.filter(loop=>loop.lanes);
    assert.equal(selected.length,1);
    assert.equal(selected[0].stores.length,2);
    assert(a.fn.ranges.some(r=>r.segment==="scalar hit continuation"));
    assert.equal(a.fn.ranges.at(-1).role,"epilogue");
    assert.deepEqual(a.fn.loops,b.fn.loops);
    const renamed=source.replaceAll(name,"computeOther").replaceAll("discriminant","margin");
    assert.deepEqual(observe(renamed,"computeOther","pie",false).program.image,a.program.image);
    assert.deepEqual(typedRv32.compile(source,[],undefined,{pieLoops:"pie"}).image,a.program.image);
    assert.notDeepEqual(a.program.image,b.program.image);
    assert.throws(()=>typedRv32.compile(source,[],undefined,{pieLoops:"other"}),/mode/);
});

test("unproved loop effects retain ordinary code and report a reason",()=>{
    const source=`function pick(data:buffer, n:i32):i32 {
        let amount = 0;
        for(let i=0; i<n; i=i+1) {
            let d=300-data.charCodeAt(i);
            if(d>=0) { data.setCharCodeAt(d,i); }
        }
        return amount;
    }`;
    const {program,fn}=observe(source,"pick","pie");
    assert.match(fn.loops[0].reason,/store address/);
    assert.deepEqual(program.image,typedRv32.compile(source).image);
});
