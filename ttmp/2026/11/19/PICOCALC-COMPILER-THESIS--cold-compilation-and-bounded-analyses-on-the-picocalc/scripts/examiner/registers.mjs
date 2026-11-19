// node registers.mjs PATH_TO_ESP_GCC PATH_TO_CJI_RV32EMU
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import vm from 'node:vm';

const [cc, emu] = process.argv.slice(2).map(path => resolve(path));
assert(cc && emu, 'pass the ESP gcc and the CJI emulator paths');
const versions = {baseline: 'dd69a81', candidate: 'f0846ba'};
const get = (rev, path) => execFileSync('git', ['show', rev + ':' + path], {encoding: 'utf8'});
const hash = data => createHash('sha256').update(data).digest('hex');
const front = get(versions.candidate, 'picocalc-os/compiler/typed-wasm.js');
assert.equal(front, get(versions.baseline, 'picocalc-os/compiler/typed-wasm.js'));
const ids = n => Array.from({length: n}, (_, i) => i);
const imports = ids(9).map(n => ({name: 'host' + n, params: ids(n).map(() => 'i32'), result: 'i32', index: n}));
const lines = ['function branchy(x:i32,y:i32):i32 { if(x<y) return host1(x); return host2(y,x); }'];
const samples = [];
for (const depth of ids(9)) {
    for (const arity of ids(9)) {
        const name = 'depth' + depth + 'arity' + arity;
        const args = ids(arity).map(i => i === arity - 1 ? 'branchy(x,y)' : 'x*' + (i + 3) + '-y');
        let expression = 'host' + arity + '(' + args.join(',') + ')';
        for (const i of ids(depth)) expression = '(x+' + (i + 1) + '*y)-(' + expression + ')';
        // The arms of max receive saved operands at exactly the requested depth, too.
        let branch = 'Math.max(branchy(x,y),y)';
        for (const i of ids(depth)) branch = '(y-' + (i + 1) + '*x)-(' + branch + ')';
        lines.push('function ' + name + '(x:i32,y:i32):i32 { let r=' + expression + '; return r+(' + branch + '); }');
        for (const pair of [[-7, 11], [0, 0], [3, -5], [-2147483648, 2147483647], [2147483647, -2147483648]])
            samples.push({name, args: pair});
    }
}
const source = lines.join('\n');
function context(revision) {
    const c = vm.createContext({});
    vm.runInContext(front, c);
    vm.runInContext(get(revision, 'picocalc-os/compiler/typed-rv32.js'), c);
    return c;
}

// Wrap the same structured bodies in a standalone Wasm module exposing real JS imports.
const uleb = n => {
    const out = [];
    do { const b = n & 127; n >>>= 7; out.push(n ? b | 128 : b); } while (n);
    return out;
};
const vec = xs => [...uleb(xs.length), ...xs.flat()];
const chars = name => vec(Array.from(Buffer.from(name)));
const sec = (id, rows) => { const body = vec(rows); return [id, ...uleb(body.length), ...body]; };
const {functions} = context(versions.baseline).typedWasm.compileFunctions(source, imports.length, imports);
const wasm = new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,
    ...sec(1, [...imports, ...functions].map(fn => [0x60, ...vec(fn.params.map(() => 127)), 1, 127])),
    ...sec(2, imports.map(fn => [...chars('guest'), ...chars(fn.name), 0, ...uleb(fn.index)])),
    ...sec(3, functions.map((fn, i) => uleb(i + imports.length))),
    ...sec(7, functions.map((fn, i) => [...chars(fn.name), 0, ...uleb(i + imports.length)])),
    ...sec(10, functions.map(fn => fn.body)),
]));
let state = 0;
let calls = 0;
const seed = 0x13579bdf;
const handlers = Object.fromEntries(imports.map(fn => [fn.name, (...args) => {
    calls++;
    state = (Math.imul(state, 17) + fn.index) | 0;
    for (const arg of args) state = (Math.imul(state, 33) + arg) | 0;
    return state;
}]));
const oracle = new WebAssembly.Instance(wasm, {guest: handlers}).exports;
const expected = Buffer.alloc(samples.length * 8);
for (const [i, sample] of samples.entries()) {
    state = seed;
    expected.writeInt32LE(oracle[sample.name](...sample.args), 8 * i);
    expected.writeInt32LE(state, 8 * i + 4);
}

function assembly(program) {
    const volatile = ['t0','t1','t2','t3','t4','t5','t6', ...ids(8).map(i => 'a' + i)];
    const out = ['.option norvc', '.option norelax', '.text', '.globl _start', '_start:', 'mv s0,sp',
        'la s1,results', 'la s2,state'];
    for (const {name, args} of samples) {
        out.push('li t0,' + seed, 'sw t0,0(s2)', 'li a0,' + args[0], 'li a1,' + args[1],
            'jal ra,' + name, 'bne sp,s0,bad', 'sw a0,0(s1)', 'lw t0,0(s2)', 'sw t0,4(s1)', 'addi s1,s1,8');
    }
    out.push('li a0,1','la a1,results','li a2,' + expected.length,'li a7,2','ecall',
        'li a0,0','li a7,1','ecall','bad:','li a0,93','li a7,1','ecall');
    for (const fn of imports) {
        out.push(fn.name + ':','andi t0,sp,15','bnez t0,bad','la t1,state','lw t0,0(t1)',
            'slli t2,t0,4','add t0,t2,t0','addi t0,t0,' + fn.index);
        for (const i of ids(fn.params.length))
            out.push('slli t2,t0,5','add t0,t0,t2','add t0,t0,a' + i);
        out.push('sw t0,0(t1)');
        for (const [i, reg] of volatile.entries()) out.push('li ' + reg + ',' + (0x6100 + i));
        out.push('la a0,state','lw a0,0(a0)','ret');
    }
    const entries = new Map(Object.entries(program.entries).map(([name, offset]) => [offset, name]));
    const relocs = new Map(program.relocations.map(({offset, index}) => [offset, imports[index].name]));
    const words = Buffer.from(program.image);
    for (let p = 0; p < words.length; p += 4) {
        if (entries.has(p)) out.push(entries.get(p) + ':');
        if (relocs.has(p)) {
            assert.equal(words.readUInt32LE(p), 0);
            out.push('jal ra,' + relocs.get(p));
        } else out.push('.4byte 0x' + words.readUInt32LE(p).toString(16));
    }
    out.push('.data','.balign 4','state: .word 0','results: .zero ' + expected.length);
    return out.join('\n') + '\n';
}

const work = mkdtempSync(join(tmpdir(), 'picocalc-examiner-'));
const results = {};
try {
    for (const [label, rev] of Object.entries(versions)) {
        const p = context(rev).typedRv32.compile(source, imports);
        const asm = join(work, label + '.S');
        const elf = join(work, label + '.elf');
        writeFileSync(asm, assembly(p));
        execFileSync(cc, ['-march=rv32im','-mabi=ilp32','-nostdlib','-nostartfiles','-mno-relax',
            '-Wl,--no-relax,-e,_start,-Ttext=0x10000', '-o', elf, asm]);
        const raw = execFileSync(emu, [elf]);
        assert.deepEqual(raw, expected, label + ' machine return and ordered import digest');
        results[label] = {revision: rev, imageBytes: p.image.length, relocations: p.relocations.length,
            imageSHA256: hash(p.image), resultSHA256: hash(raw)};
    }
} finally {
    rmSync(work, {recursive: true, force: true});
}
console.log(JSON.stringify({node: process.version, gcc: execFileSync(cc, ['-dumpfullversion'], {encoding: 'utf8'}).trim(),
    emulatorSHA256: hash(readFileSync(emu)), sourceSHA256: hash(source), programs: lines.length - 1,
    scalarInputPairsPerProgram: 5, callsPerImplementation: calls, inputs: samples.length,
    liveDepths: ids(9), arities: ids(9), outputBytesPerImplementation: expected.length,
    oracleSHA256: hash(expected), results}, null, 2));
