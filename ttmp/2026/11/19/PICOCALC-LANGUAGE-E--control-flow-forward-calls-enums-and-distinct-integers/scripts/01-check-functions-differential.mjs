import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';

const source = String.raw`
enum Phase { Cold = -2, Warm, Active = 4, Idle, Done = 13 }
record State { phase: Phase; }
type Unit = distinct i32;
record Position { at: Unit; }
type Point = distinct i32;

function forward(n: i32): i32 { return forwardB(n) + 1; }
function forwardB(n: i32): i32 { return forwardC(n) + 2; }
// } function ghost(): i32 {
function forwardC(n: i32): i32 { return forwardD(n) + 3; }
function skipBody(out: buffer): i32 {
    if (false) { out.writeLiteral(0, "} // \" { function ghost() {"); }
    return 0;
}
function forwardD(n: i32): i32 { return n * 2; }
function sign(x: i32): i32 {
    let s = 0;
    if (x > 0) { s = 1; } else if (x < 0) { s = 0 - 1; }
    else if (x === 0) { s = 10; } else { s = 20; }
    return s;
}
function compact(c: bool): i32 { if (c) return 1; else return 2; return 3; }
function elseWithWhile(c: bool): i32 {
    let n = 1;
    if (c) { n = 3; } else { while (n < 8) { n = n + n; } }
    return n;
}
function sum(n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) { s = s + i; }
    return s;
}
function nested(n: i32): i32 {
    let s = 0;
    for (let i = 0; i < n; i = i + 1) {
        for (let j = 0; j < n; j = j + 1) { s = s + i + j; }
    }
    return s;
}
function early(n: i32): i32 {
    for (let i = 0; i < n; i = i + 1) { if (i === 3) return 30; }
    return -1;
}
function first(want: i32): i32 {
    let i = 0;
    while (i < 10) {
        if (i > 1) { if (i === want) { break; } }
        i = i + 1;
    }
    return i;
}
function exitInner(n: i32): i32 {
    let count = 0;
    let j = 9;
    for (let i = 0; i < n; i = i + 1) {
        for (j = 0; j < 8; j = j + 1) {
            count = count + 1;
            if (j === 2) { break; }
        }
    }
    return 10 * count + j;
}
function different(x: i32, y: i32): bool { return x !== y; }
function differentFlag(x: bool, y: bool): bool { return x !== y; }
function branchDifferent(x: i32, y: i32): i32 { if (x !== y) return 320; return 500; }
function branchDifferentFlag(x: bool, y: bool): i32 { if (x !== y) return 320; return 500; }
function phaseValue(p: Phase): i32 { return i32(p); }
function phaseIs(p: Phase): bool { return p === Phase.Active; }
function phaseNot(p: Phase): bool { return p !== Phase.Idle; }
function phaseMatch(p: Phase): i32 {
    match (p) {
        Cold, Warm: { return 11; }
        Active, Done: { return 25; }
        Idle: { return 9; }
    }
    return 99;
}
function stateMatch(r: State): i32 {
    r.phase = Phase.Done;
    return phaseMatch(r.phase);
}
function matchBreak(p: Phase): i32 {
    let i = 0;
    while (i < 4) {
        match (p) {
            Idle: { }
            Cold, Warm: { break; }
            Active, Done: { i = i + 1; }
        }
        i = i + 1;
    }
    return i;
}
function distinctUnits(n: i32): Point {
    let at: Unit = -2147483648;
    at = at + 1;
    let stop = Unit(n);
    stop = 2 + stop;
    if (at !== -2147483647 || stop <= 2) return Point(-55);
    return Point(i32(stop) - i32(Unit(2)));
}
function storedUnit(r: Position, n: i32): i32 {
    r.at = Unit(n);
    let u = r.at;
    return i32(u + 3 - 1);
}
`;
const cases = [
    ['forward', [5], 16], ['forward', [-3], 0], ['skipBody', [256], 0],
    ['sign', [-5], -1], ['sign', [5], 1], ['sign', [0], 10],
    ['compact', [1], 1], ['compact', [0], 2],
    ['elseWithWhile', [1], 3], ['elseWithWhile', [0], 8],
    ['sum', [5], 10], ['sum', [0], 0], ['nested', [4], 48], ['nested', [0], 0],
    ['early', [5], 30], ['early', [2], -1],
    ['first', [4], 4], ['first', [1], 10], ['exitInner', [3], 92], ['exitInner', [0], 9],
    ['different', [17, 17], 0], ['different', [-1, 17], 1],
    ['differentFlag', [0, 0], 0], ['differentFlag', [1, 1], 0],
    ['differentFlag', [1, 0], 1], ['differentFlag', [0, 1], 1],
    ['branchDifferent', [2, 2], 500], ['branchDifferent', [3, 2], 320],
    ['branchDifferentFlag', [0, 0], 500], ['branchDifferentFlag', [1, 0], 320],
    ['phaseValue', [-1], -1], ['phaseIs', [4], 1], ['phaseIs', [5], 0],
    ['phaseNot', [5], 0], ['phaseNot', [4], 1],
    ['phaseMatch', [-2], 11], ['phaseMatch', [-1], 11],
    ['phaseMatch', [4], 25], ['phaseMatch', [5], 9], ['phaseMatch', [13], 25],
    ['stateMatch', ['cell'], 25], ['matchBreak', [-1], 0], ['matchBreak', [4], 4],
    ['distinctUnits', [11], 11], ['distinctUnits', [0], -55], ['storedUnit', ['cell', 20], 22],
];
const traps = [['phaseMatch', [0]], ['phaseMatch', [-3]], ['phaseMatch', [12]]];

if (process.argv[2] === '--wasm-worker') {
    const wasm = new WebAssembly.Instance(new WebAssembly.Module(compileTyped(source))).exports;
    for (const [name, args, expected] of cases) {
        assert.equal(wasm[name](...args.map(arg => arg === 'cell' ? 256 : arg)), expected, name);
    }
    for (const [name, args] of traps) assert.throws(() => wasm[name](...args), WebAssembly.RuntimeError, name);
    process.exit(0);
}

const [ccArg, emuArg] = process.argv.slice(2);
assert(ccArg && emuArg, 'pass the ESP32-P4 GCC and CJI rv32emu executable paths');
const cc = resolve(ccArg);
const emu = resolve(emuArg);
const work = mkdtempSync(join(tmpdir(), 'picocalc-language-e-'));

function runRv32(label, image, entries, tests) {
    const binary = join(work, 'program.bin'), assembly = join(work, 'program.S');
    const elf = join(work, 'program.elf');
    writeFileSync(binary, image);
    const code = ['.section .text.start,"ax"', '.global _start', '_start:'];
    for (const [i, [name, args, expected]] of tests.entries()) {
        args.forEach((arg, a) => code.push(arg === 'cell' ? `la a${a}, cell` : `li a${a}, ${arg}`));
        code.push(`call program + ${entries[name]}`);
        if (expected !== undefined) {
            code.push(`li t1, ${expected}`, `beq a0, t1, .Lcase${i}`,
                `li a0, ${i + 1}`, 'j .Lexit', `.Lcase${i}:`);
        }
    }
    code.push('li a0, 0', '.Lexit:', 'li a7, 1', 'ecall',
        '.section .text.typed,"ax"', '.balign 4', 'program:', `.incbin "${binary}"`,
        '.section .bss', '.balign 4', 'cell:', '.space 32');
    writeFileSync(assembly, code.join('\n') + '\n');
    execFileSync(cc, ['-march=rv32im', '-mabi=ilp32', '-nostdlib', '-mno-relax',
        '-Wl,-Ttext=0x10000', '-Wl,-e,_start', assembly, '-o', elf]);
    const run = spawnSync(emu, [elf], {encoding: 'utf8', timeout: 10000});
    assert.ifError(run.error);
    assert.equal(run.signal, null, label);
    return run;
}

try {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--wasm-worker'], {timeout: 10000});
    const streamed = typedRv32.compile(source);
    const buffered = typedRv32.compile(source, [], undefined, {streamFunctions: false});
    assert.deepEqual(streamed.image, buffered.image);
    assert.deepEqual(streamed.entries, buffered.entries);
    const run = runRv32('cross-target results', streamed.image, streamed.entries, cases);
    assert.equal(run.status, 0, `RV32 case ${JSON.stringify(cases[run.status - 1])} ${run.stderr}`);
    for (const test of traps) {
        const run = runRv32(test[0], streamed.image, streamed.entries, [test]);
        assert.notEqual(run.status, 0, `RV32 accepted invalid enum ${test[1]}`);
        assert.match(run.stderr, /breakpoint|EBreak|BreakPoint/i);
    }
} finally {
    rmSync(work, {recursive: true, force: true});
}

const ph = 'enum Phase { First, Second, Third } enum Other { Foreign } ';
const units = 'type Unit = distinct i32; type Point = distinct i32; ';
const malformed = [
    ['function f(): i32 { else { } return 0; }', 'expected identifier'],
    ['function f(): i32 { if (true) { } else let x = 0; return 0; }', 'expected return'],
    ['function f(): i32 { for (let i = 0; ; i = i + 1) {} return 0; }', 'expected identifier'],
    ['function f(): i32 { for (let i = 0; i < 1; let j = 1) {} return 0; }', 'expected identifier'],
    ['function f(): i32 { for (let i = 0; i < 1; i = i + 1) {} return i; }', 'unknown local i'],
    ['function f(): i32 { break; return 0; }', 'break outside a loop'],
    ['function f(x: string, y: string): bool { return x !== y; }', 'expected scalar equality operands'],
    ['function f(): i32 { return f(); }', 'recursive call cycle: f -> f'],
    ['function a(): i32 { return b(); } function b(): i32 { return a(); }', 'recursive call cycle: a -> b -> a'],
    [`function entryPoint(): i32 { return a(); } function a(): i32 { return b(); }
      function b(): i32 { return c(); } function c(): i32 { return a(); }`, 'recursive call cycle: a -> b -> c -> a'],
    ['function f(): i32 { return 0; } function dead(): i32 { return dead(); }', 'recursive call cycle: dead -> dead'],
    ['function f(): i32 { return g(); }', 'unknown function g'],
    ['enum E { A, B, A } function f(): i32 { return 0; }', 'duplicate member A in E'],
    ['enum E { A, B = 0 } function f(): i32 { return 0; }', 'duplicate enum value 0 in E'],
    ['enum E { A = 2147483647, B } function f(): i32 { return 0; }', 'i32 enum value out of range'],
    [ph + 'function f(p: Phase): i32 { match (p) { First: {} } return 0; }',
        'match on Phase does not cover: Second, Third'],
    [ph + 'function f(p: Phase): i32 { match (p) { First, Second: {} First: {} } return 0; }',
        'useless case First'],
    [ph + 'function f(p: Phase): i32 { match (p) { Foreign: {} } return 0; }', 'unknown case Foreign in Phase'],
    [ph + 'function f(p: Phase): i32 { return plain(p); } function plain(n: i32): i32 { return n; }',
        'expected i32, got Phase'],
    [ph + 'function f(p: Phase): i32 { return p + 1; }', 'expected i32, got Phase'],
    [ph + 'function f(p: Phase): bool { return p === Other.Foreign; }', 'expected Phase, got Other'],
    [ph + 'function f(): i32 { return i32(Phase.Fourth); }', 'unknown enum member Phase.Fourth'],
    [ph + 'function f(p: i32): i32 { match (p) { First: {} } return 0; }', 'match requires an enum, got i32'],
    [units + 'function f(p: Point, u: Unit): Point { return p + u; }', 'expected Point, got Unit'],
    [units + 'function f(u: Unit): Point { return g(u); } function g(p: Point): Point { return p; }',
        'expected Point, got Unit'],
    [units + 'function f(u: Unit): Unit { return u * u; }', 'expected i32, got Unit'],
    [units + 'function f(u: Unit, n: i32): Unit { return u + n; }', 'expected Unit, got i32'],
    [units + 'function f(): Point { let n = 42; return n; }', 'expected Point, got i32'],
    [units + 'function f(): Point { let n: Unit = 42; return n; }', 'expected Point, got Unit'],
    [units + 'function f(u: Unit): Point { return Point(u); }', 'expected i32, got Unit'],
];
for (const [input, diagnostic] of malformed) {
    for (const compile of [compileTyped, typedRv32.compile, text => typedRv32.compile(text, [], undefined, {streamFunctions: false})]) {
        assert.throws(() => compile(input), err => err instanceof SyntaxError && err.message.endsWith(diagnostic),
            `expected ${diagnostic} from ${input}`);
    }
}

const plain = 'function f(n: i32): i32 { let s = 0; let i = 0; while (i < n) { s = s + i; i = i + 1; } return s; }';
const counted = 'function f(n: i32): i32 { let s = 0; for (let i = 0; i < n; i = i + 1) { s = s + i; } return s; }';
assert.deepEqual(compileTyped(plain), compileTyped(counted));
assert.deepEqual(typedRv32.compile(plain).image, typedRv32.compile(counted).image);

const unspecialized = 'function f(u: i32): i32 { let at = -7; return u + at; }';
const specialized = units + 'function f(u: Unit): Point { let at: Unit = -7; return Point(i32(u + at)); }';
assert.deepEqual(compileTyped(unspecialized), compileTyped(specialized));
assert.deepEqual(typedRv32.compile(unspecialized).image, typedRv32.compile(specialized).image);

const {functions, edges, order} = typedWasm.compileFunctions(source, 11);
assert.deepEqual(functions.slice(0, 5).map(fn => fn.index), [11, 12, 13, 14, 15]);
assert.deepEqual(edges.slice(0, 5), [[1], [2], [4], [], []]);
assert.deepEqual(order.slice(0, 5), [4, 2, 1, 0, 3]);
assert.equal(Object.keys(typedWasm.compile(source).enums.Phase).length, 5);
assert.deepEqual(typedRv32.compile(source).records.Position.at, {type: 'Unit', offset: 0});
// Each legal buffer literal expands to many operations. A spread call would put
// the complete generated update on the JavaScript argument stack.
const literalWrite = 'out.writeLiteral(0,"' + 'a'.repeat(1022) + '")';
const largeUpdate = Array(30).fill(literalWrite).join(' + ');
const largeFor = 'function f(out: buffer): i32 { let n = 0; for (n = 0; false; n = ' +
    largeUpdate + ') {} return n; }';
const largeWasm = compileTyped(largeFor);
assert(WebAssembly.validate(largeWasm));
const largeRv32 = typedRv32.compile(largeFor).image;
assert(largeRv32.length > 300_000);
console.log(JSON.stringify({results: cases.length, traps: traps.length, rejected: malformed.length,
    targets: ['wasm', 'rv32'], modes: ['streamed', 'buffered'], equalLowering: ['for', 'distinct'],
    expandedUpdate: {sourceBytes:largeFor.length, wasmBytes:largeWasm.length, rv32Bytes:largeRv32.length}}));
