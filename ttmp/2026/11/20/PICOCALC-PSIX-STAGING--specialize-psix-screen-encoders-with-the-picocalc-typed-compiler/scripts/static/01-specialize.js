/* Stage one bounded, fixed-shape PSIX v1 encoder in a plain JS realm. */
(() => {
"use strict";

const wire = {
    header: 13, copyLimit: 32768, null: 0, false: 1, true: 2,
    int: 3, float: 4, string: 5, array: 6, object: 7,
};
const digest = '63d752c673c41636e4951c0f9a95ba7b7f69f698d98ed723e39037a3bc7fb026';
const hexAlphabet = '0123456789abcdef';
const chessAlphabet = '01234569abcde';
const fields = [
    ['cursor', 0, 63], ['selected', 0, 64], ['from', 0, 64], ['to', 0, 64],
    ['status', 0, 8], ['hint', 0, 1], ['depth', 0, 32],
    ['nodes', 0, 2147483647], ['score', -2147483647, 2147483647],
];
const board = {name: 'Board', start: 0, length: 64, packed: false, alphabet: chessAlphabet};
const masks = {name: 'Masks', start: 64, length: 16, packed: true, alphabet: hexAlphabet};
const wideFields = new Set(fields.filter(([, lo, hi]) => lo < -524288 || hi > 524287).map(([name]) => name));

const literal = value => ({kind: 'literal', value});
const hex = field => ({kind: 'hex', field});
const integer = name => ({kind: 'integer', name});
const tuple = items => ({kind: 'tuple', items});
const record = fields => ({kind: 'record', fields});
function chessShape(title = 'Chess') {
    return record({
        app: literal('chess'), title: literal(title),
        frame: record({tree: record({
            v: literal(1), p: literal(digest), b: hex(board), m: hex(masks),
            f: tuple(fields.map(([name]) => integer(name))),
        }), hints: literal('')}),
    });
}

const quoteUnits = units =>
    '"' + units.map(u => '\\u' + u.toString(16).padStart(4, '0')).join('') + '"';
const ascii = s => Array.from(s, c => c.charCodeAt(0));

function stageShape(shape, primitives) {
    const fixed = new Set();
    const holes = new Set();
    let values = 0, wideBodies = 0;
    function gather(node, depth) {
        if (++values > 8192 || depth > 24) throw Error('shape exceeds PSIX v1 tree caps');
        if (node.kind === 'record') {
            const keys = Object.keys(node.fields);
            if (keys.length > 64) throw Error('shape exceeds PSIX v1 field cap');
            for (const key of keys) { fixed.add(key); gather(node.fields[key], depth + 1); }
        } else if (node.kind === 'tuple') {
            if (node.items.length > 1024) throw Error('shape exceeds PSIX v1 array cap');
            for (const item of node.items) gather(item, depth + 1);
        } else if (node.kind === 'hex') holes.add(node.field);
        else if (node.kind === 'literal' && typeof node.value === 'string') fixed.add(node.value);
    }
    gather(shape, 0);
    if (holes.size !== 2 || !holes.has(board) || !holes.has(masks))
        throw Error('this profile needs the two independent Chess hex fields');
    const strings = [...fixed].sort();
    if (strings.length + holes.size > 4096) throw Error('shape exceeds PSIX v1 string cap');
    for (const s of strings) {
        if (!/^[\x00-\x7f]*$/.test(s) || s.length > 2048) throw Error('unsupported static string');
        // Canonical interning without runtime equality cases needs disjoint domains.
        for (const field of holes) {
            if (s.length === field.length && [...s].every(c => field.alphabet.includes(c)))
                throw Error('static string can collide with the ' + field.name + ' field');
        }
    }

    const stringIndex = new Map(strings.map((s, i) => [s, i]));
    const stringBase = wire.header + 2 * (strings.length + holes.size + 1);
    const fixedOffsets = [stringBase];
    for (const s of strings) fixedOffsets.push(fixedOffsets.at(-1) + s.length);
    const bodyStart = fixedOffsets.at(-1) + board.length + masks.length;
    const bytes = Array(bodyStart).fill(0);
    const late = [];
    const id = s => 'id' + stringIndex.get(s);
    const set16 = (at, n) => { bytes[at] = n % 256; bytes[at + 1] = (n >> 8) % 256; };
    const setRef = (at, tag, n) => {
        set16(at, n);
        bytes[at + 2] = tag * 16 + (n >> 16);
    };
    const put16 = (at, value) => 'psixPut16(out, ' + at + ', ' + value + ');';
    const putRef = (at, tag, value) => 'psixPutRef(out, ' + at + ', ' + (tag * 1048576)
        + ' + ' + value + ');';

    function write(at, node) {
        if (node.kind === 'record' || node.kind === 'tuple') {
            if (wideBodies) throw Error('fixed container after a variable-sized integer body');
            const isRecord = node.kind === 'record';
            const keys = isRecord ? Object.keys(node.fields).sort() : [];
            const count = isRecord ? keys.length : node.items.length;
            const start = bytes.length, step = isRecord ? 5 : 3;
            for (let i = 0; i < 2 + step * count; i++) bytes.push(0);
            setRef(at, isRecord ? wire.object : wire.array, start);
            set16(start, count);
            for (let i = 0; i < count; i++) {
                const slot = start + 2 + step * i;
                if (isRecord) {
                    late.push(put16(slot, id(keys[i])));
                    write(slot + 2, node.fields[keys[i]]);
                } else write(slot, node.items[i]);
            }
            return;
        }
        if (node.kind === 'hex') late.push(putRef(at, wire.string, 'id' + node.field.name));
        else if (node.kind === 'integer') {
            wideBodies += Number(wideFields.has(node.name));
            late.push('tail = psixWriteInteger(out, ' + at + ', tail, ' + node.name + ');');
        }
        else if (node.kind === 'literal') {
            if (typeof node.value === 'string') late.push(putRef(at, wire.string, id(node.value)));
            else if (node.value === null) setRef(at, wire.null, 0);
            else if (node.value === false) setRef(at, wire.false, 0);
            else if (node.value === true) setRef(at, wire.true, 0);
            else {
                if (!Number.isInteger(node.value) || node.value < -524288 || node.value > 524287)
                    throw Error('only 20-bit static integers may be staged');
                setRef(at, wire.int, node.value < 0 ? node.value + 1048576 : node.value);
            }
        } else throw Error('unsupported schema node ' + node.kind);
    }
    write(10, shape);
    const bodyEnd = bytes.length;
    // Packed offsets stay even or odd as staged: both dynamic strings have even lengths.
    if (bodyEnd + wideBodies * 8 > wire.copyLimit) throw Error('shape exceeds PSIX v1 byte cap');

    function writePacked(offset, data, parity) {
        let i = 0;
        const out = [];
        const at = n => '(' + offset + ' + ' + n + ')';
        if (parity && data.length) { out.push('psixPutByte(out, ' + offset + ', ' + data[i++] + ');'); }
        const pairsStart = i;
        const units = [];
        for (; i + 1 < data.length; i += 2) units.push(data[i] + 256 * data[i + 1]);
        // The typed compiler bounds its literal store to 1022 halfwords.
        for (let start = 0; start < units.length; start += 1022) {
            const p = '(' + at(pairsStart + 2 * start) + ' >> 1)';
            out.push('out.writeLiteral(' + p + ', ' + quoteUnits(units.slice(start, start + 1022)) + ');');
        }
        if (i < data.length) out.push('psixPutByte(out, ' + at(i) + ', ' + data[i] + ');');
        return out;
    }

    // Entries return a pair (the next fixed dictionary index, its output offset).
    // The impossible equality case lets a comparison stop at the first byte
    // outside the hole's alphabet. Otherwise, a strict prefix decides the order.
    function stageRank(field) {
        const code = [];
        let helper = '';
        function before(s, i) {
            const test = [];
            for (let at = 0; at < Math.min(s.length, field.length); at++) {
                const codepoint = s.charCodeAt(at), name = 'u' + at;
                test.push('const ' + name + ' = psixHexUnit(input, ' + field.start +
                    ', ' + at + ', ' + field.packed + ');');
                if (!field.alphabet.includes(s[at])) {
                    test.push('return ' + name + ' < ' + codepoint + ';');
                    return addCompare();
                }
                test.push('if (' + name + ' !== ' + codepoint + ') return ' + name + ' < ' + codepoint + ';');
            }
            test.push('return ' + (field.length < s.length) + ';');
            return addCompare();
            function addCompare() {
                const name = 'psixBefore' + field.name + i;
                helper += 'function ' + name + '(input: buffer): bool {\n    ' +
                    test.join('\n    ') + '\n}\n';
                return name;
            }
        }
        for (let i = 0; i < strings.length; i++) {
            const s = strings[i];
            if (!s.length || s.charCodeAt(0) < field.alphabet.charCodeAt(0)) continue;
            const result = i * 32768 + fixedOffsets[i];
            if (s.charCodeAt(0) > field.alphabet.charCodeAt(field.alphabet.length - 1)) {
                code.push('return ' + result + ';');
                break;
            }
            code.push('if (' + before(s, i) + '(input)) return ' + result + ';');
        }
        if (!code.at(-1)?.startsWith('return '))
            code.push('return ' + (strings.length * 32768 + fixedOffsets.at(-1)) + ';');
        return helper + 'function psixRank' + field.name + '(input: buffer): i32 {\n    ' +
            code.join('\n    ') + '\n}\n';
    }

    const source = ['// Generated from the declared Chess semantic envelope and PSIX v1 layout.', primitives,
        stageRank(board), stageRank(masks),
        'function psixEncode(input: buffer, out: buffer, capacity: i32): i32 {',
        '    if (input.length !== 90) return -1;',
        ...fields.map(([name], i) =>
            '    const ' + name + ' = psixRead32(input, ' + (72 + i * 2) + ');'),
        ...fields.filter(([, lo, hi]) => lo !== -2147483648 || hi !== 2147483647)
            .map(([name, lo, hi]) => '    if (' + name + ' < ' + lo +
                (hi < 2147483647 ? ' || ' + name + ' > ' + hi : '') + ') return -1;'),
        '    if ((from === 64) !== (to === 64)) return -1;',
        '    if (!psixValidBoard(input, selected)) return -1;',
        '    let total = ' + bodyEnd + ';',
    ];
    for (const name of wideFields)
        source.push('    if (!psixSmall(' + name + ')) { total = total + 8; }');
    source.push(
        '    if (capacity < total || out.length < ((total + 1) >> 1)) return -2;',
        '    const boardRank = psixRankBoard(input);',
        '    const masksRank = psixRankMasks(input);',
        '    const rankBoard = boardRank >> 15;',
        '    const rankMasks = masksRank >> 15;',
        '    let idBoard = rankBoard;',
        '    let idMasks = rankMasks;',
        '    let startBoard = boardRank % 32768;',
        '    let startMasks = masksRank % 32768;',
        '    if (rankBoard < rankMasks || (rankBoard === rankMasks && psixBoardBeforeMasks(input))) {',
        '        idMasks = idMasks + 1;',
        '        startMasks = startMasks + 64;',
        '    } else {',
        '        idBoard = idBoard + 1;',
        '        startBoard = startBoard + 16;',
        '    }',
    );
    const code = [
        ...writePacked('0', [80, 83, 73, 88, 1, 0], 0),
        put16(6, 'total'), put16(8, strings.length + 2),
        ...writePacked('10', bytes.slice(10, 13), 0),
        put16('13 + 2 * idBoard', 'startBoard'),
        put16('13 + 2 * idMasks', 'startMasks'),
        put16('13 + 2 * ' + (strings.length + 2), bodyStart),
        'psixWriteHex(input, out, startBoard, 0, 64, false);',
        'psixWriteHex(input, out, startMasks, 64, 16, true);',
    ];
    for (let i = 0; i < strings.length; i++) {
        const start = 'start' + i;
        code.push('let id' + i + ' = ' + i + ';', 'let ' + start + ' = ' + fixedOffsets[i] + ';');
        code.push('if (rankBoard <= ' + i + ') { id' + i + ' = id' + i + ' + 1; ' +
            start + ' = ' + start + ' + 64; }');
        code.push('if (rankMasks <= ' + i + ') { id' + i + ' = id' + i + ' + 1; ' +
            start + ' = ' + start + ' + 16; }');
        code.push(put16('13 + 2 * id' + i, start), ...writePacked(start, ascii(strings[i]), fixedOffsets[i] % 2));
    }
    code.push(...writePacked('' + bodyStart, bytes.slice(bodyStart), bodyStart % 2),
        'let tail = ' + bodyEnd + ';', ...late, 'return tail;');
    return source.join('\n') + '\n    ' + code.join('\n    ') + '\n}\n';
}

// The supplied typed primitives are plain text. Alternate titles change the staged
// constant layout and reference IDs, producing a separate native artifact.
globalThis.psixGenerateSource = (primitives, title = 'Chess') => stageShape(chessShape(title), primitives);
globalThis.psixChessRenderDigest = digest;
})();
