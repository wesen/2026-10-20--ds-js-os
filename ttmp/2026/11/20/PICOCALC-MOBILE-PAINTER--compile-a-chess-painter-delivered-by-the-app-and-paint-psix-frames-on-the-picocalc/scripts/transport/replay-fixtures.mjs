import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInThisContext} from 'node:vm';

const day = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ticket = prefix => join(day, readdirSync(day).find(name => name.startsWith(prefix + '--')));
const oracle = join(ticket('PICOCALC-RENDER-BINARY'), 'scripts/02-binary-screen.js');
const codec = runInThisContext(readFileSync(oracle, 'utf8') + ';binaryScreen');
const trace = join(ticket('PICOCALC-PSIX-STAGING'), 'scripts/board/chess-trace.ndjson');
const positions = readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const recorded = positions.length;
assert.equal(recorded, 47);
const {p} = positions[0];
const scoreCases = [-2147483647, -524289, -524288, -1, 1, 524287, 524288, 2147483647];
for (const score of scoreCases) {
    for (const nodes of [524287, 524288]) {
        const b = (score < 0 ? '0000de' : 'de0abc').repeat(11).slice(0, 64);
        const m = nodes === 524287 ? '9999999999999999' : 'decafe0123456789';
        positions.push({v: 1, p, b, m, f: [0, 63, 64, 0, 8, 1, 32, nodes, score]});
    }
}
const wrap = tree => ({app: 'chess', title: 'Chess', frame: {tree, hints: ''}});
const domains = [[0, 63], [0, 64], [0, 64], [0, 64], [0, 8], [0, 1], [0, 32], [0, 2147483647],
    [-2147483647, 2147483647]];
function qualifies(bytes) {
    try {
        const {path} = codec.admit(Uint8Array.from(bytes));
        const tree = field => path(['frame', 'tree', field]);
        const b = tree('b'), m = tree('m');
        if (path(['app']) !== 'chess' || path(['title']) !== 'Chess' || path(['frame', 'hints']) !== '' ||
            tree('v') !== 1 || tree('p') !== p || typeof b !== 'string' || !/^[0-69a-e]{64}$/.test(b) ||
            typeof m !== 'string' || !/^[0-9a-f]{16}$/.test(m)) return false;
        const f = domains.map((_, i) => path(['frame', 'tree', 'f', i]));
        if (!f.every((value, i) => Number.isInteger(value) && value >= domains[i][0] && value <= domains[i][1]))
            return false;
        return bytes.equals(Buffer.from(codec.encode(wrap({v: 1, p, b, m, f}))));
    } catch {
        return false;
    }
}
const buffers = [];
let flips = 0, acceptedFlips = 0;
for (const shape of positions) {
    const packet = Buffer.from(codec.encode(wrap(shape)));
    const cells = [...shape.b].map(x => parseInt(x, 16)).concat([...Buffer.from(shape.m, 'hex')],
        shape.f.flatMap(n => [n & 0xffff, n >>> 16]));
    assert.equal(cells.length, 90);
    assert(qualifies(packet));
    const header = Buffer.alloc(2 + cells.length * 2);
    header.writeUInt16LE(packet.length);
    cells.forEach((cell, i) => header.writeUInt16LE(cell, 2 + 2 * i));
    const bits = Buffer.alloc(packet.length);
    for (let i = 0; i < packet.length; i++) {
        for (let bit = 1; bit <= 128; bit *= 2) {
            packet[i] ^= bit;
            if (qualifies(packet)) {
                bits[i] |= bit;
                acceptedFlips++;
            }
            packet[i] ^= bit;
            flips++;
        }
    }
    buffers.push(header, packet, bits);
}
process.stderr.write(JSON.stringify({recorded, boundary: positions.length - recorded, flips, acceptedFlips}) + '\n');
process.stdout.write(Buffer.concat(buffers));
