import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {createContext, runInContext} from "node:vm";

const [work, wasmPath, elfPath] = process.argv.slice(2);
assert(work && wasmPath && elfPath, "usage: node 15-check-span-reuse.mjs WORK WASM_REACTOR ELF_REACTOR");
const nativeIndex = globalThis.__typedLexIndex;
assert.equal(typeof nativeIndex, "function", "load the native index test provider before this file");
const modes = ["stock", "headers", "spans", "indexed", "indexed-prepass", "indexed-spans", "composed"];
const lanes = new Map(modes.map(mode => {
    const realm = createContext((mode.startsWith("indexed") || mode === "composed") ? {__typedLexIndex: nativeIndex} : {});
    for (const name of ["typed-wasm", "typed-async", "typed-rv32", "typed-world"])
        runInContext(readFileSync(join(work, mode, name + ".js"), "utf8"), realm, {filename: mode + "/" + name});
    return [mode, realm];
}));

const wasm = readFileSync(wasmPath), elf = readFileSync(elfPath);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const plain = value => JSON.parse(JSON.stringify(value));
const editor = readFileSync(join(work, "stock", "editor.typed"), "utf8");
const preamble = `
record WorldEvent { kind: i32; ask: bool; token: i32; ok: bool; }
enum Phase { Warm = -2, Hot }
type Unit = distinct i32;
record WorldState { x: i32; phase: Phase; count: Unit; }
function typedWorldMeta(field: i32, output: buffer): i32 { return 0; }
`;
const handler = "function typedWorldEvent(event: WorldEvent, state: WorldState, output: buffer, hints: buffer): i32";
const wrapper = handler + ` {
    if (event.kind === 0) { start work(state, trigger(state)); return 1; }
    if (event.kind === 2) { cancel work; return 2; }
    if (resume()) return 3;
    if (pending()) return 4;
    return 0;
}
`;
const asyncBody = `
async function work(state: WorldState, value: i32): i32 {
    let i: Unit = 0;
    while (i < state.count) {
        const ok = await typedSdkYield();
        if (!ok) { break; }
        state.x = step(state, value);
        i = i + 1;
    }
    match (state.phase) {
        Warm: { await typedSdkYield(); }
        Hot: { }
    }
    return state.x;
}
`;
const support = `
function trigger(state: WorldState): i32 {
    state.x = state.x + 1;
    return state.x;
}
function step(state: WorldState, x: i32): i32 {
    const start = x;
    return finish(start); // await, cancel work, pending() are trivia here
}
function finish(x: i32): i32 { return x + 1; }
`;
const fixture = preamble + wrapper + asyncBody + support;
const simple = preamble + handler + " { return 0; }";
const commented = preamble + `function comment(output: buffer): i32 {
    output.writeLiteral(0, "start work(state) and resume() and { await }");
    // cancel work; inspect await
    return 0;
}
` + handler + " { return comment(output); }";
const long = fixture + "\n" + " ".repeat(1300);
const positives = [editor, fixture, simple, commented, long, fixture.replace("state.x + 1", "state.x + 9")];

function linked(realm, source, includeSource) {
    const w = realm.compileTypedWorld(source, wasm, {asyncSource: includeSource});
    const n = realm.compileTypedWorldRv32(source, elf, {asyncSource: includeSource});
    const b = realm.compileTypedWorldRv32(source, elf, {asyncSource: includeSource, streamFunctions: false});
    const raw = realm.typedRv32.compile(source, realm.typedWorld.imports, 96 * 1024, {asyncSource: includeSource});
    return {
        wasm: Buffer.from(w), native: Buffer.from(n), buffered: Buffer.from(b), raw: Buffer.from(raw.image),
        source: w.asyncSource, nativeSource: n.asyncSource, layout: plain(w.asyncLayout ?? null),
        records: plain(raw.records), signatures: plain(raw.signatures), entries: plain(raw.entries),
        relocations: plain(raw.relocations),
    };
}

function graph(realm, source) {
    const imports = realm.typedWorld.imports.map((fn, index) => ({...fn, index}));
    const result = realm.typedWasm.compileFunctions(source, imports.length, imports, 96 * 1024,
        false, undefined, undefined, {asyncSource: true});
    return plain(result.functions.map(({name, index, bodyAt}, i) =>
        ({name, index, bodyAt, edges: result.edges[i], order: result.order.indexOf(i)})));
}

const stock = lanes.get("stock");
for (const [i, source] of positives.entries()) {
    const reference = linked(stock, source, true);
    assert(WebAssembly.validate(reference.wasm));
    const expectedGraph = i === 0 ? null : graph(stock, source);
    for (const [mode, realm] of lanes) {
        assert.deepEqual(linked(realm, source, true), reference, mode + " positive " + i);
        if (expectedGraph) assert.deepEqual(graph(realm, source), expectedGraph, mode + " graph " + i);
    }
}

const span = lanes.get("spans");
const spanRewrite = span.typedAsync.rewrite;
span.typedAsync.rewrite = (...args) => {
    const lowered = spanRewrite(...args);
    if (lowered) Object.defineProperty(lowered, "source", {get() { throw Error("eager full source"); }});
    return lowered;
};
assert.deepEqual(linked(span, fixture, false), linked(stock, fixture, false));
span.typedAsync.rewrite = spanRewrite;

const negatives = [
    fixture.replace("return finish(start);", "return missing(start);"),
    fixture.replace("start work(state, trigger(state))", "start work(state, true)"),
    fixture.replace("function trigger(state: WorldState)", "function step(state: WorldState)"),
    fixture.replace("const start = x;", "const x = 0;"),
    fixture.replace("state.x = step(state, value);", "state.x = step(state, 1 + await typedSdkYield());"),
    fixture.replace("return finish(start);", "await typedSdkYield(); return finish(start);"),
    fixture.replace("return finish(start);", "async; return finish(start);"),
    fixture.replace("return finish(start);", "return work(state, start);"),
    fixture.replace("return finish(start);", "return 1work(state, start);"),
    fixture.replace("return finish(start); // await, cancel work, pending() are trivia here", "return 1work(state, start);"),
    fixture.replace("return finish(start);", "return state.work(state, start);"),
    fixture.replace("return finish(start);", "return state. // lookup after dot\n work(state, start);"),
    fixture.replace("return finish(start);", "return 1start work(state, 0);"),
    fixture.replace("return finish(start);", "return finish(1); // fn will be cyclic"),
    fixture.replace("return finish(start);", "return finish /* ordinary operators */ (start);"),
    fixture.replace("return finish(start);", "return finish(start);").replace("return x + 1;", "return step(0, x);"),
    fixture.replace("return x + 1;", "return work(0, x);"),
    fixture.replace("return x + 1;", "return resume(x);"),
    fixture.replace("return x + 1;", "return pending(x);"),
    fixture.replace("return x + 1;", "return cancel work;"),
    fixture.replace("return x + 1;", "cancel absent; return 0;"),
    fixture.replace("return x + 1;", "start absent(); return 0;"),
    fixture.replace("return x + 1;", "start work; return 0;"),
    fixture.replace("return x + 1;", "return x + @;"),
    fixture.replace("return x + 1;", 'return x + "\\uZZZZ";'),
    fixture.replace("return x + 1;", "return x + \u00a0;"),
    fixture.replace("return x + 1;", "return x + }"),
    fixture.replace("return x + 1; }", "return x + 1; // split terminal scope"),
    fixture.replace("record WorldState", "record Phase"),
    fixture.replace("type Unit = distinct i32;", "type typedSdkYield = distinct i32; type Unit = distinct i32;"),
    "start work(state);\n" + fixture,
    fixture + "\nawait typedSdkYield();\n",
    fixture + "\n/* await */\n",
    preamble + `function broken(): i32 { @ }\nfunction broken():i32 { return 1; }\n` + wrapper + asyncBody + support,
    preamble + `function bridge(state:WorldState):i32 { return bounce(state); }
async function work(state:WorldState,v:i32):i32 { return bridge(state); }
function bounce(state:WorldState):i32 { start work(state,0); return 0; }
` + wrapper + support,
];
function errors(realm, source) {
    return [
        () => realm.compileTypedWorld(source, wasm),
        () => realm.compileTypedWorldRv32(source, elf),
        () => realm.compileTypedWorldRv32(source, elf, {streamFunctions: false}),
    ].map(compile => {
        try {
            compile();
            return ["ok"];
        } catch (error) {
            return [error.name, error.message];
        }
    });
}
let rejected = 0;
for (const [i, source] of negatives.entries()) {
    const expected = errors(stock, source);
    if (expected[0][0] !== "ok") rejected++;
    for (const [mode, realm] of lanes) {
        const actual = errors(realm, source);
        assert.deepEqual(actual, expected, mode + " negative " + i);
    }
}
assert.equal(rejected, negatives.length - 1);

const combined = lanes.get("composed");
const indexedSources = [];
combined.__typedLexIndex = source => {
    indexedSources.push(source);
    return nativeIndex(source);
};
const planned = combined.compileTypedWorldRv32(editor, elf, {asyncSource: true});
assert.equal(indexedSources.filter(source => source === editor).length, 1);
assert(!indexedSources.includes(planned.asyncSource), "lazy full source was indexed as a side effect");
const segmentLengths = indexedSources.filter(source => source !== editor).map(source => source.length);
assert(segmentLengths.reduce((total, n) => total + n, 0) < planned.asyncSource.length);
combined.__typedLexIndex = nativeIndex;

const out = linked(combined, editor, true);
console.log(JSON.stringify({lanes: modes, positives: positives.length, negativeCases: negatives.length, segmentLengths,
    rejected, graphCases: positives.length - 1, completeSourceLazy: true,
    wasm: sha(out.wasm), elf: sha(out.native), raw: sha(out.raw), fields: out.layout.totalFields}));
