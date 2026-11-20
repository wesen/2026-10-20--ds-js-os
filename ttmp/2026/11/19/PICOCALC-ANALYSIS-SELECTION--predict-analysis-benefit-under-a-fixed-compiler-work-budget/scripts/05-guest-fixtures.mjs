// Assemble calls into the actual selected native images and derive a Wasm oracle.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {choose, metadata} from './02-policy.mjs';

const [overlay, fixture, output] = process.argv.slice(2);
const budget = 256;
const sha = data => createHash('sha256').update(data).digest('hex');
const lock = JSON.parse(readFileSync(new URL('../various/frozen-policy.json',import.meta.url)));
for (const name of ['wasm.js','rv32.js'])
    assert.equal(sha(readFileSync(join(overlay,name))),lock.staged[name]);
const src = readFileSync(fixture,'utf8');
const ctx = vm.createContext({});
for (const name of ['wasm.js','rv32.js'])
    vm.runInContext(readFileSync(join(overlay,name),'utf8'),ctx);
const wasm = (await WebAssembly.instantiate(ctx.typedWasm.compile(src).bytes)).instance.exports;
const names = Object.keys(wasm).filter(n=>n!=='memory');
const values = [-2147483648,-61,-7,-1,0,1,61,2147483647];
const expected = [];
const traps = [];
const covered = new Set();
for (const name of names) for (const a of values) for (const b of values) {
    try {
        expected.push({name,a,b,value:wasm[name](a,b)});
    } catch (error) {
        assert(error instanceof WebAssembly.RuntimeError);
        const kind = error.message.includes('divide by zero') ? 'zero' : 'overflow';
        const key = name + ':' + kind;
        if (!covered.has(key)) {
            traps.push({name,a,b,kind});
            covered.add(key);
        }
    }
}
assert(covered.has('minusOneDiv:overflow') && covered.has('zeroDiv:zero'));

for (const policy of ['none','source','literal','density']) {
    const stats = [];
    const options = {mode:policy,budget,observeFacts: row => stats.push(row)};
    if (policy === 'density' || policy === 'literal') {
        const rows = [];
        ctx.typedWasm.compileFunctions(src,0,[],undefined,true,fn => {
            rows.push(metadata(fn,ctx.SelectionCursor,policy));
            fn.code = null;
        });
        options.mode = 'ranked';
        options.selected = choose(rows,policy,budget).names;
    }
    const program = ctx.typedRv32.compile(src,[],undefined,options);
    assert.equal(program.relocations.length,0);
    const admitted = stats.filter(r=>r.admitted);
    assert(admitted.reduce((sum,row)=>sum+row.chargedCells,0) <= budget);
    const asm = [
        '.option norvc','.option norelax','.text','.global _start','_start:',
        'mv s6,sp','la s0,inputs','la s1,outputs','la s2,inputs_end','again:',
        'lw t1,0(s0)','li a7,10','ecall','mv s5,a0',
        'lw a0,4(s0)','lw a1,8(s0)','jalr ra,t1,0','sw a0,0(s1)','li a7,10','ecall',
        'sub a0,a0,s5','sw a0,4(s1)','bne sp,s6,bad','addi s1,s1,8','addi s0,s0,12','bne s0,s2,again',
        'li a0,1','la a1,outputs','li a2,'+expected.length*8,'li a7,2','ecall','li a0,0','li a7,1','ecall',
        'bad:','li a0,93','li a7,1','ecall',
    ];
    for (const [i,{name,a,b}] of traps.entries())
        asm.push('.global trap'+i,'trap'+i+':','li a0,'+a,'li a1,'+b,
            'jal ra,'+name,'li a0,94','li a7,1','ecall');
    asm.push('.balign 4','program:','.incbin "program.bin"');
    for (const [name,offset] of Object.entries(program.entries)) asm.push('.set '+name+',program+'+offset);
    asm.push('.data','.balign 4','inputs:');
    for (const {name,a,b} of expected) asm.push('.word '+[name,a,b].join(','));
    asm.push('inputs_end:','outputs: .zero '+expected.length*8);

    const dir = join(output,policy);
    mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'program.bin'),program.image);
    writeFileSync(join(dir,'run.S'),asm.join('\n')+'\n');
    writeFileSync(join(dir,'expectations.json'),JSON.stringify({
        source:sha(src), raw:sha(program.image), budget,
        words:program.image.length/4, admitted:admitted.map(r=>r.name),
        expected,traps,
    }));
}
