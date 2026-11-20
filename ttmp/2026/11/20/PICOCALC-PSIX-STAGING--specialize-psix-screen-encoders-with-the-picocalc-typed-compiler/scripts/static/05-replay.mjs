import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, mkdirSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInThisContext} from 'node:vm';

import '../../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../../picocalc-os/compiler/typed-rv32.js';
import './01-specialize.js';

const [directory, gccPath, emulatorPath, cjsonPath] = process.argv.slice(2);
assert(directory && gccPath && emulatorPath && cjsonPath,
    'usage: node 05-replay.mjs OUTPUT_DIR RV32_GCC RV32_EMULATOR CJSON_SOURCE_DIR');
const [out, gcc, emulator, cjson] = [directory, gccPath, emulatorPath, cjsonPath].map(p => resolve(p));
mkdirSync(out, {recursive: true});

const here = dirname(fileURLToPath(import.meta.url));
const date = resolve(here, '../../..');
const chess = join(date, 'PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views');
const reference = join(date, 'PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts');
const read = path => readFileSync(path, 'utf8');
const write = (name, contents) => writeFileSync(join(out, name), contents);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const codec = runInThisContext(read(join(reference, '02-binary-screen.js')) + '\nbinaryScreen;');
const chessCapture = join(out, 'chess-replay');
execFileSync(process.execPath, [join(chess, 'scripts/07-replay.mjs'), chessCapture], {stdio:'inherit'});
const recorded = read(join(chessCapture, 'states.ndjson')).trimEnd().split('\n').map(line => JSON.parse(line));
const replay = JSON.parse(read(join(chessCapture, 'replay.json')));
assert.equal(recorded.length, replay.rows.length);
const digest = globalThis.psixChessRenderDigest;
const primitives = read(join(here, '02-primitives.typed'));

function abi(s) {
    const pieces = Array.from(s.b, c => parseInt(c, 16));
    const masks = Array.from(s.m.match(/../g), pair => parseInt(pair, 16));
    const fields = s.f.flatMap(value => [value & 65535, value >>> 16]);
    return [...pieces, ...masks, ...fields];
}
function fixture(name, tree, title = 'Chess') {
    assert.equal(tree.p, digest);
    const payload = {app:'chess', title, frame:{tree, hints:''}};
    const input = abi(tree);
    const wire = codec.encode(payload);
    assert.equal(input.length, 90);
    assert.deepEqual(codec.admit(wire).path(['frame', 'tree', 'f', 8]), tree.f[8]);
    return {name, input, payload, wire:[...wire]};
}
const traced = recorded.map((s, i) => fixture(replay.rows[i].id, s));
write('board-fixtures.json', JSON.stringify(traced, null, 2) + '\n');

// Insert arbitrary admissible snapshot data after the generation step. These
// cases exercise sort relationships, limits and float encodings independently
// of the game replay. Structural validation does not imply a legal position.
function synthetic(name, board, masks, numbers) {
    return fixture(name, {v:1, p:digest, b:board.padEnd(64, '0'),
        m:masks.padEnd(16, '0'), f:[0, 0, 0, 63, 0, 0, 1, ...numbers]});
}
const tests = [
    ...traced,
    synthetic('boundary-inline', '000', '000', [524287, -524288]),
    synthetic('boundary-positive-float-negative-float', '63d6', '63d6', [524288, -524289]),
    synthetic('maximum-i32', '63d9', '63d9', [2147483647, 2147483647]),
    synthetic('minimum-profile-score', 'cab', 'cab', [0, -2147483647]),
    synthetic('directory-before-digest', '63d6a', '63d74', [0, -1]),
    synthetic('directory-after-digest', '63d9', '63d76', [0, -1]),
    synthetic('directory-prefix-b', 'b', 'b1', [0, -1]),
    synthetic('directory-prefix-chess', 'cde', 'cf', [0, -1]),
    synthetic('directory-board-first-same-rank', '0a', '0b', [0, -1]),
    synthetic('directory-masks-first-same-rank', '0b', '0a', [0, -1]),
];
let seed = 0xd7217e91;
function random() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
}
for (let i = 0; i < 64; i++) {
    const pieces = Array(64).fill('0');
    for (let j = 0; j < 32; j++) pieces[random() % 64] = '01234569abcde'[random() % 13];
    const mask = Array.from({length:16}, () => (random() % 16).toString(16)).join('');
    tests.push(synthetic('seeded-domain-' + i, pieces.join(''), mask, [random() >>> 1, random() >> 1]));
}

const source = psixGenerateSource(primitives);
write('chess-psix.typed', source);
const wasm = typedWasm.compile(source).bytes;
const native = typedRv32.compile(source);
assert.deepEqual(typedRv32.compile(source, [], undefined, {streamFunctions:false}).image, native.image);
assert.equal(native.importCount,0);
assert.deepEqual(native.relocations,[]);
write('chess-psix.wasm', wasm);
write('chess-psix.rv32', native.image);

function newWasm(module) {
    assert.deepEqual(WebAssembly.Module.imports(module), []);
    const instance = new WebAssembly.Instance(module).exports;
    const memory = instance.memory.buffer;
    const words = new DataView(memory);
    const addresses = {input:0, output:256};
    const input = new Uint16Array(memory, addresses.input + 4, 90);
    const output = new Uint8Array(memory, addresses.output + 4, 512);
    return {
        input, output,
        init(row, inLength = input.length, capacity = output.length) {
            words.setUint32(addresses.input, inLength, true);
            words.setUint32(addresses.output, capacity / 2, true);
            input.set(row);
            output.fill(0xaa);
        },
        encode: capacity => instance.psixEncode(addresses.input, addresses.output, capacity)
    };
}
const module = new WebAssembly.Module(wasm);
const run = newWasm(module);
const guard = () => assert(run.output.every(b => b === 0xaa));
for (const row of tests) {
    const bytes = row.wire.length;
    run.init(row.input);
    assert.equal(run.encode(bytes - 1), -2, row.name); guard();
    run.init(row.input, 90, Math.ceil(bytes / 2) * 2 - 2);
    assert.equal(run.encode(bytes), -2, row.name); guard();
    run.init(row.input, 90, Math.ceil(bytes / 2) * 2);
    assert.equal(run.encode(bytes), bytes, row.name);
    assert.deepEqual([...run.output.subarray(0, bytes)], row.wire, row.name);
    assert(run.output.subarray(bytes).every(b => b === 0xaa), row.name + ' untouched tail');
    assert.deepEqual([...run.input], row.input, row.name + ' untouched input');
}
const malformed = [
    ['short input', (_, run) => run.init(traced[0].input, 89)],
    ['oversized input', (_, run) => run.init(traced[0].input, 91)],
    ['bad piece', row => row[0] = 7],
    ['piece above 14', row => row[0] = 15],
    ['extra piece', row => row[32] = 1],
    ['mask above 255', row => row[67] = 256],
    ['no selection with destinations', row => row[67] = 1],
    ['cursor above 63', row => row[72] = 64],
    ['negative selected', row => {row[74] = 65535; row[75] = 65535;}],
    ['unpaired last move', row => row[76] = 0],
    ['status above 8', row => row[80] = 9],
    ['hint above 1', row => row[82] = 2],
    ['depth above 32', row => row[84] = 33],
    ['negative node count', row => row[87] = 65535],
    ['score below profile floor', row => row[89] = 32768],
];
for (const [name, mutate] of malformed) {
    const row = traced[0].input.slice();
    run.init(row);
    mutate(row, run);
    if (!name.endsWith('input')) run.input.set(row);
    assert.equal(run.encode(512), -1, name);
    guard();
}

// A changed or deduplicated literal exercises regeneration against another layout.
const titleWitnesses = [];
for (const title of ['Pico Chess', 'chess']) {
    const changed = psixGenerateSource(primitives, title);
    const changedNative = typedRv32.compile(changed);
    const guest = newWasm(new WebAssembly.Module(typedWasm.compile(changed).bytes));
    const expected = fixture('title-change', recorded[0], title);
    guest.init(expected.input);
    const count = guest.encode(512);
    assert.deepEqual([...guest.output.subarray(0, count)], expected.wire);
    assert.notEqual(hash(changedNative.image), hash(native.image));
    titleWitnesses.push({title, nativeBytes:changedNative.image.length, sha256:hash(changedNative.image), wireBytes:count});
}
assert.throws(() => psixGenerateSource(primitives, '0'.repeat(16)), /collide/);

const fixtureStride = 4 + 2 * 90 + 4 + 512;
const fixtureImage = Buffer.alloc(fixtureStride * tests.length);
for (const [i, row] of tests.entries()) {
    const at = i * fixtureStride;
    fixtureImage.writeUInt32LE(row.input.length, at);
    row.input.forEach((unit, j) => fixtureImage.writeUInt16LE(unit, at + 4 + 2 * j));
    fixtureImage.writeUInt32LE(row.wire.length, at + 184);
    fixtureImage.set(row.wire, at + 188);
}
write('fixture-image.bin', fixtureImage);
write('chess-psix.S', [
    '.section .text.psix,"ax"', '.balign 4', 'program:',
    '.incbin ' + JSON.stringify(join(out, 'chess-psix.rv32')),
    '.global psixEncode', '.set psixEncode, program + ' + native.entries.psixEncode,
    '.section .rodata,"a"', '.balign 4', '.global fixtures_start,fixtures_end',
    'fixtures_start:', '.incbin ' + JSON.stringify(join(out,'fixture-image.bin')), 'fixtures_end:', '',
].join('\n'));
const elf = join(out, 'chess-psix.elf');
const linkStart = performance.now();
execFileSync(gcc, ['-march=rv32im', '-mabi=ilp32', '-O2', '-nostdlib', '-fno-builtin',
    '-msmall-data-limit=0', '-mno-relax', '-Wl,-Ttext=0x10000', '-Wl,-e,_start',
    join(here,'03-rv32-driver.c'), join(out,'chess-psix.S'), '-o', elf], {stdio:'inherit'});
const externalLinkMs = performance.now() - linkStart;
const instructionBytes = execFileSync(emulator, [elf], {stdio:['ignore', 'pipe', 'pipe']});
assert.equal(instructionBytes.length, 8 * tests.length);
const counts = tests.map((row, i) => ({name:row.name, bytes:row.wire.length, instructions:Number(instructionBytes.readBigUInt64LE(8 * i))}));

const nativeReference = join(out,'reference-host');
execFileSync('cc', ['-std=gnu11', '-O2', '-I'+reference, '-I'+cjson,
    join(here,'04-native-reference.c'), join(cjson,'cJSON.c'),'-lm','-o',nativeReference], {stdio:'inherit'});
write('reference-input.ndjson', tests.map(row => JSON.stringify(row.payload)+'\n').join(''));
const referenceInput = openSync(join(out, 'reference-input.ndjson'), 'r');
let confirmation;
try {
    confirmation = execFileSync(nativeReference, {stdio:[referenceInput, 'pipe', 'pipe']});
} finally {
    closeSync(referenceInput);
}
let byte = 0;
for (const row of tests) {
    const length = confirmation.readUInt16LE(byte); byte += 2;
    assert.equal(length, row.wire.length, row.name);
    assert.deepEqual([...confirmation.subarray(byte, byte + length)], row.wire, row.name);
    byte += length;
}
assert.equal(byte, confirmation.length);

const timed = (n, fn) => {
    const start = performance.now();
    for (let i = 0; i < n; i++) fn(i);
    return (performance.now() - start) / n;
};
const installation = [];
for (let i = 0; i < 9; i++) {
    let bytes, linked;
    const generateMs = timed(1, () => psixGenerateSource(primitives));
    const rv32CompileMs = timed(1, () => typedRv32.compile(source));
    const wasmCompileMs = timed(1, () => {bytes = typedWasm.compile(source).bytes;});
    const wasmModuleMs = timed(1, () => {linked = new WebAssembly.Module(bytes);});
    const wasmInstantiateMs = timed(1, () => {new WebAssembly.Instance(linked);});
    installation.push({generateMs, rv32CompileMs, wasmCompileMs, wasmModuleMs, wasmInstantiateMs});
}
const prepared = traced.map(row => {
    const runner = newWasm(module);
    runner.init(row.input);
    return runner;
});
let checksum = 0;
const runs = 2000;
const hotWasm = i => {checksum += prepared[i % prepared.length].encode(512);};
const hotReference = i => {checksum += codec.encode(traced[i % traced.length].payload).length;};
timed(runs, hotWasm);
timed(runs, hotReference);
const hot = [];
for (let i = 0; i < 9; i++) {
    const samples = {};
    for (const [name, callback] of i % 2 ?
        [['jsReference',hotReference], ['wasmPacked',hotWasm]] : [['wasmPacked',hotWasm], ['jsReference',hotReference]]) {
        samples[name + 'Us'] = timed(runs, callback) * 1000;
    }
    hot.push(samples);
}
const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length/2)];
const receipt = {
    environment:{node:process.version, arch:process.arch,
        cpu:readFileSync('/proc/cpuinfo','utf8').match(/model name\s*:\s*(.*)/)?.[1] ?? 'unknown',
        gcc:execFileSync(gcc,['--version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n')[0]},
    input:{events:replay.events, tracedFrames:traced.length, changedFrames:replay.changedPosts,
        groups:Object.keys(replay.groups).length, traceSha256:replay.traceSha256,
        fixtureSha256:hash(readFileSync(join(out, 'board-fixtures.json'))), maxPackedWireBytes:Math.max(...tests.map(row=>row.wire.length))},
    correctness:{matchingWasmRv32JsAndC:tests.length, wasmMalformed:malformed.length, rv32Malformed:1,
        packedOutputShortCallerAndBacking:2 * tests.length, titleWitnesses},
    bytes:{source:Buffer.byteLength(source), wasm:wasm.length, rv32:native.image.length, elf:readFileSync(elf).length},
    sha256:{source:hash(source), wasm:hash(wasm), rv32:hash(native.image)},
    endpoint:{
        installation:'host Node in-process available compiler; stage, emit, Wasm validate, Wasm instantiate timed separately',
        rv32ExternalLink:'host process wall time for static freestanding ELF wrapper, including compiler spawn',
        rv32Instructions:'CJI emulator count between adjacent ecall-10 markers around one psixEncode call plus surrounding RISC-V C instructions',
        wasmPacked:'V8 Wasm call for preloaded state through domain checks to packed bytes in preallocated memory',
        jsReference:'resident JS tree through PSIX encode to newly allocated Uint8Array, V8',
    },
    externalLinkMs, installation, hotRunsPerSample:runs, hot, checksum, counts,
    medians:{installation:Object.fromEntries(Object.keys(installation[0]).map(k => [k,median(installation.map(s => s[k]))])),
        hot:Object.fromEntries(Object.keys(hot[0]).map(k => [k,median(hot.map(s => s[k]))])),
        tracedRv32Instructions:median(counts.slice(0,traced.length).map(row=>row.instructions))},
};
write('host-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({input:receipt.input, correctness:receipt.correctness, bytes:receipt.bytes, medians:receipt.medians}));
