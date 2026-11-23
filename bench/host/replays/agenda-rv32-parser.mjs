// Promoted from PICOCALC-AGENDA-COMPILER scripts/07-check-rv32-parser.mjs (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {agendaLines} from './agenda-lines.mjs';
import '../../lib/compiler.mjs';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass riscv32-esp-elf-gcc and the repository rv32emu executable');
const work = mkdtempSync(join(tmpdir(), 'agenda-rv32-'));
const dir = fileURLToPath(new URL('.', import.meta.url));
// The task fields lead WorldState (state.typed), so the runner reads them at the record's first eleven words.
const source = readFileSync('apps/typed/agenda/state.typed', 'utf8') + readFileSync('apps/typed/agenda/reminder.typed', 'utf8');
const {image, entries} = typedRv32.compile(source);
const {instance} = await WebAssembly.instantiate(compileTyped(source));
const wasm = new DataView(instance.exports.memory.buffer);
const lines = [...agendaLines()];
const units = 120, fields = 11, title = 4096, record = 8192;
const rowSize = 4 + units * 2 + 4 + fields * 4 + units * 2;
const fixtures = Buffer.alloc(lines.length * rowSize);
for (const [i, line] of lines.entries()) {
    assert(line.length <= units);
    const row = i * rowSize;
    wasm.setUint32(0, line.length, true);
    fixtures.writeUInt32LE(line.length, row);
    for (let j = 0; j < line.length; j++) {
        const code = line.charCodeAt(j);
        wasm.setUint16(4 + j * 2, code, true);
        fixtures.writeUInt16LE(code, row + 4 + j * 2);
    }
    wasm.setUint32(title, units, true);
    const valid = instance.exports.parseTask(0, title, record);
    const results = row + 4 + units * 2;
    fixtures.writeInt32LE(valid, results);
    if (!valid) continue;
    for (let j = 0; j < fields; j++) fixtures.writeInt32LE(wasm.getInt32(record + j * 4, true), results + 4 + j * 4);
    for (let j = 0; j < wasm.getInt32(record + 4 * (fields - 1), true); j++)
        fixtures.writeUInt16LE(wasm.getUint16(title + 4 + j * 2, true), results + 4 + fields * 4 + j * 2);
}
writeFileSync(join(work, 'program.bin'), image);
writeFileSync(join(work, 'fixtures.bin'), fixtures);
writeFileSync(join(work, 'program.S'), ` .section .text.agenda,"ax"
.balign 4
program:
.incbin "${join(work, 'program.bin')}"
${['parseTask','validDate','leadMinutes'].map(name => `.global ${name}
.set ${name}, program + ${entries[name]}`).join('\n')}
.section .rodata,"a"
.balign 4
.global cases_start,cases_end
cases_start:
.incbin "${join(work, 'fixtures.bin')}"
cases_end:
`);
const elf = join(work, 'parser.elf');
execFileSync(cc, ['-march=rv32im', '-mabi=ilp32', '-O2', '-nostdlib', '-fno-builtin', '-msmall-data-limit=0',
    '-mno-relax', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', join(dir, 'agenda-rv32-runner.c'), join(work, 'program.S'), '-o', elf],
    {stdio:['ignore','inherit','inherit']});
const run = spawnSync(emu, [elf], {timeout:30000});
if (run.status !== 0) throw new Error(`RV32 exit ${run.status}, results ${run.stdout.toString('hex')} ${run.stderr}`);
assert.equal(run.stdout.length, 16);
const [failure, checked, calendar, leads] = Array.from({length:4}, (_, i) => run.stdout.readUInt32LE(i * 4));
assert.deepEqual([failure, checked, calendar, leads], [0, lines.length, 405, 10000]);
console.log(JSON.stringify({cases:checked, calendar, leads, machineBytes:image.length,
    sha256:createHash('sha256').update(image).digest('hex')}, null, 2));
