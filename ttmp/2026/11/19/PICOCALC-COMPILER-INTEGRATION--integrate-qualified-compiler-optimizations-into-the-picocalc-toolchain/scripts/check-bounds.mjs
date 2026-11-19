import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { runRv32 } from '../../PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/scripts/lowering/rv32.mjs';

const [snapshots, nativeReactors] = process.argv.slice(2);
assert(snapshots, 'pass a directory with the pinned compiler snapshots and optionally native reactors');
const read = file => readFileSync('picocalc-os/' + file);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const controlRevision = '4452064';
const candidateRevision = 'e082ec3';
function compilerAt(revision) {
    const compiler = {};
    for (const module of ['typed-wasm', 'typed-rv32']) {
        compiler[module] = readFileSync(join(snapshots, revision + '-' + module + '.js'));
    }
    return compiler;
}

function context(compiler) {
    const ctx = vm.createContext();
    for (const [module, source] of Object.entries(compiler)) {
        vm.runInContext(source.toString(), ctx, { filename: 'compiler/' + module + '.js' });
    }
    for (const file of ['compiler/typed-world.js',
        'worlds/files/compile.js', 'worlds/agenda/compile.js']) {
        vm.runInContext(read(file).toString(), ctx, { filename: file });
    }
    return ctx;
}

const controlSource = compilerAt(controlRevision);
const candidateSource = compilerAt(candidateRevision);
const control = context(controlSource);
const candidate = context(candidateSource);

function typedChecks(ctx, source, imports = [], maxSourceLength) {
    const sizes = new Map([
        [0x02, 2], [0x03, 2], [0x04, 2], [0x0c, 2], [0x0d, 2], [0x10, 2],
        [0x20, 2], [0x21, 2], [0x28, 3], [0x2f, 3], [0x36, 3], [0x3b, 3], [0x41, 2],
    ]);
    const signedAndControl = new Set([0x00, 0x05, 0x0b, 0x0f, 0x1a, 0x45, 0x46, 0x48, 0x4a, 0x4c,
        0x4e, 0x4f, 0x6a, 0x6b, 0x6c, 0x6d, 0x6f, 0x74, 0x75]);
    const imported = Array.from(imports, (signature, index) => ({ ...signature, index }));
    const { functions } = ctx.typedWasm.compileFunctions(source, imported.length, imported, maxSourceLength, true);
    return Object.fromEntries(Array.from(functions, ({ name, code }) => {
        let checks = 0;
        for (let at = 0; at < code.length; at += sizes.get(code[at]) ?? 1) {
            const op = code[at];
            assert(sizes.has(op) || signedAndControl.has(op), 'unexpected fixture opcode ' + op.toString(16));
            if (op === 0x00) checks++;
        }
        return [name, checks];
    }));
}

function nativeTraps({ image }) {
    let traps = 0;
    const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
    for (let at = 0; at < view.byteLength; at += 4) if (view.getUint32(at, true) === 0x00100073) traps++;
    return traps;
}

function stats(before, after) {
    return { before, after, removed: before - after };
}

const editorSDK = {};
const sdk = vm.createContext({ typedWasm: { linkWorld(_src, _runtime, _entries, imports, limit) {
    Object.assign(editorSDK, { imports, limit });
    throw editorSDK;
} } });
vm.runInContext(read('compiler/typed-world.js').toString(), sdk);
assert.throws(() => sdk.compileTypedWorld('', null), error => error === editorSDK);

const files = read('worlds/files/files.typed').toString();
const agenda = ['reminder.typed', 'entry.typed'].map(file => read('worlds/agenda/' + file).toString()).join('\n');
const editor = read('worlds/editor/source.list').toString().trim().split('\n')
    .map(file => read('worlds/editor/' + file).toString()).join('\n');
const worlds = [];
for (const [name, src, reactor, entry, { imports, limit }, expected, removed] of [
    ['Files', files, 'files-reactor', 'compileFiles', {}, 8, { filesCompare: 2 }],
    ['Agenda', agenda, 'agenda-reactor', 'compileAgenda', {}, 35, { entryPut: 1 }],
    ['Editor', editor, 'typed-world-reactor', 'compileTypedWorld', editorSDK, 376, {}],
]) {
    const oldChecks = typedChecks(control, src, imports, limit);
    const newChecks = typedChecks(candidate, src, imports, limit);
    assert.deepEqual(Object.keys(newChecks), Object.keys(oldChecks));
    const changed = Object.fromEntries(Object.keys(oldChecks).filter(fn => oldChecks[fn] !== newChecks[fn])
        .map(fn => [fn, oldChecks[fn] - newChecks[fn]]));
    assert.deepEqual(changed, removed);
    const sum = byFunction => Object.values(byFunction).reduce((a, b) => a + b, 0);
    const explicitChecks = stats(sum(oldChecks), sum(newChecks));
    assert.equal(explicitChecks.before, expected);
    const wasmReactor = read('build/' + reactor + '.wasm');
    const oldWasm = control[entry](src, wasmReactor);
    const newWasm = candidate[entry](src, wasmReactor);
    assert(WebAssembly.validate(oldWasm) && WebAssembly.validate(newWasm), name + ' linked Wasm');
    const oldNative = control.typedRv32.compile(src, imports, limit);
    const newNative = candidate.typedRv32.compile(src, imports, limit);
    const trapSites = stats(nativeTraps(oldNative), nativeTraps(newNative));
    assert.equal(trapSites.removed, explicitChecks.removed, name + ' RV32 trap reduction');
    if (!explicitChecks.removed) {
        assert.deepEqual(Buffer.from(newWasm), Buffer.from(oldWasm));
        assert.deepEqual(Buffer.from(newNative.image), Buffer.from(oldNative.image));
    }
    const row = {
        name, sourceSHA256: sha256(src), removedByFunction: changed,
        explicitChecks, typedRV32Ebreaks: trapSites,
        typedRV32Bytes: stats(oldNative.image.length, newNative.image.length),
        linkedWasm: { ...stats(oldWasm.length, newWasm.length), reactorSHA256: sha256(wasmReactor),
            beforeSHA256: sha256(oldWasm), afterSHA256: sha256(newWasm) },
    };
    if (nativeReactors) {
        const nativeReactor = readFileSync(join(nativeReactors, reactor + '.elf'));
        const oldElf = control[entry + 'Rv32'](src, nativeReactor);
        const newElf = candidate[entry + 'Rv32'](src, nativeReactor);
        assert.equal(oldElf.length, newElf.length, name + ' fixed slot');
        assert.equal(Buffer.from(oldElf).equals(Buffer.from(newElf)), !explicitChecks.removed);
        row.linkedElf = { bytes: newElf.length, reactorSHA256: sha256(nativeReactor),
            beforeSHA256: sha256(oldElf), afterSHA256: sha256(newElf) };
    }
    worlds.push(row);
}

const fixtures = readFileSync(new URL('./bounds-fixtures.typed', import.meta.url), 'utf8');
const cap = `
function deferredCap(text: string): i32 {
    let i = 0;
    let sum = 0;
    while (i < text.length) {
        ${'sum = sum + text.charCodeAt(i);\n'.repeat(20)}
        i = i + 1;
    }
    return sum;
}`;
const src = fixtures + cap;
const before = typedChecks(control, src), after = typedChecks(candidate, src);
const expected = {
    clear: 0, scan: 0, guardLoop: 0, shortAnd: 0, shortOr: 0, guardedWrite: 0, guardedReturn: 0,
    trappingWrite: 1, negative: 1, chain: 1, nonStrict: 1, wrongReceiver: 1, rebound: 1,
    fieldIndex: 1, mathIndex: 1, overflow: 1, assigned: 1, callBarrier: 1, recordAlias: 1,
    bufferAlias: 2, literalAlias: 3, alternate: 1, branchStore: 1, boolEquality: 1,
    nestedAssignment: 1, multipleWrites: 1, mixedLoops: 1, loopHeaderChanges: 0,
    loopBoundFromBefore: 1, leaveLoop: 1, deferredCap: 4,
};
assert.deepEqual(after, expected);
const targets = [control, candidate].map(ctx => ({
    wasm: new WebAssembly.Module(ctx.typedWasm.compile(src).bytes),
    native: ctx.typedRv32.compile(src),
}));

const text = 1024, other = 4096, marker = 8192, alias = text - 4;
function dataFor(input = 'ABC', second = '') {
    const bytes = new Uint8Array(16384);
    const mem = new DataView(bytes.buffer);
    for (const [ptr, contents] of [[text, input], [other, second]]) {
        mem.setUint32(ptr, contents.length, true);
        for (let i = 0; i < contents.length; i++) mem.setUint16(ptr + 4 + 2 * i, contents.charCodeAt(i), true);
    }
    mem.setUint32(alias, 1, true);
    mem.setUint32(marker, 0xbabe, true);
    return bytes;
}

function runWasm(module, fn, args, bytes) {
    const wasm = new WebAssembly.Instance(module).exports;
    const memory = new Uint8Array(wasm.memory.buffer);
    memory.set(bytes);
    let outcome;
    try {
        outcome = { value: wasm[fn](...args) };
    } catch (error) {
        assert(error instanceof WebAssembly.RuntimeError && error.message === 'unreachable',
            fn + ' trapped outside its explicit object check: ' + error.message);
        outcome = { trap: true };
    }
    return { outcome, data: memory.slice(0, bytes.length) };
}

function runNative(program, fn, args, bytes) {
    const result = runRv32(program, fn, args, [], {}, bytes);
    return { outcome: result.trap ? { trap: true } : { value: result.result }, data: result.bytes };
}

let returns = 0, traps = 0;
function compare(fn, args, expectedValue, bytes = dataFor(), words = []) {
    const expected = expectedValue === null ? { trap: true } : { value: expectedValue };
    const variants = targets.flatMap(({ wasm, native }) =>
        [runWasm(wasm, fn, args, bytes), runNative(native, fn, args, bytes)]);
    for (const result of variants) {
        assert.deepEqual(result.outcome, expected, fn + ' ' + args);
        assert.deepEqual(Buffer.from(result.data), Buffer.from(variants[0].data), fn + ' memory');
    }
    const memory = new DataView(variants[0].data.buffer);
    for (const [addr, value] of words) assert.equal(memory.getUint32(addr, true), value, fn + ' explicit word');
    if (expectedValue === null) traps++;
    else returns++;
}

compare('guardedWrite', [text, 0, marker], 7, dataFor('X'), [[text + 4, 65], [marker, 0]]);
compare('guardedWrite', [text, 0, text], 7, dataFor('X'), [[text + 4, 65], [text, 0]]);
compare('guardedWrite', [text, -1, marker], -1, dataFor(), [[marker, 0xbabe]]);
compare('guardedReturn', [text, 1, marker], 66, dataFor(), [[marker, 0xbabe]]);
compare('guardedReturn', [text, 3, marker], 65, dataFor(), [[marker, 0]]);
compare('trappingWrite', [text, 3, marker], null, dataFor(), [[marker, 0xbabe]]);
compare('negative', [text, -1], null);
compare('chain', [text, 2, 3], 67);
compare('nonStrict', [text, 3], null);
compare('wrongReceiver', [text, other, 1], null);
compare('rebound', [text, other, 1], null);
compare('fieldIndex', [text, 1, marker], null);
compare('mathIndex', [text, 1, -1], null);
compare('overflow', [text, 1], null);
compare('assigned', [text, 1], null);
compare('callBarrier', [text, 1, text], null, dataFor(), [[text, 0]]);
compare('recordAlias', [text, 1, text], null, dataFor(), [[text, 0]]);
compare('bufferAlias', [text, 1, alias], null, dataFor(), [[text, 0]]);
compare('literalAlias', [text, 1, alias], null, dataFor(), [[text, 0]]);
compare('alternate', [text, 3, 1], null);
compare('alternate', [text, 3, 0], -1);
compare('branchStore', [text, 1, 1, text], null, dataFor(), [[text, 0]]);
compare('branchStore', [text, 1, 0, text], 66);
compare('boolEquality', [text, 3], null);
compare('nestedAssignment', [text, 1], null);
compare('nestedAssignment', [text, 0], 198);
const huge = dataFor();
new DataView(huge.buffer).setUint32(text, 2147483647, true);
compare('multipleWrites', [text], null, huge);
compare('mixedLoops', [text, other], 65 + 67 + 88 + 89 + 90, dataFor('ABC', 'XYZ'));
compare('loopHeaderChanges', [text, text], 65, dataFor(), [[text, 0]]);
compare('loopBoundFromBefore', [text, 1, text], null, dataFor(), [[text, 0]]);
compare('leaveLoop', [text, -1], null);
compare('leaveLoop', [text, 0], 65);
compare('deferredCap', [text], 20 * (65 + 66 + 67));

let seed = 0xa502531d;
function next(bound) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 16) % bound;
}
for (let trial = 0; trial < 128; trial++) {
    const size = next(65);
    const pos = next(80) - 8;
    const input = 'A'.repeat(size) + '😀';
    const length = input.length;
    const sum = at => input.slice(at).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const inBounds = pos >= 0 && pos < length;
    const matches = inBounds && input.charCodeAt(pos) === 65;
    const bytes = dataFor(input);
    compare('scan', [text], sum(0), bytes);
    compare('guardLoop', [text, pos], inBounds ? sum(pos) : 0, bytes);
    compare('shortAnd', [text, pos], Number(matches), bytes);
    compare('shortOr', [text, pos], Number(!inBounds || matches), bytes);
}

console.log(JSON.stringify({
    runtime: process.version,
    compilers: {
        control: { revision: controlRevision, wasmSHA256: sha256(controlSource['typed-wasm']),
            rv32SHA256: sha256(controlSource['typed-rv32']) },
        candidate: { revision: candidateRevision, wasmSHA256: sha256(candidateSource['typed-wasm']),
            rv32SHA256: sha256(candidateSource['typed-rv32']) },
    },
    worlds,
    differential: { cases: returns + traps, returns, traps, seed: '0xa502531d', targets: ['Node Wasm', 'RV32IM model'],
        comparedMemoryBytesPerCase: 16384, fixtureChecksBefore: before, fixtureChecksAfter: after },
}, null, 2));
