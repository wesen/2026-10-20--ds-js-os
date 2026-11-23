// Agenda's RV32 world against its WebAssembly build: one scripted session (a reminder, add, toggle, delete, a
// rejected prompt, the editor hand-off, a tick and a focus), the same system calls on both. agenda-wasm-world.mjs
// checks the WebAssembly build against the JavaScript Agenda. Run from the repository root.
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import '../../lib/compiler.mjs';
import {CALL, key, message, rv32Transcript, sameTranscript, settle, start, tick, typed, wasmTranscript} from './typed-world-transcript.mjs';

const [cc, emu] = process.argv.slice(2);
assert(cc && emu, 'pass the ESP32-P4 cross-compiler and CJI rv32emu');
const os = resolve('firmware'), world = resolve('apps/typed/agenda');
const {sources} = JSON.parse(readFileSync(join(world, 'app.json'), 'utf8'));
const source = sources.map(name => readFileSync(join(world, name), 'utf8') + '\n').join('');
const wasm = compileTypedWorld(source, readFileSync(join(os, 'build/typed-world-reactor.wasm')));
const clock = {wall: Date.UTC(2026, 10, 3, 19, 16), today: 20261103, offset: -300, zone: 'EST5EDT,M3.2.0/2,M11.1.0/2'};
const t0 = '# Tasks\n- [ ] dentist 🦷 @2026-11-03 14:30 !15m\n- [x] done\n- book a train\n';
const t1 = t0 + '- [ ] x @2026-11-04 14:00\n';
const t2 = t1.replace('- [ ] dentist', '- [x] dentist');
const t3 = t2.replace('- [ ] x @2026-11-04 14:00\n', '');
const script = [
    start(), settle(100, true, t0),
    key('down'), key('f4'), key('up'),
    key('f2'), ...typed('x @tom 2pm'), key('enter'), settle(101, true, t0), settle(102, true, null), settle(103, true, t1),
    key('space'), settle(104, true, t1), settle(105, true, null), settle(106, true, t2),
    key('f5'), key('f5'), settle(107, true, t2), settle(108, true, null), settle(109, true, t3),
    key('f2'), ...typed('x @someday'), key('enter'), key('esc'),
    key('f6'), settle(110, true, {ok: true}),
    tick(), message('focus', null), settle(111, false, 'no file todo.txt'),
];
const dir = mkdtempSync(join(tmpdir(), 'agenda-rv32-world-'));
try {
    const {lines, elf} = rv32Transcript(cc, emu, source, script, clock, dir);
    const calls = sameTranscript(wasmTranscript(wasm, script, clock), lines);
    const of = op => calls.filter(call => call[0] === op);
    assert.deepEqual(of(CALL.EVERY).map(call => call[1]), [15000]);
    assert.deepEqual(of(CALL.FS_WRITE).map(call => call[5]), [t1, t2, t3]);
    const sends = of(CALL.SEND).map(call => [call[4], call[5], JSON.parse(call[6])]);
    assert.deepEqual(sends, [['compositor', 'notify', {text: 'dentist 🦷 at 14:30', sub: 'in 15m'}],
        ['compositor', 'open', {app: 'editor'}]]);
    assert.deepEqual(of(CALL.ASK_FILE).map(call => [call[4], call[5], call[6], call[1], call[2]]),
        [['editor', 'open', 'notes/todo.txt', 3000, 22]]);
    const frames = of(CALL.SCREEN).map(call => JSON.parse(call[4]));
    const first = frames[0].kids[0].items.map(item => item.label);
    assert.deepEqual(first, ['TODAY · TUESDAY 3 NOV', '14:30  dentist 🦷', 'NO DATE', 'book a train']);
    assert(frames.some(frame => frame.kids.at(-1).s === 'Added.'));
    assert(frames.some(frame => frame.kids.at(-1).s.startsWith('unknown date @someday')));
    assert.equal(frames.at(-1).kids.at(-1).s, 'EST5EDT · 0 open · 0 done', 'a missing file is an empty agenda');
    console.log(JSON.stringify({events: script.length, calls: calls.length, frames: frames.length, wasmBytes: wasm.length,
        elfBytes: elf.length, writes: 3}));
} finally {
    if (process.argv.includes('--keep')) console.error(dir);
    else rmSync(dir, {recursive: true, force: true});
}
