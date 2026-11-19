import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import vm from 'node:vm';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass P4 GCC and CJI rv32emu');
const editor = readFileSync('picocalc-os/worlds/editor/view.typed', 'utf8');
const original = readFileSync('picocalc-os/js/apps/editor.js', 'utf8');
let view;
const app = {
    title() { return this; }, key() { return this; }, about() { return this; },
    icon() { return this; }, state() { return this; }, on() { return this; },
    hints() { return this; }, screen(fn) { view = fn; return this; },
};
vm.runInNewContext(original, {app: () => app, ui: {
    col: (opts, ...kids) => ({t:'col', ...opts, kids}), text: (s, opts) => ({t:'text', s, ...opts}),
}});
const expected = JSON.stringify(view({file:null}));
const source = editor + String.raw`
function copyLiteral(out: buffer, offset: i32): i32 {
    return out.writeLiteral(offset, "A🙂\n\u00e9");
}
function emptyLiteral(out: buffer): i32 {
    out.writeLiteral(0, "");
    return out.writeLiteral(0, "");
}
`;
const {bytes} = typedWasm.compile(source);
const {instance} = await WebAssembly.instantiate(bytes);
const mem = new DataView(instance.exports.memory.buffer);
mem.setUint32(0, 512, true);
const n = instance.exports.editorEmptyFrame(0);
const read = (start, count) => String.fromCharCode(...Array.from({length:count}, (_, i) =>
    mem.getUint16(4 + 2 * (start + i), true)));
assert.equal(read(0, n), expected);
assert.equal(instance.exports.copyLiteral(0, n), 5);
assert.equal(read(n, 5), 'A🙂\né');
mem.setUint32(0, 3, true);
const before = read(0, 7);
for (const offset of [-1, 0, 2147483647])
    assert.throws(() => instance.exports.copyLiteral(0, offset), WebAssembly.RuntimeError);
assert.equal(read(0, 7), before);
assert.equal(instance.exports.emptyLiteral(0), 0);
assert.throws(() => typedWasm.compile('function bad(out: buffer): i32 { return out.writeLiteral(0, "bad\\q"); }'), SyntaxError);

const program = typedRv32.compile(source);
const dir = mkdtempSync(join(tmpdir(), 'typed-editor-view-'));
try {
    const asm = join(dir, 'view.S'), binary = join(dir, 'code.bin'), elf = join(dir, 'view.elf'), driver = join(dir, 'driver.c');
    writeFileSync(binary, program.image);
    writeFileSync(asm, '.text\n.balign 4\ncode:\n.incbin "' + binary + '"\n' +
        Object.entries(program.entries).map(([name, offset]) => `.global ${name}\n.set ${name}, code+${offset}\n`).join(''));
    writeFileSync(driver, `
#include <stdint.h>
#include <stdio.h>
static struct {uint32_t length; uint16_t units[512];} out = {.length=512};
static const uint16_t expected[] = {${Array.from(expected, char => char.charCodeAt(0)).join(',')}};
extern int editorEmptyFrame(void *);
extern int copyLiteral(void *, int);
extern int emptyLiteral(void *);
int main(void) {
  int n = editorEmptyFrame(&out);
  if (n != sizeof expected / sizeof *expected) return 1;
  for (int i = 0; i < n; i++) if (out.units[i] != expected[i]) return 2;
  if (copyLiteral(&out, n) != 5 || emptyLiteral(&out)) return 3;
  if (out.units[n] != 65 || out.units[n+1] != 55357 || out.units[n+2] != 56898 ||
      out.units[n+3] != 10 || out.units[n+4] != 233) return 4;
  puts("Editor initial view and UTF-16 literal passed");
  return 0;
}
`);
    execFileSync(cc, ['-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0', '-mno-relax',
        '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-o', elf, driver, asm,
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file))], {stdio:'inherit'});
    assert.equal(execFileSync(emu, [elf], {encoding:'utf8',timeout:15000}).trim(),
        'Editor initial view and UTF-16 literal passed');
    console.log(JSON.stringify({matchingInitialView:true, units:n, wasmBytes:bytes.length, rv32Bytes:program.image.length}));
} finally {
    rmSync(dir, {recursive:true,force:true});
}
