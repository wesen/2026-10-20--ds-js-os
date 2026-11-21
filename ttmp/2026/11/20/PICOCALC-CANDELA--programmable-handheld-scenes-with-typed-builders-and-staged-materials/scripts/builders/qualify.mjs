// From the repository root: node .../qualify.mjs OUT.json [production world source directory]
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext, runInContext} from "node:vm";
import {runRv32} from "../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs";

const [output, worldDir = "picocalc-os/worlds/candela"] = process.argv.slice(2);
assert(output, "usage: node qualify.mjs OUT.json [world source directory]");
const read = file => readFileSync(file, "utf8");
const shape = "picocalc-os/worlds/candela";
const sha = x => createHash("sha256").update(x).digest("hex");
const ctx = createContext({});
for (const name of ["typed-wasm.js","typed-rv32.js","typed-async.js"])
    runInContext(read(join("picocalc-os/compiler", name)), ctx, {filename:name});
const lib = ["builders.typed","materials.typed","hand.typed"].map(n => read(join(worldDir,n))).join("\n");
const types = read(join(shape,"fluent-types.typed"));
const fluent = read(join(shape,"fluent.typed"));
const direct = read(join(dirname(fileURLToPath(import.meta.url)), "expanded.typed"));
const defs = fluent.slice(0,fluent.indexOf("function candelaFluentShared("));
function compile(source) {
    const wasm = ctx.typedWasm.compile(source).bytes;
    const rv = ctx.typedRv32.compile(source);
    const buffered = ctx.typedRv32.compile(source, [], undefined, {streamFunctions:false});
    assert.deepEqual(buffered.image, rv.image);
    return {wasm, rv, guest: new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports};
}
const sugar = compile([types,lib,fluent].join("\n"));
const expanded = compile([types,lib,defs,direct].join("\n"));
assert.deepEqual(sugar.wasm, expanded.wasm);
assert.deepEqual(sugar.rv.image, expanded.rv.image);
const graph = 32, work = 800, count = 303;
function fresh(capacity = count) {
    const bytes = new Uint8Array(1400).fill(0xab), d = new DataView(bytes.buffer);
    d.setUint32(graph, capacity, true); d.setUint32(work, 192, true);
    return bytes;
}
function machine(compiled, target, bytes) {
    if (target === "wasm") {
        const memory = new Uint8Array(compiled.guest.memory.buffer, 0, bytes.length);
        memory.set(bytes);
        return {call:(name,...args) => compiled.guest[name](...args), bytes:() => memory.slice()};
    }
    let memory = bytes.slice();
    return {call:(name,...args) => {
        const run = runRv32(compiled.rv, name, args, [], {}, memory);
        assert.equal(run.trap, false, name);
        memory = run.bytes;
        return run.result;
    }, bytes:() => memory.slice()};
}
const report = {compilerSHA256: sha(read("picocalc-os/compiler/typed-wasm.js")),
    sources: Object.fromEntries(["builders.typed","materials.typed","hand.typed"].map(n => [n,sha(read(join(worldDir,n)))])),
    wasm: {bytes:sugar.wasm.length,sha256:sha(sugar.wasm)}, rv32: {bytes:sugar.rv.image.length,sha256:sha(sugar.rv.image)},
    orderedLiteralMatchesDirectImages:true, modes:[]};
const rgb = n => [n >>> 16, (n >>> 8) & 255, n & 255];
let referenceMemory = null, referenceRows = null;
for (const [variant,p,entry] of [["hand",sugar,"candelaHandShared"],["fluent",sugar,"candelaFluentShared"],
                                ["expanded",expanded,"candelaFluentShared"]]) for (const target of ["wasm","rv32"]) {
    for (const capacity of [0,302]) {
        const seed = fresh(capacity), bad = machine(p, target, seed);
        assert.equal(bad.call(entry, graph), 0);
        assert.deepEqual(bad.bytes(), seed, "short storage remains untouched");
    }
    const m = machine(p,target,fresh());
    assert.equal(m.call(entry,graph),1);
    const bytes = m.bytes();
    if (referenceMemory) assert.deepEqual(bytes, referenceMemory);
    else referenceMemory = bytes;
    const words = new DataView(bytes.buffer,bytes.byteOffset+graph+4,count*2);
    const cell = i => words.getUint16(i*2,true);
    assert.deepEqual(Array.from({length:8},(_,i)=>cell(i)),[0x4341,1,7,3,2,1,2,0]);
    const left = cell(284), right = cell(289), floor = cell(6);
    assert.notEqual(left,right);
    const leftNode = cell(264+left), rightNode = cell(264+right);
    assert.equal(cell(8+4*rightNode),3);
    assert.equal(cell(8+4*rightNode+1),leftNode,"derived material shares the original color expression");
    const rows = [];
    for (const q of [0,128,256]) {
        assert.equal(m.call("candelaSetParam",graph,0,q),1);
        const altered = m.bytes().slice(graph+4,graph+4+2*count);
        const original = bytes.slice(graph+4,graph+4+2*count);
        original[590] = q & 255; original[591] = q >>> 8;
        assert.deepEqual(altered,original);
        const color = (mat,x,y) => rgb(m.call("candelaColorAt",graph,work,mat,x,y));
        const row = {q,left:color(left,68,61),right:color(right,100,65),floor:[color(floor,11,0),color(floor,12,0)]};
        assert.deepEqual(row.left,[30,70,150]);
        assert.deepEqual(row.right,[30,70,150].map((c,i)=>Math.floor(((256-q)*c+q*[220,170,40][i])/256)));
        assert.deepEqual(row.floor,[[48,61,72],[72,93,109]]);
        rows.push(row);
    }
    if (referenceRows) assert.deepEqual(rows,referenceRows);
    else referenceRows=rows;
    report.modes.push({variant,target,graphSHA256:sha(bytes.slice(graph+4,graph+4+2*count)),checks:12});
}
report.samples = referenceRows;
const probe = `
type Handle = distinct i32;
record Pair { x: i32; y: i32; }
namespace builder { newHandle = newHandle; }
methods Handle { place(Pair) = place; }
function newHandle(n:i32):Handle {return Handle(n);}
function place(h:Handle,x:i32,y:i32):Handle{return Handle(i32(h)*100+x*10+y);}
function mark(b:buffer,v:i32):i32{b.setCharCodeAt(0,b.charCodeAt(0)*10+v);return v;}
function order(b:buffer):i32 {return i32(builder.newHandle(mark(b,1)).place({y:mark(b,2),x:mark(b,3)}));}
function stmt(b:buffer):i32 {
    const h = builder.newHandle(2);
    h.place({x:mark(b,4),y:mark(b,5)});
    builder.newHandle(mark(b,6)).place({x:0,y:0});
    newHandle(mark(b,7)).place({x:0,y:0});
    return b.charCodeAt(0);
}
function readPair(p:Pair):i32{return i32(builder.newHandle(1).place(p));}
`;
const probeModule = compile(probe);
for (const target of ["wasm","rv32"]) {
    const seed = fresh(); const d = new DataView(seed.buffer);
    d.setUint16(graph+4,0,true); d.setInt32(8,3,true); d.setInt32(12,4,true);
    const ordered = machine(probeModule,target,seed);
    assert.equal(ordered.call("order",graph),132);
    assert.equal(new DataView(ordered.bytes().buffer).getUint16(graph+4,true),123);
    assert.equal(machine(probeModule,target,seed).call("stmt",graph),4567);
    assert.equal(machine(probeModule,target,seed).call("readPair",8),134);
}
report.effects = {recordedOrder:123,nestedResult:132,discardedStatementEffects:4567,existingRecordResult:134};
writeFileSync(resolve(output),JSON.stringify(report,null,2)+"\n");
console.log("6 executed scene variants; 2 evaluation-order probes; exact Wasm, RV32 and buffered RV32 image equality");
