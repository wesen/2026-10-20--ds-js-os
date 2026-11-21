import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {createContext,runInContext} from "node:vm";
const [baseline, receipt] = process.argv.slice(2);
assert(baseline && receipt, "usage: node 01-baseline.mjs BASELINE_COMPILER_DIRECTORY RECEIPT_JSON");
const sha = value => createHash("sha256").update(value).digest("hex");
function load(dir) {
    const ctx = createContext({});
    for (const name of ["typed-wasm.js", "typed-async.js", "typed-rv32.js"])
        runInContext(readFileSync(join(dir,name),"utf8"),ctx,{filename:name});
    return ctx;
}
const stock = load(baseline);
const current = load("picocalc-os/compiler");
const path = name => readFileSync("picocalc-os/worlds/"+name,"utf8");
const asyncSource = `
record WorldState { marker: i32; }
async function work(state: WorldState, value: i32): i32 { return value + 1; }
function entry(state: WorldState): i32 { start work(state, 1); return 0; }
function original(n: i32): i32 { return n + 1; }
`;
const scenes = [
    ["ray",path("raytrace/raytrace.typed"),"typedRayInShadow"],
    ["painter",path("chess/painter-3d.typed"),"paintChess"],
    ["files",path("files/files.typed"),"filesCompare"],
    ["materials",["builders","materials","hand"].map(n=>path("candela/"+n+".typed")).join("\n"),"candelaShadeRow"],
    ["async",asyncSource,"entry"],
];
const report = {baselineRevision:"abc02eb", corpora:{}};
for (const [name, source, fn] of scenes) {
    const rows = report.corpora[name] = {sourceSHA256:sha(source)};
    for (const target of ["wasm","rv32"]) {
        const events = [];
        const inspect = {function:fn, emit(event) { events.push(event); }};
        const compile = (ctx, options) => target === "wasm" ?
            ctx.typedWasm.compile(source,options).bytes : ctx.typedRv32.compile(source,[],undefined,options).image;
        const base = sha(compile(stock));
        const ordinary = compile(current);
        const observed = compile(current,{inspect});
        assert.equal(sha(ordinary),base);
        assert.equal(sha(observed),base);
        const fronts = events.filter(e=>e.kind==="frontend");
        assert.equal(fronts.length,1);
        const front = fronts[0];
        assert.equal(front.function,fn);
        rows[target] = {bytes:ordinary.length, sha256:base, namedLocals:front.locals.length,
            operations:front.operations.length, sourceUnit:front.operations[0].source.unit};
        if (target === "wasm") {
            assert(WebAssembly.validate(observed));
            const emitted = events.find(e=>e.kind==="emission");
            assert(emitted);
            for (const [i, op] of front.operations.entries()) {
                const range = emitted.ranges[i];
                assert.equal(range.ordinal,op.ordinal);
                assert.equal(range.start,emitted.instructionsStart+op.offset);
                assert.deepEqual(Array.from(observed.subarray(range.start,range.end)),Array.from(range.bytes));
            }
            rows[target].offsetRange=[emitted.instructionsStart,emitted.end];
        }
    }
}

const bad = [
    "function f(x: i32): i32 { const k: bool = x; return 1; }",
    "function f(): i32 { return absent(4); }",
    asyncSource.replace("return value + 1;", "const no: bool = value; return 0;"),
];
function diagnostic(run) {
    try { run(); } catch (error) { return [error.name,error.message]; }
    assert.fail("expected rejection");
}
report.diagnostics=[];
for (const source of bad) {
    const baselineWasm = diagnostic(()=>stock.typedWasm.compile(source));
    const baselineRV32 = diagnostic(()=>stock.typedRv32.compile(source));
    const observed = {inspect:{emit(){}}};
    assert.deepEqual(diagnostic(()=>current.typedWasm.compile(source,observed)),baselineWasm);
    assert.deepEqual(diagnostic(()=>current.typedRv32.compile(source,[],undefined,observed)),baselineRV32);
    report.diagnostics.push({wasm:baselineWasm,rv32:baselineRV32});
}
writeFileSync(receipt,JSON.stringify(report,null,2)+"\n");
