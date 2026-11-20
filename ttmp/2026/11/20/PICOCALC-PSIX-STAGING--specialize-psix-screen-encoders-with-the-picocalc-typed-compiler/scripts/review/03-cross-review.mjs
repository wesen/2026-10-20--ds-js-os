// Differential checks of the two live research candidates, independent of their fixture drivers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const prior = '../../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js';
const codec = read(prior);
const reference = new Function(codec + '\nreturn binaryScreen')();
// Use the observed writer's official helper binding. The comparator stays unaltered in the oracle.
const marker = 'checkValue, version: 1});';
assert.ok(codec.includes(marker));
const observed = new Function(codec.replace(marker,
    'checkValue, version: 1, experiment: {smallInt, emitUTF8, compareBytes}});') +
    '\n' + read('../runtime/01-observed-shapes.js') + '\nreturn observedPSIX;')();
const runtime = observed.create('adaptive', observed.bounds);
const labels = ['zz', 'aa', 'label', 'score', 'tail', '\ue000', '\u{10000}', '\0', ''];
const scores = [524287, 524288, -524289, -524288, -0, Number.MIN_VALUE];
let observedCases = 0;
for (const score of scores) for (const label of labels) {
    const value = {label, score, tail: [true, 7, '\ue000']};
    assert.deepEqual(runtime.write(value), reference.encode(value));
    observedCases++;
}
for (const score of scores) {
    const reordered = {tail: [true, 7, '\ue000'], score, label: 'zz'};
    assert.deepEqual(runtime.write(reordered), reference.encode(reordered));
    observedCases++;
}
const observedStats = runtime.state();
assert.ok(observedStats.hits > 0 && observedStats.fallback > 0);

// Populate the 90-halfword typed input directly, separately from the static team's packer.
vm.runInThisContext(read('../../../../../../../picocalc-os/compiler/typed-wasm.js'));
vm.runInThisContext(read('../static/01-specialize.js'));
const primitives = read('../static/02-primitives.typed');
const digest = globalThis.psixChessRenderDigest;
const labelsForStatic = ['Chess', '', '0', '!', 'd', '0'.repeat(63) + 'g', '0'.repeat(65)];
const large = [-2147483647, -524289, -524288, 0, 524287, 524288, 2147483647];
const boardPairs = [
    ['0'.repeat(64), '0'.repeat(16)], // strict prefix
    ['0'.repeat(63) + '1', 'a'.repeat(16)], // compare early
    ['0'.repeat(15) + '1' + '0'.repeat(48), '0'.repeat(16)], // agree through byte 14
    ['d' + '0'.repeat(63), 'd'.repeat(16)],
    ['63d'.padEnd(64, '0'), '63d'.padEnd(16, '0')], // leading digest bytes
    ['e' + '0'.repeat(63), '0'.repeat(16)]
];
let staticCases = 0, capacityChecks = 0;
for (const title of labelsForStatic) {
    const source = globalThis.psixGenerateSource(primitives, title);
    const wasm = new WebAssembly.Module(globalThis.typedWasm.compile(source).bytes);
    const {memory, psixEncode} = new WebAssembly.Instance(wasm).exports;
    const bytes = Buffer.from(memory.buffer);
    const outputAt = 512, room = 4096;
    bytes.writeUInt32LE(90, 0);
    bytes.writeUInt32LE(room / 2, outputAt);
    for (const [board, mask] of boardPairs) for (const score of large) {
        const fields = [0, 0, 64, 64, 0, 0, 0, Math.abs(score), score];
        for (let i = 0; i < 64; i++) bytes.writeUInt16LE(parseInt(board[i], 16), 4 + i * 2);
        for (let i = 0; i < 8; i++) bytes.writeUInt16LE(parseInt(mask.slice(i * 2, i * 2 + 2), 16), 132 + i * 2);
        fields.forEach((n, i) => bytes.writeInt32LE(n, 148 + 4 * i));
        const value = {app: 'chess', title, frame: {tree: {v: 1, p: digest, b: board, m: mask, f: fields}, hints: ''}};
        const oracle = Buffer.from(reference.encode(value));
        bytes.fill(0xa5, outputAt + 4, outputAt + 4 + room);
        assert.equal(psixEncode(0, outputAt, oracle.length - 1), -2);
        assert.ok(bytes.subarray(outputAt + 4, outputAt + 4 + room).every(x => x === 0xa5));
        capacityChecks++;
        assert.equal(psixEncode(0, outputAt, oracle.length), oracle.length);
        assert.deepEqual(bytes.subarray(outputAt + 4, outputAt + 4 + oracle.length), oracle);
        // Read-modify-write at the last odd byte must preserve its adjacent byte.
        assert.equal(bytes[outputAt + 4 + oracle.length], 0xa5);
        staticCases++;
    }
}
for (const title of ['0'.repeat(64), '0'.repeat(16)]) {
    assert.throws(() => globalThis.psixGenerateSource(primitives, title), /collide/);
}
console.log(JSON.stringify({observedCases, observedHits: observedStats.hits,
    observedFallbacks: observedStats.fallback, observedInstallations: observedStats.compiled,
    staticCases, compiledWasmModules: labelsForStatic.length, capacityChecks,
    rejectedAmbiguousSchemas: 2}, null, 2));
