// Promoted from PICOCALC-AGENDA-COMPILER scripts/16-check-entry-tokens.mjs (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import '../../lib/compiler.mjs';

const [cc, emulator] = process.argv.slice(2);
assert(cc && emulator, 'pass the RV32 GCC and repository rv32emu paths');
const app = readFileSync('apps/js/picocalc/apps/agenda.js', 'utf8');
const oracle = vm.runInNewContext(app.slice(0, app.indexOf('// ---- grouping')) + '\n({agDateWord, agTimeWord, agExpand})');
const source = ['state', 'reminder', 'entry'].map(
    name => readFileSync('apps/typed/agenda/' + name + '.typed', 'utf8')
).join('\n');
const {instance: {exports}} = await WebAssembly.instantiate(compileTyped(source));
const {image, entries} = typedRv32.compile(source);
const errorOffset = typedWasm.compile(source).records.WorldState.errorStart.offset;
assert.equal(errorOffset, 44, 'agenda-entry-runner.c places the span after the eleven task fields');
const view = new DataView(exports.memory.buffer);
const encode = date => date ? date.y * 10000 + date.m * 100 + date.d : -1;

const words = [
    '', 'today', 'TOD', 'tom', 'tmr', 'Tomorrow', 'sun', 'monday', 'tue',
    'wEdNeSdAy', 'Thursday', 'fri', 'SATURDAY', 'tomorrox', 'wednesdayy',
    '+0d', '+1D', '+999w', '+000w', '+1000d', '+d', '+5m', '-3d',
    '2-29', '11-15', '01-01', '12-31', '1-0', '0000-02-29', '0004-2-29',
    '1900-2-29', '2000-2-29', '2100-2-29', '9999-12-31', '25-99', '2--2',
    ' 2pm', '3pm ', '1:9am', '0pm', '13am', '1:99', '1mm', '2pmx', 'a', '🙂',
];
for (let hour = 0; hour <= 25; hour++) {
    for (const suffix of ['', 'am', 'PM']) {
        for (const minute of ['', ':00', ':05', ':59', ':60'])
            words.push(String(hour) + minute + suffix);
    }
}
const days = [
    null, {y: 4, m: 2, d: 28}, {y: 1999, m: 12, d: 31},
    {y: 2000, m: 2, d: 28}, {y: 2026, m: 11, d: 1}, {y: 2026, m: 11, d: 3},
    {y: 2028, m: 2, d: 29}, {y: 2099, m: 12, d: 31}, {y: 2100, m: 2, d: 28},
];
const fixtures = Buffer.alloc(words.length * days.length * 48);
let row = 0;
for (const today of days) {
    for (const token of words) {
        const date = encode(today || /^\d{4}-\d{1,2}-\d{1,2}$/.test(token)
            ? oracle.agDateWord(token, today) : null);
        const timeWord = oracle.agTimeWord(token);
        const time = timeWord === null ? -1 : Number(timeWord.slice(0, 2)) * 60 + Number(timeWord.slice(3));
        const label = JSON.stringify([token, today]);
        assert(token.length <= 16);
        fixtures.writeUInt32LE(token.length, row);
        view.setUint32(0, token.length, true);
        for (let i = 0; i < token.length; i++) {
            const unit = token.charCodeAt(i);
            fixtures.writeUInt16LE(unit, row + 4 + i * 2);
            view.setUint16(4 + i * 2, unit, true);
        }
        fixtures.writeInt32LE(encode(today), row + 36);
        fixtures.writeInt32LE(date, row + 40);
        fixtures.writeInt32LE(time, row + 44);
        assert.equal(exports.entryDate(0, encode(today)), date, label);
        assert.equal(exports.entryTime(0), time, label);
        row += 48;
    }
}

const examples = [
    '', '  ', ' words ', 'dentist @tue 2pm !15m', 'notes\t@today 12am',
    'snow 🙂\u00a0@+1W 07:30 !2h', 'rain @9999-12-31 14:30', 'only @9999-12-31',
    '@11-15 02pm', 'x @2028-2-29 noon', 'x @tue 13pm', 'x @tue 12:60',
    'x @tue 6:4pm', 'x @tue 7o', 'x @tue 2 3', 'x @tue @tom 2pm',
    'x @yesterday', 'x @1-3-05', 'x @2100-2-29', 'x @0004-2-29',
    '🙂 notes @unknown', 'x @🙂', '13pm y @tue 13pm',
    '@0004-2-29', '@2026-13-01', 'x !9999d', 'x !10000d', 'x !15M',
    '!15m', '!0d !1h', '@today !15m', '@today !15m !1h', '@ !',
    'x\n\r\u2028y', '  x '.repeat(30),
];
const statuses = [
    'one date per task', 'the clock is not set', 'unknown date',
    'not a time', 'a reminder is like', 'a task needs',
];
const capacity = 160, stride = 4 + capacity * 2;
const promptRows = [];
function addPrompt(input, today, limit) {
    let expected = '', result, start = -1, end = -1;
    try {
        expected = oracle.agExpand(input, today);
        result = expected.length > limit ? -7 : expected.length;
    } catch (error) {
        result = -1 - statuses.findIndex(prefix => error.message.startsWith(prefix));
        assert(result < 0, error.message);
        if (result === -3 || result === -4) {
            const tokens = [...input.matchAll(/\S+/gu)];
            const at = tokens.findIndex(token => token[0].startsWith('@') && token[0].length > 1);
            const span = tokens[at + (result === -4 ? 1 : 0)];
            start = span.index;
            end = start + span[0].length;
            assert(error.message.includes(span[0]));
        }
    }
    const row = Buffer.alloc(stride * 2 + 20);
    const output = 4096;
    // normalizeEntry writes the span into WorldState's errorStart and errorEnd.
    const state = 8192, error = state + errorOffset;
    row.writeUInt32LE(input.length, 0);
    row.writeUInt32LE(expected.length, stride);
    view.setUint32(0, input.length, true);
    view.setUint32(output, limit, true);
    for (let i = 0; i < input.length; i++) {
        view.setUint16(4 + i * 2, input.charCodeAt(i), true);
        row.writeUInt16LE(input.charCodeAt(i), 4 + i * 2);
    }
    for (let i = 0; i < expected.length; i++) row.writeUInt16LE(expected.charCodeAt(i), stride + 4 + i * 2);
    row.writeInt32LE(encode(today), stride * 2);
    row.writeInt32LE(result, stride * 2 + 4);
    row.writeInt32LE(limit, stride * 2 + 8);
    row.writeInt32LE(start, stride * 2 + 12);
    row.writeInt32LE(end, stride * 2 + 16);
    const label = JSON.stringify([input, today, limit]);
    view.setInt32(error, -1, true);
    view.setInt32(error + 4, -1, true);
    assert.equal(exports.normalizeEntry(0, encode(today), output, state), result, label);
    assert.deepEqual([view.getInt32(error, true), view.getInt32(error + 4, true)], [start, end], label);
    if (result >= 0) {
        let actual = '';
        for (let i = 0; i < result; i++) actual += String.fromCharCode(view.getUint16(output + 4 + i * 2, true));
        assert.equal(actual, expected, label);
    }
    promptRows.push(row);
}
for (const today of days) for (const example of examples) addPrompt(example, today, capacity);
addPrompt('hello world', days[4], 11);
addPrompt('hello world', days[4], 10);
addPrompt('x @tue 2pm', days[4], 6);
addPrompt('x', days[4], 0);

const work = mkdtempSync(join(tmpdir(), 'agenda-entry-'));
try {
    const file = name => join(work, name);
    writeFileSync(file('program.bin'), image);
    writeFileSync(file('fixtures.bin'), fixtures);
    writeFileSync(file('prompts.bin'), Buffer.concat(promptRows));
    writeFileSync(file('program.S'), [
        '.section .text.agenda,"ax"', '.balign 4', 'program:',
        '.incbin "' + file('program.bin') + '"',
        ...['entryDate','entryTime','normalizeEntry'].flatMap(name => ['.global ' + name, '.set ' + name + ', program + ' + entries[name]]),
        '.section .rodata,"a"', '.balign 4', '.global cases_start,cases_end', 'cases_start:',
        '.incbin "' + file('fixtures.bin') + '"', 'cases_end:',
        '.global prompts_start,prompts_end', 'prompts_start:',
        '.incbin "' + file('prompts.bin') + '"', 'prompts_end:',
    ].join('\n') + '\n');
    const runner = fileURLToPath(new URL('agenda-entry-runner.c', import.meta.url));
    execFileSync(cc, ['-march=rv32im', '-mabi=ilp32', '-Os', '-nostdlib', '-fno-builtin',
        '-msmall-data-limit=0', '-mno-relax', '-Wl,-Ttext=0x10000', '-Wl,-e,_start',
        runner, file('program.S'), '-o', file('entry.elf')]);
    const run = spawnSync(emulator, [file('entry.elf')], {timeout:30000});
    assert.equal(run.status, 0, 'RV32 witness ' + run.stdout.toString('hex') + ' ' + run.stderr);
    assert.equal(run.stdout.readUInt32LE(0), words.length * days.length);
    assert.equal(run.stdout.readUInt32LE(4), promptRows.length);
    console.log(JSON.stringify({cases: words.length * days.length, prompts: promptRows.length, targets: ['wasm','rv32'],
        machineBytes: image.length, includesReminder: true}));
} finally {
    rmSync(work, {recursive: true, force: true});
}
