import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work, ops] = process.argv.slice(2);
assert(work && ops, 'usage: node 04-verify.mjs <work> <typed-ops-work>');
const day = new URL('../../', import.meta.url);
const [branch] = readdirSync(day).filter(name => name.startsWith('PICOCALC-RV32-BRANCH--'));
const emulatorSource = readFileSync(new URL(branch + '/scripts/07-rv32.mjs', day), 'utf8');
const marker = 'else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));';
assert.equal(emulatorSource.split(marker).length, 2);
const emulator = emulatorSource.replace(marker, `else if (f3 === 1 && f7 === 0) x[rd] = a << ((w >>> 20) & 31);
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 5 && f7 === 0x20) x[rd] = a >> ((w >>> 20) & 31);
            ${marker}`);
const {runRv32} = await import('data:text/javascript;base64,' + Buffer.from(emulator).toString('base64'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const modes = ['current', 'direct', 'bounded'];
function load(path) {
    const ctx = vm.createContext({});
    for (const part of ['wasm', 'rv32', 'world'])
        vm.runInContext(readFileSync(join(path, 'typed', part + '.js'), 'utf8'), ctx);
    return ctx;
}

function compile(ctx, source, isEditor = false) {
    const rows = {};
    const observeFunction = fn => {
        if (fn.bounds) rows[fn.name] = fn.bounds;
    };
    const options = {observeFunction};
    if (!isEditor) return {program: ctx.typedRv32.compile(source, [], undefined, options), rows};
    const link = ctx.typedRv32.linkSlot;
    ctx.typedRv32.linkSlot = program => program;
    try { return {program: ctx.compileTypedWorldRv32(source, null, options), rows}; }
    finally { ctx.typedRv32.linkSlot = link; }
}

function markers(program, name) {
    const first = name ? program.entries[name] : 0;
    const last = Object.values(program.entries).find(offset => offset > first) ?? program.image.length;
    const image = Buffer.from(program.image);
    let count = 0;
    for (let i = first; i < (name ? last : image.length); i += 4)
        count += Number(image.readUInt32LE(i) === 0x17900013);
    return count;
}
const fixture = [
    'record Header { length: i32; }',
    'function shrink(header: Header): i32 { header.length = 1; return 0; }',
    'function direct(s: string, i: i32): i32 { if (0 <= i && i < s.length) return s.charCodeAt(i); return s.charCodeAt(i); }',
    'function bounded(s: string, i: i32, end: i32): i32 { if (end <= s.length && i < end && 0 <= i) return s.charCodeAt(i); return s.charCodeAt(i); }',
    'function missingLower(s: string, i: i32, end: i32): i32 { if (end <= s.length && i < end) return s.charCodeAt(i); return -17; }',
    'function nonstrict(s: string, i: i32, end: i32): i32 { if (end <= s.length && i <= end && 0 <= i) return s.charCodeAt(i); return -17; }',
    'function disjunction(s: string, i: i32): i32 { if (0 <= i || i < s.length) return s.charCodeAt(i); return -17; }',
    'function different(a: string, b: string, i: i32): i32 { if (0 <= i && i < a.length) return b.charCodeAt(i); return -17; }',
    'function changedIndex(s: string, start: i32, fresh: i32): i32 { let i = start; if (0 <= i && i < s.length) { i = fresh; if (true) return s.charCodeAt(i); } return -17; }',
    'function changedText(a: string, b: string, i: i32): i32 { let s = a; if (0 <= i && i < s.length) { s = b; if (true) return s.charCodeAt(i); } return -17; }',
    'function joinedIndex(s: string, start: i32, fresh: i32, change: bool): i32 { let i = start; if (0 <= i && i < s.length) { if (change) { i = fresh; } if (true) return s.charCodeAt(i); } return -17; }',
    'function joinedGuard(s: string, i: i32): i32 { let called = false; if (0 <= i && i < s.length) { called = true; } return s.charCodeAt(i); }',
    'function callEffect(s: string, h: Header, i: i32): i32 { if (0 <= i && i < s.length) { shrink(h); if (true) return s.charCodeAt(i); } return -17; }',
    'function fieldEffect(s: string, h: Header, i: i32): i32 { if (0 <= i && i < s.length) { h.length = 1; if (true) return s.charCodeAt(i); } return -17; }',
    'function logicEffect(s: string, h: Header, i: i32): i32 { if (0 <= i && i < s.length && shrink(h) === 0) return s.charCodeAt(i); return -17; }',
    'function loop(s: string, start: i32, end: i32): i32 { let i = start; let sum = 0; if (end <= s.length) { while (0 <= i && i < end) { sum = sum + s.charCodeAt(i); i = i + 1; } } while (i < end) { sum = sum + s.charCodeAt(i); i = i + 1; } return sum; }',
    'function loopEffect(s: string, h: Header, start: i32, end: i32): i32 { let i = start; let sum = 0; if (end <= s.length) { while (0 <= i && i < end) { sum = sum + s.charCodeAt(i); shrink(h); i = i + 1; } } return sum; }',
    'function loopRecord(s: string, h: Header, start: i32, end: i32): i32 { let i = start; let sum = 0; if (end <= s.length) { while (0 <= i && i < end) { sum = sum + s.charCodeAt(i); h.length = 1; i = i + 1; } } return sum; }',
    'function rhs(s: string, i: i32, end: i32): i32 { if (0 <= i && i < end && end <= s.length && s.charCodeAt(i) > 0) return 7; return -17; }',
    'function budget(s: string, i: i32, end: i32): i32 { if (0 <= i && end <= s.length && i < end && i < end && i < end && i < end && i < end && i < end && i < end) return s.charCodeAt(i); return -17; }'
].join('\n');

const apps = {};
const contexts = Object.fromEntries(modes.map(mode => [mode, load(join(work,'clean',mode))]));
const counted = Object.fromEntries(modes.map(mode => [mode, load(join(work,'count',mode))]));
const original = load(join(ops,'lanes/direct'));
const programs = {};
for (const app of ['files','agenda','editor','fixture']) {
    const combined = app === 'editor';
    const src = app === 'fixture' ? fixture : readFileSync(join(work,'sources',app,'app.typed'), 'utf8');
    apps[app] = {};
    for (const mode of modes) {
        const {program, rows} = compile(contexts[mode], src, combined);
        if (app === 'fixture') programs[mode] = program;
        const instrumentation = compile(counted[mode], src, combined).program;
        const compact = mode === 'current' ? compile(original, src, combined).program : null;
        if (compact) assert.equal(sha(program.image), sha(compact.image), app + ' current control');
        apps[app][mode] = {words: program.image.length/4, sha256: sha(program.image), checks: markers(instrumentation),
            proofAttempts: Object.values(rows).reduce((acc, row) => ({
                proven: acc.proven + row.proven, examined: acc.examined + row.examined,
                exhausted: acc.exhausted + row.exhausted,
            }), {proven: 0, examined: 0, exhausted: 0})};
        if (combined) apps[app][mode].previewAppend = rows.editorPreviewAppend;
        if (app === 'fixture') apps[app][mode].checksByFunction = Object.fromEntries(
            Object.keys(instrumentation.entries).map(name => [name, markers(instrumentation, name)]));
    }
}
const expected = apps.fixture;
for (const name of ['missingLower','nonstrict','disjunction','different','changedIndex','changedText',
    'joinedIndex','joinedGuard','callEffect','fieldEffect','logicEffect','loopEffect','loopRecord','budget']) {
    assert(expected.current.checksByFunction[name] > 0, name);
    for (const mode of modes) assert.equal(expected[mode].checksByFunction[name], expected.current.checksByFunction[name], mode+' '+name);
}
assert.equal(expected.direct.checksByFunction.direct, 1);
assert.equal(expected.bounded.checksByFunction.direct, 1);
assert.equal(expected.current.checksByFunction.bounded, 2);
assert.equal(expected.direct.checksByFunction.bounded, 2);
assert.equal(expected.bounded.checksByFunction.bounded, 1);
assert.equal(expected.bounded.checksByFunction.loop, 1);
assert.equal(expected.bounded.checksByFunction.rhs, 0);
assert(expected.bounded.proofAttempts.exhausted > 0);

const {instance: {exports}} = await WebAssembly.instantiate(contexts.current.typedWasm.compile(fixture).bytes);
const input = new Uint8Array(128);
const data = new DataView(input.buffer);
for (const [ptr, units] of [[32,[80,0xfedc,0xd83d,0xde00]],[64,[1]],[96,[]]]) {
    data.setUint32(ptr, units.length, true);
    units.forEach((unit, i) => data.setUint16(ptr+4+i*2, unit, true));
}
const vectors = [];
for (const i of [-2147483648,-1,0,1,3,4,2147483647]) {
    for (const ptr of [32,64,96]) vectors.push(['direct',[ptr,i]]);
    for (const end of [-1,0,1,3,4,5]) {
        for (const name of ['bounded','missingLower','nonstrict','loop','rhs','budget'])
            vectors.push([name,[32,i,end]]);
    }
    vectors.push(['disjunction',[32,i]],['different',[32,64,i]],['changedIndex',[32,i,4]],
        ['changedText',[32,64,i]],['joinedIndex',[32,i,4,0]],['joinedIndex',[32,i,4,1]],
        ['joinedGuard',[32,i]],['callEffect',[32,32,i]],['fieldEffect',[32,32,i]],
        ['logicEffect',[32,32,i]],['loopEffect',[32,32,i,4]],['loopRecord',[32,32,i,4]]);
}
const memory = new Uint8Array(exports.memory.buffer,0,input.length);
let traps = 0;
for (const [name,args] of vectors) {
    memory.set(input);
    let value, trap = false;
    try { value = exports[name](...args); }
    catch (error) { assert(error instanceof WebAssembly.RuntimeError); trap = true; traps++; }
    for (const mode of modes) {
        const actual = runRv32(programs[mode],name,args,[],{},input);
        assert.equal(actual.trap,trap,mode+' '+name+' '+args);
        assert.equal(actual.result,value,mode+' '+name+' '+args);
        assert.deepEqual(actual.bytes,memory,mode+' '+name+' '+args);
    }
}
console.log(JSON.stringify({apps, fixture:{cases:vectors.length,traps}}, null, 2));
