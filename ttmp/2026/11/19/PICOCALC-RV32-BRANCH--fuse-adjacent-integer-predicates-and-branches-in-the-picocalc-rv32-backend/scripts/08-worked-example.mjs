// Compile and disassemble the guide's worked function in both lanes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {compiler, lanes} from './03-apps.mjs';

const [pair, objdump] = process.argv.slice(2);
assert(pair && objdump, 'Usage: 08-worked-example.mjs <pair> <riscv-objdump>');
const source = `
function bump(b: i32, c: i32): i32 {
    let a = b + c;
    if (a > 0) { a = a + 1; }
    return a;
}
`;
const work = mkdtempSync('/tmp/picocalc-branch-example-');
try {
    console.log(source.trim());
    for (const lane of lanes) {
        const {image} = compiler(pair, lane).typedRv32.compile(source);
        const name = lane + '.bin';
        writeFileSync(join(work, name), image);
        console.log('\n' + lane + ' with ' + image.length / 4 + ' instruction words');
        console.log(execFileSync(objdump, ['-D', '-b', 'binary', '-m', 'riscv:rv32', '-M', 'no-aliases', name],
            {cwd: work, encoding: 'utf8'}).trim());
    }
} finally {
    rmSync(work, {recursive: true, force: true});
}
