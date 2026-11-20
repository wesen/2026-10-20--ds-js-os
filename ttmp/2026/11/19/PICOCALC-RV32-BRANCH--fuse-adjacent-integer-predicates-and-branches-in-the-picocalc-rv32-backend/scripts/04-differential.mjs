// Compare normal typed frontend entry points, using native Node Wasm as the oracle.
import assert from 'node:assert/strict';
import {compiler, lanes, sha} from './03-apps.mjs';
import {runRv32} from './07-rv32.mjs';

const [pair] = process.argv.slice(2);
assert(pair, 'Usage: 04-differential.mjs <compiler pair>');
const extremes = [-2147483648, -32768, -1, 0, 1, 32768, 2147483647];
const comparisons = {eq: '===', lt: '<', gt: '>', le: '<=', ge: '>='};
const functions = [];
const cases = [];
function add(name, params, result, body, calls) {
    functions.push('function ' + name + '(' + params + '): ' + result + ' { ' + body + ' }');
    for (const args of calls) cases.push({name, args});
}

functions.push('record Trace { history: i32; }');
add('capture', 'trace: Trace, x: i32', 'i32',
    'trace.history = trace.history * 10 + x; return x;', []);
add('carry', 'flag: bool', 'bool', 'return flag;', []);

const pairs = extremes.flatMap(x => extremes.map(y => [x, y]));
for (const [name, op] of Object.entries(comparisons)) {
    for (const [form, body, result] of [
        ['if', 'if (a ' + op + ' b) return 1; return 20;', 'i32'],
        ['negated', 'if (!(a ' + op + ' b)) return 2; return 30;', 'i32'],
        ['loop', 'let n = 0; while (a ' + op + ' b) { if (n > 0) return 4; n = n + 1; } return 50;', 'i32'],
        ['value', 'const flag = a ' + op + ' b; return carry(flag);', 'bool'],
    ]) add(name + '_' + form, 'a: i32, b: i32', result, body, pairs);
    add(name + '_right', 'a: i32', 'i32', 'if (a ' + op + ' 0) return 1; return 0;', extremes.map(x => [x]));
    add(name + '_left', 'a: i32', 'i32', 'if (0 ' + op + ' a) return 1; return 0;', extremes.map(x => [x]));
}
add('eqz_if', 'flag: bool', 'i32', 'if (!flag) return 1; return 2;', [[0], [1]]);
add('eqz_negated', 'flag: bool', 'i32', 'if (!!flag) return 1; return 2;', [[0], [1]]);
add('eqz_value', 'flag: bool', 'bool', 'return !flag;', [[0], [1]]);
add('call_order', 'trace: Trace, a: i32, b: i32', 'i32',
    'if (capture(trace, a) < capture(trace, b) && capture(trace, 3) > 0) return 7; return 11;',
    [[32, 1, 2], [32, 2, 1], [32, 1, 1]]);
for (const depth of [0, 4, 5, 6, 8]) {
    const prefix = Array.from({length: depth}, (_, i) => (i + 1) + ' + (').join('');
    const suffix = ')'.repeat(depth);
    add('join_' + depth, 'a: i32, b: i32', 'i32',
        'return ' + prefix + 'Math.max(a, b)' + suffix + ';', pairs);
    add('bound_' + depth, 'b: buffer, index: i32, value: i32', 'i32',
        'b.setCharCodeAt(index, value); return ' + prefix + 'b.charCodeAt(index)' + suffix + ';',
        [-2147483648, -1, 0, 1, 2, 2147483647].map(index => [64, index, 0xfedc]));
}
add('bound_read', 's: string, index: i32', 'i32',
    'return s.charCodeAt(index);', [-2147483648, -1, 0, 1, 2, 2147483647].map(index => [64, index]));
add('wide', 'a: i32, b: i32', 'i32',
    'let sum = 0; if (a <= b) { ' + 'sum = sum + 12345; '.repeat(600) + '} return sum;',
    [[0, 1], [1, 1], [1, 0]]);

const source = functions.join('\n');
const contexts = Object.fromEntries(lanes.map(lane => [lane, compiler(pair, lane)]));
const {bytes} = contexts.baseline.typedWasm.compile(source);
const {instance: {exports: oracle}} = await WebAssembly.instantiate(bytes);
const programs = Object.fromEntries(lanes.map(lane => [lane, contexts[lane].typedRv32.compile(source)]));
const initialBytes = new Uint8Array(128);
const initialMemory = new DataView(initialBytes.buffer);
initialMemory.setInt32(32, 0, true);
initialMemory.setInt32(64, 2, true);
initialMemory.setUint16(68, 0x0003, true);
initialMemory.setUint16(70, 0x8102, true);
const oracleMemory = new Uint8Array(oracle.memory.buffer, 0, initialBytes.length);

function words(program, name) {
    const starts = Object.values(program.entries);
    const start = program.entries[name];
    const end = starts[starts.indexOf(start) + 1] ?? program.image.length;
    const view = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    return Array.from({length: (end - start) / 4}, (_, i) => view.getUint32(start + 4 * i, true));
}
function branchKinds(program, name) {
    return words(program, name).filter(word => (word & 127) === 0x63).map(word => (word >>> 12) & 7);
}
// Comparing the per-function bytes requires ignoring placement-dependent JAL offsets.
const normalize = list => list.map(w => (w & 127) === 0x6f ? w & 0xfff : w);
for (const [name, kind] of [['eq', 0], ['lt', 4], ['gt', 4], ['le', 5], ['ge', 5]]) {
    assert.deepEqual(branchKinds(programs.candidate, name + '_if'), [kind]);
    assert.deepEqual(branchKinds(programs.candidate, name + '_negated'), [kind ^ 1]);
    assert.deepEqual(normalize(words(programs.candidate, name + '_value')), normalize(words(programs.baseline, name + '_value')));
}
assert.equal(branchKinds(programs.candidate, 'bound_read')[0], 7);
const wideJump = words(programs.candidate, 'wide').find(w => (w & 0xfff) === 0x6f);
const wideOffset = ((wideJump >> 31) << 20) | (wideJump & 0xff000) | (((wideJump >>> 20) & 1) << 11) |
    (((wideJump >>> 21) & 0x3ff) << 1);
assert(wideOffset > 4094);

const steps = {baseline: 0, candidate: 0};
const examples = [];
let traps = 0;
for (const {name, args} of cases) {
    oracleMemory.set(initialBytes);
    let expected, trap = false;
    try {
        expected = oracle[name](...args);
    } catch (error) {
        if (!(error instanceof WebAssembly.RuntimeError)) throw error;
        trap = true;
        traps++;
    }
    const measured = {};
    for (const lane of lanes) {
        const actual = runRv32(programs[lane], name, args, [], {}, initialBytes);
        const label = lane + ' ' + name + '(' + args.join(', ') + ')';
        assert.equal(actual.trap, trap, label);
        assert.equal(actual.result, expected, label);
        assert.deepEqual(actual.bytes, oracleMemory, label);
        steps[lane] += actual.steps;
        measured[lane] = actual.steps;
    }
    assert(measured.candidate <= measured.baseline);
    if (['wide', 'eqz_if', 'call_order', 'bound_6'].includes(name)) {
        examples.push({name, args, expected, trap, steps: measured});
    }
}
assert(steps.candidate < steps.baseline);
console.log(JSON.stringify({
    cases: cases.length, traps, normal: cases.length - traps, sourceSha256: sha(source),
    wasmSha256: sha(bytes), imageSha256: Object.fromEntries(lanes.map(lane => [lane, sha(programs[lane].image)])),
    steps, bitPatterns: 'signed i32 extrema, zero, negative bounds, unsigned UTF-16',
    depths: [0, 4, 5, 6, 8], farArmJumpBytes: wideOffset, examples,
}, null, 2));
