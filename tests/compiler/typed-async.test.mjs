// Typed async: tasks lowered into static continuation frames in WorldState (compiler/typed/async/). The fixtures are
// PICOCALC-CONTINUATION-G's (scripts/14-check-async-layout.mjs): a world with four tasks, nested awaits, a cancelled
// task and a busy start, run on WebAssembly against a miniature reactor; the frame layouts; and the diagnostics, whose
// messages and source positions both targets must report exactly.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import "../../compiler/typed/tape.js";
import "../../compiler/typed/typed-wasm.js";
import "../../compiler/typed/typed-async.js";
import "../../compiler/typed/typed-rv32.js";
import "../../compiler/typed/typed-rv32-inline.js";
import "../../compiler/typed/typed-rv32-loops.js";
import "../../compiler/typed/typed-world.js";

const {entries, imports} = typedWorld;
const eventRecord = "record WorldEvent { kind: i32; ask: bool; token: i32; ok: bool; }";
const stateRecord = "record WorldState { docLength: i32; normalized: i32; nested: i32; other: i32; evaluated: i32; }";
const handlerSignature = "function typedWorldEvent(event: WorldEvent, state: WorldState, output: buffer, hints: buffer): i32";
const handlerMeta = "function typedWorldMeta(field: i32, output: buffer): i32 { return 0; }";
const preamble = eventRecord + "\n" + stateRecord + "\n";
const asyncOpen = `
async function openFile(handle: i32, state: WorldState): i32 {
    const ok = await typedSdkFileRead(handle);
    if (!ok) return 0;
    const length = state.docLength;
    let read = 0;
    let written = 0;
    while (read < length) {
        const text = typedSdkBuffer(0);
        const stop = Math.min(length, read + 4096);
        while (read < stop) {
            let unit = text.charCodeAt(read);
            read = read + 1;
            if (unit === 13) {
                if (read < length && text.charCodeAt(read) === 10) { read = read + 1; }
                unit = 10;
            }
            text.setCharCodeAt(written, unit);
            written = written + 1;
        }
        await typedSdkYield();
    }
    state.normalized = written;
    return 1;
}
`;
const professorOpen = `
async function openFile(handle: i32, state: WorldState): i32 {
    const ok = await typedSdkFileRead(handle);
    if (!ok) return 0;
    const length = state.sourceLength;
    let read = 0;
    let written = 0;
    while (read < length) {
        const text = typedSdkBuffer(0);
        const stop = Math.min(length, read + 4096);
        while (read < stop) { text.setCharCodeAt(written, text.charCodeAt(read)); read = read + 1; written = written + 1; }
        await typedSdkYield();
    }
    state.textLength = written;
    return 1;
}
`.trimStart();
const professorRecord = "record WorldState { sourceLength: i32; textLength: i32; }\n";
const professorStart = "\nfunction begin(state: WorldState): i32 { start openFile(17, state); return 0; }";
const source = preamble + `
enum Phase { Ready = -8, Complete = 11 }
type Unit = distinct i32;
` + asyncOpen + `
async function readHelper(state: WorldState, event: WorldEvent, a: i32): Phase {
    if (a === 0) return Phase.Ready;
    const first = await typedSdkYield();
    const second = await typedSdkYield();
    state.nested = state.nested + a + event.kind;
    if (first && second) return Phase.Complete;
    return Phase.Ready;
}

async function nested(state: WorldState, event: WorldEvent, n: i32): i32 {
    const before = await readHelper(state, event, 0);
    let phase = before;
    let total: Unit = 0;
    for (let k = 0; k < n; k = k + 1) {
        if (k === 1) { break; }
        phase = await readHelper(state, event, 15);
        match (phase) {
            Complete: { total = total + 10; await typedSdkYield(); }
            Ready: { await typedSdkYield(); }
        }
    }
    state.nested = state.nested + i32(phase) + i32(total);
    return 0;
}

async function other(state: WorldState, event: WorldEvent, output: buffer): i32 {
    const done = await readHelper(state, event, 1);
    if (done === Phase.Complete) {
        output.setCharCodeAt(0, 79);
        state.other = state.other + 1;
    }
    return 0;
}

` + handlerMeta + "\n" + handlerSignature + ` {
    if (event.kind === 0) {
        if (start openFile(nextHandle(state), state)) return 101;
        return 102;
    }
    if (event.kind === 1) {
        if (start nested(state, event, 3)) return 101;
        return 102;
    }
    if (event.kind === 2) {
        if (start other(state, event, output)) return 101;
        return 102;
    }
    if (event.kind === 3) {
        cancel nested;
        return 103;
    }
    if (resume()) return 104;
    if (checkPending(state)) return 105;
    return 106;
}
function checkPending(state: WorldState): bool { return pending(); }
function nextHandle(state: WorldState): i32 {
    state.evaluated = state.evaluated + 1;
    return 17;
}
`;

function uleb(n) {
    const parts = [];
    do {
        parts.push((n & 127) | (n >= 128 ? 128 : 0));
        n >>>= 7;
    } while (n);
    return parts;
}

const vec = fields => [...uleb(fields.length), ...fields.flat()];
const string = value => [...uleb(value.length), ...Array.from(value, ch => ch.charCodeAt(0))];
const section = (id, fields) => [id, ...uleb(fields.length), ...fields];

// A Wasm reactor with the world's entry slots and SDK exports; each SDK export calls the matching "mock" import.
const worldEntries = entries.map(name => ({name, params: Array(name === "typedWorldMeta" ? 2 : 4)}));
function wasmReactor() {
    const descriptors = [...imports, ...worldEntries];
    const types = vec(descriptors.map(fn => [0x60, fn.params.length, ...Array(fn.params.length).fill(0x7f), 1, 0x7f]));
    const external = vec(imports.map((fn, i) => [...string("mock"), ...string(fn.name), 0, ...uleb(i)]));
    const definitions = vec(descriptors.map((_, i) => uleb(i)));
    const exports = vec([[...string("memory"), 2, 0],
        ...descriptors.map((fn, i) => [...string(fn.name), 0, ...uleb(imports.length + i)])]);
    const bodies = vec(descriptors.map((fn, i) => {
        const code = i < imports.length
            ? [...Array.from({length: fn.params.length}, (_, n) => [0x20, n]).flat(), 0x10, ...uleb(i)] : [0x41, 0];
        const body = [0, ...code, 0x0b];
        return [...uleb(body.length), ...body];
    }));
    return new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, ...section(1, types), ...section(2, external),
        ...section(3, definitions), ...section(5, [1, 1, 1, 1]), ...section(7, exports), ...section(10, bodies)]);
}

const addresses = {event: 32, state: 128, output: 640, hints: 768, text: 1024};
const mixed = ("a\r\nb\rc\n".repeat(1429)).slice(0, 10000);

function harness() {
    let next = 1, reject;
    const trace = [];
    const request = (name, handle) => {
        const token = reject ?? next++;
        reject = undefined;
        trace.push({name, handle, token});
        return token;
    };
    const handlers = Object.fromEntries(imports.map(fn => [fn.name, () => assert.fail("unexpected SDK call " + fn.name)]));
    Object.assign(handlers, {
        typedSdkFileRead: handle => request("read", handle),
        typedSdkYield: () => request("yield", 0),
        typedSdkBuffer: slot => { assert.equal(slot, 0); return addresses.text; },
    });
    const linked = compileTypedWorld(source, wasmReactor(), {asyncSource: true});
    const {exports} = new WebAssembly.Instance(new WebAssembly.Module(linked), {mock: handlers});
    const view = () => new DataView(exports.memory.buffer);
    const word = (at, value) => view().setInt32(at, value, true);
    word(addresses.state, mixed.length);
    word(addresses.output, 16);
    word(addresses.hints, 16);
    word(addresses.text, mixed.length);
    for (let i = 0; i < mixed.length; i++) view().setUint16(addresses.text + 4 + i * 2, mixed.charCodeAt(i), true);
    const recordLength = 4 * linked.asyncLayout.totalFields;
    return {
        trace, layout: linked.asyncLayout, lowered: linked.asyncSource,
        failStart(token) { reject = token; },
        event(kind, token = 0, ok = true, output = addresses.output) {
            [kind, 0, token, Number(ok)].forEach((value, i) => word(addresses.event + 4 * i, value));
            return exports.typedWorldEvent(addresses.event, addresses.state, output, addresses.hints);
        },
        record: () => new Uint8Array(exports.memory.buffer, addresses.state, recordLength).slice(),
        scalar: offset => view().getInt32(addresses.state + offset, true),
        unit: at => view().getUint16(at, true),
        text: length => Array.from({length}, (_, i) =>
            String.fromCharCode(view().getUint16(addresses.text + 4 + i * 2, true))).join(""),
    };
}

test("tasks run, suspend, resume and cancel on WebAssembly", () => {
    const h = harness();
    const check = (want, ...args) => assert.equal(h.event(...args), want, "handler result " + JSON.stringify(args));
    check(101, 0);
    check(102, 0);
    assert.equal(h.scalar(16), 1, "a busy start skips effectful arguments");
    const waiting = h.record();
    for (const [kind, token] of [[4, 99], [5, 1], [4, 0]]) {
        check(105, kind, token);
        assert.deepEqual(h.record(), waiting);
    }
    for (const token of [1, 2, 3, 4]) check(104, 4, token);
    const expected = mixed.replace(/\r\n|\r/g, "\n");
    assert.equal(h.scalar(4), expected.length);
    assert.equal(h.text(expected.length), expected);
    assert.deepEqual(h.trace, [
        {name: "read", handle: 17, token: 1}, {name: "yield", handle: 0, token: 2},
        {name: "yield", handle: 0, token: 3}, {name: "yield", handle: 0, token: 4},
    ]);
    check(106, 4, 4);
    h.failStart(-5);
    check(101, 0);
    check(106, 4, 5);
    assert.equal(h.scalar(16), 2);
    h.failStart(0);
    check(101, 0);
    check(106, 4, 5);
    assert.equal(h.scalar(16), 3);

    check(101, 1);
    check(101, 2);
    check(102, 1);
    check(104, 4, 6);
    check(104, 4, 7, true, addresses.hints);
    assert.equal(h.unit(addresses.hints + 4), 79);
    assert.equal(h.unit(addresses.output + 4), 0);
    assert.equal(h.scalar(12), 1);
    check(104, 4, 5);
    check(104, 4, 8);
    check(104, 4, 9);
    assert.equal(h.scalar(8), 45);
    check(101, 1);
    check(103, 3);
    const cancelled = h.record();
    check(106, 4, 10);
    assert.deepEqual(h.record(), cancelled);
    check(101, 1);
    check(104, 4, 11, false);
    check(104, 4, 12);
    check(104, 4, 13, false);
    assert.equal(h.scalar(8), 56);

    assert.match(h.lowered, /for|while/);
    const {openFile, nested, other} = h.layout.tasks;
    assert.deepEqual(openFile[0].waits.map(wait => wait.saved), [[], ["length", "read", "written"]]);
    assert.equal(openFile[0].fields.length, 5);
    const nestedHelper = nested.find(frame => frame.function === "readHelper");
    const otherHelper = other.find(frame => frame.function === "readHelper");
    assert(nestedHelper.fields.some(name => name.endsWith("_caller")));
    assert(!otherHelper.fields.some(name => name.endsWith("_caller")));
    assert.notEqual(nestedHelper.fields[0], otherHelper.fields[0]);
});

test("both targets lower the world to the same layout", () => {
    const wasm = compileTypedWorld(source, wasmReactor()).asyncLayout;
    assert.deepEqual(typedRv32.compile(source, imports).asyncLayout, wasm);
    assert.deepEqual(typedAsync.analyze(source, imports), wasm);
    assert.equal(wasm.declaredFields, 5);
    assert.equal(wasm.totalFields, 27);
});

test("liveness saves only the scalars live across each wait", () => {
    const [frame] = typedAsync.analyze(professorRecord + professorOpen + professorStart, imports).tasks.openFile;
    assert.deepEqual(frame.waits.map(wait => wait.saved), [[], ["length", "read", "written"]]);
    assert.equal(frame.fields.length, 5);
    const overlap = typedAsync.analyze(preamble + `
async function overlap(state: WorldState, limit: i32, pre: i32): i32 {
    let ix = 0;
    let total = pre;
    while (ix < limit) {
        if (ix === 0) {
            const before = ix;
            state.normalized = before;
            await typedSdkYield();
        }
        await typedSdkYield();
        total = total + 1;
        ix = ix + 1;
    }
    state.normalized = total;
    return 0;
}
` + handlerMeta + "\n" + handlerSignature + " { start overlap(state, 2, 1); return 0; }", imports).tasks.overlap[0];
    assert.deepEqual(overlap.waits.map(wait => wait.saved), [["limit", "ix", "total"], ["limit", "ix", "total"]]);
    assert.equal(overlap.fields.length, 5);
});

test("Editor's Open and Find tasks take 13 of WorldState's 70 fields", () => {
    const editor = new URL("../../apps/typed/editor/", import.meta.url);
    const app = JSON.parse(readFileSync(new URL("app.json", editor), "utf8"));
    const program = app.sources.map(name => readFileSync(new URL(name, editor), "utf8") + "\n").join("");
    const layout = typedRv32.compile(program, imports, 96 * 1024).asyncLayout;
    assert.equal(layout.declaredFields, 57);
    assert.equal(layout.totalFields, 70);
    assert.deepEqual(Object.keys(layout.tasks), ["editorFindTask", "editorOpenTask"]);
    assert.deepEqual(compileTypedWorld(program, wasmReactor()).asyncLayout, layout);
});

// Each diagnostic with its exact position; both targets compile through the same front end and must agree.
const world = body => preamble + body + "\n" + handlerMeta + "\n" + handlerSignature;
const task = body => world(body) + " { start work(state); return 0; }";
const plain = body => world(body) + " { return 0; }";
const borrowed = asyncOpen.replace("    while (read < length) {\n        const text = typedSdkBuffer(0);",
    "    const text = typedSdkBuffer(0);\n    while (read < length) {");
const diagnostics = [
    [plain(borrowed), "23:9: text is live across the wait at line 23; obtain it again after the wait"],
    [task("async function work(state: WorldState): i32 { return 1 + await typedSdkYield(); }"), "3:58: await is only allowed as a complete statement or assignment"],
    [plain("function bad(state: WorldState): i32 { await typedSdkYield(); return 0; }"), "3:40: await is only allowed in an async function"],
    [plain("async function work(handle: i32): i32 { await typedSdkYield(); return handle; }"), "3:1: async function requires a WorldState parameter"],
    [plain("async function work(state: WorldState, text: buffer): i32 { return text.length; }"), "3:40: async reference parameter text is not an ambient handler parameter"],
    [task("async function work(state: WorldState): i32 { return helper(state); }\nasync function helper(state: WorldState): i32 { return 0; }"), "3:54: call async function helper with start or await"],
    [task("async function work(state: WorldState): i32 { await helper(state); return 0; }\nasync function helper(state: WorldState): i32 { await work(state); return 0; }"), "recursive call cycle: work -> helper -> work"],
    [task("async function work(state: WorldState): i32 { const ok: i32 = await typedSdkYield(); return ok; }"), "3:63: expected i32, got bool"],
    [task(`async function work(state: WorldState): i32 { return bridge(state); }
function bridge(state: WorldState): i32 { return bounce(state); }
function bounce(state: WorldState): i32 { start work(state); return 0; }`), "recursive call cycle: work -> bridge -> bounce -> work"],
    [task("async function work(state: WorldState): i32 { await typedSdkRelease(5); return 0; }"), "3:47: expected an async function or awaitable reactor function, got typedSdkRelease"],
    [task("async function work(state: WorldState): i32 { const ok = false; ok = await typedSdkYield(); return 0; }"), "3:65: expected mutable local ok"],
    [task("async function work(state: WorldState): i32 { const value = typedSdkView(typedSdkBuffer(0), 1); await typedSdkYield(); return value.length; }"), "3:97: value is live across the wait at line 3; obtain it again after the wait"],
    [plain("function bad(state: WorldState): bool { return resume(); }"), "3:48: resume is only allowed in typedWorldEvent"],
    [professorRecord + professorOpen.replace('    while (read < length) {\n        const text = typedSdkBuffer(0);',
        '    const text = typedSdkBuffer(0);\n    while (read < length) {') + professorStart, "12:9: text is live across the wait at line 12; obtain it again after the wait"],
    [source.replace(stateRecord, stateRecord.replace("}", Array.from({length: 80}, (_, i) => "field" + i + ": i32;").join(" ") + " }")),
        "WorldState supports up to 80 scalar fields"],
    // Errors in ordinary and generated code after the lowering: the position is in the source the author wrote.
    [`record WorldState { value: i32; }
async function work(state: WorldState): i32 { return 0; }
function begin(state: WorldState): i32 { start work(state); return 0; }
function invalid(state: WorldState): i32 {
    if (pending()) return state.missing;
    return 0;
}
`, "5:40: unknown field WorldState.missing"],
    [`record WorldState { value: i32; }
async function work(state: WorldState): i32 { await typedSdkYield(); return 0; }
function begin(state: WorldState): i32 { cancel work; start work(state); return state.missing + 1; }
`, "3:95: unknown field WorldState.missing"],
    [eventRecord + `
record WorldState { value: i32; }
async function work(state: WorldState): i32 { await typedSdkYield(); return 0; }
function begin(state: WorldState): i32 { start work(state); return 0; }
function typedWorldEvent(event: WorldEvent, state: WorldState, output: buffer, hints: buffer): i32 {
    if (resume()) { return pending(); }
    return 0;
}
`, "6:37: expected i32, got bool"],
];

function message(compile) {
    try { compile(); } catch (error) { return error.message; }
    return "compiled";
}

test("diagnostics keep their messages and source positions on both targets", () => {
    const seen = diagnostics.map(([program]) => {
        const wasm = message(() => typedWasm.compileFunctions(program, 0, imports, 96 * 1024));
        const rv32 = message(() => typedRv32.compile(program, imports, 96 * 1024));
        assert.equal(rv32, wasm);
        return wasm;
    });
    if (process.env.TYPED_ASYNC_PRINT) console.log(JSON.stringify(seen, null, 1));
    else assert.deepEqual(seen, diagnostics.map(([, expected]) => expected));
});

test("typed-async.js is the build of compiler/typed/async/", async () => {
    const {bundle} = await import(new URL("../../compiler/typed/async/build.mjs", import.meta.url));
    assert(readFileSync(new URL("../../compiler/typed/typed-async.js", import.meta.url), "utf8") === bundle(),
        "edit compiler/typed/async/, never typed-async.js, then run node compiler/typed/async/build.mjs");
});

test("a lowered program compiles alone on WebAssembly", () => {
    const standalone = compileTyped(stateRecord + `
async function complete(state: WorldState): bool { state.normalized = 5; return true; }
function begin(state: WorldState): bool { return start complete(state); }
`, {asyncSource: true});
    assert(standalone.asyncLayout.tasks.complete);
    assert.match(standalone.asyncSource, /complete_step/);
    const {exports} = new WebAssembly.Instance(new WebAssembly.Module(standalone));
    assert.equal(exports.begin(128), 1);
    assert.equal(new DataView(exports.memory.buffer).getInt32(132, true), 5);
});
