// Compile one small typed function and print its Wasm body and its RV32 words.
// Usage (repository root): node <this file> <riscv objdump> [source-file]
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';

const [objdump, file] = process.argv.slice(2);
const source = file ? readFileSync(file, 'utf8') : `
function countUnit(text: string, unit: i32): i32 {
    let at = 0;
    let n = 0;
    while (at < text.length) {
        if (text.charCodeAt(at) === unit) { n = n + 1; }
        at = at + 1;
    }
    return n;
}
`;
const {functions} = typedWasm.compileFunctions(source, 0);
const program = typedRv32.compile(source, []);
for (const fn of functions) {
    console.log(`# ${fn.name}: ${fn.params.length} params, ${fn.nlocals} extra locals, ${fn.code.length} Wasm body bytes`);
    console.log('wasm: ' + Array.from(fn.code, b => b.toString(16).padStart(2, '0')).join(' '));
}
console.log(`rv32: ${program.image.length / 4} instructions, ${program.image.length} bytes`);
const dir = mkdtempSync(join(tmpdir(), 'typed-example-'));
writeFileSync(join(dir, 'code.bin'), program.image);
console.log(execFileSync(objdump, ['-D', '-b', 'binary', '-m', 'riscv:rv32', ...(process.env.NUMERIC ? ['-M', 'no-aliases,numeric'] : []), join(dir, 'code.bin')], {encoding: 'utf8'})
    .split('\n').filter(line => /^\s+[0-9a-f]+:/.test(line)).join('\n'));
