// Adapted from PICOCALC-COMPILER-THESIS/scripts/lowering/rv32.mjs.
// Interpret only instructions emitted by FunctionCode.
import assert from 'node:assert/strict';
import {packedMachine} from './packed.mjs';

const stackTop = 65536;
const returnToHost = -4;
const preserved = [2, 3, 4, 8, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
const volatile = [5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 28, 29, 30, 31];
const signed12 = n => (n << 20) >> 20;

export function runRv32(program, name, args, imports, handlers, initialBytes, decoded, instructionLimit = 100_000, onFetch) {
    const code = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    const relocations = new Map(program.relocations.map(({offset, index}) => [offset, index]));
    const memory = new DataView(new ArrayBuffer(stackTop));
    new Uint8Array(memory.buffer).set(initialBytes);
    const x = new Int32Array(32);
    for (const reg of preserved) x[reg] = 0x12340000 + reg;
    x[2] = stackTop;
    x[1] = returnToHost;
    x.set(args, 10);
    const packed = packedMachine(memory,x);
    const saved = () => preserved.map(reg => x[reg]);
    const frames = [{pc: returnToHost, saved: saved()}];
    let at = program.entries[name];
    let steps = 0;
    while (at !== returnToHost) {
        assert(++steps < instructionLimit, 'RV32 fixture instruction limit');
        assert(Number.isInteger(at) && at % 4 === 0 && at >= 0 && at < code.byteLength,
            'RV32 instruction address outside program');
        const w = code.getUint32(at, true);
        if (onFetch) onFetch(at, w);
        const op = w & 0x7f, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7;
        const a = x[(w >>> 15) & 31], b = x[(w >>> 20) & 31];
        const f7 = w >>> 25;
        const imm = w >> 20;
        let next = at + 4;
        const decodedOp = decoded?.get(at);
        if (decodedOp?.op.startsWith('esp.')) {
            assert.equal(decodedOp.word,w,'vendor decode matches current bytes');
            packed.step(decodedOp);
        } else if (relocations.has(at)) {
            assert.equal(w, 0);
            assert.equal(x[2] % 16, 0, 'unaligned SP at import');
            const fn = imports[relocations.get(at)];
            const result = handlers[fn.name](...x.slice(10, 10 + fn.params.length));
            for (const reg of volatile) x[reg] = 0x76540000 + reg;
            x[1] = next;
            x[10] = result;
        } else if (w === 0x00100073) {
            return {trap: true, packed: packed.count, steps, bytes: new Uint8Array(memory.buffer, 0, initialBytes.length)};
        } else if (op === 0x03) {
            assert(f3 === 2 || f3 === 5);
            x[rd] = f3 === 2 ? memory.getInt32(a + imm, true) : memory.getUint16(a + imm, true);
        } else if (op === 0x23) {
            const address = a + signed12((f7 << 5) | rd);
            assert(f3 === 2 || f3 === 1);
            if (f3 === 2) memory.setInt32(address, b, true);
            else memory.setUint16(address, b, true);
        } else if (op === 0x13) {
            if (f3 === 0) x[rd] = a + imm;
            else if (f3 === 1 && f7 === 0) x[rd] = a << (imm & 31);
            else if (f3 === 7) x[rd] = a & imm;
            else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));
            else if (f3 === 4) x[rd] = a ^ imm;
            else assert.fail('unknown RV32 immediate ALU instruction');
        } else if (op === 0x33) {
            if (f7 === 1 && f3 === 0) x[rd] = Math.imul(a, b);
            else if (f7 === 1 && f3 === 4) x[rd] = b === 0 ? -1 : a / b;
            else if (f7 === 1 && f3 === 6) x[rd] = b === 0 ? a : a % b;
            else if (f3 === 0) x[rd] = f7 === 0 ? a + b : a - b;
            else if (f3 === 1) x[rd] = a << b;
            else if (f3 === 2) x[rd] = Number(a < b);
            else if (f3 === 3) x[rd] = Number((a >>> 0) < (b >>> 0));
            else if (f3 === 4) x[rd] = a ^ b;
            else if (f3 === 7) x[rd] = a & b;
            else if (f3 === 5) x[rd] = a >> b;
            else assert.fail('unknown RV32 ALU instruction');
        } else if (op === 0x37) {
            x[rd] = w & 0xfffff000;
        } else if (op === 0x63) {
            const offset = ((w >> 31) << 12) | (((w >>> 7) & 1) << 11) |
                (((w >>> 25) & 63) << 5) | (((w >>> 8) & 15) << 1);
            let take;
            switch (f3) {
            case 0: take = a === b; break;
            case 1: take = a !== b; break;
            case 4: take = a < b; break;
            case 5: take = a >= b; break;
            case 6: take = (a >>> 0) < (b >>> 0); break;
            case 7: take = (a >>> 0) >= (b >>> 0); break;
            default: assert.fail('unknown RV32 branch condition');
            }
            if (take) next = at + offset;
        } else if (op === 0x6f) {
            const offset = ((w >> 31) << 20) | (w & 0xff000) | (((w >>> 20) & 1) << 11) |
                (((w >>> 21) & 0x3ff) << 1);
            assert(rd === 1 || rd === 0);
            if (rd === 1) {
                assert.equal(x[2] % 16, 0, 'unaligned SP at internal call');
                frames.push({pc: next, saved: saved()});
                x[1] = next;
            }
            next = at + offset;
        } else if (op === 0x67) {
            assert.equal(w, 0x00008067);
            next = a;
            const frame = frames.pop();
            assert.equal(next, frame.pc, 'return address');
            assert.deepEqual(saved(), frame.saved, 'SP and callee-saved registers');
        } else assert.fail('unknown RV32 opcode ' + op.toString(16));
        x[0] = 0;
        at = next;
    }
    assert.equal(frames.length, 0);
    return {trap: false, packed: packed.count, result: x[10], steps, bytes: new Uint8Array(memory.buffer, 0, initialBytes.length)};
}
