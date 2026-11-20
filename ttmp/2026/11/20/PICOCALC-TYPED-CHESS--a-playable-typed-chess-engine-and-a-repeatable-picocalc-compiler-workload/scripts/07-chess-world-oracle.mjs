import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';
import '../../../../../../picocalc-os/compiler/typed-async.js';
import '../../../../../../picocalc-os/compiler/typed-world.js';

const [gcc, emulator, reactor] = process.argv.slice(2).map(x => resolve(x));
assert(gcc && emulator && reactor, 'pass P4 GCC, CJI RV32 emulator, and shared reactor ELF');
const sdk = resolve('picocalc-os/sdk');
const dir = resolve('picocalc-os/worlds/chess');
const source = readFileSync(join(dir, 'source.list'), 'utf8').trim().split('\n')
    .map(file => readFileSync(join(dir, file), 'utf8') + '\n').join('');
const operations = [...readFileSync(join(sdk, 'nw_wire.h'), 'utf8').matchAll(/NW_CALL_([A-Z_]+)/g)]
    .map(match => match[1]);
const wasm = compileTypedWorld(source, readFileSync('picocalc-os/build/typed-world-reactor.wasm'));
const rv32 = compileTypedWorldRv32(source, readFileSync(reactor));
const trace = [];
let guest;
let timer = 2000;
const decode = new TextDecoder(), encode = new TextEncoder();
const syscall = (op, a, b, c, s0, n0, s1, n1, s2, n2) => {
    const memory = new Uint8Array(guest.memory.buffer);
    const text = (p, n) => decode.decode(memory.subarray(p, p+n));
    switch (operations[op - 1]) {
        case 'KIND': case 'PRESENT': return 0n;
        case 'SLEEP':
            assert.equal(a, 0);
            trace.push('sleep ' + ++timer);
            return BigInt(timer);
        case 'SCREEN':
            trace.push('screen ' + text(s0, n0), 'hints ' + text(s1, n1));
            return 0n;
        case 'SEND':
            trace.push('send ' + [text(s0,n0),text(s1,n1),text(s2,n2)].join(' '));
            return 0n;
        default: throw new Error('unexpected world syscall ' + operations[op - 1]);
    }
};
const denied = () => { throw new Error('unexpected WASI call'); };
guest = new WebAssembly.Instance(new WebAssembly.Module(wasm), {nw:{call:syscall,error:()=>0},
    wasi_snapshot_preview1:{fd_close:denied,fd_seek:denied,fd_write:denied}}).exports;
guest._initialize?.();
guest.nw_wasm_init();
const events = [];
function event(label, kind, second, token, type, json, from) {
    events.push({label,kind,second,token,type,json,from});
    const bytes = [type, json, from].map(x => encode.encode(x));
    const lengths = bytes.map(x => x.length);
    let at = guest.nw_wasm_buffer(lengths.reduce((a,b) => a+b+1,0));
    assert(at);
    const memory = new Uint8Array(guest.memory.buffer);
    for (const segment of bytes) {
        memory.set(segment, at);
        at += segment.length;
        memory[at++] = 0;
    }
    const offset = trace.length;
    trace.push('event ' + label);
    const result = guest.nw_wasm_event(kind, second, 0, token, ...lengths);
    trace.push('return ' + result);
    return {result, lines:trace.slice(offset+1,-1)};
}
const key = (name, ch='', label=name, state='down') => event(label, 0, 0, 0, 'key', JSON.stringify({key:name,ch,state}), 'compositor');
const settle = (token, label, ok=true) => event(label, 4, Number(ok), token, '', 'null', '');
const status = event => JSON.parse(event.lines.find(line => line.startsWith('screen ')).slice(7)).kids[0].s;
const start = event('launch', 2, 0, 0, '', 'null', '');
assert.equal(status(start), 'White to move');
assert.equal(key('enter').result, 0);
assert.equal(key('up', '', 'up-release', 'up').lines.length, 0);
key('up'); key('up');
const white = key('enter', '', 'white e2e4');
assert.equal(status(white), 'Black is thinking');
assert.equal(white.result, 1);
const first = timer;
assert.deepEqual(settle(first + 9000, 'unknown wake'), {result:1, lines:[]});
assert.equal(status(key('right', '', 'move cursor during search')), 'Black is thinking');
let wake;
let ticks = 0;
do {
    wake = settle(timer, 'search slice ' + ticks++);
    assert(ticks < 1000);
} while (wake.result === 1);
assert.equal(status(wake), 'White to move');
const reply = JSON.parse(wake.lines.find(line => line.startsWith('screen ')).slice(7)).kids.at(-1).s;
assert.equal(reply, 'Last b8-c6   Depth 3   Nodes 1600   Eval 12');
assert.equal(ticks, 78);
assert.equal(status(key('f2', '', 'reset')), 'White to move');
key('enter'); key('up'); key('up');
assert.equal(key('enter', '', 'start second search').result, 1);
const replaced = timer;
assert.equal(status(key('f2', '', 'reset during search')), 'White to move');
assert.deepEqual(settle(replaced, 'stale wake after reset'), {result:0,lines:[]});
assert.equal(status(key('enter', '', 'fresh selection')), 'White to move');
key('up'); key('up');
assert.equal(key('enter', '', 'third search').result, 1);
assert.equal(status(settle(timer, 'failed wake fallback', false)), 'White to move');

const temp = mkdtempSync(join(tmpdir(), 'typed-chess-world-'));
try {
    const cString = JSON.stringify;
    writeFileSync(join(temp, 'chess-events.h'), 'static const struct chess_event events[] = {\n' +
        events.map(x => '  {' + [x.kind,x.second,x.token,...[x.label,x.type,x.json,x.from].map(y=>cString(y))].join(',') + '}').join(',\n') + '\n};\n');
    const app = join(temp, 'chess.so');
    const driver = join(temp, 'driver.elf');
    writeFileSync(app, rv32);
    execFileSync(gcc, ['-march=rv32im','-mabi=ilp32','-O2','-fno-builtin','-msmall-data-limit=0',
        '-mno-relax','-nostdlib','-Wl,-Ttext=0x10000','-Wl,-e,_start','-I',sdk,'-I',temp,'-o',driver,
        fileURLToPath(new URL('./08-chess-world-driver.c', import.meta.url)),
        ...['libc.o','hostcalls.o','softfloat.o'].map(name=>join(dirname(emulator),name))]);
    const actual = execFileSync(emulator, [driver,app], {encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024}).trimEnd().split('\n');
    assert.equal(actual.length, trace.length);
    for (const [index,line] of trace.entries()) assert.equal(actual[index], line, 'RV32 world trace line ' + index);
} finally {
    rmSync(temp, {recursive:true,force:true});
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({events:events.length,searchSlices:ticks,reply,targets:['wasm','rv32'],
    screens:trace.filter(line=>line.startsWith('screen ')).length,
    staleWakeIgnored:true,failedWakeLegalFallback:true,traceSha256:digest(trace.join('\n')),
    wasmSha256:digest(wasm),rv32Sha256:digest(rv32)},null,2));
