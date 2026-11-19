import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';

const [cc, emulator] = process.argv.slice(2);
assert(cc && emulator, 'pass the RV32 GCC and repository rv32emu paths');
const app = readFileSync('picocalc-os/js/apps/agenda.js', 'utf8');
const oracle = vm.runInNewContext(app.slice(0, app.indexOf('// ---- grouping')) + '\n({agDateWord, agTimeWord})');
const source = ['reminder', 'entry'].map(
    name => readFileSync('picocalc-os/worlds/agenda/' + name + '.typed', 'utf8')
).join('\n');
const {instance: {exports}} = await WebAssembly.instantiate(compileTyped(source));
const {image, entries} = typedRv32.compile(source);
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

const work = mkdtempSync(join(tmpdir(), 'agenda-entry-'));
try {
    const file = name => join(work, name);
    writeFileSync(file('program.bin'), image);
    writeFileSync(file('fixtures.bin'), fixtures);
    writeFileSync(file('program.S'), [
        '.section .text.agenda,"ax"', '.balign 4', 'program:',
        '.incbin "' + file('program.bin') + '"',
        ...['entryDate','entryTime'].flatMap(name => ['.global ' + name, '.set ' + name + ', program + ' + entries[name]]),
        '.section .rodata,"a"', '.balign 4', '.global cases_start,cases_end', 'cases_start:',
        '.incbin "' + file('fixtures.bin') + '"', 'cases_end:',
    ].join('\n') + '\n');
    const runner = fileURLToPath(new URL('15-rv32-entry-runner.c', import.meta.url));
    execFileSync(cc, ['-march=rv32im', '-mabi=ilp32', '-Os', '-nostdlib', '-fno-builtin',
        '-msmall-data-limit=0', '-mno-relax', '-Wl,-Ttext=0x10000', '-Wl,-e,_start',
        runner, file('program.S'), '-o', file('entry.elf')]);
    const run = spawnSync(emulator, [file('entry.elf')], {timeout:30000});
    assert.equal(run.status, 0, 'RV32 witness ' + run.stdout.toString('hex') + ' ' + run.stderr);
    assert.equal(run.stdout.readUInt32LE(0), words.length * days.length);
    console.log(JSON.stringify({cases: words.length * days.length, targets: ['wasm','rv32'],
        machineBytes: image.length, includesReminder: true}));
} finally {
    rmSync(work, {recursive: true, force: true});
}
