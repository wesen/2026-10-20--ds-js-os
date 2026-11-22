// Promoted from PICOCALC-TYPED-APPS scripts/07-check-editor-layout.mjs (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import '../../lib/compiler.mjs';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass RV32 GCC and CJI rv32emu');
const source = readFileSync('apps/typed/editor/layout.typed', 'utf8');
const original = readFileSync('apps/js/picocalc/apps/editor.js', 'utf8');
const wrap = vm.runInNewContext(original.slice(0, original.indexOf('function edCount')) + '\nedWrap');
const wasm = typedWasm.compile(source);
const rv32 = typedRv32.compile(source);
// The standalone compiler fixes memory at one page. Give the test a larger
// data area for a 65,536-unit input, leaving the emitted functions intact.
const testModule = wasm.bytes.slice();
for (let offset = 8; offset < testModule.length;) {
    const id = testModule[offset++];
    let size = 0, shift = 0, byte;
    do {
        byte = testModule[offset++];
        size += (byte & 127) << shift;
        shift += 7;
    } while (byte & 128);
    if (id === 5) {
        assert.deepEqual([...testModule.slice(offset, offset + size)], [1, 1, 1, 1]);
        testModule.set([1, 1, 3, 3], offset);
        break;
    }
    offset += size;
}
const {instance} = await WebAssembly.instantiate(testModule);
const memory = new DataView(instance.exports.memory.buffer);
const entries = ['editorNext', 'editorPrevious', 'editorWrapEnd', 'editorColumn', 'editorOffset'];

const lines = ['', ' ', 'ab  cd ef', 'abcd ef ', 'a\tb c d', '𝄞b🙂 d👩‍🚀', 'a\u0301א🙌', 'x'.repeat(65536)];
let seed = 73;
const glyphs = [...' ab _🙂É\u0301\t '];
for (let n = 0; n < 32; n++) {
    let line = '';
    for (let i = 0; i < 190; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        line += glyphs[(seed >>> 16) % glyphs.length];
    }
    lines.push(line);
}

const fixture = [], vectors = [];
function verify(name, input, wanted) {
    assert.equal(instance.exports[name](0, ...input), wanted, `${fixture.length - 1}: ${name} ${input}`);
    vectors.push([fixture.length - 1, entries.indexOf(name), ...input, ...Array(4 - input.length).fill(0), wanted]);
}

for (const line of lines) {
    const prefix = '🙂\n';
    const text = prefix + line + '\nsecond logical line';
    const units = Array.from({length:text.length}, (_, i) => text.charCodeAt(i));
    fixture.push(units);
    memory.setUint32(0, text.length, true);
    for (const [at, unit] of units.entries()) memory.setUint16(4 + 2 * at, unit, true);
    const boundaries = [prefix.length];
    for (const point of line) boundaries.push(boundaries.at(-1) + point.length);
    const lineEnd = boundaries.at(-1);
    for (const width of (line.length > 1000 ? [49] : [1, 2, 7, 49])) {
        const rows = wrap(line, width);
        for (const [start, end] of rows) {
            const left = boundaries[start], right = boundaries[end];
            verify('editorWrapEnd', [left, lineEnd, width], right);
            verify('editorColumn', [left, right], end - start);
            if (right > left) {
                verify('editorNext', [left], boundaries[start + 1]);
                verify('editorPrevious', [right], boundaries[end - 1]);
            }
            for (const column of [0, 1, Math.floor(width / 2), width, width + 1]) {
                const last = end === boundaries.length - 1 ? end : Math.max(start, end - 1);
                verify('editorOffset', [left, right, lineEnd, column], boundaries[Math.min(start + column, last)]);
            }
        }
    }
}
assert.equal(instance.exports.editorPrevious(0, 0), 0);
assert.equal(instance.exports.editorNext(0, memory.getUint32(0, true)), memory.getUint32(0, true));

const work = mkdtempSync(join(tmpdir(), 'typed-editor-layout-'));
try {
    const driver = fileURLToPath(new URL('editor-layout-driver.c', import.meta.url));
    const image = join(work, 'layout.rv32'), asm = join(work, 'layout.S'), exe = join(work, 'driver.elf');
    writeFileSync(image, rv32.image);
    writeFileSync(asm, [
        '.section .text.editor,"ax"', '.balign 4', 'typed_program:', `    .incbin "${image}"`,
        ...entries.flatMap(name => [`    .global ${name}`, `    .set ${name}, typed_program+${rv32.entries[name]}`]),
        '',
    ].join('\n'));
    const data = fixture.map((units, i) => `static const struct { uint32_t length; uint16_t data[${units.length}]; } line${i} = {${units.length}, {\n` +
        units.join(',').match(/(?:\d+,){1,24}|\d+$/g).join('\n') + '\n}};');
    const pointers = fixture.map((_, i) => `    &line${i},`).join('\n');
    writeFileSync(join(work, 'fixtures.inc'), data.join('\n') + `\nstatic const void *const lines[] = {\n${pointers}\n};\n` +
        'static const int vectors[][7] = {\n' + vectors.map(v => `    {${v.join(',')}},\n`).join('') + '};\n');
    execFileSync(cc, ['-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0', '-mno-relax',
        '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-I', work, '-I', 'apps/typed/editor', '-o', exe, driver, asm,
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file))], {stdio:'inherit'});
    const result = execFileSync(emu, [exe], {encoding:'utf8',timeout:15000});
    assert.equal(result.trim(), `${vectors.length} editor layout vectors passed`);
    console.log(JSON.stringify({logicalLines:fixture.length, vectors:vectors.length, wasmBytes:wasm.bytes.length, rv32Bytes:rv32.image.length}));
} finally {
    rmSync(work, {recursive:true,force:true});
}
