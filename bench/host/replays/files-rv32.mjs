// Files' RV32 world against its WebAssembly build: one scripted session (listing, sizes, mkdir, entering and leaving a
// folder, a refused editor hand-off, delete), the same system calls on both. files-wasm.mjs checks the WebAssembly
// build against the JavaScript Files. From PICOCALC-TYPED-APPS scripts/02-check-files-rv32.mjs; run from the
// repository root.
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import '../../lib/compiler.mjs';
import {CALL, key, rv32Transcript, sameTranscript, settle, start, typed, wasmTranscript} from './typed-world-transcript.mjs';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass the ESP32-P4 cross-compiler and CJI rv32emu');
const os = resolve('firmware'), world = resolve('apps/typed/files');
const {sources} = JSON.parse(readFileSync(join(world, 'app.json'), 'utf8'));
const source = sources.map(name => readFileSync(join(world, name), 'utf8') + '\n').join('');
const wasm = compileTypedWorld(source, readFileSync(join(os, 'build/typed-world-reactor.wasm')));
const clock = {wall: -1, today: -1, offset: 0, zone: ''};
const listing = [{name: 'A.txt', size: 1280, dir: false}, {name: 'z', size: 0, dir: true},
    {name: 'big "q"', size: 3221225472, dir: false}, {more: true}];
const withA = [...listing.slice(0, 3), {name: 'a', size: 0, dir: true}];
const info = {free: 34359738368, total: 68719476736};
const script = [
    start(), settle(100, true, listing), settle(101, true, info),
    key('f3'), ...typed('a'), key('enter'), settle(102, true, null), settle(103, true, withA), settle(104, true, info),
    key('enter'), settle(105, true, []), settle(106, true, info),
    key('backspace'), settle(107, true, withA), settle(108, true, info),
    key('down'), key('down'), key('enter'), settle(109, true, {ok: false, why: 'busy'}),
    key('f5'), key('f5'), settle(110, true, null), settle(111, true, withA.filter(e => e.name !== 'A.txt')),
    settle(112, false, 'no card'),
];
const dir = mkdtempSync(join(tmpdir(), 'files-rv32-'));
try {
    const {lines, elf} = rv32Transcript(cc, emu, source, script, clock, dir);
    const calls = sameTranscript(wasmTranscript(wasm, script, clock), lines);
    const of = op => calls.filter(call => call[0] === op);
    assert.deepEqual(of(CALL.FS_OPEN).map(call => call[4]), ['fs:/']);
    assert.deepEqual(of(CALL.FS_OP).map(call => [call[4], call[5]]), [['list', ''], ['info', ''], ['mkdir', 'a'],
        ['list', ''], ['info', ''], ['list', 'a'], ['info', ''], ['list', ''], ['info', ''], ['remove', 'A.txt'],
        ['list', ''], ['info', '']]);
    assert.deepEqual(of(CALL.ASK_FILE).map(call => [call[4], call[5], call[6]]), [['editor', 'open', 'A.txt']]);
    assert.deepEqual(of(CALL.REVOKE).map(call => call[1]), [21]);
    const frames = of(CALL.SCREEN).map(call => JSON.parse(call[4]));
    const rows = frame => frame.kids[1].items?.map(item => [item.label, item.right]);
    assert.deepEqual(rows(frames[0]), [['z/', ''], ['A.txt', '1.3 KB'], ['big "q"', '3.0 GB']]);
    assert.equal(frames[0].kids[0].kids[1].s, '32.0 GB free');
    assert.equal(frames[0].kids[3].s, 'Only the first 256 entries are shown.');
    assert(frames.some(frame => frame.kids[2].prompt === 'New folder: ' && frame.kids[2].value === 'a'));
    assert(frames.some(frame => frame.kids[1].s === 'Empty folder. Backspace goes up.' && frame.kids[0].kids[0].s === '/a'));
    assert(frames.some(frame => frame.kids[3].s === 'Editor: busy'));
    assert(frames.some(frame => frame.kids[3].s === 'F5 again deletes A.txt'));
    assert.equal(frames.at(-1).kids[3].s, 'Deleted A.txt');
    assert.equal(frames.at(-1).kids[0].kids[1].s, '', 'a failed info hides the free space');
    console.log(JSON.stringify({events: script.length, calls: calls.length, frames: frames.length, wasmBytes: wasm.length,
        elfBytes: elf.length}));
} finally {
    if (process.argv.includes('--keep')) console.error(dir);
    else rmSync(dir, {recursive: true, force: true});
}
