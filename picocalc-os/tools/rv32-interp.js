// A reference interpreter for the RV32IM subset that typed-rv32.js emits, with
// per-instruction execution counts and calling-convention checks.
//
// This is a classic script with no imports. It runs unchanged in Node (vm.runInThisContext
// or a plain <script>), in the trace REPL's goja sessions and in bare QuickJS, and defines
// globalThis.typedRv32Interp = {run, profile, classify}.
//
// It does not execute Espressif PIE instructions; a program compiled with pieLoops stops
// with "unsupported RV32 opcode". It checks, at every internal call and return, that the
// stack pointer is 16-byte aligned, that the return address is the one pushed by the call,
// and that sp, gp, tp and s0-s11 hold the values they had at the call. A backend that keeps
// locals in callee-saved registers must pass these checks.
(() => {
"use strict";

const RETURN_TO_HOST = -4;
const CALLEE_SAVED = [2, 3, 4, 8, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
const CALLER_SAVED = [5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 28, 29, 30, 31];
const EBREAK = 0x00100073;

class Rv32Fault extends Error {}

function fault(message, at) {
    throw new Rv32Fault(message + " at 0x" + (at >>> 0).toString(16));
}

// program: the object returned by typedRv32.compile (image, entries, relocations, imports).
// memoryBytes: initial guest memory; the stack is placed above it.
// options: {stackBytes = 65536, limit = 50e6, imports = [], handlers = {}, counts = true}
function run(program, entry, args, memoryBytes, options = {}) {
    const image = program.image;
    const code = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const words = image.byteLength >>> 2;
    const stackBytes = options.stackBytes ?? 65536;
    const limit = options.limit ?? 50e6;
    const size = (memoryBytes.length + stackBytes + 15) & -16;
    const bytes = new Uint8Array(size);
    bytes.set(memoryBytes);
    const memory = new DataView(bytes.buffer);
    const counts = options.counts === false ? null : new Uint32Array(words);
    const relocations = new Map((program.relocations ?? []).map(r => [r.offset, r.index]));
    const x = new Int32Array(32);
    for (const reg of CALLEE_SAVED) x[reg] = 0x12340000 + reg;
    x[2] = size;
    x[1] = RETURN_TO_HOST;
    for (let i = 0; i < args.length; i++) x[10 + i] = args[i];
    const frames = [{pc: RETURN_TO_HOST, saved: CALLEE_SAVED.map(r => x[r])}];
    let at = program.entries[entry];
    if (at === undefined) throw new Error("unknown RV32 entry " + entry);
    let steps = 0;
    const signed12 = n => (n << 20) >> 20;
    const check = (address, width) => {
        if (address < 0 || address + width > size) fault("memory access outside guest memory: " + address, at);
    };
    while (at !== RETURN_TO_HOST) {
        if (++steps > limit) fault("instruction limit " + limit + " reached", at);
        if (at < 0 || at >= image.byteLength || at & 3) fault("instruction address outside program", at);
        const w = code.getUint32(at, true);
        if (counts) counts[at >>> 2]++;
        const op = w & 0x7f, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7, f7 = w >>> 25;
        const a = x[(w >>> 15) & 31], b = x[(w >>> 20) & 31], imm = w >> 20;
        let next = at + 4;
        if (relocations.has(at)) {
            const fn = (options.imports ?? [])[relocations.get(at)];
            const handler = fn && options.handlers?.[fn.name];
            if (!handler) fault("no handler for import " + relocations.get(at), at);
            if (x[2] & 15) fault("unaligned sp at import call", at);
            const result = handler(...x.slice(10, 10 + fn.params.length));
            for (const reg of CALLER_SAVED) x[reg] = 0x76540000 + reg;
            x[1] = next;
            x[10] = result | 0;
        } else if (w === EBREAK) {
            return {trap: true, at, steps, counts, bytes: bytes.subarray(0, memoryBytes.length), registers: x};
        } else switch (op) {
        case 0x03: { // loads
            const address = a + imm;
            if (f3 === 0) { check(address, 1); x[rd] = memory.getInt8(address); }
            else if (f3 === 1) { check(address, 2); x[rd] = memory.getInt16(address, true); }
            else if (f3 === 2) { check(address, 4); x[rd] = memory.getInt32(address, true); }
            else if (f3 === 4) { check(address, 1); x[rd] = memory.getUint8(address); }
            else if (f3 === 5) { check(address, 2); x[rd] = memory.getUint16(address, true); }
            else fault("unsupported load", at);
            break;
        }
        case 0x23: { // stores
            const address = a + signed12((f7 << 5) | rd);
            if (f3 === 0) { check(address, 1); memory.setUint8(address, b & 255); }
            else if (f3 === 1) { check(address, 2); memory.setUint16(address, b & 65535, true); }
            else if (f3 === 2) { check(address, 4); memory.setInt32(address, b, true); }
            else fault("unsupported store", at);
            break;
        }
        case 0x13: { // immediate ALU
            const shamt = imm & 31;
            if (f3 === 0) x[rd] = a + imm;
            else if (f3 === 1) x[rd] = a << shamt;
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));
            else if (f3 === 4) x[rd] = a ^ imm;
            else if (f3 === 5) x[rd] = f7 & 0x20 ? a >> shamt : a >>> shamt;
            else if (f3 === 6) x[rd] = a | imm;
            else x[rd] = a & imm;
            break;
        }
        case 0x33: { // register ALU and M extension
            if (f7 === 1) {
                if (f3 === 0) x[rd] = Math.imul(a, b);
                else if (f3 === 1) x[rd] = Number((BigInt(a) * BigInt(b)) >> 32n); // mulh
                else if (f3 === 3) x[rd] = Number((BigInt(a >>> 0) * BigInt(b >>> 0)) >> 32n) | 0; // mulhu
                else if (f3 === 4) x[rd] = b === 0 ? -1 : (a === -2147483648 && b === -1 ? a : a / b);
                else if (f3 === 6) x[rd] = b === 0 ? a : (a === -2147483648 && b === -1 ? 0 : a % b);
                else fault("unsupported M instruction", at);
            } else if (f3 === 0) x[rd] = f7 === 0x20 ? a - b : a + b;
            else if (f3 === 1) x[rd] = a << (b & 31);
            else if (f3 === 2) x[rd] = Number(a < b);
            else if (f3 === 3) x[rd] = Number((a >>> 0) < (b >>> 0));
            else if (f3 === 4) x[rd] = a ^ b;
            else if (f3 === 5) x[rd] = f7 === 0x20 ? a >> (b & 31) : a >>> (b & 31);
            else if (f3 === 6) x[rd] = a | b;
            else x[rd] = a & b;
            break;
        }
        case 0x37: x[rd] = w & 0xfffff000; break; // lui
        case 0x63: { // branches
            const offset = ((w >> 31) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 63) << 5) | (((w >>> 8) & 15) << 1);
            let take;
            if (f3 === 0) take = a === b;
            else if (f3 === 1) take = a !== b;
            else if (f3 === 4) take = a < b;
            else if (f3 === 5) take = a >= b;
            else if (f3 === 6) take = (a >>> 0) < (b >>> 0);
            else if (f3 === 7) take = (a >>> 0) >= (b >>> 0);
            else fault("unsupported branch", at);
            if (take) next = at + offset;
            break;
        }
        case 0x6f: { // jal
            const offset = ((w >> 31) << 20) | (w & 0xff000) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1);
            if (rd === 1) {
                if (x[2] & 15) fault("unaligned sp at internal call", at);
                frames.push({pc: next, saved: CALLEE_SAVED.map(r => x[r])});
            } else if (rd !== 0) fault("unsupported jal link register", at);
            if (rd) x[rd] = next;
            next = at + offset;
            break;
        }
        case 0x67: { // jalr: only `ret` is emitted
            if (w !== 0x00008067) fault("unsupported jalr", at);
            next = a;
            const frame = frames.pop();
            if (!frame || next !== frame.pc) fault("return address does not match the call", at);
            for (let i = 0; i < CALLEE_SAVED.length; i++) {
                if (x[CALLEE_SAVED[i]] !== frame.saved[i])
                    fault("callee-saved x" + CALLEE_SAVED[i] + " changed across a call", at);
            }
            break;
        }
        default: fault("unsupported RV32 opcode 0x" + op.toString(16), at);
        }
        x[0] = 0;
        at = next;
    }
    return {trap: false, result: x[10], steps, counts, bytes: bytes.subarray(0, memoryBytes.length), registers: x};
}

// Classify one instruction word for profiling. Checked-access shapes follow
// FunctionCode.checkedAddress: an unsigned branch over an ebreak is a bounds test,
// and a word load at offset 0 feeding that branch is a capacity load.
function classify(word, nextWord, afterWord) {
    const op = word & 0x7f, rs1 = (word >>> 15) & 31, rd = (word >>> 7) & 31;
    const kinds = [];
    if (op === 0x03) kinds.push(rs1 === 2 ? "spLoad" : "load");
    if (op === 0x23) kinds.push(rs1 === 2 ? "spStore" : "store");
    if (op === 0x63) {
        kinds.push("branch");
        if (((word >>> 12) & 7) === 6 && nextWord === EBREAK) kinds.push("boundsTest");
    }
    if (op === 0x6f && rd === 1) kinds.push("call");
    if (op === 0x33 && (word >>> 25) === 1) kinds.push(((word >>> 12) & 7) === 0 ? "mul" : "div");
    if (op === 0x03 && ((word >>> 12) & 7) === 2 && (word >> 20) === 0 && rs1 !== 2 &&
        (nextWord & 0x7f) === 0x63 && ((nextWord >>> 12) & 7) === 6 && afterWord === EBREAK &&
        ((nextWord >>> 20) & 31) === rd) kinds.push("capacityLoad");
    return kinds;
}

// Attribute execution counts to the functions of a compiled program. Functions are laid
// out contiguously in entry order, so each one ends where the next begins.
function profile(program, counts) {
    const image = program.image;
    const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const starts = Object.entries(program.entries).sort((p, q) => p[1] - q[1]);
    const rows = [];
    for (let i = 0; i < starts.length; i++) {
        const [name, start] = starts[i];
        const end = i + 1 < starts.length ? starts[i + 1][1] : image.byteLength;
        const row = {name, start, bytes: end - start, steps: 0, spLoad: 0, spStore: 0, load: 0, store: 0,
            branch: 0, boundsTest: 0, capacityLoad: 0, call: 0, mul: 0, div: 0, entries: counts[start >>> 2]};
        for (let at = start; at < end; at += 4) {
            const n = counts[at >>> 2];
            if (!n) continue;
            row.steps += n;
            const word = view.getUint32(at, true);
            const nextWord = at + 4 < image.byteLength ? view.getUint32(at + 4, true) : 0;
            const afterWord = at + 8 < image.byteLength ? view.getUint32(at + 8, true) : 0;
            for (const kind of classify(word, nextWord, afterWord)) row[kind] += n;
        }
        rows.push(row);
    }
    return rows;
}

globalThis.typedRv32Interp = {run, profile, classify, Rv32Fault};
})();
