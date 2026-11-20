// Prepare separately linked guest functions and their independent WebAssembly expectations.
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect, policies, realm, sha, revision} from './03-qualify.mjs';

const [overlays, sources, output] = process.argv.slice(2);
assert.ok(overlays && sources && output);
mkdirSync(output, {recursive:true});
const here = dirname(fileURLToPath(import.meta.url));
const min = -2147483648, max = 2147483647;
const x = [min, -61, -7, -1, 0, 1, 61, max];
const y = [min, -1, 0, 1, 7, max];
const dates = [19990101, 19991231, 20000229, 20000301, 20240229, 20241231, 21000301, 21001231];

const fixture = readFileSync(join(here,'04-arithmetic.typed'),'utf8');
const agenda = readFileSync(join(sources,'agenda.typed'),'utf8');
const ordinary = [...fixture.matchAll(/function (\w+)/g)].map(m => m[1]);
const expectedProofs = {
    fixedDiv: [1,1], fixedRem: [1,0], minusOneDiv: [1,0], minusOneRem: [1,0],
    minDiv: [1,1], localDiv: [1,1], negativeLocal: [1,1], singleWriteLet: [1,1],
    parameterThenConst: [1,1], nestedLocal: [1,1], wrappedDivisor: [1,1],
};
// Exercise all structural caps without adding a program to the real app corpus.
const assignments = 'v=v+1;'.repeat(300);
const limits = [
    'function fullProofTable(v:i32):i32{return v' + '/4'.repeat(129) + ';}',
    'function highSlot(v:i32):i32{' + Array.from({length:129},(_,i) => 'const d'+i+'=4;').join('') + 'return v/d128;}',
    'function aboveFunctionCap(x:i32):i32{let v=x;' + assignments + 'return v/4;}',
    ...Array.from({length:24}, (_,i) => 'function budget'+i+'(x:i32):i32{let v=x;' +
        'v=v+1;'.repeat(145) + 'return v/4;}'),
    'function laterSmall(x:i32):i32{return x/4;}',
].join('\n');

for (const [moduleName, source, vectors] of [
    ['arithmetic', fixture, ordinary.flatMap(name => x.flatMap(a => y.map(b => [name,a,b])))],
    ['agenda', agenda, dates.map(date => ['entryWeekday',date,0])],
    ['limits', limits, [['fullProofTable',max,0],['highSlot',min,0],['aboveFunctionCap',0,0],
        ['budget0',3,0],['budget23',3,0],['laterSmall',61,0]]],
]) {
    const baseline = realm(overlays, 'control');
    const oracle = (await WebAssembly.instantiate(baseline.typedWasm.compile(source).bytes)).instance.exports;
    const seenTraps = new Set();
    const expected = [], traps = [];
    for (const [name,a,b] of vectors) {
        try {
            expected.push({name, a, b, value:oracle[name](a,b)});
        } catch (error) {
            assert.ok(error instanceof WebAssembly.RuntimeError);
            const kind = error.message.includes('divide by zero') ? 'zero' : 'overflow';
            const trap = name + ':' + kind;
            if (!seenTraps.has(trap)) {
                traps.push({name,a,b,kind});
                seenTraps.add(trap);
            }
        }
    }
    let initial;
    for (const policy of policies) {
        const context = realm(overlays, policy);
        const stats = [];
        const program = context.typedRv32.compile(source, [], undefined, {observeFacts: row => stats.push(row)});
        const raw = collect(program);
        assert.equal(program.relocations.length,0);
        if (policy === 'control') initial = raw;
        assert.equal(raw.div,initial.div);
        assert.equal(raw.rem,initial.rem);
        let remaining = 32768;
        let budgetSkipped = false;
        for (const row of stats) {
            const {name, removedZero, removedOverflow, usedProofs, chargedCells} = row;
            assert.equal(usedProofs,removedZero);
            assert.equal(initial.functions[name].words - raw.functions[name].words,
                2 * removedZero + 7 * removedOverflow);
            if (moduleName === 'arithmetic') assert.deepEqual([removedZero,removedOverflow],expectedProofs[name] ?? [0,0], name);
            if (moduleName === 'limits') {
                if (name === 'fullProofTable') assert.equal(usedProofs,128);
                if (name === 'highSlot') assert.equal(usedProofs,0);
                if (name === 'aboveFunctionCap') assert.equal(row.admitted,false);
                if (name.startsWith('budget') && !row.admitted) budgetSkipped = true;
                if (name === 'laterSmall') assert.equal(row.admitted,true);
            }
            remaining -= chargedCells;
        }
        if (policy === 'select') {
            assert.ok(remaining >= 0);
            if (moduleName === 'limits') assert.ok(budgetSkipped);
        }
        const directory = join(output,moduleName,policy);
        mkdirSync(directory,{recursive:true});
        writeFileSync(join(directory,'program.bin'), program.image);
        const asm = [
            '.option norvc','.option norelax','.text','.global _start','_start:',
            'mv s6,sp','la s0,inputs','la s1,outputs','la s2,inputs_end','again:',
            'lw t1,0(s0)','li a7,10','ecall','mv s5,a0',
            'lw a0,4(s0)','lw a1,8(s0)','jalr ra,t1,0','sw a0,0(s1)','li a7,10','ecall',
            'sub a0,a0,s5','sw a0,4(s1)','bne sp,s6,bad','addi s1,s1,8','addi s0,s0,12','bne s0,s2,again',
            'li a0,1','la a1,outputs','li a2,'+expected.length*8,'li a7,2','ecall','li a0,0','li a7,1','ecall',
            'bad:','li a0,93','li a7,1','ecall',
        ];
        for (const [i,{name,a,b}] of traps.entries()) {
            asm.push('.global trap'+i,'trap'+i+':','li a0,'+a,'li a1,'+b,'jal ra,'+name,
                'li a0,94','li a7,1','ecall');
        }
        asm.push('.balign 4','program:','.incbin "program.bin"');
        for (const [name,offset] of Object.entries(program.entries)) asm.push('.set '+name+',program+'+offset);
        asm.push('.data','.balign 4','inputs:');
        for (const {name,a,b} of expected) asm.push('.word '+[name,a,b].join(','));
        asm.push('inputs_end:','outputs: .zero '+expected.length*8);
        writeFileSync(join(directory,'run.S'),asm.join('\n')+'\n');
        writeFileSync(join(directory,'expectations.json'),JSON.stringify({
            revision, policy, sourceSha256:sha(source), imageSha256:raw.raw, words:raw.words,
            expected, traps, stats,
        }));
    }
}
