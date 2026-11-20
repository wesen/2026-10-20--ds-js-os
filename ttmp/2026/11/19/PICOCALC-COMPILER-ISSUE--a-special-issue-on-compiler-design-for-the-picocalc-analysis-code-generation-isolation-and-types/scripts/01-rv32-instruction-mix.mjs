// Classify every RV32 instruction the typed compiler emits for the typed apps.
// Run from the repository root: node <this file> [--json]
// Exact counts over the emitted image; nothing here is a model.
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
import '../../../../../../picocalc-os/compiler/typed-rv32.js';

const os = resolve('picocalc-os');
const worldJs = readFileSync(join(os, 'compiler/typed-world.js'), 'utf8');
// Reuse the import table declared by the shared world contract without evaluating its linker.
const importRows = [...worldJs.matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"(?:, true)?\]/g)]
    .map(([, name, params, result]) => ({name, params: params ? params.split(',') : [], result}));

function sourceOf(dir, list) {
    return list.map(name => readFileSync(join(os, 'worlds', dir, name), 'utf8') + '\n').join('');
}
const editorList = readFileSync(join(os, 'worlds/editor/source.list'), 'utf8').trim().split('\n');
const apps = {
    editor: {source: sourceOf('editor', editorList), imports: importRows, max: 96 * 1024},
    files: {source: sourceOf('files', ['files.typed']), imports: [], max: 64 * 1024},
    agenda: {source: sourceOf('agenda', ['reminder.typed', 'entry.typed']), imports: [], max: 64 * 1024},
};

function analyse(name, {source, imports, max}) {
    const imported = imports.map((fn, index) => ({...fn, index}));
    const {functions} = typedWasm.compileFunctions(source, imports.length, imported, max);
    const program = typedRv32.compile(source, imports, max);
    const view = new DataView(program.image.buffer);
    const starts = functions.map(fn => program.entries[fn.name] / 4);
    const total = program.image.length / 4;
    const c = {words: total, functions: functions.length, wasmBodyBytes: 0,
        slotLoad: 0, slotStore: 0, localLoad: 0, localStore: 0, raSaveRestore: 0, argSpill: 0,
        memLoad: 0, memStore: 0, branch: 0, jal: 0, call: 0, jalr: 0, ebreak: 0, alu: 0, constant: 0, frame: 0,
        storeThenLoadSameSlot: 0, branchOverJump: 0, branchOverJumpNear: 0, branchOverTrap: 0};
    for (let f = 0; f < functions.length; f++) {
        const fn = functions[f];
        c.wasmBodyBytes += fn.code.length;
        const begin = starts[f], end = f + 1 < functions.length ? starts[f + 1] : total;
        const locals = fn.params.length + fn.nlocals;
        const first = view.getUint32(4 * begin, true);
        const frame = -(first >> 20);            // addi sp, sp, -frame
        let prev = null;
        for (let i = begin; i < end; i++) {
            const w = view.getUint32(4 * i, true);
            const op = w & 0x7f, rd = (w >> 7) & 31, f3 = (w >> 12) & 7, rs1 = (w >> 15) & 31, rs2 = (w >> 20) & 31;
            let kind = 'alu', slot = null;
            if (w === 0x00100073) kind = 'ebreak';
            else if (op === 0x03) {
                const off = w >> 20;
                if (rs1 === 2 && f3 === 2) {
                    slot = off;
                    kind = off === frame - 4 ? 'raSaveRestore' : off >= 4 * locals ? 'slotLoad' : 'localLoad';
                } else kind = 'memLoad';
            } else if (op === 0x23) {
                const off = ((w >> 25) << 5) | ((w >> 7) & 31);
                const signed = (off << 20) >> 20;
                if (rs1 === 2 && f3 === 2) {
                    slot = signed;
                    kind = signed === frame - 4 ? 'raSaveRestore' : signed >= 4 * locals ? 'slotStore'
                        : (i - begin - 2 < fn.params.length && i - begin >= 2) ? 'argSpill' : 'localStore';
                } else kind = 'memStore';
            } else if (op === 0x63) kind = 'branch';
            else if (op === 0x6f) kind = rd === 1 ? 'call' : 'jal';
            else if (op === 0x67) kind = 'jalr';
            else if (op === 0x37) kind = 'constant';
            else if (op === 0x13 && rs1 === 0) kind = 'constant';
            else if (op === 0x13 && rd === 2 && rs1 === 2) kind = 'frame';
            c[kind]++;
            if (prev && prev.kind === 'slotStore' && kind === 'slotLoad' && prev.slot === slot) c.storeThenLoadSameSlot++;
            if (prev && prev.kind === 'branch' && prev.skip === 8) {
                if (kind === 'jal') {
                    c.branchOverJump++;
                    // J-type immediate
                    const imm = (((w >> 31) & 1) << 20) | (((w >> 12) & 0xff) << 12) | (((w >> 20) & 1) << 11) | (((w >> 21) & 0x3ff) << 1);
                    const delta = (imm << 11) >> 11;
                    if (delta >= -4096 && delta <= 4094) c.branchOverJumpNear++;
                } else if (kind === 'ebreak') c.branchOverTrap++;
            }
            const bimm = op === 0x63 ? ((((w >> 31) & 1) << 12) | (((w >> 7) & 1) << 11) | (((w >> 25) & 0x3f) << 5) | (((w >> 8) & 0xf) << 1)) : null;
            prev = {kind, slot, skip: bimm};
        }
    }
    c.sourceBytes = Buffer.byteLength(source);
    c.rv32Bytes = program.image.length;
    return [name, c];
}

const results = Object.fromEntries(Object.entries(apps).map(([name, app]) => analyse(name, app)));
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else for (const [name, c] of Object.entries(results)) {
    const pct = n => (100 * n / c.words).toFixed(1).padStart(5) + '%';
    console.log(`\n== ${name}: ${c.functions} functions, ${c.sourceBytes} source bytes, ${c.wasmBodyBytes} Wasm body bytes, ${c.rv32Bytes} RV32 bytes (${c.words} instructions)`);
    console.log(`   RV32 bytes per Wasm body byte: ${(c.rv32Bytes / c.wasmBodyBytes).toFixed(2)}`);
    for (const k of ['slotLoad', 'slotStore', 'localLoad', 'localStore', 'argSpill', 'raSaveRestore', 'frame', 'memLoad', 'memStore',
        'alu', 'constant', 'branch', 'jal', 'call', 'jalr', 'ebreak']) console.log(`   ${k.padEnd(14)} ${String(c[k]).padStart(7)} ${pct(c[k])}`);
    console.log(`   operand-stack traffic (slotLoad+slotStore): ${pct(c.slotLoad + c.slotStore)}`);
    console.log(`   all sp-relative traffic incl. locals:       ${pct(c.slotLoad + c.slotStore + c.localLoad + c.localStore + c.argSpill)}`);
    console.log(`   adjacent store-then-load of the same slot:  ${c.storeThenLoadSameSlot} pairs (${pct(2 * c.storeThenLoadSameSlot)} of instructions)`);
    console.log(`   branch-over-jump pairs: ${c.branchOverJump}, of which target within conditional-branch range: ${c.branchOverJumpNear}`);
    console.log(`   branch-over-trap pairs: ${c.branchOverTrap}`);
}
