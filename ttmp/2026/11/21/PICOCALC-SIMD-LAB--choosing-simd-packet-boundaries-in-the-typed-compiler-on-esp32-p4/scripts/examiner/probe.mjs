import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../../../../../../../', import.meta.url));
const review = resolve(root, 'ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review');
const {runRv32} = await import(pathToFileURL(resolve(review, 'run-rv32.mjs')));
const {decode} = await import(pathToFileURL(resolve(review, 'decode.mjs')));
for (const part of ['typed-wasm', 'typed-rv32', 'typed-pie-loops']) {
    await import(pathToFileURL(resolve(root, 'picocalc-os/compiler', part + '.js')));
}
const source = readFileSync(new URL('./probe.typed', import.meta.url), 'utf8');
const wasm = new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(source).bytes)).exports;
const variants = ['stock', 'pie-empty'].map(arm => {
    const events = [];
    const options = {inspect:{function:'probe', emit:e => events.push(e)}};
    if (arm !== 'stock') options.pieLoops = arm;
    const image = typedRv32.compile(source, [], undefined, options);
    const dis = decode(image.image, process.argv[2]);
    const em = events.find(e => e.kind === 'emission');
    if (arm === 'pie-empty') assert.equal(em.loops.filter(l => l.lanes === 8).length, 1);
    return {arm, image, dis, em};
});
const receipt = [];
for (const [name, distance, count, divisor, outCap] of [
    ['mixed', 6, 24, 3, 64],
    ['alignment-and-tail', 3, 31, 3, 64],
    ['store-before-trap', 6, 24, 3, 10],
    ['divide-trap', 6, 24, 0, 64],
    ['zero-trip', 6, 0, 0, 64],
]) {
    const a = 64, out = 256, input = new Uint8Array(400).fill(0xab);
    const s = new DataView(input.buffer);
    s.setUint32(a, 64, true);
    s.setUint32(out, outCap, true);
    for (let j = 0; j < 64; j++) {
        const value = j < 14 ? 65535 : [12, 65535, 0, 74, 87, 32768, 2, 79][(j - 14) % 8];
        s.setUint16(a + 4 + 2*j, value, true);
    }
    const args = [a, out, distance, count, divisor];
    const mem = new Uint8Array(wasm.memory.buffer, 0, input.length);
    mem.set(input);
    let trapped = false, result;
    try { result = wasm.probe(...args); }
    catch (e) { assert(e instanceof WebAssembly.RuntimeError); trapped = true; }
    for (const {arm, image, dis, em} of variants) {
        let minima = 0, hitSpillWrites = 0;
        const r = runRv32(image, 'probe', args, [], {}, input, dis, 100000, pc => {
            const {op, word} = dis.get(pc);
            if (op === 'esp.min.u16.a') minima++;
            if (op === 'sw' && ((word >>> 15) & 31) === 2) {
                const offset = ((word >> 25) << 5) | ((word >>> 7) & 31);
                if (offset >= 4 * em.localCount && em.ranges.some(range =>
                    range.segment === 'scalar hit continuation' && pc >= range.start && pc < range.end))
                    hitSpillWrites++;
            }
        });
        assert.equal(r.trap, trapped);
        assert.equal(r.result, result);
        assert.deepEqual(r.bytes, mem);
        if (arm === 'pie-empty' && name !== 'zero-trip') assert(minima > 0);
        if (arm === 'pie-empty' && name === 'mixed') assert(hitSpillWrites > 0);
        receipt.push({name, arm, trapped, result, minima, hitSpillWrites,
            imageSHA256:createHash('sha256').update(image.image).digest('hex'),
            changedBytes:mem.reduce((n, b, i) => n + Number(b !== input[i]), 0)});
    }
}
console.log(JSON.stringify(receipt, null, 2));
