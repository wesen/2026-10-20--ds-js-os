// Run from the repository root: node <path>/differential.mjs <baseline.js>
import assert from 'node:assert/strict';
import {loadCompiler} from './compiler-source.mjs';
import {runRv32} from './rv32.mjs';

assert(process.argv[2], 'pass the baseline lowerer extracted with git show');
const compilers = {baseline: loadCompiler(process.argv[2]), variant: loadCompiler()};
const params = n => Array(n).fill('i32');
const imports = [
    {name: 'clobber', params: params(8), result: 'i32'},
    {name: 'tick', params: params(1), result: 'bool'},
];
const source = `
record Cell { value: i32; }
function bump(b: i32, c: i32): i32 {
    let a = b + c;
    if (a > 0) { a = a + 1; }
    return a;
}
function inner(x: i32): i32 {
    if (x < 0) return 40 - x;
    return x + 7;
}
function callMixed(x: i32): i32 {
    return 100 + clobber(3, -5, inner(x), 11, -13, 17, 19, 23);
}
function callFull(x: i32): i32 {
    return 1 + (2 + (4 + (8 + (16 + (32 + clobber(3, -5, inner(x), 11, -13, 17, 19, 23))))));
}
function join(x: i32, y: i32): i32 {
    return 1000 + Math.max(x, y);
}
function deepJoin(x: i32, y: i32): i32 {
    return 1 + (2 + (4 + (8 + (16 + (32 + Math.max(x, y))))));
}
function shortCircuit(flag: bool, x: i32): bool {
    return flag && tick(x) === (flag || tick(99));
}
function recordWrite(c: Cell, x: i32): i32 {
    c.value = callFull(x);
    return c.value;
}
function bufferWrite(b: buffer, i: i32, x: i32): i32 {
    b.setCharCodeAt(i, callMixed(x));
    return b.charCodeAt(i);
}
function loop(n: i32): i32 {
    let acc = 0;
    let i = 0;
    while (i < n) {
        if (i >= 6) return acc + 7001;
        acc = acc + inner(i);
        i = i + 1;
    }
    return acc;
}
function div(a: i32, b: i32): i32 { return a / b; }
function mod(a: i32, b: i32): i32 { return a % b; }
function deepDiv(a: i32, b: i32): i32 {
    return 1 + (2 + (4 + (8 + (16 + (32 + a / b)))));
}
function deepMod(a: i32, b: i32): i32 {
    return 1 + (2 + (4 + (8 + (16 + (32 + a % b)))));
}
function snapshotLocal(a: i32): i32 { return a; }
`;

const indexed = imports.map((fn, index) => ({...fn, index}));
for (const context of Object.values(compilers)) {
    const original = context.typedWasm.compileFunctions;
    context.typedWasm.compileFunctions = (...args) => {
        const lowered = original(...args);
        const fn = lowered.functions.find(item => item.name === 'snapshotLocal');
        // Save local.get 0 on the operand stack, then set local 0 to 7.
        fn.code = [0x20, 0, 0x41, 7, 0x21, 0, 0x0b];
        fn.body = [1 + fn.code.length, 0, ...fn.code];
        return lowered;
    };
}

function unsigned(n) {
    const bytes = [];
    do {
        bytes.push((n & 127) | (n > 127 ? 128 : 0));
        n >>>= 7;
    } while (n);
    return bytes;
}
const vector = rows => [...unsigned(rows.length), ...rows.flat()];
const text = s => [...unsigned(s.length), ...Array.from(s, c => c.charCodeAt(0))];
const section = (id, rows) => {
    const bytes = vector(rows);
    return [id, ...unsigned(bytes.length), ...bytes];
};
const {functions} = compilers.baseline.typedWasm.compileFunctions(source, imports.length, indexed);
const wasm = Uint8Array.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    ...section(1, [...imports, ...functions].map(fn => [0x60, fn.params.length, ...fn.params.map(() => 0x7f), 1, 0x7f])),
    ...section(2, imports.map((fn, i) => [...text('fixture'), ...text(fn.name), 0, ...unsigned(i)])),
    ...section(3, functions.map((fn, i) => unsigned(imports.length + i))),
    ...section(5, [[0, 1]]),
    ...section(7, [[...text('memory'), 2, 0], ...functions.map((fn, i) =>
        [...text(fn.name), 0, ...unsigned(imports.length + i)])]),
    ...section(10, functions.map(fn => fn.body)),
]);
const programs = Object.fromEntries(Object.entries(compilers).map(([key, context]) =>
    [key, context.typedRv32.compile(source, imports)]));

function handlers(log) {
    return {
        clobber(...args) {
            log.push(['clobber', args]);
            return args.reduce((sum, n, i) => sum + (i + 1) * n, 0);
        },
        tick(x) {
            log.push(['tick', [x]]);
            return Number(x > 0);
        },
    };
}
const image = new Uint8Array(128);
const bufferAddress = 64;
new DataView(image.buffer).setUint32(bufferAddress, 2, true);
const wasmLog = [];
const {instance: {exports: oracle}} = await WebAssembly.instantiate(wasm, {fixture: handlers(wasmLog)});
const wasmMemory = new Uint8Array(oracle.memory.buffer, 0, image.length);
const cases = [
    ['bump', [2, 3]], ['bump', [-6, 2]],
    ...[-9, 0, 48].flatMap(x => [
        ['callMixed', [x]], ['callFull', [x]],
        ['recordWrite', [16, x]], ['bufferWrite', [bufferAddress, 1, x]],
        ['snapshotLocal', [x]],
    ]),
    ...[[7, 2], [2, 7], [7, 7], [-5, -2]].flatMap(args => [['join', args], ['deepJoin', args]]),
    ...[-1, 0, 1].flatMap(x => [['shortCircuit', [0, x]], ['shortCircuit', [1, x]]]),
    ...[-1, 0, 1, 6, 7].map(x => ['loop', [x]]),
    ['bufferWrite', [bufferAddress, -1, 5]], ['bufferWrite', [bufferAddress, 2, 5]],
    ...[[7, 3], [-7, 3], [7, -3], [-7, -3], [0, -1], [1, 0],
        [-2147483648, -1], [-2147483648, 1], [2147483647, 1], [-2147483648, 0]]
        .flatMap(args => ['div', 'mod', 'deepDiv', 'deepMod'].map(name => [name, args])),
];
const summary = {cases: cases.length, traps: 0, imports: 0, executedWords: {baseline: 0, variant: 0}, examples: []};
for (const [name, args] of cases) {
    const label = JSON.stringify([name, args]);
    const executions = {};
    wasmLog.length = 0;
    wasmMemory.set(image);
    let value, trap = false;
    try { value = oracle[name](...args); } catch (e) {
        if (!(e instanceof WebAssembly.RuntimeError)) throw e;
        trap = true;
    }
    summary.traps += Number(trap);
    summary.imports += wasmLog.length;
    for (const [key, program] of Object.entries(programs)) {
        const log = [];
        const run = runRv32(program, name, args, imports, handlers(log), image);
        assert.equal(run.trap, trap, key + label);
        assert.equal(run.result, value, key + label);
        assert.deepEqual(log, wasmLog, key + label + ' import arguments and call order');
        assert.deepEqual(run.bytes, wasmMemory, key + label + ' application memory');
        executions[key] = run.steps;
        summary.executedWords[key] += run.steps;
    }
    if (['bump', 'callMixed', 'callFull', 'deepJoin', 'deepDiv', 'deepMod'].includes(name))
        summary.examples.push({name, args, result: value, trap, ...executions});
}
console.log(JSON.stringify(summary));
