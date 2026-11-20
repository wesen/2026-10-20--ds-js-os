import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {variants} from './variants.mjs';
import {createCompiler} from '../03-compile.mjs';
import {decode} from './decode.mjs';
import {cases, reference} from './cases.mjs';
import {runRv32} from './run-rv32.mjs';
import '../../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../../picocalc-os/compiler/typed-rv32.js';

const src = fs.readFileSync(new URL('./projection.tjs',import.meta.url),'utf8');
const {bytes} = typedWasm.compile(src);
const wasm = (await WebAssembly.instantiate(bytes)).instance.exports;
const scalar = typedRv32.compile(src);
const {rv32,wasm:wasmCompiler}=createCompiler();
const candidate = rv32.compile(src,[],undefined,{pie:true});
const portable = rv32.compile(src,[],undefined,{piePortable:true});
const prefix = process.argv[2] ?? '/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf';
const decoded = decode(candidate.image,prefix);
const statics = Object.create(null);
for (const {op} of decoded.values()) {
    if (op.startsWith('esp.')) statics[op] = (statics[op] ?? 0)+1;
}
let success = 0, traps = 0, vectorCases = 0, stores = 0;
const retired = [];
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
    const ordinary = runRv32(scalar,'nested',c.args,[],{},c.bytes);
    check(c.name+' scalar',ordinary,gold);
    const port = runRv32(portable,'nested',c.args,[],{},c.bytes);
    check(c.name+' guarded ordinary RV32',port,gold);
    const packed = runRv32(candidate,'nested',c.args,[],{},c.bytes,decoded);
    check(c.name+' PIE',packed,gold);
    if (c.vector !== undefined) assert.equal(packed.packed.stores > 0,c.vector,c.name+' selection');
    if (packed.packed.stores) {
        vectorCases++;
        assert.equal(packed.packed.stores,Math.floor(c.n/8)*3,c.name+' complete groups');
    }
    stores += packed.packed.stores;
    if (c.name.startsWith('count-')) retired.push([c.n,ordinary.steps,port.steps,packed.steps]);
    if (trap) traps++; else success++;
}
const digest = value => createHash('sha256').update(value).digest('hex');
const candidateSources={};
for (const path of ['../02-pie-lowering.js','../03-compile.mjs','./projection.tjs']) {
    candidateSources[path]=digest(fs.readFileSync(new URL(path,import.meta.url)));
}
const images = Object.fromEntries(Object.entries({scalar,portable,candidate}).map(([k,v])=>[k,digest(v.image)]));
console.log(JSON.stringify({candidateSources,images,success,traps,cases:success+traps,scalarBytes:scalar.image.length,candidateBytes:candidate.image.length,vectorCases,stores,statics,retired,portableBytes:portable.image.length,variants:variants(rv32,wasmCompiler,prefix)},null,2));
