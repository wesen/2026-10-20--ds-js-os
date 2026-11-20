import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cases, reference} from './cases.mjs';
import {runRv32} from './run-rv32.mjs';
import '../../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../../picocalc-os/compiler/typed-rv32.js';

const src = fs.readFileSync(new URL('./projection.tjs',import.meta.url),'utf8');
const {bytes} = typedWasm.compile(src);
const wasm = (await WebAssembly.instantiate(bytes)).instance.exports;
const scalar = typedRv32.compile(src);
let success = 0, traps = 0;
function check(label, result, gold) {
    assert.equal(result.trap,gold.trap,label+' trap');
    assert.equal(result.result,gold.result,label+' result');
    assert.deepEqual(result.bytes,gold.bytes,label+' arena');
}
for (const c of cases()) {
    const gold = reference(c);
    const arena = new Uint8Array(wasm.memory.buffer,0,c.bytes.length);
    arena.set(c.bytes);
    let trap = false, result;
    try { result = wasm.nested(...c.args); }
    catch (e) {
        if (!(e instanceof WebAssembly.RuntimeError)) throw e;
        trap = true;
    }
    check(c.name+' Wasm',{result,trap,bytes:arena},gold);
    check(c.name+' scalar',runRv32(scalar,'nested',c.args,[],{},c.bytes),gold);
    if (trap) traps++; else success++;
}
console.log(JSON.stringify({success,traps,cases:success+traps,scalarBytes:scalar.image.length}));
