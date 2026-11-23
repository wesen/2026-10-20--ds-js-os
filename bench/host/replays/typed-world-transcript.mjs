// A typed world's WebAssembly and RV32 builds, run against one scripted kernel, must make the same system calls with
// the same arguments. The kernel's rules are typed-world-transcript-driver.c's: handles count from 20, tokens of
// asynchronous calls from 100, the clock advances 1 s of uptime and of wall time per event, the store keeps what was
// saved. Each call is a JSON line [op, a, b, c, s0, s1, s2]; each event ends with ["end", result].
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const CALL = {SEND: 4, REPLY: 6, EVERY: 10, KIND: 11, ASK: 12, SLEEP: 13, RELEASE: 16, STORE_LOAD: 17,
    STORE_SAVE: 18, SCREEN: 20, PRESENT: 21, CLOCK_WALL: 22, CLOCK_ZONE: 23, FS_OPEN: 29, FS_READ: 30,
    CLOCK_OFFSET: 31, FS_WRITE: 32, CLOCK_TODAY: 33, FS_AT: 34, REVOKE: 35, ASK_FILE: 36, FS_OP: 37, NOW: 2};
const ASYNC = new Set([CALL.FS_READ, CALL.FS_WRITE, CALL.FS_OP, CALL.ASK_FILE, CALL.ASK, CALL.SLEEP]);
const here = dirname(fileURLToPath(import.meta.url));

// An event: {kind, second, timer, token, type, json, from}; kinds as nw.h numbers them.
export const message = (type, json, from = 'compositor', ask = 0) =>
    ({kind: 0, second: ask, timer: 0, token: 0, type, json: JSON.stringify(json), from});
export const key = (name, ch = '') => message('key', {key: name, ch, state: 'down'});
export const typed = text => [...text].map(ch => key(ch === ' ' ? 'space' : ch, ch));
export const start = () => ({kind: 2, second: 0, timer: 0, token: 0, type: '', json: 'null', from: ''});
export const tick = () => ({kind: 1, second: 0, timer: 0, token: 0, type: '', json: 'null', from: ''});
export const settle = (token, ok, value) =>
    ({kind: 4, second: ok ? 1 : 0, timer: 0, token, type: '', json: JSON.stringify(value), from: ''});

function quoteBytes(bytes) {
    const out = [34];
    for (const c of bytes) {
        if (c === 34 || c === 92) out.push(92, c);
        else if (c < 32) out.push(...Buffer.from('\\u' + c.toString(16).padStart(4, '0')));
        else out.push(c);
    }
    out.push(34);
    return Buffer.from(out);
}

export function wasmTranscript(bytes, script, clock) {
    let memory, step = 0, handles = 20, tokens = 100, stored = Buffer.alloc(0);
    const lines = [];
    const view = (at, n) => Buffer.from(memory.buffer, at, n);
    const call = (op, a, b, c, s0, n0, s1, n1, s2, n2, out, outN) => {
        lines.push(Buffer.concat([Buffer.from(`[${op},${a},${b},${c},`), quoteBytes(view(s0, n0)), Buffer.from(','),
            quoteBytes(view(s1, n1)), Buffer.from(','), quoteBytes(view(s2, n2)), Buffer.from(']')]));
        const write = text => {
            const data = Buffer.from(text);
            const n = Math.min(data.length, outN - 1);
            data.copy(view(out, outN), 0, 0, n);
            view(out, outN)[n] = 0;
            return BigInt(data.length);
        };
        if (op === CALL.NOW) return BigInt(step) * 1000000n;
        if (op === CALL.CLOCK_WALL) return clock.wall < 0 ? -1n : BigInt(clock.wall) + BigInt(step) * 1000n;
        if (op === CALL.CLOCK_TODAY) return BigInt(clock.today);
        if (op === CALL.CLOCK_OFFSET) return BigInt(clock.offset + 1440);
        if (op === CALL.CLOCK_ZONE) return write(clock.zone);
        if (op === CALL.STORE_LOAD) return write(stored);
        if (op === CALL.STORE_SAVE) { stored = Buffer.from(view(s0, n0)); return 0n; }
        if (op === CALL.FS_OPEN || op === CALL.FS_AT) return BigInt(handles++);
        if (ASYNC.has(op)) return BigInt(tokens++);
        return 0n;
    };
    const wasi = new Proxy({}, {get: () => () => 0});
    const {exports} = new WebAssembly.Instance(new WebAssembly.Module(bytes),
        {nw: {call, error: (out, n) => { if (n) view(out, n)[0] = 0; return 0; }}, wasi_snapshot_preview1: wasi});
    memory = exports.memory;
    exports._initialize?.();
    exports.nw_wasm_init();
    for (step = 0; step < script.length; step++) {
        const e = script[step];
        const parts = [e.type, e.json, e.from].map(s => Buffer.from(s));
        const at = exports.nw_wasm_buffer(parts.reduce((n, p) => n + p.length + 1, 0));
        let offset = at;
        for (const part of parts) {
            part.copy(view(offset, part.length));
            view(offset + part.length, 1)[0] = 0;
            offset += part.length + 1;
        }
        const result = exports.nw_wasm_event(e.kind, e.second, e.timer, e.token, ...parts.map(p => p.length));
        lines.push(Buffer.from(`["end",${result}]`));
    }
    return lines;
}

function cString(text) {
    let out = '"';
    for (const c of Buffer.from(text)) {
        if (c === 34 || c === 92) out += '\\' + String.fromCharCode(c);
        else if (c >= 32 && c < 127) out += String.fromCharCode(c);
        else out += '\\' + c.toString(8).padStart(3, '0');
    }
    return out + '"';
}

// Build the RV32 reactor, link the world, run the script on rv32emu; returns the lines and the ELF.
export function rv32Transcript(cc, emu, source, script, clock, dir) {
    const os = join(here, '../../../firmware'), sdk = join(os, 'sdk'), runtime = join(sdk, 'typed');
    const reactor = join(dir, 'reactor.so'), app = join(dir, 'world.so'), driver = join(dir, 'driver.elf');
    execFileSync(cc, [
        '-march=rv32imafc_zicsr_zifencei', '-mabi=ilp32f', '-Os', '-fPIC', '-shared', '-nostartfiles',
        '-nostdlib', '-e', 'app_main', '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections',
        '-fvisibility=hidden', '-Wl,--strip-all', '-Wl,-z,max-page-size=16', '-Wno-attributes', '-I', sdk, '-o', reactor,
        join(runtime, 'world.c'), join(runtime, 'chess-psix.c'), join(runtime, 'rv32-slot.S'), join(sdk, 'nw_elf.c'),
        join(os, 'third_party/quickjs/libunicode.c'), join(here, 'libgcc-helpers.c'),
    ], {stdio: 'inherit'});
    const elf = compileTypedWorldRv32(source, readFileSync(reactor));
    writeFileSync(app, elf);
    writeFileSync(join(dir, 'script.h'), [
        `#define WALL ${clock.wall}LL`, `#define TODAY ${clock.today}`, `#define OFFSET ${clock.offset}`,
        `#define ZONE ${cString(clock.zone)}`,
        'static const struct script_event { int kind, second, timer, token; const char *type, *json, *from; } script[] = {',
        ...script.map(e => `    {${e.kind}, ${e.second}, ${e.timer}, ${e.token}, ${cString(e.type)}, ${cString(e.json)}, ${cString(e.from)}},`),
        '};', ''].join('\n'));
    execFileSync(cc, [
        '-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0', '-mno-relax', '-nostdlib',
        '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-I', sdk, '-I', dir, '-o', driver,
        join(here, 'typed-world-transcript-driver.c'),
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file)),
    ], {stdio: 'inherit'});
    const output = execFileSync(emu, [driver, app], {timeout: 60000, maxBuffer: 1 << 28});
    const lines = [];
    let at = 0;
    while (at < output.length) {
        const end = output.indexOf(10, at);
        lines.push(output.subarray(at, end < 0 ? output.length : end));
        at = end < 0 ? output.length : end + 1;
    }
    if (lines.at(-1)?.toString() !== 'transcript done') throw new Error('RV32 transcript stopped: ' + output.subarray(-400));
    lines.pop();
    return {lines, elf};
}

// Compare the two transcripts line by line; return the calls as parsed JSON.
export function sameTranscript(wasm, rv32) {
    const n = Math.min(wasm.length, rv32.length);
    for (let i = 0; i < n; i++) {
        if (!wasm[i].equals(rv32[i]))
            throw new Error(`transcripts differ at line ${i}:\n  wasm ${wasm[i].toString().slice(0, 600)}\n  rv32 ${rv32[i].toString().slice(0, 600)}`);
    }
    if (wasm.length !== rv32.length) throw new Error(`transcripts have ${wasm.length} and ${rv32.length} lines`);
    return wasm.map(line => JSON.parse(line.toString()));
}
