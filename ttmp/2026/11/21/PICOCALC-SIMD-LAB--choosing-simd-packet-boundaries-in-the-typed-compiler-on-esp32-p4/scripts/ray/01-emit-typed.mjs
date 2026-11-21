import {execFileSync} from 'node:child_process';
// Emit complete position-relative RV32 modules and expose their row entry points
// to the IDF linker. The C wrapper and Typed entries use the native RISC-V ABI.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInThisContext } from 'node:vm';

const [out] = process.argv.slice(2);
if (!out) throw new Error('usage: node 01-emit-typed.mjs OUTPUT_DIRECTORY (from repository root)');
for (const base of ['typed-wasm', 'typed-rv32', 'typed-pie-loops']) {
    runInThisContext(execFileSync('git', ['show', '9a1ff99:picocalc-os/compiler/' + base + '.js'], {encoding:'utf8'}));
}
const source = readFileSync('picocalc-os/worlds/raytrace/raytrace.typed', 'utf8');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const identifiers = {};
const asm = ['.option push', '.option norvc'];
for (const arm of ['stock', 'scalar', 'pie']) {
    const obj = typedRv32.compile(source, [], undefined, {pieLoops: arm === 'stock' ? undefined : arm});
    assert.equal(obj.importCount, 0);
    const entry = obj.entries.typedRayComputeRow;
    assert(Number.isInteger(entry) && entry % 4 === 0);
    identifiers[arm] = {sourceSHA256:sha256(source), imageSHA256:sha256(obj.image), imageBytes:obj.image.length, rowOffset:entry};
    asm.push('.section .text.p4_typed_' + arm + ',"ax",@progbits', '.balign 16');
    for (let i = 0; i < obj.image.length; i += 4) {
        if (i === entry) asm.push('.global p4_typed_' + arm + '_row', '.type p4_typed_' + arm + '_row,@function', 'p4_typed_' + arm + '_row:');
        // A data directive preserves the compiler's exact four bytes on target.
        asm.push('.byte ' + obj.image.slice(i, i+4).join(','));
    }
}
asm.push('.option pop');
writeFileSync(join(out, 'typed-images.S'), asm.join('\n') + '\n');
writeFileSync(join(out, 'typed-images.json'), JSON.stringify(identifiers, null, 2) + '\n');
