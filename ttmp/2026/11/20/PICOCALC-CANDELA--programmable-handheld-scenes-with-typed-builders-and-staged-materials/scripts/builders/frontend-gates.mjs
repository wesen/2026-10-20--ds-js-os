import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext,runInContext} from "node:vm";
const [qjs,scene,reactor,out] = process.argv.slice(2);
assert(out, "usage: node frontend-gates.mjs INDEX-QJS ASSEMBLED-FLUENT-SCENE TYPED-WORLD-REACTOR.wasm RECEIPT.json");
const here = dirname(fileURLToPath(import.meta.url));
const files = ["typed-wasm","typed-async","typed-rv32","typed-world"].map(n=>"picocalc-os/compiler/"+n+".js");
const sha=x=>createHash("sha256").update(x).digest("hex");
const compiler = version => {
    const ctx = createContext({});
    for (const file of files) runInContext(version ? execFileSync("git",["show",version+":"+file],{encoding:"utf8"})
        : readFileSync(file,"utf8"),ctx,{filename:file});
    return ctx;
};
const base=compiler("c065dc2"), now=compiler();
const same=(a,b)=>{assert.equal(sha(a),sha(b));return {bytes:a.length,sha256:sha(a)};};
const wasmReactor = readFileSync(reactor);
const receipt={baseline:"c065dc2",ordinaryWorlds:{}};
for (const name of ["editor","chess"]) {
    const dir=join("picocalc-os/worlds",name);
    const source=readFileSync(join(dir,"source.list"),"utf8").trim().split(/\s+/).map(f=>readFileSync(join(dir,f),"utf8")).join("\n");
    const native = ctx=>ctx.typedRv32.compile(source,ctx.typedWorld.imports,96*1024).image;
    receipt.ordinaryWorlds[name]={sourceSHA256:sha(source),rv32:same(native(base),native(now)),
        linkedWasm:same(base.compileTypedWorld(source,wasmReactor),now.compileTypedWorld(source,wasmReactor))};
}
const longLiteral = 'out.writeLiteral(0,"' + "a".repeat(1022) + '")';
const largeFor = 'function f(out: buffer): i32 { let n = 0; for (n = 0; false; n = ' +
    Array(30).fill(longLiteral).join(" + ") + ') {} return n; }';
receipt.historicalLargeUpdate = same(base.typedRv32.compile(largeFor).image,now.typedRv32.compile(largeFor).image);
const poses={};
for (const mode of ["REFERENCE","INDEX"]) {
    const result=JSON.parse(execFileSync(resolve(qjs),[mode,...files,join(here,"indexed-qjs.js"),"--",resolve(scene)],
        {encoding:"utf8",maxBuffer:4*1024*1024}));
    poses[mode]={wasm:Uint8Array.from(result.wasm),rv32:Uint8Array.from(result.rv32)};
}
receipt.quickJS={sourceSHA256:sha(readFileSync(scene)),wasm:same(poses.INDEX.wasm,poses.REFERENCE.wasm),
    rv32:same(poses.INDEX.rv32,poses.REFERENCE.rv32)};
const asyncPreamble=`
record WorldState { value:i32; }
record WorldEvent { kind:i32; ask:bool; token:i32; ok:bool; }
record Pair { x:i32; y:i32; }
type H=distinct i32;
namespace ns { make=make; bounce=bounce; }
methods H { fold(Pair)=fold; }
`;
const asyncTail=`
function make(v:i32):H{return H(v);}
function fold(h:H,x:i32,y:i32):H{return H(i32(h)+x+y);}
function typedWorldMeta(f:i32,out:buffer):i32{return 0;}
function typedWorldEvent(event:WorldEvent,state:WorldState,output:buffer,hints:buffer):i32{
    start work(state); return 0;
}`;
const make=body=>asyncPreamble+body+asyncTail;
const asyncBody=make(`
async function work(state:WorldState):i32 {
    const x=3; await typedSdkYield();
    const h=ns.make(x).fold({y:x,x:4});
    state.value=i32(h); return state.value;
}
function bounce(state:WorldState):i32{return 3;}
`);
const goodWasm=now.compileTypedWorld(asyncBody,wasmReactor);
assert(WebAssembly.validate(goodWasm));
const asyncRV=now.typedRv32.compile(asyncBody,now.typedWorld.imports,96*1024);
receipt.async={linkedWasm:sha(goodWasm),rv32:sha(asyncRV.image)};
const cycle=make("async function work(state:WorldState):i32{return ns.bounce(state);}" +
                 "function bounce(state:WorldState):i32{start work(state);return 0;}");
assert.throws(()=>now.compileTypedWorld(cycle,wasmReactor),/recursive call cycle/);
assert.throws(()=>now.typedRv32.compile(cycle,now.typedWorld.imports,96*1024),/recursive call cycle/);
receipt.async.recursiveAliasRejected=true;
const aliases = "type H=distinct i32; record P{x:i32;y:bool;} namespace shape{make=make;} methods H{apply(P)=apply;} ";
const funcs = "function make(x:i32):H{return H(x);} function apply(h:H,x:i32,y:bool):H{return h;}";
const examples = [
    [aliases.replace("make=make","make=missing")+funcs,/unknown target missing/],
    [aliases.replace("apply(P)=apply","apply(P)=make")+funcs,/target must take H/],
    [aliases+funcs.replace("y:bool","y:i32"),/wrong target type for option y/],
    [aliases.replace("make=make;","make=make;make=make;")+funcs,/duplicate member shape.make/],
    [aliases+funcs+"function f(shape:i32):H{return shape.make(1);}",/unknown member i32.make/],
    [aliases+funcs+"function f(h:H):H{return h.apply({x:1});}",/missing option P.y/],
    ["type H=distinct i32; methods H{f=loop;} function loop(h:H):H{return h.f();}",/recursive call cycle/],
];
for (const [source,regex] of examples) {
    assert.throws(()=>now.typedWasm.compile(source),regex);
    assert.throws(()=>now.typedRv32.compile(source),regex);
}
receipt.declarationAndScopeFailures = examples.length;
writeFileSync(out,JSON.stringify(receipt,null,2)+"\n");
console.log("QuickJS native index and regex agree; Editor/Chess match baseline on both targets; async aliases compiled and cycle rejected");
