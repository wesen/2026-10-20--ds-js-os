import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {runInThisContext} from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../../../..");
const day = resolve(here, "../../..");
const pie = readdirSync(day).find(name => name.startsWith("PICOCALC-TYPED-PIE--"));
const {runRv32} = await import(resolve(day, pie, "scripts/review/run-rv32.mjs"));
const [replay, out] = process.argv.slice(2);
assert(replay && out, "usage: node maintained-poses.mjs REPLAY_FIXTURES OUTPUT");
mkdirSync(out, {recursive: true});
for (const name of ["typed-wasm.js", "typed-rv32.js"]) {
    runInThisContext(readFileSync(resolve(root, "picocalc-os/compiler", name), "utf8"), {filename: name});
}
const source = readFileSync(resolve(root, "picocalc-os/worlds/chess/painter-3d.typed"), "utf8");
assert(Buffer.byteLength(source) <= 16384);
const code = typedWasm.compile(source).bytes;
const rv32 = typedRv32.compile(source);
assert(rv32.image.length + 24 <= 32768);
const painter = new WebAssembly.Instance(new WebAssembly.Module(code)).exports;
const view = new DataView(painter.memory.buffer);
const state = new Uint16Array(painter.memory.buffer, 4, 91);
const capacity = 12288;
const words = new Uint16Array(painter.memory.buffer, 260, capacity);
view.setUint32(0, state.length, true);
view.setUint32(256, capacity, true);
const fixture = readFileSync(replay);
const stride = 4 + 180 + 4 + 8192;
assert.equal(fixture.length, 47 * stride);
const hash = content => createHash("sha256").update(content).digest("hex");
const send = (name, object) => writeFileSync(resolve(out, name), object);

function rotation(phase) {
    const radians = phase * Math.PI / 16;
    const x = Math.round(Math.cos(radians) * 256) + Math.round(Math.sin(radians) * 256);
    const z = Math.round(Math.cos(radians) * 256) - Math.round(Math.sin(radians) * 256);
    return {x, z, camera: (x + 512) * 1024 + z + 512};
}

function verify(words, count) {
    let ops = 0, at = 0, triangles = 0, texts = 0;
    while (at < count) {
        const op = words[at];
        ++ops;
        if (op === 5) {
            ++triangles;
            assert(at + 8 <= count);
            for (let j = 1; j < 7; j += 2) {
                assert(words[at + j] < 320 && words[at + j + 1] < 280);
            }
            at += 8;
        } else if (op === 3) {
            ++texts;
            assert(words[at + 1] < 320 && words[at + 2] + 12 <= 280);
            assert.equal(words[at + 3], 0);
            const length = words[at + 6];
            assert(length > 0 && length <= 64 && at + 7 + length <= count);
            at += 7 + length;
        } else if (op === 1) {
            assert.equal(at, 0);
            assert.deepEqual(Array.from(words.slice(1, 5)), [0, 0, 320, 280]);
            at += 6;
        } else {
            assert.equal(op, 4);
            assert.equal(at + 2 + words[at + 1], count);
            return {ops, triangles, texts};
        }
    }
    throw new Error("missing terminal hints");
}

const cases = [];
const arena = new Uint8Array(painter.memory.buffer, 0, 260 + 2 * capacity);
let modeledInstructions = 0;
for (const index of [0, 7, 10, 12, 19]) {
    for (let i = 0; i < 90; ++i) {
        state[i] = fixture.readUInt16LE(index * stride + 4 + i * 2);
    }
    for (let phase = 0; phase < 32; ++phase) {
        state[90] = phase;
        const input = state.slice();
        words.fill(0xcafe);
        const before = arena.slice();
        const count = painter.paintChess(0, 256);
        assert(count > 0 && count <= capacity);
        const native = runRv32(rv32, "paintChess", [0, 256], [], {}, before, undefined, 3000000);
        assert.equal(native.trap, false);
        assert.equal(native.result, count);
        assert.deepEqual(native.bytes, arena);
        modeledInstructions = Math.max(modeledInstructions, native.steps);
        assert.deepEqual(state, input);
        assert(words.subarray(count).every(word => word === 0xcafe));
        const stats = verify(words, count);
        assert.equal(stats.texts, (state[76] < 64 && state[78] < 64) ? 18 : 17);
        const {x, z} = rotation(phase);
        let tileAt = 6 + 16 * (Number(x !== 0) + Number(z !== 0));
        function project(col, row) {
            const dx = col - 64, dz = row - 64;
            return [160 + Math.trunc((z * dx - x * dz) / 256),
                140 + Math.trunc((x * dx + z * dz) * 5 / 2048)];
        }
        function tile(row, col, side) {
            const a = project(col, row), b = project(col + side, row);
            const c = project(col + side, row + side), d = project(col, row + side);
            assert.deepEqual(Array.from(words.slice(tileAt, tileAt + 7)), [5, ...a, ...b, ...c]);
            assert.deepEqual(Array.from(words.slice(tileAt + 8, tileAt + 15)), [5, ...a, ...c, ...d]);
            tileAt += 16;
        }
        for (let square = 0; square < 64; square++) {
            const col = (square % 8) * 16, row = Math.floor(square / 8) * 16;
            tile(row, col, 16);
            if (state[72] === square) tile(row + 2, col + 2, 12);
        }
        const data = Buffer.from(words.buffer, words.byteOffset, count * 2);
        const name = `position-${index}-phase-${phase}`;
        send(name + ".words", data);
        cases.push({name, index, phase, count, ...stats, commandSha256: hash(data)});
    }
}
for (const index of [0, 7, 10, 12, 19]) {
    assert.equal(new Set(cases.filter(row => row.index === index).map(row => row.commandSha256)).size, 32);
}

// Exhaust every square, phase, legal piece kind and color for the exact per-mesh maximum.
const meshMaximum = {};
for (let phase = 0; phase < 32; ++phase) {
    const {camera} = rotation(phase);
    for (let square = 0; square < 64; ++square) {
        for (const piece of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14]) {
            const x = (square % 8) * 16 + 8;
            const z = Math.floor(square / 8) * 16 + 8;
            const count = painter.paintPiece(256, 0, x, z, piece, camera);
            assert(count > 0 && count % 8 === 0);
            meshMaximum[piece] = Math.max(meshMaximum[piece] ?? 0, count / 8);
        }
    }
}
const triangleMax = Math.max(...Object.values(meshMaximum));
// Slab has two visible walls, board has two faces per tile plus two cursor faces.
const commandBound = 1 + 4 + 128 + 2 + 16 + 2 + 1 + 32 * triangleMax;
const wordBound = 6 + (4 + 128 + 2 + 16 + 32 * triangleMax) * 8 + 33 + 17 + 38;
assert(wordBound < capacity);
for (const phase of [0, 5, 8, 13]) {
    for (let kind = 1; kind <= 6; ++kind) {
        state.fill(0);
        state.fill(64, 72, 80);
        state[27] = kind;
        state[90] = phase;
        const count = painter.paintChess(0, 256);
        verify(words, count);
        send(`mesh-${kind}-phase-${phase}.words`, Buffer.from(words.buffer, words.byteOffset, count * 2));
    }
}

state.fill(0);
state.fill(6, 0, 33);
words.fill(0xcafe);
assert.equal(painter.paintChess(0, 256), 0);
assert(words.every(word => word === 0xcafe));
send("painter.rv32", rv32.image);
send("receipt.json", JSON.stringify({sourceBytes: Buffer.byteLength(source), sourceSha256: hash(source),
    wasmBytes: code.length, rv32Bytes: rv32.image.length, rv32Sha256: hash(rv32.image),
    testedMeshPlacements: 32 * 64 * 12, meshMaximum, commandBound, wordBound,
    modeledInstructionsMax: modeledInstructions, matchedNativeArenas: cases.length, cases}, null, 2) + "\n");
console.log({source: Buffer.byteLength(source), wasm: code.length, rv32: rv32.image.length, triangleMax,
    commandBound, wordBound, sceneCases: cases.length, modeledInstructions, maxObservedWords: Math.max(...cases.map(row => row.count))});
