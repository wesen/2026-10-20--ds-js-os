import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-async.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';
import '../../../../../../picocalc-os/compiler/typed-world.js';

const [cc, emu, only] = process.argv.slice(2);
assert(cc && emu, 'Pass P4 GCC and CJI rv32emu, and optionally a fixture name.');
const os = resolve('picocalc-os');
const editor = join(os, 'worlds/editor');
const source = readFileSync(join(editor, 'source.list'), 'utf8').trim().split('\n')
    .map(file => readFileSync(join(editor, file), 'utf8') + '\n').join('');
const sdk = join(os, 'sdk');
const operations = [...readFileSync(join(sdk, 'nw_wire.h'), 'utf8').matchAll(/NW_CALL_([A-Z_]+)/g)]
    .map(match => match[1]);
const large = 'text '.repeat(15).concat('\r\n').repeat(53) + 'a'.repeat(14) + '\r\n' +
    'text '.repeat(15).concat('\r\n').repeat(797) + 'x'.repeat(70);
assert.equal(large.length, 65536);
assert.equal(large.slice(4095, 4097), '\r\n');
const normalized = large.replace(/\r\n?/g, '\n');

const event = (label, kind, second, token, type, data, from, failYield = false) =>
    ({label, kind, second, token, type, json:JSON.stringify(data), from, failYield});
const boot = () => event('initial view', 2, 0, 0, '', null, '');
const open = (label, handle, name) => event(label, 0, 1, 0, 'open', {file:{$h:handle},name}, 'files');
const key = (label, key, ch = '') => event(label, 0, 0, 0, 'key', {key,ch,state:'down'}, 'compositor');
const settle = (label, token, data = null, ok = true, failYield = false) =>
    event(label, 4, Number(ok), token, '', data, '', failYield);

// Use the actual CRLF slice rule to pick the expected timers for the following events.
function completeLarge(handle, beforeFirstSlice = []) {
    const events = [settle('large read completes', 100 + handle, large), ...beforeFirstSlice];
    let timer = 2000;
    let at = 0;
    while (at < large.length) {
        at = Math.min(at + 4096, large.length);
        if (large[at - 1] === '\r' && large[at] === '\n') at++;
        events.push(settle('normalize slice ' + (++timer - 2000), timer));
    }
    events.push(settle('draw large file', ++timer));
    return {events, timer};
}

const fixtures = [
    {name:'guard-open', expectedWrite:normalized, events:[
        boot(), open('start old read', 23, 'old.txt'), settle('draw old file', 123, 'previous document'),
        open('start large read', 24, 'large.txt'),
        key('key during read', 'X', 'X'),
        ...completeLarge(24, [key('key during normalization', 'X', 'X'),
            settle('duplicate read while normalizing', 124, 'unexpected data')]).events,
        key('save normalized bytes', 'f2'),
        settle('save completes', 324, {bytes:normalized.length}),
    ]},
    {name:'read-failures', events:[
        boot(),
        open('read startup fails', 29, 'never-opened.txt'),
        settle('spurious failed read token', 129, 'should not open'),
        open('read permission check', 23, 'denied.txt'),
        settle('read permission denied', 123, 'permission denied', false),
        open('missing file lookup', 24, 'missing.txt'),
        settle('missing file opens empty', 124, 'no file missing.txt', false),
        open('start large failing read', 25, 'bad.txt'),
        settle('first normalization timer fails', 125, large, true, true),
    ]},
];
const incoming = completeLarge(23);
const oldTimer = incoming.timer + 1;
const searchKeys = [key('open Find', 'f3'),
    ...[...'text text z'].map((ch, i) => key('query unit ' + i, ch, ch)),
    key('start pending search', 'enter')];
for (const search of [true, false]) {
    fixtures.push({name:search ? 'replace-search' : 'replace-control', events:[
        boot(), open('start large read', 23, 'large.txt'), ...incoming.events,
        ...(search ? searchKeys : []),
        open('start replacement read', 24, 'replacement.txt'),
        settle('old timer during replacement', oldTimer),
        settle('draw replacement', 124, 'replacement text'),
        settle('old timer after replacement', oldTimer),
    ]});
}
fixtures.push({name:'replace-query', events:[
    boot(), open('start large read', 23, 'large.txt'), ...incoming.events, ...searchKeys,
    key('begin replacement query', 'f3'),
    key('clear previous query', 'esc'),
    key('enter new query', 'f3'),
    key('type new query', 'x', 'x'),
    key('find replacement query', 'enter'),
    settle('old timer after new query', oldTimer),
]});

const wasm = new WebAssembly.Module(compileTypedWorld(source,
    readFileSync(join(os, 'build/typed-world-reactor.wasm'))));
const tmp = mkdtempSync(join(tmpdir(), 'typed-editor-events-'));
const gcc = (args) => execFileSync(cc, args, {stdio:'inherit'});
const encoder = new TextEncoder(), decoder = new TextDecoder();

function runWasm({events, expectedWrite = ''}) {
    let exports, timer = 2000, failYield = false;
    const trace = [];
    const call = (op, a, b, c, s0, n0, s1, n1, s2, n2, out, outSize) => {
        const memory = new Uint8Array(exports.memory.buffer);
        const str = (address, length) => decoder.decode(memory.slice(address, address + length));
        switch (operations[op - 1]) {
            case 'KIND':
            case 'PRESENT': return 0n;
            case 'FS_READ': trace.push('read ' + a); return BigInt(a === 29 ? -1 : 100 + a);
            case 'FS_WRITE':
                assert.equal(str(s1, n1), expectedWrite, 'write receives the exact normalized file bytes');
                trace.push('write ' + a + ' ' + n1);
                return BigInt(300 + a);
            case 'SLEEP':
                assert.equal(a, 0);
                if (failYield) { trace.push('sleep failed'); return -1n; }
                trace.push('sleep ' + ++timer);
                return BigInt(timer);
            case 'REPLY': trace.push('reply ' + str(s0, n0)); return 0n;
            case 'RELEASE': trace.push('release ' + a); return 1n;
            case 'SCREEN': trace.push('screen ' + str(s0, n0), 'hints ' + str(s1, n1)); return 0n;
            case 'STORE_LOAD': if (outSize) memory[out] = 0; return 0n;
            case 'STORE_SAVE': trace.push('store ' + str(s0, n0)); return 0n;
            case 'CLOCK_WALL': return 1792662060000n;
            default: throw new Error('Unexpected kernel opcode ' + op);
        }
    };
    const denyWasi = () => { throw new Error('Unexpected WASI call'); };
    ({exports} = new WebAssembly.Instance(wasm, {nw:{call,error:() => 0},
        wasi_snapshot_preview1:{fd_close:denyWasi, fd_seek:denyWasi, fd_write:denyWasi}}));
    exports._initialize?.();
    exports.nw_wasm_init();
    for (const {label, kind, second, token, type, json, from, failYield:fail} of events) {
        const strings = [type, json, from].map(text => encoder.encode(text));
        const lengths = strings.map(bytes => bytes.length);
        let address = exports.nw_wasm_buffer(lengths.reduce((sum, n) => sum + n + 1, 0));
        assert(address);
        const memory = new Uint8Array(exports.memory.buffer);
        for (const bytes of strings) {
            memory.set(bytes, address);
            address += bytes.length;
            memory[address++] = 0;
        }
        failYield = fail;
        trace.push('event ' + label);
        trace.push('return ' + exports.nw_wasm_event(kind, second, 0, token, ...lengths));
    }
    return trace;
}

function cString(text) {
    return text.match(/[\s\S]{1,2000}/g)?.map(part => JSON.stringify(part)).join('\n') ?? '""';
}

function runRv32({events, expectedWrite = ''}, app) {
    const driver = join(tmp, 'driver.elf');
    writeFileSync(join(tmp, 'editor-events.h'), 'static const char expected_write[] = ' + cString(expectedWrite) +
        ';\nstatic const struct edit_event events[] = {\n' + events.map(e =>
            '  {' + [e.kind, e.second, e.token, Number(e.failYield), cString(e.label), cString(e.type),
                cString(e.json), cString(e.from)].join(', ') + '},').join('\n') + '\n};\n');
    gcc(['-march=rv32im', '-mabi=ilp32', '-O2', '-fno-builtin', '-msmall-data-limit=0',
        '-mno-relax', '-nostdlib', '-Wl,-Ttext=0x10000', '-Wl,-e,_start', '-I', sdk, '-I', tmp,
        '-o', driver, fileURLToPath(new URL('02-editor-event-driver.c', import.meta.url)),
        ...['libc.o', 'hostcalls.o', 'softfloat.o'].map(file => join(dirname(emu), file))]);
    return execFileSync(emu, [driver, app], {encoding:'utf8',timeout:15000}).trimEnd().split('\n');
}

function group(trace) {
    const steps = new Map();
    let current;
    for (const line of trace) {
        if (line.startsWith('event ')) {
            current = [];
            steps.set(line.slice(6), current);
        } else {
            current.push(line);
        }
    }
    return steps;
}

function expectOpen(steps, label, status) {
    const calls = steps.get(label);
    const frame = calls.find(line => line.startsWith('screen '));
    assert(frame, label + ' publishes a screen');
    assert.equal(JSON.parse(frame.slice(7)).kids[0].s, status);
    assert(calls.indexOf(frame) < calls.indexOf('reply {"ok":true}'), label + ' replies after publishing');
    assert.equal(calls.at(-1), 'return 0');
}

try {
    const reactor = join(tmp, 'reactor.so'), app = join(tmp, 'editor.so');
    gcc(['-march=rv32imafc_zicsr_zifencei', '-mabi=ilp32f', '-Os', '-fPIC', '-shared', '-nostartfiles',
        '-nostdlib', '-e', 'app_main', '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections',
        '-fvisibility=hidden', '-Wl,--strip-all', '-Wl,-z,max-page-size=16', '-Wno-attributes',
        '-I', sdk, '-o', reactor, join(sdk, 'typed/world.c'), join(sdk, 'typed/rv32-slot.S'),
        join(sdk, 'nw_elf.c'), join(os, 'third_party/quickjs/libunicode.c')]);
    writeFileSync(app, compileTypedWorldRv32(source, readFileSync(reactor)));
    const results = new Map();
    for (const fixture of fixtures.filter(fixture => !only || fixture.name === only)) {
        const trace = runWasm(fixture);
        assert.deepEqual(runRv32(fixture, app), trace, fixture.name + ' has identical per-event SDK calls and statuses');
        const steps = group(trace);
        const summary = {fixture:fixture.name, targets:['wasm','rv32'], events:steps.size,
            timers:trace.filter(line => /^sleep \d+$/.test(line)).length,
            screens:trace.filter(line => line.startsWith('screen ')).length,
            examinedSavedBytes:fixture.expectedWrite?.length ?? 0};
        results.set(fixture.name, {steps, summary});
    }
    const guard = results.get('guard-open')?.steps;
    if (guard) {
        for (const label of ['key during read', 'key during normalization', 'duplicate read while normalizing'])
            assert.deepEqual(guard.get(label), ['return 1'], label + ' preserves the pending open');
        for (let slice = 1; slice < 16; slice++)
            assert.deepEqual(guard.get('normalize slice ' + slice), ['sleep ' + (2001 + slice), 'return 1']);
        assert.deepEqual(guard.get('normalize slice 16'), ['release 23', 'sleep 2017', 'return 1']);
        expectOpen(guard, 'draw large file', 'large.txt  1:1');
        assert(guard.get('save normalized bytes').includes('write 24 ' + normalized.length));
    }
    const failures = results.get('read-failures')?.steps;
    if (failures) {
        assert.deepEqual(failures.get('read startup fails'),
            ['read 29', 'release 29', 'reply {"ok":false,"why":"Cannot read file."}', 'return 0']);
        assert.deepEqual(failures.get('spurious failed read token'), ['return 0']);
        assert.deepEqual(failures.get('read permission denied'),
            ['release 23', 'reply {"ok":false,"why":"permission denied"}', 'return 0']);
        expectOpen(failures, 'missing file opens empty', 'missing.txt  1:1');
        assert.deepEqual(failures.get('first normalization timer fails').slice(-4),
            ['sleep failed', 'release 25', 'reply {"ok":false,"why":"Invalid file response."}', 'return 0']);
    }
    const search = results.get('replace-search')?.steps, control = results.get('replace-control')?.steps;
    for (const result of [search, control].filter(Boolean)) {
        assert.deepEqual(result.get('old timer during replacement'), ['return 1']);
        assert.deepEqual(result.get('old timer after replacement'), ['return 0']);
        expectOpen(result, 'draw replacement', 'replacement.txt  1:1');
        assert(result.get('draw replacement').includes('release 23'));
    }
    if (search) assert.deepEqual(search.get('start pending search'), ['sleep ' + oldTimer, 'return 1']);
    if (search && control) assert.deepEqual(search.get('draw replacement'), control.get('draw replacement'));
    const nextQuery = results.get('replace-query')?.steps;
    if (nextQuery) {
        assert.deepEqual(nextQuery.get('start pending search'), ['sleep ' + oldTimer, 'return 1']);
        assert.equal(nextQuery.get('begin replacement query').at(-1), 'return 0');
        const match = nextQuery.get('find replacement query').find(line => line.startsWith('screen '));
        assert(match, 'the new query publishes its match in the existing document');
        assert.equal(JSON.parse(match.slice(7)).kids[0].s, 'large.txt  1:3');
        assert.deepEqual(nextQuery.get('old timer after new query'), ['return 0']);
    }
    assert(results.size, 'No fixture selected');
    for (const {summary} of results.values()) console.log(JSON.stringify(summary));
} finally {
    rmSync(tmp, {recursive:true,force:true});
}
