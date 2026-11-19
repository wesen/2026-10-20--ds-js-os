// Run from the repository root. All storage is private to a fresh Wasm instance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {compiler} from '../bounds/emitter.mjs';
import {analyze} from '../bounds/proof.mjs';

const source = `
record Cell { n: i32; }
function change(c: Cell): i32 { c.n = 0; return 1; }
function mutatingMin(s: string, c: Cell, i: i32): i32 {
    let stop = Math.min(s.length, change(c));
    if (i >= 0 && i < stop) return s.charCodeAt(i);
    return 9;
}
function emptyLiteral(s: string, b: buffer, c: Cell, i: i32): i32 {
    if (i < 0 || i >= s.length) return 9;
    b.writeLiteral(change(c), "");
    return s.charCodeAt(i);
}
function shortCircuitEffect(s: string, c: Cell, i: i32, skip: bool): i32 {
    if (i >= 0 && i < s.length && (skip || change(c) > 0)) return s.charCodeAt(i);
    return 9;
}
function shortCircuitFresh(s: string, c: Cell, i: i32, skip: bool): i32 {
    if ((skip || change(c) > 0) && i >= 0 && i < s.length) return s.charCodeAt(i);
    return 9;
}
function nestedEffect(s: string, c: Cell, i: i32, mutate: bool): i32 {
    let n = 0;
    if (i < 0 || i >= s.length) return 9;
    while (n < 2) {
        let inner = 0;
        while (inner < 1) {
            if (mutate && n === 1) { change(c); }
            inner = inner + 1;
        }
        let v = s.charCodeAt(i);
        n = n + 1;
    }
    return n;
}
function inclusiveWrap(s: string, stop: i32): i32 {
    let i = 2147483647;
    while (i <= stop) {
        if (i < s.length) return s.charCodeAt(i);
        i = i + 1;
    }
    return 9;
}
function strictLast(s: string, start: i32, stop: i32): i32 {
    if (start < 0) return 9;
    let i = start;
    while (i < stop && i < s.length) {
        let v = s.charCodeAt(i);
        i = i + 1;
        if (i === stop) return v;
    }
    return 9;
}
function highHeader(s: string, i: i32): i32 {
    if (i >= 0 && i < s.length) return s.charCodeAt(i);
    return 9;
}
function mirror(s: string, i: i32, edge: i32): i32 {
    if (!(0 > i || edge <= i || s.length < edge)) return s.charCodeAt(i);
    return 9;
}
`;
const zero = 128;
const other = 256;
const args = [
    -2147483648, -1, 0, 1, 2, 2147483647,
];
const cases = [];
for (const length of [0, 1, 2, 0x80000000, 0xffffffff]) {
    for (const i of args) {
        cases.push(['highHeader', [zero, i], length]);
        for (const end of [0, 1, 2, 2147483647]) {
            cases.push(['mirror', [zero, i, end], length]);
            cases.push(['strictLast', [zero, i, end], length]);
        }
        for (const c of [zero, other]) {
            cases.push(['mutatingMin', [zero, c, i], length], ['emptyLiteral', [zero, other, c, i], length]);
            for (const skip of [0, 1]) {
                for (const name of ['shortCircuitEffect', 'shortCircuitFresh', 'nestedEffect'])
                    cases.push([name, [zero, c, i, skip], length]);
            }
        }
    }
    cases.push(['inclusiveWrap', [zero, 2147483646], length],
        // A signed strict comparison against an ordinary small header admits the wrapped counter.
        ['inclusiveWrap', [zero, 2147483647], [0, 1, 2].includes(length) ? length : 2]);
}
function compile(source, mode) {
    const traces = [];
    const c = compiler(mode ? {analyze(name, trace) {
        const result = analyze(trace, mode, 128);
        traces.push({name, checks: result.checks.length,
            removed: result.checks.filter(c => c.removed).length,
            reasons: result.checks.map(c => c.reason), events: result.events});
    }} : {});
    const bytes = c.compile(source).bytes;
    return {bytes: Buffer.from(bytes), instance: new WebAssembly.Instance(new WebAssembly.Module(bytes)), traces};
}
function invoke(instance, name, args, length) {
    const {memory} = instance.exports;
    const image = new Uint8Array(memory.buffer);
    image.fill(0);
    const data = new DataView(memory.buffer);
    data.setUint32(zero, length, true);
    data.setUint32(other, 2, true);
    data.setUint16(zero + 4, 65, true);
    data.setUint16(zero + 6, 66, true);
    let outcome;
    try { outcome = {value: instance.exports[name](...args)}; }
    catch (error) {
        if (!(error instanceof WebAssembly.RuntimeError)) throw error;
        outcome = {trap: error.message};
    }
    return {...outcome, memory: Buffer.from(image)};
}
const original = compile(source);
const variants = ['direct', 'chained'].map(mode => [mode, compile(source, mode)]);
const counts = {};
let traps = 0;
for (const [name, args, length] of cases) {
    const expected = invoke(original.instance, name, args, length);
    const row = counts[name] ??= {calls: 0, traps: 0};
    row.calls++;
    if (expected.trap) { row.traps++; traps++; }
    for (const [mode, program] of variants) {
        assert.deepEqual(invoke(program.instance, name, args, length), expected, [mode, name, args, length].join(' '));
    }
}
const m = Object.fromEntries(variants.map(([mode, data]) => [mode, data.traces]));
assert(m.chained.find(f => f.name === 'mirror').removed === 1);
assert(m.direct.find(f => f.name === 'shortCircuitFresh').removed === 1);
for (const name of ['mutatingMin', 'emptyLiteral', 'shortCircuitEffect', 'nestedEffect', 'inclusiveWrap'])
    assert.equal(m.chained.find(f => f.name === name).removed, 0, name);

const tail = 'x=x+x+x+x+x+x+x+x;';
function stress(n) {
    return 'function budget(s:string,i:i32):i32{let x=0;if(i>=0&&i<s.length){x=s.charCodeAt(i);}' +
        tail.repeat(n) + 'return x;}';
}
const low = compile(stress(8), 'chained');
assert.equal(low.traces[0].removed, 1);
const high = stress(3270);
const limited = compile(high, 'chained');
const clean = compile(high);
assert.equal(limited.traces[0].reasons[0], 'analysis limit');
assert.deepEqual(limited.bytes, clean.bytes);
const digest = data => createHash('sha256').update(data).digest('hex');
console.log(JSON.stringify({node: process.version, sourceSHA256: digest(source),
    compilerSHA256: digest(readFileSync('picocalc-os/compiler/typed-wasm.js')), inputs: cases.length, traps,
    counts, traces: m, rollback: {sourceBytes: high.length, nearEntryProofInShortFunction: low.traces[0].removed,
        ...limited.traces[0], byteIdentical: true, moduleSHA256: digest(clean.bytes)}}, null, 2));
