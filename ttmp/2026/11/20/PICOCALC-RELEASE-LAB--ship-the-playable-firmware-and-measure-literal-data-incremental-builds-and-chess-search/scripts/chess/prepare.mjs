import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {cpus} from "node:os";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {runInThisContext} from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../../../..");
const [output, repeatsText = "7"] = process.argv.slice(2);
assert(output, "usage: node prepare.mjs OUTPUT [HOST_REPEATS]");
const repeats = Number(repeatsText);
assert(Number.isInteger(repeats) && repeats > 0);
const out = resolve(output);
mkdirSync(out, {recursive: true});
const save = (file, text) => writeFileSync(resolve(out, file), text);
const read = name => readFileSync(resolve(root, "picocalc-os", name), "utf8");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
for (const file of ["typed-wasm.js", "typed-rv32.js"]) {
    runInThisContext(read("compiler/" + file), {filename: file});
}
const units = ["state", "position", "moves", "search"];
const unitSource = units.map(name => read("worlds/chess/" + name + ".typed"));
const source = unitSource.join("\n");
const fixture = JSON.parse(readFileSync(resolve(here, "fixtures.json"), "utf8"));
const {positions, fullDepths, fullNodeBudget, playable, terminal, sliceSteps} = fixture;
const cases = positions.slice(0, terminal.position).flatMap((_, position) =>
    fullDepths.map(depth => ({position, depth, budget: fullNodeBudget}))).concat([playable, terminal]);

const boardWidth = 135;
function board(fen) {
    const [ranks, side, castle, ep, half, full] = fen.split(" ");
    const cells = new Uint16Array(boardWidth);
    for (const [rank, text] of ranks.split("/").entries()) {
        let file = 0;
        for (const ch of text) {
            if (/[1-8]/.test(ch)) { file += Number(ch); continue; }
            const square = rank * 16 + file++;
            cells[square] = " PNBRQK  pnbrqk".indexOf(ch);
            assert(cells[square] > 0 && cells[square] <= 14);
            if (ch === "K") cells[131] = square;
            if (ch === "k") cells[132] = square;
        }
        assert.equal(file, 8);
    }
    cells[128] = Number(side === "b");
    for (const [index, right] of [..."KQkq"].entries()) {
        if (castle.includes(right)) cells[129] += 2 ** index;
    }
    cells[130] = ep === "-" ? 128 : (8 - Number(ep[1])) * 16 + ep.charCodeAt(0) - 97;
    cells[133] = Number(half);
    cells[134] = Number(full);
    return cells;
}

const pos = positions.map(row => board(row.fen));
const wasm = typedWasm.compile(source);
const native = typedRv32.compile(source);
assert.equal(native.importCount, 0);
assert.deepEqual(native.relocations, []);
const guest = new WebAssembly.Instance(new WebAssembly.Module(wasm.bytes)).exports;
const memory = new DataView(guest.memory.buffer);
const capacity = 16384, stateAt = 48000;
const boardCells = new Uint16Array(guest.memory.buffer, 4, capacity);
const state = new Uint8Array(guest.memory.buffer, stateAt, 4 + Math.max(...Object.values(wasm.records.WorldState).map(field => field.offset)));
memory.setUint32(0, capacity, true);
const offsets = wasm.records.WorldState;
const names = ["bestMove", "score", "completed", "nodes"];
const get = name => memory.getInt32(stateAt + offsets[name].offset, true);
const square = index => "abcdefgh"[index % 8] + (8 - Math.floor(index / 8));
const uci = move => move ? square(Math.floor(move / 64) % 64) + square(move % 64) +
    ("qrbn"[Math.floor(move / 4096) - 1] ?? "") : null;

// Verify the live-reply fixture through the maintained make-move path.
boardCells.fill(0);
boardCells.set(pos[0]);
guest.chessMake(0, guest.chessMove(100, 68, 0), 384);
assert.deepEqual(boardCells.slice(0, boardWidth), pos[1]);

for (const [index, depth, expected] of [[0, 3, 8902], [2, 2, 2039]]) {
    boardCells.fill(0);
    boardCells.set(pos[index]);
    assert.equal(guest.chessPerft(0, depth), expected);
    assert.deepEqual(boardCells.slice(0, boardWidth), pos[index]);
}

function run(row, steps = sliceSteps) {
    boardCells.fill(0);
    boardCells.set(pos[row.position]);
    state.fill(0);
    let slices = 0, maxSliceNs = 0;
    const begin = process.hrtime.bigint();
    guest.chessStartSearch(0, stateAt, row.depth, row.budget, 1);
    while (get("running")) {
        const start = process.hrtime.bigint();
        guest.chessSearchSlice(0, stateAt, steps);
        maxSliceNs = Math.max(maxSliceNs, Number(process.hrtime.bigint() - start));
        slices++;
    }
    const wallNs = Number(process.hrtime.bigint() - begin);
    assert.deepEqual(boardCells.slice(0, boardWidth), pos[row.position]);
    const result = Object.fromEntries(names.map(name => [name, get(name)]));
    assert(result.nodes <= row.budget && result.completed <= row.depth);
    return {result: {...result, slices}, wallNs, maxSliceNs};
}

// Warm each workload once. Preserve deterministic identities throughout the rotated sample order.
const stats = cases.map(row => ({...row, ...run(row), name: positions[row.position].name, samples: []}));
for (let rep = 0; rep < repeats; ++rep) {
    for (let i = 0; i < cases.length; ++i) {
        const index = (i + rep * 5) % cases.length;
        const sample = run(cases[index]);
        assert.deepEqual(sample.result, stats[index].result);
        stats[index].samples.push({wallNs: sample.wallNs, maxSliceNs: sample.maxSliceNs});
    }
}
for (let i = 0; i < cases.length; i++) {
    for (const alternate of [1, 4096]) {
        const other = run(cases[i], alternate).result;
        for (const name of names) assert.equal(other[name], stats[i].result[name]);
    }
}
const median = samples => samples.slice().sort((a, b) => a - b)[Math.floor(samples.length / 2)];
for (const row of stats) {
    delete row.wallNs;
    delete row.maxSliceNs;
    row.result.uci = uci(row.result.bestMove);
    row.medianWallNs = median(row.samples.map(s => s.wallNs));
}
const payload = stats.map(({result}) => names.map(name => result[name]).concat(result.slices));
const digest = hash(Buffer.from(payload.flatMap(row => row.flatMap(value =>
    Array.from({length: 4}, (_, byte) => value >> (8 * byte) & 255)))));
const report = {engineSourceSha256: hash(source), unitSha256: Object.fromEntries(units.map((n,i)=>[n,hash(unitSource[i])])),
    rv32Bytes: native.image.length, rv32Sha256: hash(native.image), wasmBytes: wasm.bytes.length,
    wasmSha256: hash(wasm.bytes), repeats, node: process.version, v8: process.versions.v8, host: cpus()[0].model, digest,
    sliceSteps, liveFixtureMatchedChessMake: true, perftGate: {openingDepth3: 8902, kiwipeteDepth2: 2039}, sliceInvarianceSteps: [1, 48, 4096], expected: stats};
save("host.json", JSON.stringify(report, null, 2) + "\n");
save("engine.bin", native.image);
save("bench-data.h", [
    ...["running", ...names].map(name => `#define FIELD_${name} ${offsets[name].offset / 4}`),
    `#define SLICE_STEPS ${sliceSteps}`,
    "static const uint16_t positions[][135] = {",
    ...pos.map(cells => "  {" + cells.join(",") + "},"),
    "};",
    "static const bench_case cases[] = {",
    ...stats.map(({position, depth, budget}, i) => `  {${position},${depth},${budget},{${payload[i].join(",")}}},`),
    "};",
].join("\n") + "\n");
save("engine.S", [
    '.section .text.chess_benchmark,"ax"', ".balign 4", "engine_start:", '.incbin "engine.bin"',
    ...["chessStartSearch", "chessSearchSlice"].flatMap(name => [
        `.global ${name}`, `.set ${name}, engine_start + ${native.entries[name]}`,
    ]),
    "",
].join("\n"));
console.log(JSON.stringify({digest, cases: stats.map(row => [row.name,row.depth,row.budget,row.result.uci,row.result.completed,row.result.nodes,row.medianWallNs])}));
