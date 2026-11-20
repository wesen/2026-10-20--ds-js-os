import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';

const [work, board] = process.argv.slice(2);
const fullSource = readFileSync(join(work, 'sources/editor/app.typed'), 'utf8');
const start = fullSource.indexOf('function editorPreviewSlot(');
const end = fullSource.indexOf('function editorPreviewIndent(', start);
const records = fullSource.slice(0, fullSource.indexOf('function '));
assert(start > 0 && end > start);
const code = records + fullSource.slice(start, end);
const main = join(board, 'tree/picocalc-os/port/esp32p4/main');
const header = [];
const asm = ['.section .text.lab_guest,"ax",@progbits', '.option push', '.option norvc', '.option norelax'];
const receipt = {};
for (const [lane, name] of ['base', 'direct', 'bounded'].entries()) {
    const ctx = vm.createContext({});
    for (const part of ['wasm', 'rv32'])
        vm.runInContext(readFileSync(join(board, 'lanes', name, 'typed', part + '.js'), 'utf8'), ctx);
    const program = ctx.typedRv32.compile(code);
    const image = Buffer.from(program.image);
    const symbol = 'preview_copy_' + lane;
    assert.equal(program.importCount, 0);
    const offset = program.entries.editorPreviewAppend;
    asm.push('.balign 4');
    for (let at = 0; at < image.length; at += 4) {
        if (at === offset) asm.push('.global ' + symbol, '.type ' + symbol + ', @function', symbol + ':');
        asm.push('.long 0x' + image.readUInt32LE(at).toString(16));
    }
    header.push(`extern int ${symbol}(void *, int32_t *, const void *, int, int, int);`);
    if (lane === 0) for (const field of ['previewRows', 'previewUnits', 'previewColumns']) {
        const word = program.records.WorldState[field].offset / 4;
        assert(Number.isInteger(word) && word < 80);
        header.push(`#define ${field.toUpperCase()} ${word}`);
    }
    receipt[name] = {sha256: createHash('sha256').update(image).digest('hex'), words: image.length / 4,
        entryOffset: offset, rawHex: image.toString('hex')};
}
header.push('static int (*const preview_copy_fns[])(void *, int32_t *, const void *, int, int, int) = {preview_copy_0, preview_copy_1, preview_copy_2};');
appendFileSync(join(main, 'lab_guest.S'), asm.concat('.option pop', '').join('\n'));
appendFileSync(join(main, 'lab_guest.h'), header.concat('').join('\n'));
writeFileSync(join(board, 'copy-guest.json'), JSON.stringify(receipt, null, 2) + '\n');
