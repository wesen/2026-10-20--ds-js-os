import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInThisContext} from 'node:vm';
import '../../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../../picocalc-os/compiler/typed-async.js';
import '../../../../../../../picocalc-os/compiler/typed-world.js';

const dir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(dir, '../../../../../../..');
const day = resolve(dir, '../../..');
const ticket = prefix => join(day, readdirSync(day).find(name => name.startsWith(prefix + '--')));
const os = join(repo, 'picocalc-os');
const chess = join(os, 'worlds/chess');
const painter = readFileSync(join(chess, 'painter.typed'));
const reference = join(ticket('PICOCALC-RENDER-BINARY'), 'scripts/02-binary-screen.js');
const codec = runInThisContext(readFileSync(reference, 'utf8') + ';binaryScreen');
const fixtures = join(ticket('PICOCALC-PSIX-STAGING'), 'scripts/board/chess-trace.ndjson');
const firstTrace = JSON.parse(readFileSync(fixtures, 'utf8').split('\n')[0]);
const wire = [...readFileSync(join(os, 'sdk/nw_wire.h'), 'utf8').matchAll(/NW_CALL_([A-Z_]+)/g)]
    .map(match => match[1]);
const embedded = process.argv[2];
assert(embedded, 'pass the output of the painter embedding tool');
const source = readFileSync(join(chess, 'source.list'), 'utf8').trim().split('\n').map(part => {
    const text = readFileSync(join(chess, part), 'utf8');
    return part === 'view.typed' ? text.replace('function chessRender(', 'function chessRenderTree(') : text;
}).concat(readFileSync(join(chess, 'mobile-view.typed'), 'utf8'), readFileSync(embedded, 'utf8')).join('\n');
const reactor = readFileSync(join(os, 'build/typed-world-reactor.wasm'));
const wasm = compileTypedWorld(source, reactor);
const texts = new TextDecoder();
let guest, timer = 2000, rejectPublish = false;
const frames = [], sources = [], controls = [], fallback = [];
const call = (op, sourceFlag, _b, _c, p, n, p1, n1, p2, n2) => {
    const memory = new Uint8Array(guest.memory.buffer);
    const payload = Buffer.from(memory.subarray(p, p + n));
    const text = (start, length) => texts.decode(memory.subarray(start, start + length));
    switch (wire[op - 1]) {
        case 'KIND': case 'PRESENT': return 0n;
        case 'SLEEP': return BigInt(++timer);
        case 'SEND':
            controls.push([text(p, n), text(p1, n1), text(p2, n2)]);
            return 0n;
        case 'SCREEN':
            fallback.push([JSON.parse(text(p, n)), text(p1, n1)]);
            return 0n;
        case 'PAINTER_PUBLISH': {
            if (rejectPublish) return -1n;
            assert.equal(n1, 0);
            assert.equal(n2, 0);
            if (sourceFlag === 1) {
                assert.deepEqual(payload, painter, 'the SDK sends the active Chess app’s exact painter source');
                sources.push(payload);
            } else {
                assert.equal(sourceFlag, 0);
                const value = JSON.parse(JSON.stringify(codec.admit(Uint8Array.from(payload)).view()));
                assert.deepEqual(payload, Buffer.from(codec.encode(value)), 'canonical replay bytes');
                assert.equal(value.app, 'chess');
                assert.equal(value.title, 'Chess');
                assert.equal(value.frame.hints, '');
                frames.push(value.frame.tree);
            }
            return 0n;
        }
        default: throw new Error('unexpected world syscall ' + wire[op - 1]);
    }
};
const denied = () => { throw new Error('unexpected WASI syscall'); };
guest = new WebAssembly.Instance(new WebAssembly.Module(wasm), {nw: {call, error: () => 0},
    wasi_snapshot_preview1: {fd_close: denied, fd_seek: denied, fd_write: denied}}).exports;
guest._initialize?.();
guest.nw_wasm_init();
function event(kind, second, token, type, json, from) {
    const parts = [type, json, from].map(value => Buffer.from(value));
    const lengths = parts.map(part => part.length);
    let at = guest.nw_wasm_buffer(lengths.reduce((a, b) => a + b + 1, 0));
    assert(at);
    const memory = new Uint8Array(guest.memory.buffer);
    for (const part of parts) {
        memory.set(part, at);
        at += part.length;
        memory[at++] = 0;
    }
    return guest.nw_wasm_event(kind, second, 0, token, ...lengths);
}
const key = (keyName, state = 'down', from = 'compositor') =>
    event(0, 0, 0, 'key', JSON.stringify({key: keyName, ch: '', state}), from);
const settle = (token, ok = true) => event(4, Number(ok), token, '', 'null', '');
const resend = from => event(0, 0, 0, 'painter.resend', 'null', from);
const latest = () => frames.at(-1).f;
assert.equal(event(2, 0, 0, '', 'null', ''), 0);
assert.deepEqual(frames[0], firstTrace);
assert.equal(sources.length, 1);
key('up', 'up');
key('up', 'down', 'u-untrusted');
resend('u-untrusted');
assert.equal(frames.length, 1);
assert.equal(sources.length, 1);
key('right');
assert.deepEqual(latest().slice(0, 2), [53, 64]);
key('left'); key('enter');
assert.deepEqual(latest().slice(0, 2), [52, 52]);
assert.equal(frames.at(-1).m, '0000000010100000');
key('up'); key('up');
assert.equal(key('enter'), 1);
assert.deepEqual(latest().slice(0, 5), [36, 64, 52, 36, 6]);
const pendingStart = frames.length;
assert.equal(settle(timer + 5000), 1);
assert.equal(frames.length, pendingStart);
let count = 1;
while (settle(timer) === 1) assert(++count < 1000);
assert.equal(count, 78);
assert.deepEqual(latest().slice(2), [1, 18, 0, 0, 3, 1600, 12]);
assert.equal(sources.length, 1);
key('esc');
assert.deepEqual(controls, [['compositor', 'open', '{"app":"launcher"}']]);
key('f2');
assert.deepEqual(frames.at(-1), firstTrace);
assert.equal(sources.length, 1, 'new game is within the original publisher epoch');
resend('compositor');
assert.equal(sources.length, 2);
assert.deepEqual(frames.at(-1), firstTrace);
assert.equal(fallback.length, 0);
rejectPublish = true;
resend('compositor');
assert.equal(fallback.at(-1)[0].kids[0].s, 'White to move');
rejectPublish = false;
key('left');
assert.equal(latest()[0], 51);
assert.equal(sources.length, 3);
console.log(JSON.stringify({sourceBytes: painter.length,
    sourceSha256: createHash('sha256').update(painter).digest('hex'),
    sourcePublications: sources.length, frames: frames.length, searchSlices: count,
    fallbackOnPublishFailure: true, exactCanonicalRoundTrips: frames.length}, null, 2));
