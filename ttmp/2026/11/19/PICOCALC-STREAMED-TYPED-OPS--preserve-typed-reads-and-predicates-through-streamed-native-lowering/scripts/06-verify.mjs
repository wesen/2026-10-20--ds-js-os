#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work] = process.argv.slice(2);
assert(work, 'usage: node 06-verify.mjs <work>');
const day = new URL('../../', import.meta.url);
const [branch] = readdirSync(day).filter(name => name.startsWith('PICOCALC-RV32-BRANCH--'));
const source = readFileSync(new URL(branch + '/scripts/07-rv32.mjs', day), 'utf8');
const marker = 'else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));';
assert.equal(source.split(marker).length, 2);
const emulator = source.replace(marker, `else if (f3 === 1 && f7 === 0) x[rd] = a << ((w >>> 20) & 31);
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 5 && f7 === 0x20) x[rd] = a >> ((w >>> 20) & 31);
            ${marker}`);
const {runRv32} = await import('data:text/javascript;base64,' + Buffer.from(emulator).toString('base64'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const names = ['staged', 'observe', 'direct'];
const contexts = {};
for (const lane of names) {
    const ctx = contexts[lane] = vm.createContext({});
    for (const part of ['wasm', 'rv32', 'world'])
        vm.runInContext(readFileSync(join(work, 'lanes', lane, 'typed', part + '.js'), 'utf8'), ctx);
}

function compile(lane, source, world = false, streaming = true) {
    const ctx = contexts[lane];
    const stats = {functions: 0, cells: 0, maxFunctionCells: 0, stringReads: 0, bufferReads: 0, predicates: 0};
    const observe = fn => {
        const code = fn.code;
        stats.functions++;
        stats.cells += code.length;
        stats.maxFunctionCells = Math.max(stats.maxFunctionCells, code.length);
        for (let pos = 0; pos < code.length;) {
            const op = code[pos++];
            if (op === 256) {
                stats[code[pos] % 2 ? 'bufferReads' : 'stringReads']++;
                pos += lane === 'direct' ? 1 : 2;
            } else if (op === 257) {
                stats.predicates++;
                pos += 4;
            } else if ([0x02,0x03,0x04,0x0c,0x0d,0x10,0x20,0x21,0x41].includes(op)) pos++;
            else if ([0x28,0x2f,0x36,0x3b].includes(op)) pos += 2;
        }
    };
    const compileFunctions = ctx.typedWasm.compileFunctions;
    let wasm;
    ctx.typedWasm.compileFunctions = (src, base, imports, limit, numeric, consume) => {
        if (streaming) {
            const parsed = compileFunctions(src, base, imports, limit);
            wasm = sha(JSON.stringify(parsed.functions.map(fn => fn.body)));
        }
        if (consume) return compileFunctions(src, base, imports, limit, numeric, fn => { observe(fn); consume(fn); });
        const parsed = compileFunctions(src, base, imports, limit, numeric);
        for (const fn of parsed.functions) observe(fn);
        return parsed;
    };
    const options = {streamFunctions: streaming};
    try {
        if (!world) {
            const program = ctx.typedRv32.compile(source, [], undefined, options);
            return {program, stats, wasm};
        }
        const link = ctx.typedRv32.linkSlot;
        ctx.typedRv32.linkSlot = program => program;
        try {
            const program = ctx.compileTypedWorldRv32(source, null, options);
            return {program, stats, wasm};
        }
        finally { ctx.typedRv32.linkSlot = link; }
    } finally {
        ctx.typedWasm.compileFunctions = compileFunctions;
    }
}

const fixture = [
    'record Trace { seen: i32; }',
    'function note(p: Trace, i: i32): i32 { p.seen = p.seen + 1; return i; }',
    'function read(s: string, i: i32): i32 { return s.charCodeAt(i); }',
    'function choose(s: string, p: Trace, a: i32, i: i32): i32 { if (a < 2 && s.charCodeAt(note(p, i)) >= 40000) return 256; return 257; }',
    'function either(s: string, p: Trace, a: i32, i: i32): i32 { if (!(a < 2) || s.charCodeAt(note(p, i)) >= 40000) return 256; return 257; }',
    'function boolValue(a: i32, b: i32): bool { return a >= b; }',
    'function loop(s: string, i: i32): i32 { let n = i; let sum = 0; while (!(n >= s.length)) { sum = sum + s.charCodeAt(n); n = n + 1; } return sum; }',
    'function switchReceiver(a: string, b: string, i: i32): i32 { let s = a; if (i > 0) { s = b; } return s.charCodeAt(i); }',
];
for (const depth of [0, 4, 5, 6, 10]) {
    const left = Array.from({length: depth}, (_, i) => `${i + 1} + (`).join('');
    fixture.push(`function buffer${depth}(b: buffer, p: Trace, i: i32): i32 { return ${left}b.charCodeAt(note(p, i))${')'.repeat(depth)}; }`);
}

const appSource = app => readFileSync(join(work, 'staged/sources', app, 'app.typed'), 'utf8');
const apps = {};
for (const [app, src] of Object.entries({files: appSource('files'), agenda: appSource('agenda'),
    editor: appSource('editor'), fixtures: fixture.join('\n')})) {
    const world = app === 'editor';
    const variants = Object.fromEntries(names.map(lane => [lane, compile(lane, src, world)]));
    const canonical = program => ({
        image: sha(program.image), entries: JSON.stringify(program.entries),
        relocations: JSON.stringify(program.relocations), records: JSON.stringify(program.records),
        signatures: JSON.stringify(program.signatures), importCount: program.importCount,
    });
    assert.deepEqual(canonical(variants.staged.program), canonical(variants.observe.program), app + ' observation');
    for (const lane of names) {
        const {program} = compile(lane, src, world, false);
        assert.deepEqual(canonical(program), canonical(variants[lane].program), app + ' ' + lane + ' buffering');
        assert.equal(variants[lane].wasm, variants.staged.wasm, app + ' ' + lane + ' Wasm bodies');
    }
    apps[app] = Object.fromEntries(names.map(lane => {
        const {program, stats} = variants[lane];
        return [lane, {words: program.image.length / 4, sha256: sha(program.image), ...stats}];
    }));
}

const src = fixture.join('\n');
const programs = Object.fromEntries(names.map(lane => [lane, compile(lane, src).program]));
const {instance: {exports}} = await WebAssembly.instantiate(contexts.staged.typedWasm.compile(src).bytes);
const input = new Uint8Array(160);
const mem = new DataView(input.buffer);
for (const [ptr, units] of [[32, [0xfedc, 0xd83d, 0xde00]], [64, [255, 128]], [96, []]]) {
    mem.setUint32(ptr, units.length, true);
    units.forEach((unit, i) => mem.setUint16(ptr + 4 + i * 2, unit, true));
}
const indices = [-2147483648, -1, 0, 1, 2, 3, 2147483647];
const cases = [];
for (const i of indices) {
    cases.push(['read', [32,i]], ['read', [96,i]], ['loop', [32,i]], ['switchReceiver', [32,64,i]]);
    for (const a of [1, 2, 3]) {
        cases.push(['choose', [32,128,a,i]], ['either', [32,128,a,i]], ['boolValue', [a,i]]);
    }
    for (const depth of [0, 4, 5, 6, 10]) cases.push(['buffer' + depth, [32,128,i]]);
}
const steps = Object.fromEntries(names.map(lane => [lane, 0]));
const oracleMemory = new Uint8Array(exports.memory.buffer, 0, input.length);
let traps = 0;
for (const [fn, args] of cases) {
    oracleMemory.set(input);
    let value, trap = false;
    try { value = exports[fn](...args); }
    catch (error) {
        assert(error instanceof WebAssembly.RuntimeError, error);
        trap = true;
        traps++;
    }
    for (const lane of names) {
        const actual = runRv32(programs[lane], fn, args, [], {}, input);
        assert.equal(actual.trap, trap, `${lane} ${fn}(${args}) trap`);
        assert.equal(actual.result, value, `${lane} ${fn}(${args}) return`);
        assert.deepEqual(actual.bytes, oracleMemory, `${lane} ${fn}(${args}) mutation`);
        steps[lane] += actual.steps;
    }
}
console.log(JSON.stringify({apps, differential: {cases: cases.length, traps, steps}}, null, 2));
