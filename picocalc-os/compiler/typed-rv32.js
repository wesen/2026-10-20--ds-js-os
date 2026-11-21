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
        if (program.nativeInspection) observeSteps(this);
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
                // A frameless function still keeps its parameters in argument registers.
                const check = this.frameless ? T5 : A0;
                this.constant(check, -1);
                this.branch(1, b, check, safe);
                this.constant(check, -2147483648);
                this.emit(instruction.b(1, a, check, 8));
                this.emit(0x00100073);
                this.mark(safe);
            }
            this.emit(instruction.r(0x33, out, alu[0], a, b, alu[1]));
        } else if (op === 0x46 || op === 0x47) {
            this.emit(instruction.r(0x33, out, 4, a, b)); // xor
            if (op === 0x46) this.emit(instruction.i(0x13, out, 3, out, 1)); // seqz
            else this.emit(instruction.r(0x33, out, 3, ZERO, out)); // snez
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
        case 0xf1: { // checked UTF-16 address, before any payload load or write RHS
            const receiver = this.cell(), position = this.cell();
            this.load(T5, 4 * position);
            this.load(T6, 4 * receiver);
            this.load(A0, 0, T6);
            this.emit(instruction.b(6, T5, A0, 8)); // unsigned position < capacity
            this.emit(0x00100073);
            const out = this.resultRegister();
            this.emit(instruction.i(0x13, out, 1, T5, 1));
            this.emit(instruction.r(0x33, out, 0, T6, out));
            this.push(out);
            break;
        }
        case 0xf2: { // ordered UTF-16 stores after the complete range check
            const address = this.cell();
            const value = this.program.literals[this.cell()];
            this.load(T5, 4 * address);
            for (let i = 0; i < value.length; i++) {
                this.constant(T6, value.charCodeAt(i));
                this.store(T6, 4 + 2 * i, T5, 1);
            }
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

// Describe a tiny unary integer helper only after its verified operation tape is available.
// Accepted body: if (x <relation> K) return -x or C; return x.
// The branch below skips the taken action when the source predicate is false.
const GUARDED_FALSE = new Map([
    [0x46,[1,false]], [0x47,[0,false]], // eq: bne, ne: beq
    [0x48,[5,false]], [0x4a,[5,true]],  // lt: bge x,K; gt: bge K,x
    [0x4c,[4,true]], [0x4e,[4,false]],  // le: blt K,x; ge: blt x,K
]);

function guardedReturnSummary(fn) {
    const t = fn.code;
    if (fn.nlocals || fn.params.length !== 1 || fn.params[0] !== "i32" || fn.result !== "i32" ||
        (t.length !== 14 && t.length !== 17)) return null;
    const branch = GUARDED_FALSE.get(t[4]);
    if (!branch || t[0] !== 0x20 || t[1] !== 0 || t[2] !== 0x41 || t[5] !== 0x04 ||
        t[6] !== 0x40 || t[7] !== 0x41) return null;
    const negate = t.length === 17;
    if (negate && (t[8] !== 0 || t[9] !== 0x20 || t[10] !== 0 || t[11] !== 0x6b)) return null;
    const tail = t.length - 5;
    if (t[tail] !== 0x0f || t[tail+1] !== 0x0b || t[tail+2] !== 0x20 ||
        t[tail+3] !== 0 || t[tail+4] !== 0x0b) return null;
    return {kind: branch[0], swap: branch[1], limit: t[3], negate, literal: t[8]};
}

class GuardedReturnCode extends FunctionCode {
    call(index) {
        const summary = this.starts[index].guardedReturn;
        if (!summary) return super.call(index);
        // pop/push preserve every lower stack operand, including any frame spills.
        const x = this.pop(T5);
        const out = this.resultRegister();
        this.move(out, x);
        const limit = summary.limit === 0 ? ZERO : T6;
        if (limit !== ZERO) this.constant(limit, summary.limit);
        const branch = this.words.length;
        this.emit(0);
        if (summary.negate) this.emit(instruction.r(0x33, out, 0, ZERO, x, 0x20));
        else this.constant(out, summary.literal);
        this.words[branch] = instruction.b(summary.kind, summary.swap ? limit : x,
            summary.swap ? x : limit, 4 * (this.words.length - branch)) >>> 0;
        this.push(out);
        if (this.inspection) this.inlinedGuard = true;
    }
}

// An allowlist keeps any new operation with a possible frame dependency on the
// ordinary path until its frameless lowering is reviewed.
const LEAF_OPERANDS = new Map([
    [0x02,1],[0x04,1],[0x05,0],[0x0b,0],[0x0c,1],[0x0d,1],[0x0f,0],
    [0x1a,0],[0x20,1],[0x41,1],[0x45,0],
    [0x46,0],[0x47,0],[0x48,0],[0x4a,0],[0x4c,0],[0x4e,0],[0x4f,0],
    ...Array.from(ALU.keys(), op => [op,0]),
]);
const LEAF_SPILL = Symbol("frameless function needs an operand spill");

class LeafCode extends FunctionCode {
    spill() { throw LEAF_SPILL; }

    step(op) {
        if (op !== 0x20) return super.step(op);
        const local = this.cell();
        if (local >= this.program.params.length) throw LEAF_SPILL;
        this.push(A0 + local);
        return false;
    }

    lower() {
        this.frameless = true;
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        if (this.at !== this.program.code.length || this.control.length) throw LEAF_SPILL;
        this.mark(this.exit);
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        return this;
    }
}

// Wrap only the selected instance. The ordinary emitter and the leaf emitter
// keep their real instruction loop, including lookahead and zero-word ops.
function observeSteps(fn) {
    const step = fn.step;
    const ranges = [];
    fn.inspection = {ranges, trackedWords: fn.words};
    fn.step = function(op) {
        const inputStart = this.at - 1;
        let start = this.words.length * 4;
        const live = this.depth;
        const done = step.call(this, op);
        const decisions = [];
        if (op === 0x10 && this.inlinedGuard) {
            decisions.push("inline guarded return from verified i32 helper");
            this.inlinedGuard = false;
        } else if (op === 0x10) {
            const args = this.functions[this.program.code[inputStart + 1]].params.length;
            decisions.push("preserve " + Math.min(Math.max(0, live - args), STACK_REGISTERS.length) +
                " register-held operands across call");
        }
        if (this.loopRanges) {
            ranges.push(...this.loopRanges);
            start = ranges.at(-1).end;
            this.loopRanges = null;
        }
        ranges.push({inputStart, inputEnd: this.at, start, end: this.words.length * 4,
            role: "operation", decisions});
        return done;
    };
}

// Ranges use byte offsets in the final image; tape offsets stay function-local.
// Research lowerings may supply multiple segments when an admitted fast path
// precedes a fallback. Never attach the old positions to replacement words.
function nativeEmission(fn, start, inspect) {
    const ranges = [];
    const length = fn.words.length * 4;
    const ordinary = fn.inspection && fn.inspection.trackedWords === fn.words;
    const segments = fn.inspectionSegments ?? (ordinary ?
        [{offset: 0, ranges: fn.inspection.ranges}] : []);
    let cursor = 0;
    function gap(end, role) {
        if (end > cursor) ranges.push({start: start + cursor, end: start + end, role});
        cursor = end;
    }
    for (const segment of segments) {
        for (const r of segment.ranges) {
            const lo = segment.offset + r.start, hi = segment.offset + r.end;
            if (lo < cursor || hi < lo || hi > length) throw new Error("invalid RV32 inspection segment");
            gap(lo, ordinary && !fn.inspectionSegments ? "prologue" : "specialized code");
            ranges.push({...r, start: start + lo, end: start + hi, segment: segment.label ?? r.segment});
            cursor = hi;
        }
    }
    gap(length, ordinary && !fn.inspectionSegments ? "epilogue" : "specialized code");
    inspect.emit({kind: "emission", target: "rv32", function: fn.program.name,
        start, end: start + length, localCount: fn.locals, frame: fn.frameless ? "leaf" : "framed",
        leafDecision: fn.program.nativeInspection.leafDecision, loops: fn.program.loopDecisions, ranges});
}

function declineLeaf(fn, reason) {
    if (fn.nativeInspection) fn.nativeInspection.leafDecision = reason;
    return null;
}

function lowerLeaf(fn, callables, targets) {
    if (fn.nlocals) return declineLeaf(fn, "function declares frame locals");
    if (fn.code.length > 128) return declineLeaf(fn, "operation tape exceeds 128 cells");
    if (fn.params.length > 8 || !fn.params.every(type => type === "i32" || type === "bool"))
        return declineLeaf(fn, "argument list outside leaf convention");
    for (let at = 0; at < fn.code.length;) {
        const operands = LEAF_OPERANDS.get(fn.code[at++]);
        if (operands === undefined || at + operands > fn.code.length)
            return declineLeaf(fn, "operation outside frameless allowlist");
        at += operands;
    }
    try {
        return new LeafCode(fn, callables, targets).lower();
    } catch (error) {
        if (error !== LEAF_SPILL) throw error;
        return declineLeaf(fn, "leaf requires frame storage");
    }
}

function compile(source, imports = [], maxSourceLength, options) {
    const imported = imports.map((fn, index) => ({...fn, index}));
    const targets = imported.map(fn => ({importIndex: fn.index}));
    const callables = imported.slice();
    const code = [];
    function declare(functions) {
        for (const fn of functions) {
            targets.push({global: true});
            callables.push(fn);
        }
    }

    const inspect = options?.inspect;
    const policy = options?.inlineGuardedReturns;
    if (policy !== undefined && typeof policy !== "boolean" && typeof policy !== "function")
        throw new TypeError("expected a boolean or caller selector for inlineGuardedReturns");
    function lower(fn) {
        if (inspect && (inspect.function === undefined || inspect.function === fn.name))
            fn.nativeInspection = {leafDecision: "eligible for frameless lowering"};
        let Emitter = FunctionCode;
        if (policy) {
            // Only our internal definition targets can acquire summaries. A forward call
            // uses the ordinary ABI in both streaming and buffered compilation.
            const summary = guardedReturnSummary(fn);
            if (summary) targets[imported.length + code.length].guardedReturn = summary;
            if (policy === true || policy(fn.name)) Emitter = GuardedReturnCode;
        }
        const mode = options?.pieLoops;
        if (mode !== undefined) {
            if (mode !== "scalar" && mode !== "pie" && mode !== "pie-empty" && typeof mode !== "function") throw new TypeError("unknown PIE loop compilation mode");
            if (!globalThis.typedPieLoops) throw new Error("load typed-pie-loops.js for PIE loop compilation");
            const selected = typedPieLoops.lower(fn, callables, targets, mode, Emitter, instruction);
            if (selected) {
                code.push(selected);
                if (fn.literals) fn.literals = null;
                return;
            }
        }
        code.push(lowerLeaf(fn, callables, targets) ?? new Emitter(fn, callables, targets).lower());
        // The lowered code retains the descriptor, so release the function-local literal table.
        if (fn.literals) fn.literals = null;
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
    const {functions, records, enums, distinct, asyncLayout, asyncSource} = typedWasm.compileFunctions(source,
        imported.length, imported, maxSourceLength, true, stream ? consume : undefined, declare, options);
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
        if (fn.program.nativeInspection) nativeEmission(fn, start * 4, inspect);
    }
    return {image, entries, records: typedWasm.recordLayouts(records), enums: typedWasm.enumLayouts(enums),
        distinct: [...distinct], relocations, importCount: imports.length,
        signatures: functions.map(({name, params, result}) => ({name, params, result})),
        ...(asyncLayout && {asyncLayout}), ...(asyncSource && {asyncSource})};
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
