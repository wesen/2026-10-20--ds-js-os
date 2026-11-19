// Lower the shared typed frontend's structured i32 operations to RV32IM.
// This code executes in the host tools and can execute in a bare QuickJS realm.
(() => {
"use strict";

const ZERO = 0, RA = 1, SP = 2, A0 = 10, T5 = 30, T6 = 31;
const STACK_REGISTERS = [5, 6, 7, 28, 29]; // t0–t4
const instruction = {
    r: (op, rd, f3, a, b, f7 = 0) => (f7 << 25) | (b << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    i: (op, rd, f3, a, imm) => (imm << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    s: (f3, a, b, imm) => ((imm >> 5) << 25) | (b << 20) | (a << 15) | (f3 << 12) | ((imm & 31) << 7) | 0x23,
    b: (f3, a, b, imm) => ((imm & 0x1000) << 19) | ((imm & 0x7e0) << 20) | (b << 20) |
        (a << 15) | (f3 << 12) | ((imm & 0x1e) << 7) | ((imm & 0x800) >> 4) | 0x63,
    j: (rd, imm) => ((imm & 0x100000) << 11) | ((imm & 0x7fe) << 20) | ((imm & 0x800) << 9) |
        (imm & 0xff000) | (rd << 7) | 0x6f,
};

const ALU = new Map([
    [0x6a,[0,0]], [0x6b,[0,0x20]], [0x6c,[0,1]], [0x6d,[4,1]], [0x6f,[6,1]],
    [0x74,[1,0]], [0x75,[5,0x20]],
]);

class FunctionCode {
    constructor(program, functions, starts) {
        this.program = program;
        this.functions = functions;
        this.starts = starts;
        this.locals = program.params.length + program.nlocals;
        this.words = [];
        this.calls = [];
        this.control = [];
        this.depth = this.spillDepth = this.at = 0;
        this.exit = {};
    }

    cell() { return this.program.code[this.at++]; }

    emit(word) { this.words.push(word >>> 0); }
    load(reg, offset, base = SP, kind = 2) {
        this.emit(instruction.i(0x03, reg, kind, base, offset));
    }

    store(reg, offset, base = SP, kind = 2) {
        this.emit(instruction.s(kind, base, reg, offset));
    }

    constant(reg, n) {
        const lo = (n << 20) >> 20;
        if (n !== lo) this.emit(((n - lo) & 0xfffff000) | (reg << 7) | 0x37);
        this.emit(instruction.i(0x13, reg, 0, n === lo ? ZERO : reg, lo));
    }

    move(to, from) {
        if (to !== from) this.emit(instruction.i(0x13, to, 0, from, 0));
    }

    slot(depth) { return 4 * (this.locals + depth); }

    spill(depth, reg) {
        this.store(reg, this.slot(depth));
        this.spillDepth = Math.max(this.spillDepth, depth + 1);
    }

    pop(scratch) {
        if (!this.depth) throw new SyntaxError("empty RV32 operand stack");
        const depth = --this.depth;
        const reg = STACK_REGISTERS[depth];
        if (reg !== undefined) return reg;
        this.load(scratch, this.slot(depth));
        return scratch;
    }

    push(reg) {
        const depth = this.depth++;
        const home = STACK_REGISTERS[depth];
        if (home === undefined) this.spill(depth, reg);
        else this.move(home, reg);
    }

    resultRegister() { return STACK_REGISTERS[this.depth] ?? T5; }

    // A conditional branch skips the fixed-width jump when the predicate is false.
    branch(kind, a, b, target) {
        this.emit(instruction.b(kind ^ 1, a, b, 8));
        this.jump(target);
    }

    jump(target, rd = ZERO) {
        this.calls.push({from: this.words.length, target, rd});
        this.emit(0);
    }

    mark(label) { label.at = this.words.length; }

    binary(op) {
        const b = this.pop(T6);
        const a = this.pop(T5);
        const out = this.resultRegister();
        const alu = ALU.get(op);
        if (alu) {
            if (op === 0x6d || op === 0x6f) {
                this.emit(instruction.b(1, b, ZERO, 8));
                this.emit(0x00100073);
            }
            if (op === 0x6d) {
                const safe = {};
                // No operand lives in an argument register between operations.
                this.constant(A0, -1);
                this.branch(1, b, A0, safe);
                this.constant(A0, -2147483648);
                this.emit(instruction.b(1, a, A0, 8));
                this.emit(0x00100073);
                this.mark(safe);
            }
            this.emit(instruction.r(0x33, out, alu[0], a, b, alu[1]));
        } else if (op === 0x46) {
            this.emit(instruction.r(0x33, out, 4, a, b)); // xor
            this.emit(instruction.i(0x13, out, 3, out, 1)); // seqz
        } else {
            const unsigned = op === 0x4f;
            if (![0x48, 0x4a, 0x4c, 0x4e, 0x4f].includes(op))
                throw new SyntaxError("unsupported RV32 operator " + op);
            const swap = op === 0x4a || op === 0x4c;
            this.emit(instruction.r(0x33, out, unsigned ? 3 : 2, swap ? b : a, swap ? a : b));
            if (op === 0x4c || op === 0x4e || unsigned)
                this.emit(instruction.i(0x13, out, 4, out, 1));
        }
        this.push(out);
    }

    begin(op) {
        const type = this.cell();
        if (type !== 0x40 && type !== 0x7f) throw new SyntaxError("unsupported RV32 control result");
        const condition = op === 0x04 ? this.pop(T5) : ZERO;
        const block = {op, depth: this.depth, value: type === 0x7f, start: {}, alternate: {}, end: {}};
        this.control.push(block);
        this.mark(block.start);
        if (op === 0x04) this.branch(0, condition, ZERO, block.alternate);
    }

    end() {
        const block = this.control.pop();
        if (!block) {
            this.move(A0, this.pop(A0));
            return true;
        }
        if (block.alternate.at === undefined) this.mark(block.alternate);
        this.mark(block.end);
        // Both arms put a result in the same home at the block's entry depth.
        this.depth = block.depth + Number(block.value);
        return false;
    }

    call(index) {
        const count = this.functions[index].params.length;
        if (count > 8) throw new SyntaxError("RV32 supports up to eight register arguments");
        for (let i = count - 1; i >= 0; i--) {
            const arg = A0 + i;
            this.move(arg, this.pop(arg));
        }
        // Only the values below the arguments survive the call.
        const live = Math.min(this.depth, STACK_REGISTERS.length);
        for (let d = 0; d < live; d++) this.spill(d, STACK_REGISTERS[d]);
        this.jump(this.starts[index], RA);
        for (let d = 0; d < live; d++) this.load(STACK_REGISTERS[d], this.slot(d));
        this.push(A0);
    }

    step(op) {
        switch (op) {
        case 0x00: this.emit(0x00100073); break;  // Wasm unreachable
        case 0x02: case 0x03: case 0x04: this.begin(op); break;
        case 0x05: {
            const block = this.control.at(-1);
            this.jump(block.end);
            this.mark(block.alternate);
            this.depth = block.depth;
            break;
        }
        case 0x0b: return this.end();
        case 0x0c: case 0x0d: {
            const block = this.control.at(-1 - this.cell());
            const target = block.op === 0x03 ? block.start : block.end;
            if (op === 0x0d) this.branch(1, this.pop(T5), ZERO, target);
            else this.jump(target);
            break;
        }
        case 0x0f: this.move(A0, this.pop(A0)); this.jump(this.exit); break;
        case 0x10: this.call(this.cell()); break;
        case 0x1a: this.depth--; break;
        case 0x20: {
            const out = this.resultRegister();
            this.load(out, 4 * this.cell());
            this.push(out);
            break;
        }
        case 0x21: this.store(this.pop(T5), 4 * this.cell()); break;
        case 0x28: case 0x2f: case 0x36: case 0x3b: {
            this.cell(); // alignment hint
            const offset = this.cell();
            if (offset > 2047) throw new SyntaxError("RV32 field offset exceeds the instruction range");
            if (op === 0x28 || op === 0x2f) {
                const base = this.pop(T5);
                const out = this.resultRegister();
                this.load(out, offset, base, op === 0x28 ? 2 : 5); // lw or lhu
                this.push(out);
            } else {
                const value = this.pop(T6);
                this.store(value, offset, this.pop(T5), op === 0x36 ? 2 : 1); // sw or sh
            }
            break;
        }
        case 0x41: {
            const out = this.resultRegister();
            this.constant(out, this.cell());
            this.push(out);
            break;
        }
        case 0x45: {
            const value = this.pop(T5);
            const out = this.resultRegister();
            this.emit(instruction.i(0x13, out, 3, value, 1));
            this.push(out);
            break;
        }
        default: this.binary(op);
        }
        return false;
    }

    lower() {
        const count = this.program.params.length;
        if (count > 8) throw new SyntaxError("RV32 supports up to eight register arguments");
        this.emit(0);
        this.emit(0);
        for (let i = 0; i < count; i++) this.store(A0 + i, 4 * i);
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        const frame = (4 * (this.locals + this.spillDepth + 1) + 15) & -16;
        if (frame > 2032) throw new SyntaxError("RV32 function frame exceeds the instruction range");
        this.words[0] = instruction.i(0x13, SP, 0, SP, -frame) >>> 0;
        this.words[1] = instruction.s(2, SP, RA, frame - 4) >>> 0;
        this.mark(this.exit);
        this.load(RA, frame - 4);
        this.emit(instruction.i(0x13, SP, 0, SP, frame));
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        return this;
    }
}

function compile(source, imports = [], maxSourceLength, options) {
    const imported = imports.map((fn, index) => ({...fn, index}));
    const targets = imported.map(fn => ({importIndex: fn.index}));
    const callables = imported.slice();
    const code = [];
    function lower(fn) {
        targets.push({global: true});
        callables.push(fn);
        code.push(new FunctionCode(fn, callables, targets).lower());
    }

    let lowerError;
    function consume(fn) {
        // Buffered compilation checks the entire source before reporting a backend error.
        if (!lowerError) {
            try { lower(fn); } catch (error) { lowerError = error; }
        }
        // FunctionCode retains the function descriptor until assembly.
        fn.code = null;
    }

    const stream = options?.streamFunctions ?? true;
    const {functions, records} = typedWasm.compileFunctions(source, imported.length, imported,
        maxSourceLength, true, stream ? consume : undefined);
    if (lowerError) throw lowerError;
    if (!stream) {
        for (const fn of functions) lower(fn);
    }
    let words = 0;
    for (let i = 0; i < code.length; i++) {
        targets[imported.length + i].at = words;
        words += code[i].words.length;
    }
    const image = new Uint8Array(words * 4);
    const view = new DataView(image.buffer);
    const entries = Object.create(null);
    const relocations = [];
    for (let i = 0; i < code.length; i++) {
        const start = targets[imported.length + i].at;
        const fn = code[i];
        entries[functions[i].name] = start * 4;
        for (const {from, target, rd} of fn.calls) {
            if (target.importIndex !== undefined) {
                relocations.push({offset: 4 * (start + from), index: target.importIndex});
                continue;
            }
            const delta = 4 * (target.at - from - (target.global ? start : 0));
            if (!Number.isInteger(delta) || delta < -1048576 || delta > 1048574)
                throw new SyntaxError("RV32 jump exceeds the instruction range");
            fn.words[from] = instruction.j(rd, delta) >>> 0;
        }
        for (let j = 0; j < fn.words.length; j++) view.setUint32(4 * (start + j), fn.words[j], true);
    }
    const layouts = Object.fromEntries(Array.from(records, ([name, fields]) => [name, Object.fromEntries(fields)]));
    return {image, entries, records: layouts, relocations, importCount: imports.length,
        signatures: functions.map(({name, params, result}) => ({name, params, result}))};
}

// The bundled, already linked SDK reactor reserves this area in executable
// text. The native world loader still validates and relocates the completed ELF.
function linkSlot(program, runtime, entries) {
    const magic = [0x4147454e, 0x44415256, 0x3332534c];
    const headerBytes = 20;
    const importOffset = headerBytes + 4 * entries.length;
    const codeOffset = importOffset + 4 * program.importCount;
    const view = new DataView(runtime.buffer, runtime.byteOffset, runtime.byteLength);
    if (runtime.length < 52 || view.getUint32(0, true) !== 0x464c457f ||
        view.getUint8(4) !== 1 || view.getUint8(5) !== 1 ||
        view.getUint16(16, true) !== 3 || view.getUint16(18, true) !== 243 ||
        (view.getUint32(36, true) & 6) !== 2)
        throw new SyntaxError("expected an ELF32 RISC-V ilp32f reactor");
    const count = view.getUint16(44, true);
    const stride = view.getUint16(42, true);
    const segments = view.getUint32(28, true);
    if (stride !== 32 || segments + stride * count > runtime.length)
        throw new SyntaxError("invalid RV32 reactor program headers");

    let slot = -1, capacity = 0;
    for (let i = 0; i < count; i++) {
        const header = segments + i * stride;
        if (view.getUint32(header, true) !== 1 || !(view.getUint32(header + 24, true) & 1)) continue;
        const start = view.getUint32(header + 4, true);
        const end = start + view.getUint32(header + 16, true);
        if (end > runtime.length) throw new SyntaxError("truncated RV32 reactor code segment");
        for (let at = (start + 3) & -4; at + codeOffset <= end; at += 4) {
            if (view.getUint32(at, true) !== magic[0] || view.getUint32(at + 4, true) !== magic[1] ||
                view.getUint32(at + 8, true) !== magic[2]) continue;
            if (slot >= 0) throw new SyntaxError("ambiguous RV32 reactor slot");
            capacity = view.getUint32(at + 12, true);
            if (view.getUint32(at + 16, true) !== entries.length + 65536 * program.importCount || capacity < codeOffset ||
                capacity > end - at || capacity > 1048576 || capacity % 4)
                throw new SyntaxError("invalid RV32 reactor slot header");
            for (let entry = at + headerBytes; entry < at + importOffset; entry += 4) {
                if (view.getUint32(entry, true) !== 0x00100073)
                    throw new SyntaxError("invalid RV32 reactor entry stub");
            }
            for (let entry = at + importOffset; entry < at + codeOffset; entry += 4) {
                if ((view.getUint32(entry, true) & 0xfff) !== 0x6f)
                    throw new SyntaxError("invalid RV32 runtime import trampoline");
            }
            slot = at;
            at += capacity - 4;
        }
    }
    if (slot < 0) throw new SyntaxError("missing RV32 reactor slot");
    if (program.image.length > capacity - codeOffset) throw new SyntaxError("RV32 program does not fit the reactor slot");
    const bytes = new Uint8Array(runtime);
    const patched = new DataView(bytes.buffer);
    for (let i = 0; i < entries.length; i++) {
        const offset = program.entries[entries[i]];
        if (!Number.isInteger(offset) || offset < 0 || offset + 4 > program.image.length || offset % 4)
            throw new SyntaxError("invalid RV32 entry " + entries[i]);
        const stub = headerBytes + 4 * i;
        patched.setUint32(slot + stub, instruction.j(ZERO, codeOffset + offset - stub), true);
    }
    bytes.set(program.image, slot + codeOffset);
    for (const {offset, index} of program.relocations) {
        const call = codeOffset + offset;
        patched.setUint32(slot + call, instruction.j(RA, importOffset + 4 * index - call), true);
    }
    return bytes;
}

globalThis.typedRv32 = {compile, linkSlot};
})();
