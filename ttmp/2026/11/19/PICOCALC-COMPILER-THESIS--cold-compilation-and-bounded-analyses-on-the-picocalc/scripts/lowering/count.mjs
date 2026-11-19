// Run from the repository root: node <path>/count.mjs <baseline.js> [paired samples]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {baselineRevision, loadCompiler, lowererSource} from './compiler-source.mjs';

const baselinePath = process.argv[2];
assert(baselinePath, 'pass the baseline lowerer extracted with git show');
const samples = Number(process.argv[3] ?? 31);
assert(Number.isInteger(samples) && samples > 0);
const root = 'picocalc-os';
const read = path => readFileSync(`${root}/${path}`, 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const compilers = {baseline: loadCompiler(baselinePath), variant: loadCompiler()};
const importRows = [...read('compiler/typed-world.js').matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"\]/g)]
    .map(([, name, params, result]) => ({name, params: params ? params.split(',') : [], result}));
assert(importRows.length > 0, 'read the Editor SDK signatures');

function app(name, files, imports = [], limit = 64 * 1024) {
    const source = files.map(file => read(`worlds/${name}/${file}`) + '\n').join('');
    return {name, source, imports, limit};
}

function count(program, functions) {
    const view = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    const totals = {words: 0, operandLoads: 0, operandStores: 0, moves: 0, maxFrameBytes: 0};
    const rows = {};
    for (const [index, fn] of functions.entries()) {
        const start = program.entries[fn.name];
        const end = index + 1 < functions.length ? program.entries[functions[index + 1].name] : program.image.length;
        const frameBytes = -(view.getUint32(start, true) >> 20);
        const words = (end - start) / 4;
        const row = rows[fn.name] = {words, operandLoads: 0, operandStores: 0, moves: 0, frameBytes};
        const localsBytes = 4 * (fn.params.length + fn.nlocals);
        for (let at = start; at < end; at += 4) {
            const w = view.getUint32(at, true);
            const op = w & 0x7f, rd = (w >>> 7) & 31, rs1 = (w >>> 15) & 31, f3 = (w >>> 12) & 7;
            const loadOffset = w >> 20;
            const storeOffset = ((w >> 25) << 5) | rd;
            if (rs1 === 2 && f3 === 2) {
                if (op === 0x03 && loadOffset >= localsBytes && loadOffset < frameBytes - 4) row.operandLoads++;
                if (op === 0x23 && storeOffset >= localsBytes && storeOffset < frameBytes - 4) row.operandStores++;
            }
            if (op === 0x13 && f3 === 0 && rs1 !== 0 && rd !== rs1 && loadOffset === 0) row.moves++;
        }
        for (const key of ['words', 'operandLoads', 'operandStores', 'moves']) totals[key] += row[key];
        totals.maxFrameBytes = Math.max(totals.maxFrameBytes, frameBytes);
    }
    assert.equal(totals.words * 4, program.image.length);
    return {...totals, codeBytes: program.image.length, imageSha256: digest(program.image), functions: rows};
}

const apps = [
    app('files', ['files.typed']),
    app('agenda', ['reminder.typed', 'entry.typed']),
    app('editor', read('worlds/editor/source.list').trim().split('\n'), importRows, 96 * 1024),
];
const result = {baselineRevision, node: process.version, samples, apps: {}};
result.lowerer = Object.fromEntries(Object.entries({baseline: baselinePath, variant: undefined})
    .map(([name, path]) => {
        const source = lowererSource(path);
        return [name, {bytes: Buffer.byteLength(source), sha256: digest(source)}];
    }));
for (const {name, source, imports, limit} of apps) {
    const imported = imports.map((fn, index) => ({...fn, index}));
    const {functions} = compilers.baseline.typedWasm.compileFunctions(source, imports.length, imported, limit);
    const row = result.apps[name] = {sourceBytes: Buffer.byteLength(source), sourceSha256: digest(source),
        functionCount: functions.length, importCount: imports.length};
    const run = key => compilers[key].typedRv32.compile(source, imports, limit);
    for (const key of ['baseline', 'variant']) {
        row[key] = {...count(run(key), functions), compileMs: []};
        for (let i = 0; i < 10; i++) run(key);
    }
    // Both compilers use the same current frontend and alternate first position.
    for (let i = 0; i < samples; i++) {
        const order = i % 2 ? ['variant', 'baseline'] : ['baseline', 'variant'];
        for (const key of order) {
            const start = performance.now();
            const program = run(key);
            row[key].compileMs.push(Number((performance.now() - start).toFixed(4)));
            assert.equal(program.image.length, row[key].codeBytes);
        }
    }
    for (const key of ['baseline', 'variant']) {
        const ordered = row[key].compileMs.toSorted((a, b) => a - b);
        row[key].medianCompileMs = ordered[Math.floor(ordered.length / 2)];
    }
}
console.log(JSON.stringify(result, null, 2));
