// Node host micro-experiment. The specialized writer never calls the reference encoder.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const referencePath = new URL('../../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js', import.meta.url);
const reference = vm.runInThisContext(readFileSync(referencePath, 'utf8') + '\nbinaryScreen');
const keys = ['label', 'score', 'tail'];
const permanent = [...keys, '\ue000'].map(text => Buffer.from(text));
const header = Buffer.from([80, 83, 73, 88, 1, 0]);
const rootSize = 17; // 2 bytes plus three (2-byte ID, 3-byte ref) pairs
const tailPrefix = Buffer.from([3, 0, 0, 0, 32, 7, 0, 48]); // count, true, 7
const tailSize = tailPrefix.length + 3;
const small = n => Number.isInteger(n) && n >= -524288 && n <= 524287;
const input = (label, score) => ({ label, score, tail: [true, 7, '\ue000'] });
function ref(bytes, offset, tag, payload) {
    bytes.writeUIntLE(tag * 0x100000 + payload, offset, 3);
}

// Manually residualized for the one declared layout pictured in the report.
function write(label, score) {
    if (typeof label !== 'string' || !label.isWellFormed()) throw Error('utf8');
    if (!Number.isFinite(score)) throw Error('number');
    const valueBytes = Buffer.from(label);
    if (valueBytes.length > 2048) throw Error('string-cap');
    let rank = permanent.findIndex(text => Buffer.compare(text, valueBytes) >= 0);
    if (rank < 0) rank = permanent.length;
    const alias = rank < permanent.length && permanent[rank].equals(valueBytes);
    const dictionary = permanent.slice();
    if (!alias) dictionary.splice(rank, 0, valueBytes);
    const id = i => i + Number(!alias && i >= rank);
    const pool = 13 + 2 * (dictionary.length + 1);
    const root = pool + dictionary.reduce((size, text) => size + text.length, 0);
    const indirect = !small(score);
    const tail = root + rootSize + (indirect ? 8 : 0);
    const bytes = Buffer.alloc(tail + tailSize);
    header.copy(bytes);
    bytes.writeUInt16LE(bytes.length, 6);
    bytes.writeUInt16LE(dictionary.length, 8);
    ref(bytes, 10, 7, root);
    let next = pool;
    for (const [i, text] of dictionary.entries()) {
        bytes.writeUInt16LE(next, 13 + 2 * i);
        text.copy(bytes, next);
        next += text.length;
    }
    bytes.writeUInt16LE(root, 13 + 2 * dictionary.length);
    bytes.writeUInt16LE(keys.length, root);
    for (const [i] of keys.entries()) bytes.writeUInt16LE(id(i), root + 2 + 5 * i);
    ref(bytes, root + 4, 5, rank);
    if (indirect) {
        ref(bytes, root + 9, 4, root + rootSize);
        bytes.writeDoubleLE(score, root + rootSize);
    } else {
        ref(bytes, root + 9, 3, score & 0xfffff);
    }
    ref(bytes, root + 14, 6, tail);
    tailPrefix.copy(bytes, tail);
    ref(bytes, tail + 8, 5, id(3));
    return bytes;
}

function inspect(bytes) {
    const root = bytes.readUIntLE(10, 3) & 0xfffff;
    const ids = keys.map((_, i) => bytes.readUInt16LE(root + 2 + 5 * i));
    const scoreRef = bytes.readUIntLE(root + 9, 3);
    return {bytes: bytes.length, dictionaryCount: bytes.readUInt16LE(8), root, keyIds: ids,
        labelId: bytes.readUIntLE(root + 4, 3) & 0xfffff, scoreTag: scoreRef >>> 20,
        tail: bytes.readUIntLE(root + 14, 3) & 0xfffff};
}

const labels = ['', 'aa', 'zz', 'label', 'score', 'tail', '\ue000', '\u{10000}', '🚀',
    'labe', 'label\0', 'label!', 'm', 's', 't', 'ta', 'tailz', '\0', '\0withnul',
    'caf\u00e9', 'cafe\u0301', 'x'.repeat(2048), 'é'.repeat(1024)];
const scores = [-2147483648, -524289, -524288, -7, -0, 0, 7, 524287, 524288,
    2147483647, 0.5, Number.MIN_VALUE, Number.MAX_VALUE];
for (const label of labels) {
    for (const score of scores) {
        const got = write(label, score);
        assert.deepEqual(got, Buffer.from(reference.encode(input(label, score))));
        const reader = reference.admit(got);
        assert.equal(reader.path(['label']), label);
        assert.equal(reader.path(['score']), score || 0);
        assert.equal(reader.path(['tail', 2]), '\ue000');
    }
}
const invalid = [['\ud800', 0, 'utf8'], ['\udc00', 0, 'utf8'], ['x'.repeat(2049), 0, 'string-cap'],
    ['é'.repeat(1025), 0, 'string-cap'], ['', Infinity, 'number'], ['', NaN, 'number']];
for (const [label, score, message] of invalid) {
    assert.throws(() => write(label, score), { message });
    assert.throws(() => reference.encode(input(label, score)), { message });
}

// Isolate the observed-body assumption: give it a *correct* header and pool.
const trained = write('zz', 524287);
const heldOut = write('aa', 524287);
const stale = Buffer.from(heldOut);
const staleRoot = inspect(stale).root;
assert.equal(staleRoot, inspect(trained).root);
trained.copy(stale, staleRoot, staleRoot);
const staleView = reference.admit(stale);
assert.notDeepEqual(stale, heldOut);
assert.equal(staleView.path(['label']), 524287);
const few = [['zz', 524287], ['aa', 524287], ['label', 524287], ['lengthy', 524287],
    ['aa', 524288], ['\ue000', 7], ['\u{10000}', 7]];
const evidence = {validCases: labels.length * scores.length, invalidCases: invalid.length,
    examples: few.map(([label, score]) => ({label, score, ...inspect(write(label, score))})),
    staleBody: {oracleLabel: 'aa', admittedLabel: staleView.path(['label']),
        admittedKeys: Object.keys(staleView.view()), wireDifferences: stale.reduce(
            (count, byte, index) => count + Number(byte !== heldOut[index]), 0)},
    utfOrder: {utf16: ['\ue000', '\u{10000}'].sort(),
        utf8: ['\ue000', '\u{10000}'].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))}};
console.log(JSON.stringify(evidence, null, 2));
