import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import "../../compiler/typed/tape.js";
import "../../compiler/typed/typed-wasm.js";
import "../../compiler/typed/typed-async.js";
import "../../compiler/typed/typed-rv32.js";
import "../../compiler/typed/typed-rv32-inline.js";
import "../../compiler/typed/typed-rv32-loops.js";
import "../../compiler/typed/typed-rv32-kernel.js";

function capture(name) {
    const events = [];
    return {events, inspect: {function: name, emit(event) { events.push(event); }}};
}

function checkRanges(bytes, front, emission) {
    assert.equal(front.function, emission.function);
    assert(emission.instructionsStart > emission.start);
    assert.equal(front.operations.length, emission.ranges.length);
    let next = emission.instructionsStart;
    for (const [i, op] of front.operations.entries()) {
        const range = emission.ranges[i];
        assert.equal(op.ordinal, i);
        assert.equal(range.ordinal, i);
        assert.equal(range.start, next);
        assert.equal(range.start, emission.instructionsStart + op.offset);
        assert.equal(range.end, range.start + op.length);
        assert.equal(bytes[range.start], op.opcode);
        assert.deepEqual(range.bytes, Array.from(bytes.subarray(range.start, range.end)));
        next = range.end;
    }
    assert.equal(next, emission.end);
}

test("Wasm inspection uses emitted operations and final module bytes", () => {
    const callers = Array.from({length: 130}, (_, i) =>
        `function padding${i}(x: i32): i32 { return x; }`).join("\n");
    const locals = Array.from({length: 128}, (_, i) => `const temp${i} = ${i};`).join("\n");
    const source = `
        enum Mode { Negative = -98765, Next }
        ${callers}
        function inspected(out: buffer, n: i32): i32 {
            ${locals}
            let sum = -98765;
            for (let i = 0; i < n; i = i + 1) { sum = sum + temp127; }
            out.writeLiteral(0, "${"A🐈".repeat(24)}");
            return final(sum);
        }
        function final(x: i32): i32 { return x + 32768; }
        function negative(): Mode { return Mode.Negative; }
    `;
    const {events, inspect} = capture("inspected");
    const original = typedWasm.compile(source);
    const result = typedWasm.compile(source, {inspect});
    assert.deepEqual(result, original);
    assert(WebAssembly.validate(result.bytes));
    assert.deepEqual(events.map(e => e.kind), ["frontend", "emission"]);
    const [front, emission] = events;
    assert.equal(front.target, "wasm");
    assert.equal(emission.target, "wasm");
    assert.equal(front.index, 130);
    checkRanges(result.bytes, front, emission);
    assert(front.operations.some(op => op.op === "call" && op.operands[0] === 131 && op.length === 3));
    assert(front.operations.some(op => op.op === "i32.const" && op.operands[0] === 98765 && op.length >= 3));
    assert(front.operations.some(op => op.op === "local.set" && op.operands[0] === 129 && op.length === 3));
    assert(front.operations.some(op => op.op === "i32.store16" && op.operands[1] === 128 && op.length === 4));
    assert.deepEqual(front.locals.slice(0, 2), [
        {index:0,name:"out",type:"buffer",mutable:false,parameter:true,source:null},
        {index:1,name:"n",type:"i32",mutable:false,parameter:true,source:null},
    ]);
    assert.equal(front.locals.find(local => local.name === "sum").mutable, true);
    const i = front.locals.find(local => local.name === "i").index;
    const loopTail = front.operations.filter(op => op.op === "local.set" && op.operands[0] === i).at(-1);
    const headerEnd = source.indexOf(")", source.indexOf("for ("));
    assert.deepEqual(loopTail.source, {unit:"original",start:headerEnd,end:headerEnd+1,precision:"emission-token"});
    assert.equal(front.localCount, front.locals.length + 2, "anonymous literal temporaries are not given invented names");
    const negative = capture("negative");
    typedWasm.compile(source, {inspect:negative.inspect});
    const constant = negative.events[0].operations[0];
    assert.equal(constant.op, "i32.const");
    assert.deepEqual(constant.operands, [-98765]);
    assert.equal(constant.length, 4);
});

test("numeric frontend observation preserves cells and private text operations", () => {
    const source = `
        function sample(in: string, out: buffer, at: i32): i32 {
            const value = in.charCodeAt(at);
            out.writeLiteral(at, "A🐈");
            return value;
        }
    `;
    const {events, inspect} = capture("sample");
    const result = typedRv32.compile(source, [], undefined, {inspect});
    assert.deepEqual(result, typedRv32.compile(source));
    const front = events.find(e => e.kind === "frontend");
    assert.equal(front.target, "tape");
    for (const [i, op] of front.operations.entries()) {
        assert.equal(op.ordinal, i);
        assert.equal(op.offset, i === 0 ? 0 : front.operations[i-1].offset + front.operations[i-1].length);
    }
    assert(front.operations.some(op => op.op === "text.checked_address" && op.length === 3 && op.operands[0] === 0));
    assert(front.operations.some(op => op.op === "text.literal_stores" && op.length === 3 && op.operands[1] === 0));
});

const asyncSource = `
    record WorldState { marker: i32; }
    async function work(state: WorldState, value: i32): i32 { return value + 1; }
    function entry(state: WorldState): i32 { start work(state, 1); return 0; }
    function original(n: i32): i32 { return n + 1; }
`;

test("async reports distinguish original, rewritten, and synthetic origins", () => {
    const {events, inspect} = capture();
    const original = typedWasm.compile(asyncSource);
    const observed = typedWasm.compile(asyncSource, {inspect});
    assert.deepEqual(observed, original);
    const fronts = events.filter(e => e.kind === "frontend");
    const bodies = events.filter(e => e.kind === "emission");
    assert.equal(fronts.length, bodies.length);
    for (const [i, front] of fronts.entries()) {
        checkRanges(observed.bytes, front, bodies[i]);
        for (const op of front.operations) {
            const {unit, start, end, precision} = op.source;
            const text = unit === "original" ? asyncSource : front.sourceText;
            assert(start >= 0 && end >= start && end <= text.length);
            assert.equal(precision, "emission-token");
        }
    }
    assert.equal(fronts.find(f => f.function === "entry").operations[0].source.origin, "rewritten-body");
    assert.equal(fronts.find(f => f.function === "original").operations[0].source.unit, "original");
    assert(fronts.some(f => f.operations[0].source.origin === "synthetic-source"));
    const error = new SyntaxError("observer error");
    assert.throws(() => typedWasm.compile(asyncSource, {inspect:{emit() { throw error; }}}), thrown => thrown === error);
});

test("observer data can be edited without changing bytes or final placement", () => {
    const source = "function f(x: i32): i32 { return x + 32; }";
    const baseline = typedWasm.compile(source);
    const {events, inspect} = capture("f");
    typedWasm.compile(source, {inspect});
    const modified = [];
    const result = typedWasm.compile(source, {inspect:{function:"f", emit(event) {
        if (event.kind === "frontend") event.operations.length = 0;
        else modified.push(event);
    }}});
    assert.deepEqual(result, baseline);
    assert.deepEqual(modified, [events[1]]);
    const absent = capture("missing");
    assert.deepEqual(typedWasm.compile(source, {inspect:absent.inspect}), baseline);
    assert.deepEqual(absent.events, []);
});

test("typed-wasm.js is the build of compiler/typed/frontend/ and compiler/typed/wasm/", async () => {
    const {bundle} = await import(new URL("../../compiler/typed/frontend/build.mjs", import.meta.url));
    assert(readFileSync(new URL("../../compiler/typed/typed-wasm.js", import.meta.url), "utf8") === bundle(),
        "edit compiler/typed/frontend/ or wasm/, never typed-wasm.js, then run node compiler/typed/frontend/build.mjs");
});
