// Compare lowered RV32 words with actual Wasm evaluation and preserve focused machine-state witnesses.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const [work] = process.argv.slice(2);
assert(work, 'Usage: node 05-behavior.mjs <staged-directory>');
const day = new URL('../../', import.meta.url);
const [branchTicket] = readdirSync(day).filter(name => name.startsWith('PICOCALC-RV32-BRANCH--'));
const emulator = readFileSync(new URL(`${branchTicket}/scripts/07-rv32.mjs`, day), 'utf8');
const marker = 'else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));';
assert.equal(emulator.split(marker).length, 2);
const extended = emulator.replace(marker, `else if (f3 === 1 && f7 === 0) x[rd] = a << ((w >>> 20) & 31);
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 5 && f7 === 0x20) x[rd] = a >> ((w >>> 20) & 31);
            ${marker}`);
const {runRv32} = await import('data:text/javascript;base64,' + Buffer.from(extended + '\n//# sourceURL=rv32-behavior-emulator.mjs').toString('base64'));
const lanes = ['base', 'fusion', 'staged'];
const contexts = Object.fromEntries(lanes.map(lane => {
    const context = createContext();
    for (const part of ['wasm', 'rv32']) {
        const file = resolve(work, 'lanes', lane, 'typed', part + '.js');
        runInContext(readFileSync(file, 'utf8'), context, {filename: file});
    }
    return [lane, context];
}));
const input = new Uint8Array(128);
const memory = new DataView(input.buffer);
memory.setInt32(32, 2, true);
memory.setUint16(36, 0xfedc, true);
memory.setUint16(38, 0x8102, true);
const common = [0x80000000 | 0, -32768, -2048, -1, 0, 1, 31, 32, 63, 2047, 2147483647];
const pairs = common.flatMap(a => common.map(b => [a, b]));
const app = [];
const cases = [];
const add = (name, params, returnType, body, tuples) => {
    app.push(`function ${name}(${params}): ${returnType} { ${body} }`);
    for (const args of tuples) cases.push({name, args});
};
app.push('record Trace { n: i32; }');
add('note', 'p: Trace, x: i32', 'i32', 'p.n = p.n * 10 + x; return x;', []);
add('yes', 'p: Trace, x: i32', 'bool', 'return note(p, x) > 0;', []);
add('finish', 'a: i32, b: bool, c: i32', 'i32', 'if (b) return a + c; return a - c;', []);
add('eight', 'a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32', 'i32',
    'return a + 2 * b + 3 * c + 4 * d + 5 * e + 6 * f + 7 * g + 8 * h;', []);
add('call8', 'p: Trace, a: i32, b: i32', 'i32',
    'return a + eight(note(p, a), 2, note(p, b), 4, note(p, a + 1), 6, 7, note(p, b + 1));',
    [[64,2,3], [64,3,2], [64,-1,0]]);
add('joincall', 'p: Trace, a: i32, b: i32', 'i32',
    'return finish(note(p, 2), a > 0 && yes(p, b), note(p, 3));', [[64,2,3], [64,0,2], [64,1,-1]]);
add('retguard', 'p: Trace, a: i32, b: i32', 'i32',
    'return note(p, 7) + note(p, a) / b;', pairs.map(([a, b]) => [64, a, b]));
for (const [name, body] of Object.entries({
    div: 'a / b', rem: 'a % b', divConst: 'a / 8', divNeg: 'a / (-1)', divZero: 'a / 0',
    shiftR: 'a >> 63', shiftVar: 'a >> b',
    addimm: 'a + 2047', addwide: 'a + 2048', subimm: 'a - 2048', subwide: 'a - (-2048)',
})) add(name, 'a: i32, b: i32', 'i32', `return ${body};`, pairs);
for (const [name, op] of Object.entries({eq: '===', lt: '<', le: '<=', gt: '>', ge: '>='})) {
    add(name, 'a: i32, b: i32', 'i32', `if (!(a ${op} b)) return 13; return -9;`, pairs);
}
add('ltImmediate', 'a:i32', 'bool', 'return a < 42;', common.map(a => [a]));
for (const depth of [0, 4, 5, 6, 8]) {
    const prefix = Array.from({length: depth}, (_, i) => `${i + 1} + (`).join('');
    add('join' + depth, 'a: i32, b: i32', 'i32',
        'return ' + prefix + 'Math.max(a, b)' + ')'.repeat(depth) + ';', pairs);
    add('bounds' + depth, 'b: buffer, i: i32, x: i32', 'i32',
        'b.setCharCodeAt(i, x); return ' + prefix + 'b.charCodeAt(i)' + ')'.repeat(depth) + ';',
        [-1, 0, 1, 2, 2147483647].map(i => [32, i, 0xfeed]));
}
for (const [name, length] of [['shortArm', 340], ['nearArm', 341], ['longArm', 342]]) {
    add(name, 'x: i32, n: i32', 'i32',
        `let r = x; if (n > 0) { ${'r = r + 1; '.repeat(length)} } return r;`, [[20, 0], [20, 1]]);
}
add('longLoop', 'n: i32', 'i32',
    'let i = n; let x = 0; while (i > 0) { ' + 'x = x + 1; '.repeat(400) + 'i = i - 1; } return x;',
    [[0], [1], [2]]);
const source = app.join('\n');
const {instance: {exports: oracle}} = await WebAssembly.instantiate(contexts.base.typedWasm.compile(source).bytes);
const oracleMemory = new Uint8Array(oracle.memory.buffer, 0, input.length);
const programs = Object.fromEntries(lanes.map(lane => [lane, contexts[lane].typedRv32.compile(source)]));
const steps = Object.fromEntries(lanes.map(lane => [lane, 0]));
const witnesses = [];
let traps = 0;
for (const {name, args} of cases) {
    oracleMemory.set(input);
    let value, trap = false;
    try { value = oracle[name](...args); }
    catch (error) {
        assert(error instanceof WebAssembly.RuntimeError, error);
        trap = true;
        traps++;
    }
    const caseSteps = {};
    for (const lane of lanes) {
        const actual = runRv32(programs[lane], name, args, [], {}, input);
        assert.equal(actual.trap, trap, `${lane} ${name}(${args}) trap`);
        assert.equal(actual.result, value, `${lane} ${name}(${args}) value`);
        assert.deepEqual(actual.bytes, oracleMemory, `${lane} ${name}(${args}) memory`);
        steps[lane] += actual.steps;
        caseSteps[lane] = actual.steps;
    }
    if (['call8', 'joincall', 'shortArm', 'nearArm', 'longArm', 'longLoop', 'bounds8'].includes(name)) {
        witnesses.push({name, args, value, trap, steps: caseSteps});
    }
}

function findTransfers(program, name) {
    const code = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    const start = program.entries[name];
    const end = Object.values(program.entries).find(offset => offset > start) ?? code.byteLength;
    const b = [], j = [];
    for (let at = start; at < end; at += 4) {
        const w = code.getUint32(at, true);
        if ((w & 127) === 0x63) b.push(((w >> 31) << 12) | (((w >>> 7) & 1) << 11) |
            (((w >>> 25) & 63) << 5) | (((w >>> 8) & 15) << 1));
        if ((w & 127) === 0x6f) j.push(((w >> 31) << 20) | (w & 0xff000) |
            (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1));
    }
    return {b, j};
}
const transfers = Object.fromEntries(['shortArm', 'nearArm', 'longArm', 'longLoop']
    .map(name => [name, findTransfers(programs.staged, name)]));
assert(transfers.shortArm.b.some(n => n > 4000), 'short-arm witness must include a direct range-sized B');
assert(transfers.longArm.j.some(n => n > 4094), 'long-arm witness must need JAL fallback');
assert(transfers.longLoop.j.some(n => n < -4096), 'wide backedge witness');

// The current source grammar cannot put local.set between a local read and its use.
// Feed the real lowering this already typed numeric function to test that invariant.
const raw = createContext({typedWasm: {compileFunctions: () => ({functions: [{name: 'stale',
    params: ['i32'], result: 'i32', nlocals: 0, code: [
        0x41, 1, 0x41, 2, 0x41, 3, 0x41, 4, 0x41, 5, 0x20, 0, 0x41, 99, 0x21, 0,
        0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x0b,
    ]}], records: new Map()})}});
runInContext(readFileSync(join(work, 'lanes/staged/typed/rv32.js'), 'utf8'), raw);
const stagedRaw = raw.typedRv32.compile('', [], undefined, {streamFunctions: false});
assert.equal(runRv32(stagedRaw, 'stale', [41], [], {}, input).result, 56);

const imports = [{name: 'host', params: ['i32'], result: 'i32'}];
const hostSource = 'function use(a:i32,b:i32):i32 { return (a * 2) + host(a) + host(b); }';
for (const lane of lanes) {
    const program = contexts[lane].typedRv32.compile(hostSource, imports);
    const seen = [];
    const result = runRv32(program, 'use', [2, 3], imports, {host: n => { seen.push(n); return n * 3; }}, input);
    assert.deepEqual(seen, [2, 3]);
    assert.equal(result.result, 19);
}
const invalid = ['', 'function syntax(:i32', 'function bad(x:i32):i32 { return x > 0; }',
    'function wide(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32,i:i32):i32 { return 0; }'];
const diagnostic = (lane, text, streamFunctions) => {
    try { contexts[lane].typedRv32.compile(text, [], undefined, {streamFunctions}); }
    catch (error) { return `${error.name}: ${error.message}`; }
    assert.fail('diagnostic fixture unexpectedly compiled');
};
const diagnostics = invalid.map(text => diagnostic('base', text, true));
for (const lane of lanes) for (const stream of [true, false]) {
    assert.deepEqual(invalid.map(text => diagnostic(lane, text, stream)), diagnostics);
}
console.log(JSON.stringify({cases: cases.length, traps, steps, transfers, witnesses, diagnostics,
    staleLocalSpill: {depth: 5, expected: 56}, importClobber: {order: [2, 3], expected: 19}}, null, 2));
