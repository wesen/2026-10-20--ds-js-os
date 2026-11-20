// Run at repository root: node guest.mjs RV32_CC RV32EMU LABEL [CANDIDATE_DIR] [OPTIONS_JSON]
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {compiler, hash, revision} from './compiler.mjs';

const [ccArg, emulatorArg, label, overlay, optionsJSON] = process.argv.slice(2);
assert(ccArg && emulatorArg && label, 'pass GCC, emulator and implementation label');
const [cc, emulator] = [ccArg, emulatorArg].map(p => resolve(p));
const options = optionsJSON ? JSON.parse(optionsJSON) : {};
const {realm: baseline} = compiler();
const {realm: candidate, files} = compiler(overlay);

const lines = ['record Trace { calls:i32; sequence:i32; }',
    'function touch(t:Trace,n:i32):bool{t.calls=t.calls+1;t.sequence=t.sequence*17+n;return n>=0;}'];
const normal = [];
function add(name, body, samples) {
    lines.push('function ' + name + '(x:i32,y:i32,t:Trace,b:buffer):i32{' + body + '}');
    for (const [x,y] of samples) normal.push({name,x,y});
}
const values=[-2147483648,-1,0,1,2147483647];
const pairs=values.flatMap(x=>values.map(y=>[x,y]));
for (const [name,op] of Object.entries({eq:'===',lt:'<',gt:'>',le:'<=',ge:'>='})) {
    const pred='x'+op+'y';
    add('arm'+name,'if('+pred+')return 19;return -37;',pairs);
    add('loop'+name,'let i=0;while(('+pred+') && i<3){touch(t,i);i=i+1;}return i;',pairs);
    add('nested'+name,'if((!('+pred+') && touch(t,-2)) || (('+pred+') && touch(t,5)))return 29;return -31;',pairs);
    add('value'+name,'let flag='+pred+';if(!flag)return 0;if(flag===touch(t,x))return 3;return 8;',pairs);
}
for (const depth of [0,4,5,6,8]) {
    let term='Math.max(x,y)';
    for(let k=0;k<depth;k++) term='(x+'+k+')-('+term+')';
    add('depth'+depth,'return '+term+';',pairs);
}
add('units','return b.charCodeAt(x);',[[0,0],[1,0],[2,0]]);
add('shortGuard','if(x<0 || b.charCodeAt(x)===65)return 1;return 0;', [[-1,0],[0,0],[1,0],[2,0]]);
add('write','b.setCharCodeAt(x,y);return b.charCodeAt(x);', [[0,-1],[1,32768],[2,0]]);
add('far', 'if(x<y){'+'t.calls=t.calls+1;'.repeat(475)+'}return t.calls;',[[1,0],[0,1]]);
const source=lines.join('\n');
const wasm=await WebAssembly.instantiate(baseline.typedWasm.compile(source).bytes);
const oracle=wasm.instance.exports;
const mem=new DataView(oracle.memory.buffer);
const reset=()=>{
    mem.setInt32(128,0,true); mem.setInt32(132,7,true);
    mem.setUint32(256,3,true);
    [65,0xd834,0xdd1e].forEach((u,i)=>mem.setUint16(260+2*i,u,true));
};
const expected=[];
for (const {name,x,y} of normal) {
    reset();
    expected.push([oracle[name](x,y,128,256),mem.getInt32(128,true),mem.getInt32(132,true),
        mem.getUint32(260,true),mem.getUint16(264,true)]);
}
const traps = [['units',-1],['units',3],['units',-2147483648],['shortGuard',3],['write',3],['write',-1]];
for (const [name,x] of traps) {
    reset(); assert.throws(()=>oracle[name](x,0,128,256), WebAssembly.RuntimeError);
}
const program=candidate.typedRv32.compile(source,[],undefined,options);
assert.deepEqual(JSON.parse(JSON.stringify(program.relocations)),[]);
const work=mkdtempSync(join(tmpdir(),'rv32-independent-'));
try {
    writeFileSync(join(work,'program.bin'), program.image);
    const asm = ['.option norvc','.option norelax','.text','.global _start','_start:',
        'mv s6,sp','la s0,inputs','la s1,outputs','la s2,inputs_end','la s3,trace','la s4,buf','again:',
        'sw zero,0(s3)','li t0,7','sw t0,4(s3)','li t0,3','sw t0,0(s4)','li t0,0xd8340041','sw t0,4(s4)',
        'li t0,0xdd1e','sw t0,8(s4)','lw t1,0(s0)','li a7,10','ecall','mv s5,a0',
        'lw a0,4(s0)','lw a1,8(s0)','mv a2,s3','mv a3,s4','jalr ra,t1,0','sw a0,0(s1)','li a7,10','ecall',
        'sub a0,a0,s5','sw a0,20(s1)','bne sp,s6,bad','lw t0,0(s3)','sw t0,4(s1)','lw t0,4(s3)','sw t0,8(s1)',
        'lw t0,4(s4)','sw t0,12(s1)','lhu t0,8(s4)','sw t0,16(s1)','addi s1,s1,24','addi s0,s0,12','bne s0,s2,again',
        'li a0,1','la a1,outputs','li a2,'+normal.length*24,'li a7,2','ecall','li a0,0','li a7,1','ecall',
        'bad:','li a0,93','li a7,1','ecall'];
    for (const [i,[name,x]] of traps.entries()) {
        asm.push('.global trap'+i,'trap'+i+':','li a0,'+x,'li a1,0','la a2,trace','la a3,buf','jal ra,'+name,
            'li a0,94','li a7,1','ecall');
    }
    asm.push('.balign 4','program:','.incbin "program.bin"');
    for (const [name,at] of Object.entries(program.entries)) asm.push('.set '+name+',program+'+at);
    asm.push('.data','.balign 4','trace: .word 0,7','buf: .word 3,0xd8340041,0xdd1e','inputs:');
    for (const {name,x,y} of normal) asm.push('.word '+[name,x,y].join(','));
    asm.push('inputs_end:','outputs: .zero '+normal.length*24);
    writeFileSync(join(work,'run.S'),asm.join('\n')+'\n');
    const flags=['-march=rv32im','-mabi=ilp32','-mno-relax'];
    execFileSync(cc,[...flags,'-c','run.S','-o','run.o'],{cwd:work});
    function run(entry) {
        execFileSync(cc,[...flags,'-nostdlib','-Wl,--no-relax,-Ttext=0x10000,-e,'+entry,'run.o','-o','run.elf'],{cwd:work});
        const result=spawnSync(emulator,['run.elf'],{cwd:work,timeout:10000});
        if(result.error) throw result.error;
        return result;
    }
    const ok=run('_start'); assert.equal(ok.status,0,ok.stderr.toString()); assert.equal(ok.stdout.length,normal.length*24);
    const counters={}, observed=[];
    for (const [i,{name,x,y}] of normal.entries()) {
        const off=i*24;
        const row=[ok.stdout.readInt32LE(off),ok.stdout.readInt32LE(off+4),ok.stdout.readInt32LE(off+8),
            ok.stdout.readUInt32LE(off+12),ok.stdout.readUInt32LE(off+16)];
        assert.deepEqual(row,expected[i],JSON.stringify({name,x,y}));
        observed.push(row);
        (counters[name]??=[]).push(ok.stdout.readUInt32LE(off+20));
    }
    for (const i of traps.keys()) {
        const bad=run('trap'+i); assert.notEqual(bad.status,0); assert.match(bad.stderr.toString(),/ebreak at 0x[\da-f]+/i);
    }
    const totals=Object.fromEntries(Object.entries(counters).map(([name,counts])=>[name,counts.reduce((a,b)=>a+b,0)]));
    console.log(JSON.stringify({label,revision,options,files,sourceSHA256:hash(source),imageBytes:program.image.length,
        imageSHA256:hash(program.image),emulatorSHA256:hash(readFileSync(emulator)),gcc:execFileSync(cc,['-dumpfullversion'],{encoding:'utf8'}).trim(),
        returned:normal.length,traps,resultsSHA256:hash(JSON.stringify(observed)),totals,
        example:{inputs:normal[0],output:observed[0],timedInstructionsIncludingHarness:counters.armeq[0]}},null,2));
} finally {rmSync(work,{recursive:true,force:true});}
