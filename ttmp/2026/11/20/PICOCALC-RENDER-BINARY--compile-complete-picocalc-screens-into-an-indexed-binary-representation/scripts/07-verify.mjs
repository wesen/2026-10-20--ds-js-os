import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const [capsule, output, ...inputs] = process.argv.slice(2);
if (!capsule || !output || inputs.length !== 4) throw Error('usage: 07-verify.mjs capsule.js output-dir sysmon chess snake editor');
const here = dirname(fileURLToPath(import.meta.url));
const cx = vm.createContext({labMicros: () => 0});
vm.runInContext(readFileSync(capsule, 'utf8') + '\n' + readFileSync(join(here, '06-retention.js'), 'utf8'), cx);
const expose = vm.runInContext('({binaryFixtures, binaryScreen, screenPayload, admitJSON, createBinaryView, paintScreen, makeScreenRetention, fullWeight, renderLabRun})', cx);
const {binaryScreen: codec} = expose;
const ByteArray = vm.runInContext('Uint8Array', cx);
const SHA = value => createHash('sha256').update(value).digest('hex');

function equivalent(actual, expected) {
    if (expected === null || typeof expected !== 'object') { assert.strictEqual(actual, expected); return; }
    assert.strictEqual(Array.isArray(actual), Array.isArray(expected));
    if (Array.isArray(expected)) {
        assert.strictEqual(actual.length, expected.length);
        expected.forEach((value, index) => equivalent(actual[index], value));
    } else {
        const keys = Object.keys(expected).sort();
        assert.deepEqual(Object.keys(actual).sort(), keys);
        keys.forEach(key => equivalent(actual[key], expected[key]));
    }
}
function dataView(wire) { return new DataView(wire.buffer, wire.byteOffset, wire.byteLength); }
function edited(wire, change) {
    const candidate = new ByteArray(wire);
    change(candidate, dataView(candidate));
    return candidate;
}
function ref(bytes, at) { return bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16; }
function putRef(bytes, at, tag, arg) {
    bytes[at] = arg;
    bytes[at + 1] = arg >>> 8;
    bytes[at + 2] = (tag << 4) | (arg >>> 16);
}

const pass = [];
function test(name, body) { body(); pass.push(name); }
const spec = {a: ['zero', '\u0000', 'é', '東京', '🧪', 1 / 3, -524288, 524287, -524289, 524288, true, false, null],
    'a\u0000': 0, '𐐀': 'non-ASCII key', '': 'private use', '???': '', nest: {[Symbol('ignored')]: 1}};
const simple = codec.encode(spec);
test('all data kinds, signed boundary, binary64, supplementary Unicode and embedded zero', () => {
    equivalent(codec.admit(simple).view(), spec);
    const value = codec.admit(simple);
    assert.equal(value.path(['a', 4]), '🧪');
    assert.equal(value.path(['a', 5]), 1 / 3);
    assert.equal(value.path(['𐐀']), 'non-ASCII key');
    assert.equal(value.path(['a', -1]), undefined);
    assert.equal(value.path(['a', 15]), undefined);
    assert.equal(value.path(['a', 0, 'length']), undefined);
    assert.equal(value.path(['missing']), undefined);
    assert.equal(value.path(['a', 1, 't']), undefined);
});
test('non-zero input subarray and immutable owned bytes', () => {
    const padded = new ByteArray(simple.length + 19);
    padded.set(simple, 7);
    const owned = codec.admit(padded.subarray(7, 7 + simple.length));
    padded.fill(0);
    equivalent(owned.view(), spec);
    assert.equal(Reflect.set(owned.view(), 'a', 1), false);
    assert.equal(Reflect.deleteProperty(owned.view(), 'a'), false);
    assert.equal(Reflect.defineProperty(owned.view().a, '0', {value: 1}), false);
    assert.equal(Reflect.setPrototypeOf(owned.view(), null), false);
});
test('canonical key order and negative-zero normalization like producer JSON', () => {
    assert.deepEqual(codec.encode({z: -0, a: 524288}), codec.encode({a: 524288, z: 0}));
    assert.equal(codec.admit(codec.encode(-0)).path([]), 0);
    equivalent(codec.admit(codec.encode(JSON.parse('{"__proto__":42,"":true}'))).view(), JSON.parse('{"__proto__":42,"":true}'));
});
test('ordinary limits and agreement on valid neighboring generations', () => {
    const limits = codec.limits;
    const deep = depth => {
        let root = null;
        while (depth--) root = [root];
        return root;
    };
    const limit = (valid, invalid, failure) => {
        codec.admit(codec.encode(valid));
        codec.checkValue(valid);
        assert.throws(() => codec.encode(invalid), failure);
        assert.throws(() => codec.checkValue(invalid), failure);
    };
    limit('é'.repeat(limits.stringBytes / 2), 'é'.repeat(limits.stringBytes / 2) + 'x', /string-cap/);
    limit(deep(limits.depth), deep(limits.depth + 1), /tree-cap/);
    limit(new Array(limits.array).fill(4), new Array(limits.array + 1).fill(4), /array-cap/);
    const fields = Array.from({length: limits.fields + 1}, (_, i) => ['field' + i, null]);
    limit(Object.fromEntries(fields.slice(1)), Object.fromEntries(fields), /field-cap/);
    const rows = Array.from({length: 8}, () => new Array(1023).fill(0));
    limit(rows.map((v, i) => i ? v : v.slice(1)), rows, /tree-cap/);
    const manyStrings = Array.from({length: 5}, (_, i) => Array.from({length: 820}, (_, j) => (i * 820 + j).toString(36)));
    for (let i = 0; i < 4; i++) manyStrings[i].pop();
    limit(manyStrings, manyStrings.concat([['distinct']]), /strings-cap/);
    assert.throws(() => codec.encode(new Array(17).fill(null).map((_, i) => String(i).padStart(2048, 'a'))), /byte-cap/);
    assert.throws(() => codec.admit(new ByteArray(limits.bytes + 1)), /byte-cap/);
    assert.throws(() => codec.encode('\ud800'), /utf8/);
    assert.throws(() => codec.encode({x: Infinity}), /number/);
    assert.throws(() => codec.encode([undefined]), /value-type/);
});
const malformed = [
    ['magic', b => { b[0] = 0; }, /header/],
    ['unsupported version', b => { b[4] = 2; }, /header/],
    ['unknown flags', b => { b[5] = 1; }, /header/],
    ['length mismatch', (b, d) => d.setUint16(6, b.length + 1, true), /header/],
    ['string count cap', (b, d) => d.setUint16(8, 4100, true), /strings-cap/],
    ['bad directory start', (b, d) => d.setUint16(13, 0, true), /string-directory/],
    ['bad UTF-8', (b, d) => { b[d.getUint16(15, true)] = 0xff; }, /utf8|string-order/],
    ['unknown tag', b => putRef(b, 10, 14, 0), /tag/],
    ['nonzero null payload', b => putRef(b, 10, 0, 1), /immediate/],
    ['out-of-range string index', b => putRef(b, 10, 5, 65535), /string-id/],
    ['non-preorder root offset', b => putRef(b, 10, 7, 0), /node-offset/],
    ['object width cap', (b, d) => d.setUint16(ref(b, 10) & 0xfffff, 65, true), /field-cap/],
    ['duplicate key', (b, d) => { const p = (ref(b, 10) & 0xfffff) + 2; d.setUint16(p + 5, d.getUint16(p, true), true); }, /field-order/],
    ['cyclic/aliased child offset', b => { const p = ref(b, 10) & 0xfffff; putRef(b, p + 4, 7, p); }, /node-offset/],
    ['oversize child in valid slot', b => { const p = ref(b, 10) & 0xfffff; putRef(b, p + 4, 4, b.length); }, /float-offset/],
    ['unused trailing bytes', b => putRef(b, 10, 0, 0), /trailing/]
];
for (const [name, change, diagnostic] of malformed)
    test(name, () => assert.throws(() => codec.admit(edited(simple, change)), diagnostic));
test('nonfinite/canonical float encodings', () => {
    const wire = codec.encode(1 / 3);
    const at = ref(wire, 10) & 0xfffff;
    for (const value of [Infinity, NaN, 2, -0]) assert.throws(
        () => codec.admit(edited(wire, (b, d) => d.setFloat64(at, value, true))), /number/);
});
test('every truncation of a mixed tree is rejected', () => {
    for (let i = 0; i < simple.length; i++) assert.throws(() => codec.admit(simple.subarray(0, i)));
});
test('last-good commit, authenticated generation and live pinned old view', () => {
    const diagnostics = [];
    let generation = 4;
    const registry = expose.makeScreenRetention(s => s === 'sysmon' ? generation : undefined,
        (sender, message) => diagnostics.push([sender, message]));
    const auth = {sender: 'sysmon', generation};
    const expected = expose.binaryFixtures.sysmon.payload;
    const wire = codec.encode(expected);
    assert.equal(registry.submit(auth, wire, 'B'), true);
    const pinned = registry.replay(auth.sender);
    assert.equal(registry.submit(auth, wire.subarray(1), 'B'), false);
    assert.equal(registry.submit(auth, codec.encode({...expected, app: 'snake'}), 'B'), false);
    assert.equal(registry.submit(auth, JSON.stringify({...expected, frame: {tree: false, hints: ''}}), 'G'), false);
    assert.equal(registry.submit(auth, '{', 'G'), false);
    assert.equal(registry.submit(auth, ' '.repeat(32769), 'G'), false);
    assert.equal(registry.replay(auth.sender), pinned);
    assert.equal(registry.submit(auth, codec.encode({...expected, title: 'new title'}), 'B'), true);
    assert.equal(registry.replay(auth.sender).title, 'new title');
    assert.equal(pinned.title, expected.title);
    generation++;
    assert.equal(registry.submit(auth, wire, 'B'), false);
    assert.equal(registry.replay(auth.sender), undefined);
    assert.equal(registry.submit({sender: 'sysmon', generation}, wire, 'B'), true);
    registry.revoke(auth.sender);
    assert.equal(registry.replay(auth.sender), undefined);
    assert(diagnostics.every(([sender]) => sender === auth.sender));
    assert.deepEqual(diagnostics.map(([sender, d]) => d).slice(0, 3), ['header', 'screen-envelope', 'screen-tree']);
});

function wireCommands(payload, row) {
    const lines = [];
    const rgb = c => String(c).replace(/^#/, '').replace(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i, '$1$1$2$2$3$3');
    const fb = {
        text: (x, y, s, f, c, max = 0) => lines.push('T ' + [x | 0, y | 0, max | 0, f || 'm', c, Buffer.from(String(s)).toString('hex')].join(' '))
    };
    for (const [name, first] of [['fill', 'F'], ['rect', 'R'], ['line', 'L']])
        fb[name] = (a, b, c, d, color) => lines.push(first + ' ' + [a | 0, b | 0, c | 0, d | 0, rgb(color)].join(' '));
    expose.paintScreen(payload, row, fb);
    return lines.join('\n') + '\n';
}

mkdirSync(output, {recursive: true});
const receipts = {};
for (const input of inputs) {
    const source = readFileSync(input, 'utf8');
    const records = source.trim().split('\n').map(JSON.parse);
    const app = records[0].app;
    const gCommands = [], bCommands = [], evidence = [];
    for (const [index, row] of records.entries()) {
        const original = expose.screenPayload(row);
        const text = JSON.stringify(original);
        const json = expose.admitJSON(text, app);
        const wire = codec.encode(original);
        const candidate = expose.createBinaryView(wire, app).root;
        equivalent(candidate, original);
        const g = wireCommands(json, row), b = wireCommands(candidate, row);
        assert.equal(b, g, row.id);
        // Exercise forwarding damage recovery and startup full paint on one first and middle frame.
        const boundary = index === 0 ? 'X\n' : '';
        const retry = index === Math.floor(records.length / 2);
        const insert = c => boundary + c + (retry ? 'S\n' + c : '') + 'P\n';
        gCommands.push(insert(g));
        bCommands.push(insert(b));
        const base64 = Buffer.from(wire).toString('base64');
        const fallback = JSON.stringify({app, title: row.title, encoding: 'psix-v1-base64', frame: base64});
        const dictionaryEntries = dataView(wire).getUint16(8, true);
        const dictionaryBytes = dataView(wire).getUint16(13 + 2 * dictionaryEntries, true) - 13;
        evidence.push({id: row.id, jsonBytes: Buffer.byteLength(text), rawBinaryBytes: wire.length, dictionaryEntries, dictionaryBytes,
            base64Bytes: base64.length, jsonEnvelopeBytes: Buffer.byteLength(fallback), commandSha256: SHA(g), skippedFlushRetried: retry});
    }
    writeFileSync(join(output, app + '.G.ops'), gCommands.join(''));
    writeFileSync(join(output, app + '.B.ops'), bCommands.join(''));
    const fixture = expose.binaryFixtures[app];
    writeFileSync(join(output, app + '.json'), JSON.stringify(fixture.payload));
    writeFileSync(join(output, app + '.psix'), codec.encode(fixture.payload));
    const control = JSON.parse(expose.renderLabRun(app + '-G', 1));
    for (const arm of ['B', 'P']) {
        const other = JSON.parse(expose.renderLabRun(app + '-' + arm, 1));
        for (const key of Object.keys(control).filter(k => k.endsWith('Hash') || k.endsWith('Commands'))) assert.equal(other[key], control[key]);
    }
    receipts[app] = {frames: records.length, traceSha256: SHA(source), evidence, fixtureChecksums: control};
}
let random = 0x9114, rejected = 0, admitted = 0;
function next() {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return random >>> 0;
}
for (let i = 0; i < 30000; i++) {
    const b = new ByteArray(simple);
    for (let k = 1 + next() % 3; k; k--) b[next() % b.length] = next() & 255;
    let value;
    try { value = codec.admit(b).view(); }
    catch (e) { assert.equal(e.name, 'Error'); rejected++; continue; }
    const canonical = codec.admit(codec.encode(value)).view();
    assert.equal(expose.fullWeight(canonical), expose.fullWeight(value));
    assert.equal(JSON.stringify(canonical), JSON.stringify(value));
    admitted++;
}
writeFileSync(join(output, 'host-checks.json'), JSON.stringify({pass, mutation: {seed: '0x9114', trials: 30000, rejected, admitted}, receipts}, null, 2) + '\n');
console.log(JSON.stringify({passed: pass.length, rejected, admitted, frames: Object.fromEntries(Object.entries(receipts).map(([app, r]) => [app, r.frames]))}));
