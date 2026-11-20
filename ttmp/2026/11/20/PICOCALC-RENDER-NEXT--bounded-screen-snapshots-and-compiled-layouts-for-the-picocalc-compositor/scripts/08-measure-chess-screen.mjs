// From the repository root: make -C picocalc-os typed-world-reactor, then node this file.
// Capture SCREEN at the guest SDK boundary, before the kernel wraps it or the compositor paints.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-async.js';
import '../../../../../../picocalc-os/compiler/typed-world.js';

const dir = 'picocalc-os/worlds/chess';
const parts = readFileSync(join(dir, 'source.list'), 'utf8').trim().split('\n');
const source = parts.map(file => readFileSync(join(dir, file), 'utf8') + '\n').join('');
const reactor = readFileSync('picocalc-os/build/typed-world-reactor.wasm');
const program = compileTypedWorld(source, reactor);
const operations = [...readFileSync('picocalc-os/sdk/nw_wire.h', 'utf8').matchAll(/NW_CALL_([A-Z_]+)/g)]
    .map(match => match[1]);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const runs = [];
let guest;
let eventName;
let timer = 2000;

function syscall(op, a, b, c, treeStart, treeBytes, hintStart, hintBytes) {
    switch (operations[op - 1]) {
    case 'KIND': case 'PRESENT': return 0n;
    case 'SLEEP': return BigInt(++timer);
    case 'SCREEN': {
        const view = Buffer.from(guest.memory.buffer, treeStart, treeBytes);
        const hints = Buffer.from(guest.memory.buffer, hintStart, hintBytes);
        const tree = JSON.parse(view.toString('utf8'));
        const operations = tree.kids.find(node => node.t === 'canvas').ops;
        const row = {event: eventName, status: tree.kids[0].s, treeBytes, hintBytes,
            canvasOps: operations.length, treeSha256: sha256(view), hintsSha256: sha256(hints)};
        runs.push(row);
        return 0n;
    }
    default: throw Error('Unexpected syscall ' + operations[op - 1]);
    }
}
const denied = () => { throw Error('Unexpected WASI call'); };
guest = new WebAssembly.Instance(new WebAssembly.Module(program), {nw: {call: syscall, error: () => 0},
    wasi_snapshot_preview1: {fd_close: denied, fd_seek: denied, fd_write: denied}}).exports;
guest._initialize?.();
guest.nw_wasm_init();

function event(label, kind, ok, token, name, payload, sender) {
    eventName = label;
    const args = [name, payload, sender].map(value => Buffer.from(value));
    let pos = guest.nw_wasm_buffer(args.reduce((n, arg) => n + arg.length + 1, 0));
    assert(pos);
    const memory = new Uint8Array(guest.memory.buffer);
    for (const arg of args) {
        memory.set(arg, pos);
        pos += arg.length;
        memory[pos++] = 0;
    }
    return guest.nw_wasm_event(kind, ok, 0, token, ...args.map(arg => arg.length));
}

event('launch', 2, 0, 0, '', 'null', '');
for (const [key, label] of [['enter', 'select e2'], ['up', 'cursor e3'], ['up', 'cursor e4'], ['enter', 'play e2e4']]) {
    event(label, 0, 0, 0, 'key', JSON.stringify({key, ch: '', state: 'down'}), 'compositor');
}
for (let n = 1; n <= 1000; n++) {
    if (event('reply wake ' + n, 4, 1, timer, '', 'null', '') !== 1) break;
    assert(n < 1000, 'Chess did not settle');
}
assert.equal(runs[0].status, 'White to move');
assert.equal(runs.find(row => row.event === 'play e2e4').status, 'Black is thinking');
assert.equal(runs.at(-1).status, 'White to move');
console.log(JSON.stringify({boundary: 'host Wasm typed SDK SCREEN; JSON tree and hints only',
    sourceSha256: sha256(source), reactorSha256: sha256(reactor), moduleSha256: sha256(program), runs}, null, 2));
