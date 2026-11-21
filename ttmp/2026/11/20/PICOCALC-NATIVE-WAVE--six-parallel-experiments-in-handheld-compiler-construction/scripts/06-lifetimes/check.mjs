import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {context,root} from "./stage.mjs";

const here=dirname(fileURLToPath(import.meta.url));
const day=resolve(here,"../../..");
const pie=readdirSync(day).find(n=>n.startsWith("PICOCALC-TYPED-PIE--"));
const {runRv32}=await import(resolve(day,pie,"scripts/review/run-rv32.mjs"));
const [heldout,output]=process.argv.slice(2);
assert(heldout && output);
mkdirSync(output,{recursive:true});
const reveal=JSON.parse(readFileSync(heldout,"utf8"));
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const builtins=[
    {name:"typedSdkBuffer",params:["i32"],result:"buffer"},
    {name:"typedSdkYield",params:[],result:"i32",awaitable:true},
    {name:"opaqueKeep",params:["buffer"],result:"i32"},
];
const imports=builtins;
const prelude="record WorldEvent {kind:i32; ask:bool; token:i32; ok:bool;}\nrecord WorldState {sum:i32;}\n";
const tail=`
function typedWorldEvent(event:WorldEvent,state:WorldState,output:buffer,hints:buffer):i32 {
    if (resume()) { return state.sum; }
    if (start task(state,typedSdkBuffer(0))) { return 1; }
    return state.sum;
}`;
const simply=(body,helpers="")=>prelude+helpers+`
async function task(state:WorldState,chunk:buffer):i32 {
${body}
}
`+tail;
const yieldThen="const paused=await typedSdkYield();\n";
const helper="function read(b:buffer):i32 {return b.charCodeAt(0);}\n";
const yes=(name,source,expected=7,extra=[])=>({name,source,accepted:true,expected,declarations:["task.chunk",...extra]});
const no=(name,source,reason)=>({name,source,accepted:false,reason,declarations:["task.chunk"]});
const development=[
    yes("scalar across wait",simply("const n=chunk.charCodeAt(0);\n"+yieldThen+"state.sum=n; return n;")),
    yes("direct returned alias consumed within turn",simply("const alias=id(chunk); const n=read(alias);\n"+yieldThen+"state.sum=n; return n;",
        "function id(x:buffer):buffer {return x;}\n"+helper)),
    {...yes("direct scalar field store after reference read",simply("let b=chunk;\n"+yieldThen+
        "b=typedSdkBuffer(0); state.sum=b.charCodeAt(0); return state.sum;"),99),
        allowedGap:/unproved retained store/},
    yes("overwrite kills old reference then copies scalar",simply("let b=chunk;\n"+yieldThen+
        "b=typedSdkBuffer(0); const value=b.charCodeAt(0); state.sum=value; return value;"),99),
    yes("nested async prefix",simply(`const n=await child(state,chunk); state.sum=n; return n;`,
        `async function child(state:WorldState,local:buffer):i32 {
        const n=local.charCodeAt(0); await typedSdkYield(); return n;
        }\n`),7,["child.local"]),
    no("alias across wait",simply("const b=chunk;\n"+yieldThen+"return b.charCodeAt(0);"),/live across the wait/),
    no("escape through transitive helper",simply("return outer(chunk);",
        "function inner(b:buffer):i32 {return opaqueKeep(b);}\nfunction outer(b:buffer):i32 {return inner(b);}\n"),/unproved reference import/),
    no("loop-carried buffer remains live",simply(`let b=chunk; let i=0;
        while (i<1) { b=typedSdkBuffer(0); i=i+1; }
        await typedSdkYield(); return b.charCodeAt(0);`),/live across the wait/),
    no("only one branch kills the old reference",simply(`let b=chunk;
        if (state.sum>0) {b=typedSdkBuffer(0);}
        await typedSdkYield(); return b.charCodeAt(0);`),/live across the wait/),
    no("opaque reference sink",simply("opaqueKeep(chunk);\n"+yieldThen+"return 0;"),/unproved reference import/),
];

const waves = {
    "parse then yield": yes("parse then yield",simply("const n=chunk.charCodeAt(0); await typedSdkYield(); state.sum=n; return n;")),
    "resume through alias": no("resume through alias",simply("const q=chunk; const ignored=chunk.charCodeAt(0); await typedSdkYield(); return q.charCodeAt(0);"),/live across the wait/),
    "borrow helper": yes("borrow helper",simply("const n=read(chunk); state.sum=n; return n;",helper)),
    "escaping helper": no("escaping helper",simply("return stash(chunk);",
        "function stash(b:buffer):i32 {return opaqueKeep(b);}"),/unproved reference import/),
    "dead alternate arm": yes("dead alternate arm",simply(`const durable=7;
        if (state.sum>0) {const p=chunk; return p.charCodeAt(0);}
        await typedSdkYield(); state.sum=durable; return durable;`)),
};
const unsupported="The shared grammar has no persistent buffer value type; substituting a fresh ambient buffer would change the scenario.";
const held=reveal.cases.map(row=> {
    const translated=waves[row.name];
    if (!translated) return {name:row.name,accepted:row.accept,outsideLanguage:unsupported};
    assert.equal(translated.accepted,row.accept);
    return translated;
});

const editor=readFileSync(resolve(root,"picocalc-os/worlds/editor/editor.typed"),"utf8");
const start=editor.indexOf("        while (read < stop) {",editor.indexOf("async function editorOpenTask"));
const finish=editor.indexOf("\n    }\n    return editorOpened",start);
assert(start>=0 && finish>start);
const inner=editor.slice(start,finish);
const realistic=yes("Editor CRLF normalization prefix",simply(
    "const text=chunk; let read=0; let written=0; const length=4; const stop=length;\n"+inner+
    "\nawait typedSdkYield(); state.sum=written; return written;"),3);
realistic.scratch=[65,13,10,66];

function runProgram(program,fixture) {
    const event=0,state=128,output=600,hints=900,scratch=1024,replacement=2048;
    let bytes=new Uint8Array(4096);
    function initializeBuffer(address,values) {
        const view=new DataView(bytes.buffer);
        view.setUint32(address,16,true);
        values.forEach((unit,i)=>view.setUint16(address+4+2*i,unit,true));
    }
    initializeBuffer(scratch,fixture.scratch??[7]);
    initializeBuffer(replacement,[99]);
    initializeBuffer(output,[214]);
    initializeBuffer(hints,[]);
    const calls=[];
    let turn=0;
    const handlers={typedSdkBuffer:()=>{calls.push(["buffer",turn]);return turn?scratch+1024:scratch;},
        typedSdkYield:()=>{calls.push(["yield",turn]);return 73;}};
    function eventBody() {
        const outcome=runRv32(program,"typedWorldEvent",[event,state,output,hints],imports,handlers,bytes,undefined,2e6);
        assert.equal(outcome.trap,false);
        bytes=outcome.bytes;
        return outcome.result;
    }
    eventBody();
    if (fixture.scratch) {
        const view=new DataView(bytes.buffer);
        assert.deepEqual([0,1,2].map(i=>view.getUint16(scratch+4+i*2,true)),[65,10,66]);
    }
    if (calls.some(([name])=>name==="yield")) {
        // Replace stale contents and install the new completion event.
        turn=1;
        initializeBuffer(scratch,[444]);
        initializeBuffer(output,[555]);
        const view=new DataView(bytes.buffer);
        view.setInt32(event,4,true); view.setInt32(event+8,73,true); view.setInt32(event+12,1,true);
        assert.equal(eventBody(),fixture.expected);
    }
    assert.equal(new DataView(bytes.buffer).getInt32(state,true),fixture.expected);
    return {steps:calls,bytes:sha(bytes),value:fixture.expected};
}

function validate(fixture) {
    if (fixture.outsideLanguage) return fixture;
    const successes=[];
    const result={name:fixture.name,sourceSha256:sha(fixture.source),expected:fixture.accepted};
    for (const arm of ["stock","explicit","inferred"]) {
        const vm=context(arm,fixture.declarations);
        let program;
        try { program=vm.typedRv32.compile(fixture.source,imports); }
        catch(error) {
            if (arm==="stock") assert.match(error.message,/not an ambient handler parameter/);
            else {
                if (fixture.allowedGap) assert.match(error.message,fixture.allowedGap);
                else {
                    assert.equal(fixture.accepted,false,fixture.name+" "+error.message);
                    assert.match(error.message,fixture.reason);
                }
            }
            result[arm]={accepted:false,diagnostic:error.message};
            continue;
        }
        assert.notEqual(arm,"stock");
        assert.equal(fixture.accepted,true);
        for(const frames of Object.values(program.asyncLayout.tasks)) for(const frame of frames)
            assert(!frame.waits.some(wait=>wait.saved.some(name=>["chunk","local","alias","b","text"].includes(name))));
        result[arm]={accepted:true,bytes:program.image.length,imageSha256:sha(program.image),
                     slots:program.asyncLayout.totalFields-program.asyncLayout.declaredFields,
                     metrics:{...vm.turnExperiment.metrics},runtime:runProgram(program,fixture)};
        successes.push(result[arm]);
    }
    if (fixture.allowedGap) {
        assert.equal(successes.length,0);
        result.coverageGap=true;
    } else if (fixture.accepted) assert.deepEqual(successes[0],successes[1]);
    return result;
}

const checks = {development:development.map(validate), heldOut:held.map(validate), realistic:validate(realistic)};
const sourceFor = size => simply(
    "let n=0;\n" + Array.from({length:size},(_,i)=>`n=n+read${i}(chunk);\n`).join("") +
    "await typedSdkYield(); state.sum=n; return n;\n",
    Array.from({length:size},(_,i)=>`function read${i}(b:buffer):i32 {return b.charCodeAt(0);}\n`).join(""));
const ms=(fn)=>{const a=performance.now();const result=fn();return [performance.now()-a,result];};
const costs=[];
for (const helpers of [16,64,120]) {
    const source=sourceFor(helpers);
    const vms=["explicit","inferred"].map(arm=>[arm,context(arm,["task.chunk"])]);
    const runs=Object.fromEntries(vms.map(([arm])=>[arm,[]]));
    for(const [,vm] of vms) vm.typedRv32.compile(source,imports);
    for (let i=0;i<11;i++) {
        for (let a=0;a<2;a++) {
            const [arm,vm]=vms[(a+i)%2];
            const [analyzeMs]=ms(()=>vm.typedAsync.analyze(source,imports));
            const [compileMs,program]=ms(()=>vm.typedRv32.compile(source,imports));
            runs[arm].push({analyzeMs,compileMs,imageSha256:sha(program.image),metrics:vm.turnExperiment.metrics});
        }
    }
    assert.equal(new Set(Object.values(runs).flat().map(row=>row.imageSha256)).size,1);
    costs.push({helpers,runs});
}
assert.throws(()=>context("inferred").typedRv32.compile(sourceFor(129),imports),/bounded helper proof exceeded/);
const details={heldOutSha256:sha(readFileSync(heldout)),checks,costs};
writeFileSync(resolve(output,"lifetime-result.json"),JSON.stringify(details,null,2)+"\n");
console.log(JSON.stringify({dev:checks.development.length,held:checks.heldOut.length,
    outside:checks.heldOut.filter(r=>r.outsideLanguage).length,realistic:checks.realistic.inferred}));
