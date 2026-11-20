import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';

const [gcc, emulator] = process.argv.slice(2).map(p => resolve(p));
assert(gcc && emulator, 'pass ESP32-P4 GCC and the CJI RV32 emulator');
const ticket = dirname(dirname(fileURLToPath(import.meta.url)));
const root = resolve('picocalc-os/worlds/chess');
const source = ['state', 'position', 'moves', 'search'].map(part => readFileSync(join(root, part + '.typed'), 'utf8')).join('\n');
const {positions, reference} = JSON.parse(readFileSync(join(ticket, 'various/reference-positions.json'), 'utf8'));
positions.push({name:'kiwipete',fen:'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    perft:{1:48,2:2039}, mate_in_one_uci:[]});
const configurations = [
    {name:'material-only', depth:1, budget:1800, advanced:0, slice:19},
    {name:'quiescence', depth:1, budget:1800, advanced:1, slice:19},
    {name:'deepening', depth:3, budget:1600, advanced:1, slice:19},
    {name:'budget-exhaustion', depth:4, budget:1, advanced:1, slice:1},
];
const fields = ['running','bestMove','nodes','score','completed'];
const boardWords = 135, limit = 16384, list = 1024, undo = 384, stateAt = 48000;
function board(fen) {
    const [ranks, side, castle, ep, half, full] = fen.split(' ');
    const value = new Uint16Array(boardWords);
    for (const [rank, row] of ranks.split('/').entries()) {
        let file = 0;
        for (const ch of row) {
            if (Number(ch)) { file += Number(ch); continue; }
            const square = rank * 16 + file++;
            value[square] = ' PNBRQK  pnbrqk'.indexOf(ch);
            if (ch === 'K') value[131] = square;
            if (ch === 'k') value[132] = square;
        }
        assert.equal(file, 8);
    }
    value[128] = Number(side === 'b');
    for (const [i, right] of [...'KQkq'].entries()) if (castle.includes(right)) value[129] += 2 ** i;
    value[130] = ep === '-' ? 128 : (8 - Number(ep[1])) * 16 + ep.charCodeAt(0) - 97;
    value[133] = Number(half);
    value[134] = Number(full);
    return Array.from(value);
}
const square = dense => 'abcdefgh'[dense % 8] + (8 - Math.floor(dense / 8));
const uci = move => move ? square(Math.floor(move / 64) % 64) + square(move % 64) + ('qrbn'[Math.floor(move / 4096) - 1] ?? '') : null;

const compiled = typedWasm.compile(source);
const guest = new WebAssembly.Instance(new WebAssembly.Module(compiled.bytes)).exports;
const memory = new DataView(guest.memory.buffer);
memory.setUint32(0, limit, true);
const offsets = compiled.records.WorldState;
const field = name => memory.getInt32(stateAt + offsets[name].offset, true);
const unit = at => memory.getUint16(4 + at * 2, true);
const position = () => Array.from({length: boardWords}, (_, i) => unit(i));
const expected = [];
const rows = [];
for (const fixture of positions) {
    const start = board(fixture.fen);
    start.forEach((value, i) => memory.setUint16(4 + i * 2, value, true));
    const count = guest.chessLegalMoves(0, list, undo);
    const moves = Array.from({length:count}, (_, i) => unit(list + i));
    if (fixture.legal_uci) assert.deepEqual(moves.map(uci).sort(), fixture.legal_uci, fixture.name + ' legal moves');
    const inCheck = guest.chessInCheck(0, start[128]);
    if (fixture.in_check !== undefined) assert.equal(inCheck, Number(fixture.in_check), fixture.name + ' check');
    assert.deepEqual(position(), start, fixture.name + ' legal generation restores position');
    const perft = [];
    for (let depth = 1; depth <= 3; depth++) {
        const expectedCount = fixture.perft[depth];
        if (expectedCount === undefined) { perft.push(-1); continue; }
        const actual = guest.chessPerft(0, depth);
        assert.equal(actual, expectedCount, fixture.name + ' perft ' + depth);
        assert.deepEqual(position(), start, fixture.name + ' perft restores position');
        perft.push(actual);
    }
    const search = configurations.map(config => {
        guest.chessStartSearch(0, stateAt, config.depth, config.budget, config.advanced);
        let steps = 0;
        while (field('running')) {
            guest.chessSearchSlice(0, stateAt, config.slice);
            assert(++steps < 10000, 'sliced search stalled');
        }
        assert.deepEqual(position(), start, fixture.name + ' search restores position');
        const [move, nodes, score, completed] = fields.slice(1).map(field);
        if (move) assert(moves.includes(move), fixture.name + ' completed a legal search move');
        assert(nodes <= config.budget);
        if (config.name === 'budget-exhaustion' && moves.length) {
            assert.equal(completed, 0);
            assert.equal(move, moves[0], 'fallback remains the first known legal move');
        }
        return {mode: config.name, move:uci(move), nodes, score, completed, steps, packed:move};
    });
    for (const entry of search.filter(row => row.mode !== 'budget-exhaustion')) {
        if (fixture.mate_in_one_uci?.length) {
            assert(fixture.mate_in_one_uci.includes(entry.move), fixture.name + ' chose the reference mate');
            assert.equal(entry.score, 29999);
        }
        if (fixture.checkmate) assert.equal(entry.score, -30000);
        if (fixture.stalemate) assert.equal(entry.score, 0);
    }
    expected.push(count, inCheck, ...Array.from({length:512}, (_, i) => moves[i] ?? 0), ...perft);
    for (const {packed,nodes,score,completed,steps} of search) expected.push(packed,nodes,score,completed,steps);
    rows.push({name:fixture.name,legal:count,inCheck:!!inCheck,perft,search});
}
const quiet = rows.find(r => r.name === 'quiet-mate-in-two').search.find(x => x.mode === 'deepening');
assert.equal(quiet.move, 'd6c7');
assert.equal(quiet.score, 29997);
const poisoned = rows.find(r => r.name === 'defended-rook').search;
assert.equal(poisoned[0].move, 'd1d5', 'material-only engine takes the defended pawn');
assert.notEqual(poisoned[1].move, 'd1d5', 'quiescence sees the rook recapture');

// Change only whether quiet leaves extend captures. Keep activity, ordering and checked evasions.
const standPatExit = 'if (!state.advanced || capped || stand + 32768 >= board.charCodeAt(frame + 3))';
assert.equal(source.split(standPatExit).length, 2);
const noQuietExtension = source.replace(standPatExit,
    'if (!state.advanced || capped || !check || stand + 32768 >= board.charCodeAt(frame + 3))');
const control = new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(noQuietExtension).bytes)).exports;
const controlMemory = new DataView(control.memory.buffer);
controlMemory.setUint32(0, limit, true);
const defended = positions.find(fixture => fixture.name === 'defended-rook');
board(defended.fen).forEach((value, i) => controlMemory.setUint16(4 + i * 2, value, true));
const controlField = name => controlMemory.getInt32(stateAt + offsets[name].offset, true);
control.chessStartSearch(0, stateAt, 1, 1800, 1);
let controlSteps = 0;
while (controlField('running')) {
    control.chessSearchSlice(0, stateAt, 19);
    assert(++controlSteps < 10000, 'quiet-leaf control stalled');
}
const quietLeafAblation = {
    target: 'wasm', position: defended.name,
    withQuietExtension: {move: poisoned[1].move, nodes: poisoned[1].nodes, score: poisoned[1].score},
    withoutQuietExtension: {move: uci(controlField('bestMove')), nodes: controlField('nodes'), score: controlField('score')},
};
assert.deepEqual(quietLeafAblation.withoutQuietExtension, {move:'d1d5',nodes:25,score:456});

const native = typedRv32.compile(source);
const buffered = typedRv32.compile(source, [], undefined, {streamFunctions:false});
assert.deepEqual(native.image, buffered.image);
const temp = mkdtempSync(join(tmpdir(), 'typed-chess-oracle-'));
try {
    const cases = Buffer.alloc(positions.length * 272);
    for (const [i, fixture] of positions.entries()) {
        board(fixture.fen).forEach((value, j) => cases.writeUInt16LE(value, i * 272 + j * 2));
        cases.writeUInt16LE(Object.keys(fixture.perft).length, i * 272 + 270);
    }
    const app = join(temp, 'engine.bin'), data = join(temp, 'cases.bin'), asm = join(temp, 'engine.S');
    writeFileSync(app, native.image);
    writeFileSync(data, cases);
    const entries = ['chessLegalMoves','chessInCheck','chessPerft','chessStartSearch','chessSearchSlice'];
    const aliases = entries.map(name => `.global ${name}\n.set ${name}, program + ${native.entries[name]}`);
    writeFileSync(asm, '.section .text.chess,"ax"\n.balign 4\nprogram:\n.incbin "' + app + '"\n' +
        aliases.join('\n') + '\n.section .rodata,"a"\n.balign 4\n.global cases_start,cases_end\ncases_start:\n.incbin "' +
        data + '"\ncases_end:\n');
    const suffix = fields.map(name => `#define F_${name} ${offsets[name].offset / 4}`).join('\n');
    const cfg = configurations.map(({depth,budget,advanced,slice}) => `{${depth},${budget},${advanced},${slice}}`).join(',');
    const header = join(temp, 'configuration.h');
    writeFileSync(header, suffix + '\n#define CONFIGURATIONS ' + cfg + '\n');
    const elf = join(temp, 'check.elf');
    execFileSync(gcc, ['-march=rv32im','-mabi=ilp32','-O2','-nostdlib','-fno-builtin','-msmall-data-limit=0',
        '-mno-relax','-Wl,-Ttext=0x10000','-Wl,-e,_start','-include',header,
        join(ticket, 'scripts/04-engine-rv32-runner.c'), asm, '-o', elf]);
    const run = spawnSync(emulator, [elf], {timeout:30000, maxBuffer:1024 * 1024});
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.length, 4 * expected.length);
    for (const [i, value] of expected.entries()) assert.equal(run.stdout.readInt32LE(i * 4), value, 'RV32 word ' + i);
} finally {
    rmSync(temp, {recursive:true, force:true});
}
console.log(JSON.stringify({reference,targets:['wasm','rv32'],rows,wordsMatched:expected.length,quietLeafAblation,
    engineSourceSha256:createHash('sha256').update(source).digest('hex')}, null, 2));
