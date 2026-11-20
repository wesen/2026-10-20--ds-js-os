import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {join} from "node:path";
import "../../../../../../picocalc-os/compiler/typed-wasm.js";
import "../../../../../../picocalc-os/compiler/typed-async.js";
import "../../../../../../picocalc-os/compiler/typed-rv32.js";
import "../../../../../../picocalc-os/compiler/typed-world.js";
import "../../../../../../picocalc-os/worlds/files/compile.js";
import "../../../../../../picocalc-os/worlds/agenda/compile.js";

const thesis = "../../PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/scripts/lowering/rv32.mjs";
const interpreter = readFileSync(new URL(thesis, import.meta.url), "utf8");
assert(interpreter.includes("steps < 100_000"));
const {runRv32} = await import("data:text/javascript;base64," +
    Buffer.from(interpreter.replace("steps < 100_000", "steps < 1_000_000")).toString("base64"));

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

// The real linker replaces entry stubs and reuses exported SDK functions.
// This reactor supplies those same slots and routes SDK calls to test handlers.
const worldEntries = entries.map(name => ({name, params: Array(name === "typedWorldMeta" ? 2 : 4)}));
function wasmReactor(sdk = imports, entryDescriptors = worldEntries) {
    const descriptors = [...sdk, ...entryDescriptors];
    const types = vec(descriptors.map(fn => [0x60, fn.params.length, ...Array(fn.params.length).fill(0x7f), 1, 0x7f]));
    const external = vec(sdk.map((fn, i) => [...string("mock"), ...string(fn.name), 0, ...uleb(i)]));
    const definitions = vec(descriptors.map((_, i) => uleb(i)));
    const memory = [1, 1, 1, 1];
    const exports = vec([[...string("memory"), 2, 0],
        ...descriptors.map((fn, i) => [...string(fn.name), 0, ...uleb(sdk.length + i)])]);
    const bodies = vec(descriptors.map((fn, i) => {
        const code = i < sdk.length ? [...Array.from({length: fn.params.length}, (_, n) => [0x20, n]).flat(), 0x10, ...uleb(i)] : [0x41, 0];
        const body = [0, ...code, 0x0b];
        return [...uleb(body.length), ...body];
    }));
    return new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, ...section(1, types), ...section(2, external),
        ...section(3, definitions), ...section(5, memory), ...section(7, exports), ...section(10, bodies)]);
}

function rv32Reactor(sdk = imports, entryDescriptors = worldEntries) {
    const header = 84;
    const capacity = 229376;
    const bytes = new Uint8Array(header + capacity);
    const view = new DataView(bytes.buffer);
    const word = (at, value) => view.setUint32(at, value, true);
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1]);
    view.setUint16(16, 3, true);
    view.setUint16(18, 243, true);
    word(28, 52);
    word(36, 2);
    view.setUint16(42, 32, true);
    view.setUint16(44, 1, true);
    word(52, 1);
    word(56, header);
    word(68, capacity);
    word(76, 1);
    [0x4147454e, 0x44415256, 0x3332534c, capacity, entryDescriptors.length + 65536 * sdk.length]
        .forEach((value, i) => word(header + i * 4, value));
    entryDescriptors.forEach((_, i) => word(header + (5 + i) * 4, 0x00100073));
    sdk.forEach((_, i) => word(header + (5 + entryDescriptors.length + i) * 4, 0x0000006f));
    return bytes;
}

function miniatureReactor() {
    let next = 1;
    let reject;
    const trace = [];
    function request(name, handle) {
        const token = reject ?? next++;
        reject = undefined;
        trace.push({name, handle, token});
        return token;
    }
    const handlers = Object.fromEntries(imports.map(fn => [fn.name, () => {
        assert.fail("unexpected SDK call " + fn.name);
    }]));
    Object.assign(handlers, {
        typedSdkFileRead: handle => request("read", handle),
        typedSdkYield: () => request("yield", 0),
        typedSdkBuffer: slot => { assert.equal(slot, 0); return addresses.text; },
    });
    return {handlers, trace, failStart(token) { reject = token; }};
}

const addresses = {event: 32, state: 128, output: 640, hints: 768, text: 1024};
const mixed = ("a\r\nb\rc\n".repeat(1429)).slice(0, 10000);
const recordLength = 4 * typedAsync.analyze(source, imports).totalFields;

function makeHarness(engine) {
    const mock = miniatureReactor();
    let image = new Uint8Array(24576);
    let call;
    let layout;
    let lowered;
    if (engine === "wasm") {
        const linked = compileTypedWorld(source, wasmReactor(), {asyncSource: true});
        const instance = new WebAssembly.Instance(new WebAssembly.Module(linked), {mock: mock.handlers});
        [layout, lowered] = [linked.asyncLayout, linked.asyncSource];
        image = new Uint8Array(instance.exports.memory.buffer, 0, image.length);
        call = args => instance.exports.typedWorldEvent(...args);
    } else {
        const opts = {asyncSource: true, streamFunctions: engine !== "rv32 buffered"};
        const native = typedRv32.compile(source, imports, undefined, opts);
        const linked = compileTypedWorldRv32(source, rv32Reactor(), opts);
        assert.deepEqual(native.asyncLayout, linked.asyncLayout);
        [layout, lowered] = [linked.asyncLayout, linked.asyncSource];
        assert.equal(new DataView(linked.buffer).getUint32(104, true) & 127, 0x6f);
        call = args => {
            const run = runRv32(native, "typedWorldEvent", args, imports, mock.handlers, image);
            assert.equal(run.trap, false);
            image = run.bytes;
            return run.result;
        };
    }
    const view = () => new DataView(image.buffer, image.byteOffset, image.byteLength);
    function word(at, value) { view().setInt32(at, value, true); }
    function event(kind, token = 0, ok = true, output = addresses.output) {
        const at = addresses.event;
        [kind, 0, token, Number(ok)].forEach((value, i) => word(at + 4 * i, value));
        return call([at, addresses.state, output, addresses.hints]);
    }
    word(addresses.state, mixed.length);
    word(addresses.text, mixed.length);
    word(addresses.output, 16);
    word(addresses.hints, 16);
    for (let i = 0; i < mixed.length; i++) view().setUint16(addresses.text + 4 + i * 2, mixed.charCodeAt(i), true);
    return {event, mock, layout, lowered,
        record: () => image.slice(addresses.state, addresses.state + recordLength),
        scalar: offset => view().getInt32(addresses.state + offset, true),
        unit: at => view().getUint16(at, true),
        text(length) {
            return Array.from({length}, (_, i) => String.fromCharCode(view().getUint16(addresses.text + 4 + i * 2, true))).join("");
        },
    };
}

const expected = mixed.replace(/\r\n|\r/g, "\n");
for (const engine of ["wasm", "rv32", "rv32 buffered"]) {
    const h = makeHarness(engine);
    const events = [];
    const check = (want, ...args) => {
        const result = h.event(...args);
        events.push([args, result]);
        assert.equal(result, want, engine + " handler result " + JSON.stringify(args));
    };
    check(101, 0);
    check(102, 0);
    assert.equal(h.scalar(16), 1, "a busy start skips effectful arguments");
    const waiting = h.record();
    check(105, 4, 99);
    check(105, 5, 1);
    check(105, 4, 0);
    assert.deepEqual(h.record(), waiting);
    for (const token of [1, 2, 3, 4]) check(104, 4, token);
    assert.equal(h.scalar(4), expected.length);
    assert.equal(h.text(expected.length), expected);
    assert.deepEqual(h.mock.trace, [
        {name: "read", handle: 17, token: 1}, {name: "yield", handle: 0, token: 2},
        {name: "yield", handle: 0, token: 3}, {name: "yield", handle: 0, token: 4},
    ]);
    check(106, 4, 4);
    h.mock.failStart(-5);
    check(101, 0);
    check(106, 4, 5);
    assert.equal(h.mock.trace.at(-1).token, -5);
    assert.equal(h.scalar(16), 2);
    h.mock.failStart(0);
    check(101, 0);
    check(106, 4, 5);
    assert.equal(h.mock.trace.at(-1).token, 0);
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
    assert(openFile[0].fields.length === 5);
    const nestedHelper = nested.find(frame => frame.function === "readHelper");
    const otherHelper = other.find(frame => frame.function === "readHelper");
    assert(nestedHelper.fields.some(name => name.endsWith("_caller")));
    assert(!otherHelper.fields.some(name => name.endsWith("_caller")));
    assert.notEqual(nestedHelper.fields[0], otherHelper.fields[0]);
    console.log(engine + " handled " + events.length + " events and normalized " + mixed.length + " units");
}
console.log(JSON.stringify(typedAsync.analyze(preamble + asyncOpen + handlerMeta + "\n" + handlerSignature +
    " { start openFile(17, state); return 0; }", imports), null, 2));

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

function rejects(body, pattern, task = true) {
    const program = preamble + body + "\n" + handlerMeta + "\n" + handlerSignature +
        (task ? " { start work(state); return 0; }" : " { return 0; }");
    assert.throws(() => compileTypedWorld(program, wasmReactor()), pattern);
    assert.throws(() => compileTypedWorldRv32(program, rv32Reactor()), pattern);
}

rejects(asyncOpen.replace("    while (read < length) {\n        const text = typedSdkBuffer(0);",
    "    const text = typedSdkBuffer(0);\n    while (read < length) {"), /text is live across the wait at line /, false);
rejects("async function work(state: WorldState): i32 { return 1 + await typedSdkYield(); }", /await is only allowed as a complete statement/);
rejects("function bad(state: WorldState): i32 { await typedSdkYield(); return 0; }", /await is only allowed in an async function/, false);
rejects("async function work(handle: i32): i32 { await typedSdkYield(); return handle; }", /requires a WorldState parameter/, false);
rejects("async function work(state: WorldState, text: buffer): i32 { return text.length; }", /text is not an ambient handler parameter/, false);
rejects("async function work(state: WorldState): i32 { return helper(state); }\nasync function helper(state: WorldState): i32 { return 0; }", /call async function helper with start or await/);
rejects("async function work(state: WorldState): i32 { await helper(state); return 0; }\nasync function helper(state: WorldState): i32 { await work(state); return 0; }", /recursive call cycle: work -> helper -> work/);
rejects("async function work(state: WorldState): i32 { const ok: i32 = await typedSdkYield(); return ok; }", /expected i32, got bool/);
rejects(`async function work(state: WorldState): i32 { return bridge(state); }
function bridge(state: WorldState): i32 { return bounce(state); }
function bounce(state: WorldState): i32 { start work(state); return 0; }`, /recursive call cycle: work -> bridge -> bounce -> work/);
rejects("async function work(state: WorldState): i32 { await typedSdkRelease(5); return 0; }", /expected an async function or awaitable reactor function/);
rejects("async function work(state: WorldState): i32 { const ok = false; ok = await typedSdkYield(); return 0; }", /expected mutable local ok/);
rejects("async function work(state: WorldState): i32 { const value = typedSdkView(typedSdkBuffer(0), 1); await typedSdkYield(); return value.length; }", /value is live across the wait/);
rejects("function bad(state: WorldState): bool { return resume(); }", /resume is only allowed in typedWorldEvent/, false);

const tooLarge = source.replace(stateRecord, stateRecord.replace("}", Array.from({length: 80},
    (_, i) => "field" + i + ": i32;").join(" ") + " }"));
assert.throws(() => compileTypedWorld(tooLarge, wasmReactor()), /WorldState supports up to 80 scalar fields/);
assert.throws(() => compileTypedWorldRv32(tooLarge, rv32Reactor()), /WorldState supports up to 80 scalar fields/);
console.log("both targets reject invalid awaits, illegal references, cycles, and frame overflow");

const standalone = compileTyped(stateRecord + `
async function complete(state: WorldState): bool { state.normalized = 5; return true; }
function begin(state: WorldState): bool { return start complete(state); }
`, {asyncSource: true});
assert(standalone.asyncLayout.tasks.complete);
assert.match(standalone.asyncSource, /complete_step/);
const standaloneWorld = new WebAssembly.Instance(new WebAssembly.Module(standalone));
assert.equal(standaloneWorld.exports.begin(128), 1);
assert.equal(new DataView(standaloneWorld.exports.memory.buffer).getInt32(132, true), 5);

const baseline = process.argv[2];
if (baseline) checkBaseline(baseline);

function checkBaseline(directory) {
    const atBaseline = path => readFileSync(join(directory, path), "utf8");
    const context = vm.createContext({});
    for (const name of ["typed-wasm", "typed-rv32", "typed-world"]) {
        const path = "picocalc-os/compiler/" + name + ".js";
        vm.runInContext(atBaseline(path), context, {filename: path});
    }
    const prefix = "picocalc-os/worlds/";
    const editorSource = atBaseline(prefix + "editor/source.list").trim().split("\n")
        .filter(line => line && !line.startsWith("#")).map(name => atBaseline(prefix + "editor/" + name)).join("\n");
    const sync = [
        ["Files", atBaseline(prefix + "files/files.typed"), "Files", [], [
            ["filesName", 2], ["filesCompare", 4], ["filesSelect", 3], ["filesAction", 5],
        ]],
        ["Agenda", ["reminder", "entry"].map(name => atBaseline(prefix + "agenda/" + name + ".typed")).join("\n"), "Agenda", [], [
            ["parseTask", 3], ["normalizeEntry", 4], ["agendaDateKey", 2], ["entryAddDays", 2], ["entryWeekday", 1], ["agendaMark", 2],
        ]],
        ["Editor", editorSource, "TypedWorld", imports, worldEntries.map(fn => [fn.name, fn.params.length])],
    ];
    for (const world of ["files", "agenda"]) {
        const path = prefix + world + "/compile.js";
        vm.runInContext(atBaseline(path), context, {filename: path});
    }
    for (const [world, program, suffix, sdk, signatures] of sync) {
        const descriptors = signatures.map(([name, arity]) => ({name, params: Array(arity)}));
        const wasmRuntime = wasmReactor(sdk, descriptors);
        const rv32Runtime = rv32Reactor(sdk, descriptors);
        const wasmCompiler = "compile" + suffix;
        const rv32Compiler = "compile" + suffix + "Rv32";
        const wasm = globalThis[wasmCompiler](program, wasmRuntime);
        const native = globalThis[rv32Compiler](program, rv32Runtime);
        assert.equal(wasm.asyncLayout, undefined);
        assert.equal(native.asyncLayout, undefined);
        assert.deepEqual(wasm, new Uint8Array(context[wasmCompiler](program, wasmRuntime)), world + " Wasm identity");
        assert.deepEqual(native, new Uint8Array(context[rv32Compiler](program, rv32Runtime)), world + " RV32 identity");
        console.log(world + " is byte-identical to the supplied baseline on Wasm and RV32");
    }
}
