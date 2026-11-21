import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync, readdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {runInThisContext} from "node:vm";

const dir = dirname(fileURLToPath(import.meta.url));
const [output] = process.argv.slice(2);
assert(output && process.argv.length === 3, "run from the repository root with a JSON output path");
for (const name of ["typed-wasm", "typed-rv32"]) {
    runInThisContext(readFileSync("picocalc-os/compiler/" + name + ".js", "utf8"), {filename:name});
}
const source = readFileSync(resolve(dir, "burst.typed"), "utf8");
const inputs = JSON.parse(readFileSync(resolve(dir,"manifest-input.json"),"utf8")).inputs;
const wasm = typedWasm.compile(source);
const native = typedRv32.compile(source);
const guest = new WebAssembly.Instance(new WebAssembly.Module(wasm.bytes)).exports;
const day = "ttmp/2026/11/19";
const branch = readdirSync(day).find(f => f.startsWith("PICOCALC-RV32-BRANCH--"));
const {runRv32} = await import(pathToFileURL(resolve(day,branch,"scripts/07-rv32.mjs")));
const textAt=16, calAt=256, destAt=288, capacity=48;
const digest = data => createHash("sha256").update(data).digest("hex");
const batch = [];
const checks = {};
function run(name, args, input, expectedBytes, expectedResult, expectedTrap=false) {
    const guestBytes = new Uint8Array(guest.memory.buffer,0,input.length);
    guestBytes.set(input);
    let value, trap=false;
    try {value = guest[name](...args);}
    catch (e) {if (!(e instanceof WebAssembly.RuntimeError)) throw e; trap=true;}
    const rv = runRv32(native,name,args,[],{},input);
    assert.equal(trap,expectedTrap,name+" Wasm trap");
    assert.equal(rv.trap,expectedTrap,name+" RV32 trap");
    assert.equal(rv.result,expectedResult,name+" RV32 return");
    assert.equal(value,expectedResult,name+" Wasm return");
    assert.deepEqual(guestBytes,expectedBytes,name+" Wasm memory");
    assert.deepEqual(rv.bytes,expectedBytes,name+" RV32 memory");
    batch.push([name,args,rv.result??null,rv.trap,rv.steps,digest(rv.bytes)]);
    checks[name]=(checks[name]??0)+1;
}
function checksumRange(s,start,stop) {
    if(start<0 || stop>s.length || stop<start) return -1;
    const fields=s.slice(start,stop).split(";");
    if(fields.some(field=>!/^[0-9]*$/.test(field)))return -2;
    return fields.filter(x=>x.length).reduce((sum,field)=>{
        let value=0;
        for(const digit of field)value=(10*value+Number(digit))%4093;
        return (13*sum+3*value+7)%4093;
    },0);
}
for(const text of inputs) {
    assert(4+2*text.length+textAt<calAt);
    const input = new Uint8Array(448).fill(0xaa);
    const data = new DataView(input.buffer);
    data.setInt32(textAt,text.length,true);
    for(let i=0;i<text.length;i++)data.setUint16(textAt+4+2*i,text.charCodeAt(i),true);
    for(const [i,value] of [7,3,11].entries())data.setInt32(calAt+i*4,value,true);
    data.setInt32(destAt,capacity,true);
    const boundaries=[...new Set([-1,0,1,3,text.length-1,text.length,text.length+1])];
    for(const start of boundaries) {
        const inRange=start>=0 && start<text.length;
        run("uncheckedRequest",[textAt,start],input,input,inRange?text.charCodeAt(start):undefined,!inRange);
        for(const stop of boundaries) {
            run("inspect",[textAt,start,stop],input,input,start>=0 && start<stop && stop<=text.length?text.charCodeAt(start):-1);
            const count=start<0 || stop>text.length?-1:(start>=stop?0:text.slice(start,stop).split(";").length-1);
            run("countEvents",[textAt,start,stop],input,input,count);
            run("readBurst",[textAt,calAt,start,stop],input,input,checksumRange(text,start,stop));
        }
    }
    for(const [n,label] of ["No events in this window","One event in this window","Two or more events in this window"].entries()) {
        for(const offset of [-1,0,1,capacity-label.length,capacity-label.length+1]) {
            const trap=offset<0 || offset+label.length>capacity;
            const expected=input.slice(), v=new DataView(expected.buffer);
            if(!trap) for(let i=0;i<label.length;i++)v.setUint16(destAt+4+2*(offset+i),label.charCodeAt(i),true);
            run("label",[destAt,offset,n],input,expected,trap?undefined:label.length,trap);
        }
    }
}
const summary={sourceSHA256:digest(source),rv32SHA256:digest(native.image),imageBytes:native.image.length,
    wasmBytes:wasm.bytes.length,functions:Object.keys(native.entries).length,checks,total:batch.length,
    traps:batch.filter(r=>r[3]).length,rv32Steps:batch.reduce((sum,r)=>sum+r[4],0),
    orderedDigest:digest(JSON.stringify(batch))};
writeFileSync(output, JSON.stringify(summary,null,2)+"\n");
console.log(summary);
