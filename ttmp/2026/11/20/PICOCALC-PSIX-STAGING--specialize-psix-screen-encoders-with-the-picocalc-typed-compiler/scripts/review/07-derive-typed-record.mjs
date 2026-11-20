// Derive closed flat-record PSIX writers from the Typed compiler's own record layouts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const repo = '../../../../../../../';
const prior = '../../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js';
vm.runInThisContext(read(repo + 'picocalc-os/compiler/typed-wasm.js'));
vm.runInThisContext(read(repo + 'picocalc-os/compiler/typed-rv32.js'));
const oracle = new Function(read(prior) + '\nreturn binaryScreen;')();
const primitives = read('../static/02-primitives.typed');

// The common Chess primitive's published range excludes INT_MIN. This flat record accepts all i32s.
const extended = `
function deriveInteger(out: buffer, slot: i32, cursor: i32, value: i32): i32 {
    if (value === -2147483648) {
        psixPutRef(out, slot, 4194304 + cursor);
        psixPut16(out, cursor, 0);
        psixPut16(out, cursor + 2, 0);
        psixPut16(out, cursor + 4, 0);
        psixPut16(out, cursor + 6, 49632);
        return cursor + 8;
    }
    return psixWriteInteger(out, slot, cursor, value);
}`;

function derive(name, layout) {
    const fields = Object.entries(layout).map(([key, entry]) =>
        ({...entry, key, utf8: Buffer.from(key)})).sort((a, b) => Buffer.compare(a.utf8, b.utf8));
    if (fields.length > 64 || fields.some(f => f.utf8.length > 2048 || !['i32', 'bool'].includes(f.type))) {
        throw Error('flat i32/bool record required within PSIX limits');
    }
    // Every dictionary member is one distinct field name. Each slot is a scalar.
    const pool = 13 + 2 * (fields.length + 1);
    const root = pool + fields.reduce((sum, f) => sum + f.utf8.length, 0);
    const base = root + 2 + fields.length * 5;
    const integers = fields.filter(f => f.type === 'i32');
    if (base + 8 * integers.length > 32768) throw Error('maximum packet exceeds PSIX capacity');
    const fixed = Buffer.alloc(base);
    fixed.write('PSIX');
    fixed[4] = 1;
    fixed.writeUInt16LE(fields.length, 8);
    fixed.writeUIntLE(0x700000 + root, 10, 3);
    fixed.writeUInt16LE(fields.length, root);
    let start = pool;
    for (const [i, field] of fields.entries()) {
        fixed.writeUInt16LE(start, 13 + i * 2);
        field.utf8.copy(fixed, start);
        start += field.utf8.length;
        fixed.writeUInt16LE(i, root + 2 + 5 * i);
    }
    fixed.writeUInt16LE(start, 13 + fields.length * 2);
    // All capacity decisions precede the first output store.
    const body = ['function encodeDerived(row: ' + name + ', out: buffer, capacity: i32): i32 {',
        '    let total = ' + base + ';'];
    for (const field of integers)
        body.push('    if (!psixSmall(row.' + field.key + ')) { total = total + 8; }');
    body.push('    if (capacity < total || out.length < ((total + 1) >> 1)) return -2;');
    // Even slices holding at most 1,022 packed units match the existing literal-store contract.
    for (let at = 0; at + 1 < base; at += 2044) {
        const end = Math.min(at + 2044, base - base % 2);
        let literal = '';
        for (let i = at; i < end; i += 2)
            literal += '\\u' + fixed.readUInt16LE(i).toString(16).padStart(4, '0');
        body.push('    out.writeLiteral(' + (at / 2) + ', "' + literal + '");');
    }
    if (base % 2) body.push('    psixPutByte(out, ' + (base - 1) + ', ' + fixed[base - 1] + ');');
    body.push('    psixPut16(out, 6, total);', '    let cursor = ' + base + ';');
    for (const [i, field] of fields.entries()) {
        const slot = root + 4 + i * 5;
        if (field.type === 'i32') {
            body.push('    cursor = deriveInteger(out, ' + slot + ', cursor, row.' + field.key + ');');
        } else {
            body.push('    if (row.' + field.key + ') { psixPutRef(out, ' + slot + ', 2097152); }',
                '    else { psixPutRef(out, ' + slot + ', 1048576); }');
        }
    }
    body.push('    return cursor;', '}');
    return {source: body.join('\n'), fields, base};
}

// Feed unmodified project sources into the frontend. The standalone compiler needs at least one function.
const units = ['picocalc-os/worlds/chess/state.typed', 'picocalc-os/worlds/agenda/reminder.typed'];
const integerCases = [-2147483648, -524289, -524288, -1, 0, 524287, 524288, 2147483647];
const rows = [];
for (const file of units) {
    const original = read(repo + file);
    const source = original + '\nfunction lookupRecordLayouts(): i32 { return 0; }\n';
    const parsed = typedWasm.compile(source);
    for (const [name, layout] of Object.entries(parsed.records)) {
        const {source: body, fields, base} = derive(name, layout);
        const program = source + primitives + extended + '\n' + body;
        const wasm = typedWasm.compile(program);
        const rv32 = typedRv32.compile(program);
        assert.deepEqual(wasm.records[name], layout);
        assert.deepEqual(rv32.records[name], layout);
        const {memory, encodeDerived} = new WebAssembly.Instance(new WebAssembly.Module(wasm.bytes)).exports;
        const memoryBytes = Buffer.from(memory.buffer);
        const rowAt = 64, outAt = 2048, cap = 1024;
        assert.ok(fields.length * 4 <= outAt - rowAt);
        memoryBytes.writeUInt32LE(cap / 2, outAt);
        const seen = new Set();
        function test(values) {
            const key = JSON.stringify(values);
            if (seen.has(key)) return;
            seen.add(key);
            for (const field of fields)
                memoryBytes.writeInt32LE(Number(values[field.key]), rowAt + field.offset);
            const expected = Buffer.from(oracle.encode(values));
            memoryBytes.fill(0xa5, outAt + 4, outAt + 4 + cap);
            assert.equal(encodeDerived(rowAt, outAt, expected.length - 1), -2);
            assert.ok(memoryBytes.subarray(outAt + 4, outAt + 4 + cap).every(b => b === 0xa5));
            assert.equal(encodeDerived(rowAt, outAt, expected.length), expected.length);
            const packet = memoryBytes.subarray(outAt + 4, outAt + 4 + expected.length);
            assert.deepEqual(packet, expected);
            const admitted = oracle.admit(packet);
            for (const field of fields) assert.equal(admitted.path([field.key]), values[field.key]);
            assert.equal(memoryBytes[outAt + 4 + expected.length], 0xa5);
        }
        const defaults = Object.fromEntries(fields.map(f => [f.key, f.type === 'i32' ? 0 : false]));
        test(defaults);
        for (const f of fields) {
            for (const value of f.type === 'i32' ? integerCases : [true]) test({...defaults, [f.key]: value});
        }
        for (let i = 0; i < integerCases.length; i++)
            test(Object.fromEntries(fields.map((f, j) => [f.key, f.type === 'i32' ?
                integerCases[(i + j) % integerCases.length] : Boolean((i + j) % 2)])));
        const collision = fields.find(f => f.key === 'cursor');
        const collisionLine = collision && body.split('\n').find(line => line.includes(', cursor, row.cursor)'));
        if (collision) assert.ok(collisionLine);
        rows.push({file, name, fields: fields.length, bools: fields.filter(f => f.type === 'bool').length,
            basePacketBytes: base, wasmExact: seen.size, capacityRejections: seen.size,
            rv32ImageBytes: rv32.image.byteLength, ...(collisionLine && {collisionLine: collisionLine.trim()})});
    }
}
const total = rows.reduce((sum, row) => sum + row.wasmExact, 0);
console.log(JSON.stringify({experiment: 'Typed compiler record metadata to flat PSIX v1 encoder',
    fullI32: true, executed: 'Node WebAssembly', rv32: 'compiled', totalWasmExact: total, rows}, null, 2));
