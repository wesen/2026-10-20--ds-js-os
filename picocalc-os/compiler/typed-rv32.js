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

// select.branches: the branch funct3 taken when the predicate holds, and whether the
// instruction's operands are reversed. From PICOCALC-RV32-BRANCH 02-predicate-fusion.patch.
const PREDICATES = new Map([
    [0x45,[0,false]], // eqz (right operand is zero)
    [0x46,[0,false]], // eq
    [0x47,[1,false]], // ne
    [0x48,[4,false]], // lt_s
    [0x4a,[4,true]],  // gt_s
    [0x4c,[5,true]],  // le_s
    [0x4e,[5,false]], // ge_s
    [0x4f,[7,false]], // ge_u
]);

const fitsImmediate = n => n >= -2048 && n <= 2047;
const powerOfTwo = n => n > 0 && (n & (n - 1)) === 0 ? 31 - Math.clz32(n) : -1;

// select.immediates: an operation whose right operand is a literal, as I-type instructions.
// Each entry returns [funct3, immediate] pairs, applied in order to the result register; the
// first reads the left operand. null keeps the register form.
const IMMEDIATE_FORMS = new Map([
    [0x6a, c => fitsImmediate(c) ? [[0, c]] : null],                       // addi
    [0x6b, c => fitsImmediate(-c) ? [[0, -c]] : null],                     // addi -c
    [0x6c, c => c === 1 ? [[0, 0]] : powerOfTwo(c) > 0 ? [[1, powerOfTwo(c)]] : null], // mv, slli
    [0x74, c => [[1, c & 31]]],                                            // slli
    [0x75, c => [[5, 0x400 | (c & 31)]]],                                  // srai
    [0x48, c => fitsImmediate(c) ? [[2, c]] : null],                       // slti
    [0x4c, c => c < 2047 && c >= -2049 ? [[2, c + 1]] : null],             // a <= c as a < c+1
    [0x4e, c => fitsImmediate(c) ? [[2, c], [4, 1]] : null],               // !(a < c)
    [0x4f, c => fitsImmediate(c) ? [[3, c], [4, 1]] : null],               // !(a <u c)
    [0x46, c => fitsImmediate(c) ? [[4, c], [3, 1]] : null],               // xori, seqz
]);

// Signed division by a constant d in [3, 2^31) that is not a power of two: q = mulh(n, M)
// (+ n when M is negative), shifted right arithmetically by s, plus one when n < 0.
// Hacker's Delight, Figure 10-1, with exact doubles (every value stays below 2^34).
function divisionMagic(d) {
    const two31 = 2147483648, anc = two31 - 1 - two31 % d;
    let p = 31, q1 = Math.floor(two31 / anc), r1 = two31 - q1 * anc;
    let q2 = Math.floor(two31 / d), r2 = two31 - q2 * d, delta;
    do {
        p++;
        q1 *= 2; r1 *= 2;
        if (r1 >= anc) { q1++; r1 -= anc; }
        q2 *= 2; r2 *= 2;
        if (r2 >= d) { q2++; r2 -= d; }
        delta = d - r2;
    } while (q1 < delta || (q1 === delta && r1 === 0));
    return {magic: (q2 + 1) | 0, shift: p - 32};
}

// How select lowers the literal at tape[at] (an i32.const operand cell), given the next
// operation: "zero" (read x0), "divide", "immediate", or "register" (it needs a register:
// a fused branch compare, a large or unfoldable operand, a store value, an argument).
// The emitter and the planner both use this, so a constant home is planned exactly where
// the emitter would otherwise load the literal.
function constantForm(tape, at, s) {
    const c = tape[at], next = tape[at + 1];
    const consumer = tape[at + 2] === 0x45 ? tape[at + 3] : tape[at + 2];
    if (s?.branches && PREDICATES.has(next) && (consumer === 0x04 || consumer === 0x0d))
        return s.immediates && c === 0 ? "zero" : "register";
    if (s?.divisions && (next === 0x6d || next === 0x6f) && (c >= 3 || powerOfTwo(c) > 0) &&
        !(next === 0x6f && powerOfTwo(c) < 0)) return "divide";
    if (!s?.immediates) return "register";
    if (c === 0) return "zero";
    return IMMEDIATE_FORMS.get(next)?.(c) ? "immediate" : "register";
}

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
        // direct[d] names the home register of a local read that is still pending at operand
        // depth d. Its consumer reads the home itself, so no copy is emitted.
        this.direct = [];
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
        if (n === lo || lo !== 0 || !this.select?.immediates)
            this.emit(instruction.i(0x13, reg, 0, n === lo ? ZERO : reg, lo));
    }

    // select.results: when the next operation stores this result into a homed local, the
    // result is computed in the home and the store disappears. Call after popping the
    // operands; every caller's sequence reads its operands no later than its first write.
    destination() {
        const tape = this.program.code, plan = this.locations;
        if (!this.select?.results || !plan || tape[this.at] !== 0x21 || plan.forward.has(this.at)) return undefined;
        const home = plan.homes.get(tape[this.at + 1]);
        if (home === undefined) return undefined;
        this.at += 2;
        this.materialize(home);
        return home;
    }

    // Push a result computed in resultRegister(), unless destination() stored it already.
    result(out, stored) {
        if (stored === undefined) this.push(out);
    }

    move(to, from) {
        if (to !== from) this.emit(instruction.i(0x13, to, 0, from, 0));
    }

    readLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) this.move(reg, home);
        else this.load(reg, 4 * local);
    }

    writeLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) {
            // A pending read of this local must keep the value it had when it was pushed.
            this.materialize(home);
            this.move(home, reg);
        } else this.store(reg, 4 * local);
    }

    // Copy pending direct reads into their ordinary operand locations: every one, or only
    // those of one home register. Control flow calls this so that both arms of a join and
    // every loop iteration agree on where each operand lives.
    materialize(home) {
        for (let d = 0; d < this.depth; d++) {
            const h = this.direct[d];
            if (h === undefined || (home !== undefined && h !== home)) continue;
            this.direct[d] = undefined;
            const reg = STACK_REGISTERS[d];
            if (reg === undefined) this.spill(d, h);
            else this.move(reg, h);
        }
    }

    pushHome(home) {
        this.direct[this.depth++] = home;
    }

    checkedAddress(receiver, index, constant) {
        const base = this.locations?.homes.get(receiver) ?? T6;
        if (base === T6) this.readLocal(base, receiver);
        const capacity = this.locations?.homes.get(-1 - receiver);
        const cached = this.locations?.receiver === receiver;
        const length = capacity ?? (cached ? A0 + 7 : A0);
        if (capacity === undefined && (!cached || !this.capacityReady)) this.load(length, 0, base);
        if (cached) this.capacityReady = true;
        this.emit(instruction.b(6, index, length, 8));
        this.emit(0x00100073);
        const out = this.resultRegister(), tape = this.program.code;
        if (constant >= 0 && constant <= 1021 && tape[this.at] === 0x2f && tape[this.at+2] === 4) {
            this.at += 3;
            this.load(out, 4 + 2 * constant, base, 5);
        } else {
            this.emit(instruction.i(0x13, out, 1, index, 1));
            this.emit(instruction.r(0x33, out, 0, base, out));
        }
        this.push(out);
    }

    slot(depth) { return 4 * (this.locals + depth); }

    spill(depth, reg) {
        this.store(reg, this.slot(depth));
        this.spillDepth = Math.max(this.spillDepth, depth + 1);
    }

    pop(scratch) {
        if (!this.depth) throw new SyntaxError("empty RV32 operand stack");
        const depth = --this.depth;
        const home = this.direct[depth];
        if (home !== undefined) {
            this.direct[depth] = undefined;
            return home;
        }
        const reg = STACK_REGISTERS[depth];
        if (reg !== undefined) return reg;
        this.load(scratch, this.slot(depth));
        return scratch;
    }

    push(reg) {
        const depth = this.depth++;
        this.direct[depth] = undefined;
        const home = STACK_REGISTERS[depth];
        if (home === undefined) this.spill(depth, reg);
        else this.move(home, reg);
    }

    resultRegister() { return STACK_REGISTERS[this.depth] ?? T5; }

    // A conditional branch skips the fixed-width jump when the predicate is false.
    branch(kind, a, b, target) {
        if (this.select?.branches && target.at !== undefined) {
            const offset = 4 * (target.at - this.words.length);
            if (offset >= -4096) {
                this.emit(instruction.b(kind, a, b, offset) >>> 0);
                return;
            }
        }
        // select.shortBranches: a forward branch is one conditional branch, patched once the
        // function is complete; patchBranches() asks for a long-branch lowering if any
        // target is beyond the 4 KiB range.
        if (this.select?.shortBranches && !this.longBranches) {
            (this.shortBranches ??= []).push({from: this.words.length, target, kind, a, b});
            this.emit(0);
            return;
        }
        this.emit(instruction.b(kind ^ 1, a, b, 8));
        this.jump(target);
    }

    patchBranches() {
        for (const {from, target, kind, a, b} of this.shortBranches ?? []) {
            const offset = 4 * (target.at - from);
            if (!(offset <= 4094)) throw SHORT_BRANCH_RANGE;
            this.words[from] = instruction.b(kind, a, b, offset) >>> 0;
        }
    }

    jump(target, rd = ZERO) {
        this.calls.push({from: this.words.length, target, rd});
        this.emit(0);
    }

    mark(label) { label.at = this.words.length; }

    binary(op) {
        const b = this.pop(T6);
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
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
        this.result(out, stored);
    }

    // select.immediates and select.divisions: the literal at this.at feeds the next operation.
    selectConstant() {
        const tape = this.program.code, c = tape[this.at], next = tape[this.at + 1];
        const kind = constantForm(tape, this.at, this.select);
        if (kind === "register") return false;
        if (kind === "zero") {
            this.at++;
            this.pushHome(ZERO);
            return true;
        }
        if (kind === "divide") {
            this.at += 2;
            this.divideByConstant(next === 0x6f, c);
            return true;
        }
        const form = IMMEDIATE_FORMS.get(next)(c);
        this.at += 2;
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        form.forEach(([f3, imm], i) => this.emit(instruction.i(0x13, out, f3, i ? out : a, imm)));
        this.result(out, stored);
        return true;
    }

    // Signed truncating division or remainder by a positive constant, without a divide.
    // T6 is the scratch register; pop(T5) never returns it.
    divideByConstant(remainder, d) {
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        const k = powerOfTwo(d);
        if (k === 0) this.move(out, a);
        else if (k > 0) {
            // Bias a negative dividend by d - 1 so that the shift rounds toward zero.
            if (k === 1) this.emit(instruction.i(0x13, T6, 5, a, 31));         // srli t6,a,31
            else {
                this.emit(instruction.i(0x13, T6, 5, a, 0x400 | 31));         // srai t6,a,31
                this.emit(instruction.i(0x13, T6, 5, T6, 32 - k));            // srli t6,t6,32-k
            }
            if (remainder) {
                this.emit(instruction.r(0x33, T6, 0, a, T6));                 // add t6,a,t6
                if (fitsImmediate(-d)) this.emit(instruction.i(0x13, T6, 7, T6, -d)); // andi
                else {
                    this.emit(instruction.i(0x13, T6, 5, T6, 0x400 | k));
                    this.emit(instruction.i(0x13, T6, 1, T6, k));
                }
                this.emit(instruction.r(0x33, out, 0, a, T6, 0x20));          // sub out,a,t6
            } else {
                this.emit(instruction.r(0x33, out, 0, a, T6));                // add out,a,t6
                this.emit(instruction.i(0x13, out, 5, out, 0x400 | k));       // srai out,out,k
            }
        } else {
            const {magic, shift} = divisionMagic(d);
            this.constant(T6, magic);
            this.emit(instruction.r(0x33, T6, 1, a, T6, 1));                  // mulh t6,a,t6
            if (magic < 0) this.emit(instruction.r(0x33, T6, 0, T6, a));      // add t6,t6,a
            if (shift) this.emit(instruction.i(0x13, T6, 5, T6, 0x400 | shift));
            this.emit(instruction.i(0x13, out, 5, a, 31));                    // srli out,a,31
            this.emit(instruction.r(0x33, out, 0, out, T6));                  // add out,out,t6
        }
        this.result(out, stored);
    }

    // Whether the operation at `at` (after a predicate) is a branch the predicate can fuse with.
    fusible(at) {
        const tape = this.program.code;
        const consumer = tape[at] === 0x45 ? tape[at + 1] : tape[at];
        return consumer === 0x04 || consumer === 0x0d;
    }

    branchTarget() {
        const block = this.control.at(-1 - this.cell());
        return block.op === 0x03 ? block.start : block.end;
    }

    // select.branches: a comparison consumed by if or br_if becomes one conditional branch.
    fuseBranch(op) {
        const encoding = PREDICATES.get(op);
        if (!encoding || !this.fusible(this.at)) return false;
        const negate = this.program.code[this.at] === 0x45;
        const consumer = this.program.code[this.at + Number(negate)];
        this.at += 1 + Number(negate);
        const [kind, swap] = encoding;
        const right = op === 0x45 ? ZERO : this.pop(T6);
        const left = this.pop(T5);
        // As at every control operation, pending direct reads move to their stack registers.
        this.materialize();
        const a = swap ? right : left;
        const b = swap ? left : right;
        const whenTrue = kind ^ Number(negate);
        if (consumer === 0x04) this.begin(consumer, whenTrue ^ 1, a, b);
        else this.branch(whenTrue, a, b, this.branchTarget());
        return true;
    }

    begin(op, kind = 0, a, b = ZERO) {
        const type = this.cell();
        if (type !== 0x40 && type !== 0x7f) throw new SyntaxError("unsupported RV32 control result");
        const condition = op === 0x04 ? a ?? this.pop(T5) : ZERO;
        const block = {op, depth: this.depth, value: type === 0x7f, start: {}, alternate: {}, end: {}};
        this.control.push(block);
        this.mark(block.start);
        if (op === 0x04) this.branch(kind, condition, b, block.alternate);
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
        // Only the values below the arguments survive the call. A pending direct read stays in
        // its home: a function that calls keeps homes only in callee-saved registers.
        const live = Math.min(this.depth, STACK_REGISTERS.length);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.spill(d, STACK_REGISTERS[d]);
        this.jump(this.starts[index], RA);
        for (let d = 0; d < live; d++) if (this.direct[d] === undefined) this.load(STACK_REGISTERS[d], this.slot(d));
        this.push(A0);
    }

    step(op) {
        const plan = this.locations;
        if (op >= 0x02 && op <= 0x0f) this.materialize();
        if (plan?.forward.has(this.at - 1)) {
            const constant = op === 0x41 ? this.cell() : undefined;
            const constantHome = constant === undefined ? undefined : plan.homes.get("c" + constant);
            const index = constant === undefined ? this.pop(T5) : constantHome ?? T5;
            if (constant !== undefined) {
                if (constantHome === undefined) this.constant(index, constant);
                this.at++; // local.set opcode following the literal
            }
            this.at += 2; // destination local and checked-address opcode
            const receiver = this.cell();
            this.at++; // proven single-use index local
            this.checkedAddress(receiver, index, constant);
            return false;
        }
        if (op === 0x20 && this.capacityReady && this.program.code[this.at] === plan.receiver &&
            this.program.code[this.at+1] === 0x28 && this.program.code[this.at+3] === 0) {
            this.at += 4;
            this.push(A0 + 7);
            return false;
        }
        if (this.select?.branches && op >= 0x45 && op <= 0x4f && this.fuseBranch(op)) return false;
        if (op === 0x41 && this.select && this.selectConstant()) return false;
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
            const local = this.cell();
            const home = plan?.direct ? plan.homes.get(local) : undefined;
            if (home !== undefined) {
                this.pushHome(home);
                break;
            }
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.readLocal(out, local);
            this.result(out, stored);
            break;
        }
        case 0x21: this.writeLocal(this.pop(T5), this.cell()); break;
        case 0x28: case 0x2f: case 0x36: case 0x3b: {
            this.cell(); // alignment hint
            const offset = this.cell();
            if (offset > 2047) throw new SyntaxError("RV32 field offset exceeds the instruction range");
            if (op === 0x28 || op === 0x2f) {
                const base = this.pop(T5);
                const stored = this.destination();
                const out = stored ?? this.resultRegister();
                this.load(out, offset, base, op === 0x28 ? 2 : 5); // lw or lhu
                this.result(out, stored);
            } else {
                const value = this.pop(T6);
                this.store(value, offset, this.pop(T5), op === 0x36 ? 2 : 1); // sw or sh
            }
            break;
        }
        case 0x41: {
            const n = this.cell();
            const constantHome = plan?.homes.get("c" + n);
            if (constantHome !== undefined) {
                this.pushHome(constantHome);
                break;
            }
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.constant(out, n);
            this.result(out, stored);
            break;
        }
        case 0x45: {
            const value = this.pop(T5);
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.emit(instruction.i(0x13, out, 3, value, 1));
            this.result(out, stored);
            break;
        }
        case 0xf1: { // checked UTF-16 address, before any payload load or write RHS
            const receiver = this.cell(), position = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5);
            break;
        }
        case 0xf2: { // ordered UTF-16 stores after the complete range check
            const address = this.cell();
            const value = this.program.literals[this.cell()];
            this.readLocal(T5, address);
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

    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

    lower() {
        const count = this.program.params.length;
        if (count > 8) throw new SyntaxError("RV32 supports up to eight register arguments");
        const saved = this.savedRegisters();
        // The frame size depends on the deepest spill, known only after the body, so the
        // prologue is emitted as placeholders and patched below.
        this.emit(0);
        this.emit(0);
        for (let k = 0; k < saved.length; k++) this.emit(0);
        for (let i = 0; i < count; i++) this.writeLocal(A0 + i, i);
        // Capacity homes belong to unwritten parameters, still in their argument registers here.
        for (const [id, reg] of this.locations?.homes ?? []) {
            if (typeof id === "string") this.constant(reg, Number(id.slice(1)));
            else if (id < 0) this.load(reg, 0, A0 - 1 - id);
        }
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        const frame = (4 * (this.locals + this.spillDepth + saved.length + 1) + 15) & -16;
        if (frame > 2032) throw new SyntaxError("RV32 function frame exceeds the instruction range");
        this.words[0] = instruction.i(0x13, SP, 0, SP, -frame) >>> 0;
        this.words[1] = instruction.s(2, SP, RA, frame - 4) >>> 0;
        for (let k = 0; k < saved.length; k++)
            this.words[2 + k] = instruction.s(2, SP, saved[k], frame - 8 - 4 * k) >>> 0;
        // Every return jumps here, so one restore sequence covers all exits.
        this.mark(this.exit);
        for (let k = 0; k < saved.length; k++) this.load(saved[k], frame - 8 - 4 * k);
        this.load(RA, frame - 4);
        this.emit(instruction.i(0x13, SP, 0, SP, frame));
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        this.patchBranches();
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
const SHORT_BRANCH_RANGE = Symbol("a forward branch target is beyond the conditional-branch range");

class LeafCode extends FunctionCode {
    spill() { throw LEAF_SPILL; }

    step(op) {
        if (op !== 0x20) return super.step(op);
        const local = this.cell();
        if (local >= this.program.params.length) throw LEAF_SPILL;
        // select.leafParams: a frameless leaf never writes a parameter, so reads use it in place.
        if (this.select?.leafParams) this.pushHome(A0 + local);
        else this.push(A0 + local);
        return false;
    }

    lower() {
        this.frameless = true;
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        if (this.at !== this.program.code.length || this.control.length) throw LEAF_SPILL;
        this.mark(this.exit);
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        this.patchBranches();
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

function lowerLeaf(fn, callables, targets, select) {
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
        const leaf = new LeafCode(fn, callables, targets);
        leaf.select = select;
        return leaf.lower();
    } catch (error) {
        if (error !== LEAF_SPILL) throw error;
        return declineLeaf(fn, "leaf requires frame storage");
    }
}

// Operand cells that follow each numeric opcode in a function's tape. The planner
// walks the raw cells: decoding the tape into operation records allocated several
// objects per operation, which cost a bare interpreter roughly a quarter of the
// whole compile even when no policy was enabled.
const OPERAND_CELLS = new Int8Array(256).fill(-1);
for (const [opcode, cells] of [
    [0x00,0],[0x02,1],[0x03,1],[0x04,1],[0x05,0],[0x0b,0],[0x0c,1],[0x0d,1],[0x0f,0],
    [0x10,1],[0x1a,0],[0x20,1],[0x21,1],[0x28,2],[0x2f,2],[0x36,2],[0x3b,2],[0x41,1],
    [0x45,0],[0x46,0],[0x47,0],[0x48,0],[0x4a,0],[0x4c,0],[0x4e,0],[0x4f,0],
    [0x6a,0],[0x6b,0],[0x6c,0],[0x6d,0],[0x6f,0],[0x74,0],[0x75,0],[0xf1,2],[0xf2,2],
]) OPERAND_CELLS[opcode] = cells;

// inline: replace calls to small internal functions lowered earlier with their tapes.
// A call `args…; call f` becomes `local.set p_{n-1} … local.set p_0; block (result i32)
// <f's tape> end`, where f's locals are renumbered into a range of the caller's locals and
// each `return` becomes a branch to the new block. Every Typed function returns a value
// and every declaration has an initializer, so the inlined block needs no zeroed locals;
// repeated inlining of the same callee into one caller shares one local range, which is
// safe because inlined bodies never overlap in time (a callee is never its own ancestor).
//
// An argument that is a plain local read or a literal, for a parameter the callee never
// writes, is substituted into the body instead of copied: the caller's `local.get x` or
// `i32.const c` cells are removed and the callee reads x or c directly. A literal is not
// substituted for a parameter used as a checked-address operand, which must be a local.
//
// Only calls inside a caller's loop are inlined, unless `anywhere` is set; the library
// keeps each candidate fully expanded (`anywhere`), so a callee inlined into a loop brings
// its own callees with it.
// maxLoopDepth bounds the loop nesting a call site and the callee's own loops may form
// together: a callee whose loops already amortize its call is left out of a caller's loop.
const INLINE_DEFAULTS = Object.freeze({calleeCells: 1000, callerCells: 8000, maxLoopDepth: 2});

function loopDepth(code) {
    let depth = 0, deepest = 0;
    const blocks = [];
    for (let at = 0; at < code.length; at += 1 + OPERAND_CELLS[code[at]]) {
        const op = code[at];
        if (op >= 0x02 && op <= 0x04) { blocks.push(op); if (op === 0x03) deepest = Math.max(deepest, ++depth); }
        if (op === 0x0b && blocks.pop() === 0x03) depth--;
    }
    return deepest;
}

function inlineCalls(fn, library, limits, arity, anywhere) {
    const tape = fn.code;
    // Cheap rejections before the walk: no call to a library function, or (for the
    // function's own code) no loop. Operand cells can match too, which only costs a walk.
    let candidate = false;
    for (let i = tape.indexOf(0x10); i >= 0 && !candidate; i = tape.indexOf(0x10, i + 1)) candidate = library.has(tape[i + 1]);
    if (!candidate || (!anywhere && !tape.includes(0x03))) return null;
    const bases = new Map(), out = [], stack = [], blocks = [];
    let locals = fn.params.length + fn.nlocals, loops = 0, changed = false;
    const push = entry => stack.push(entry);
    const pop = n => { stack.length = Math.max(0, stack.length - n); };
    for (let at = 0; at < tape.length;) {
        const opcode = tape[at], cells = OPERAND_CELLS[opcode], a = tape[at + 1];
        if (cells < 0) return null;
        let callee = opcode === 0x10 && (anywhere || loops > 0) ? library.get(a) : undefined;
        if (callee && (out.length + callee.code.length > limits.callerCells || loops + callee.loops > limits.maxLoopDepth))
            callee = undefined;
        if (!callee) {
            const start = out.length;
            for (let k = 0; k <= cells; k++) out.push(tape[at + k]);
            at += 1 + cells;
            // Abstract operand stack: the cells that produced each simple value.
            if (opcode === 0x20) push({at: start, local: a});
            else if (opcode === 0x41) push({at: start, constant: a});
            else if (opcode === 0x21) {
                pop(1);
                for (let i = 0; i < stack.length; i++) if (stack[i]?.local === a) stack[i] = null;
            } else if (opcode === 0x1a || opcode === 0x0d) pop(1);
            else if (opcode === 0x45 || opcode === 0x28 || opcode === 0x2f) { pop(1); push(null); }
            else if ((opcode >= 0x46 && opcode <= 0x4f) || (opcode >= 0x6a && opcode <= 0x75)) { pop(2); push(null); }
            else if (opcode === 0x36 || opcode === 0x3b) pop(2);
            else if (opcode === 0xf1) push(null);
            else if (opcode === 0x10) { pop(arity(a)); push(null); }
            else if (opcode >= 0x02 && opcode <= 0x04) {
                if (opcode === 0x04) pop(1);
                blocks.push({op: opcode, value: a === 0x7f, height: stack.length});
                if (opcode === 0x03) loops++;
            } else if (opcode === 0x05) stack.length = blocks.at(-1).height;
            else if (opcode === 0x0b && blocks.length) {
                const block = blocks.pop();
                if (block.op === 0x03) loops--;
                stack.length = block.height;
                if (block.value) push(null);
            }
            continue;
        }
        at += 2;
        let base = bases.get(callee);
        if (base === undefined) {
            base = locals;
            bases.set(callee, base);
            locals += callee.params + callee.nlocals;
        }
        const args = stack.slice(stack.length - callee.params);
        const subst = args.map((arg, i) => {
            if (!arg || callee.written[i]) return undefined;
            const cellsOk = arg.local !== undefined ? out[arg.at] === 0x20 && out[arg.at + 1] === arg.local
                : out[arg.at] === 0x41 && out[arg.at + 1] === arg.constant;
            if (!cellsOk || (arg.local === undefined && callee.addressed[i])) return undefined;
            return arg;
        });
        for (const arg of subst.filter(Boolean).sort((x, y) => y.at - x.at)) out.splice(arg.at, 2);
        pop(callee.params);
        for (let i = callee.params - 1; i >= 0; i--) if (!subst[i]) out.push(0x21, base + i);
        out.push(0x02, 0x7f);
        const local = v => v < callee.params && subst[v] ? subst[v].local : base + v;
        let depth = 0;
        const body = callee.code;
        for (let k = 0; k < body.length;) {
            const op = body[k], n = OPERAND_CELLS[op], v = body[k + 1];
            k += 1 + n;
            if (op === 0x0f) { out.push(0x0c, depth); continue; }
            if (op >= 0x02 && op <= 0x04) depth++;
            if (op === 0x0b) depth--;
            if (op === 0x20 && v < callee.params && subst[v]?.constant !== undefined) out.push(0x41, subst[v].constant);
            else if (op === 0x20 || op === 0x21) out.push(op, local(v));
            else if (op === 0xf1) out.push(op, local(v), local(body[k - 1]));
            else for (let j = n; j >= 0; j--) out.push(body[k - 1 - j]);
        }
        // The callee's final `end` closed its function; here it closes the inlined block.
        push(null);
        changed = true;
    }
    return changed ? {code: out, nlocals: locals - fn.params.length} : null;
}

// select.commute: `c OP e` becomes `e c OP` for a literal c and commutative OP (add, mul,
// eq, ne), so the literal reaches selectConstant as a right operand. Moving a literal past
// e cannot change e's effects. Each abstract stack entry records where its cells start in
// the output; an expression whose start is not certain (a value block) is NaN and is never
// moved past.
const COMMUTATIVE = new Set([0x6a, 0x6c, 0x46, 0x47]);

function commuteConstants(code, arity) {
    const out = [], stack = [], blocks = [];
    let changed = false;
    for (let at = 0; at < code.length;) {
        const op = code[at], cells = OPERAND_CELLS[op], a = code[at + 1];
        if (cells < 0) return null;
        const start = out.length;
        if ((op >= 0x46 && op <= 0x4f) || (op >= 0x6a && op <= 0x75)) {
            const right = stack.pop(), left = stack.pop();
            if (!left || !right) return null;
            if (COMMUTATIVE.has(op) && left.constant !== undefined && right.constant === undefined &&
                left.start + 2 === right.start && out[left.start] === 0x41) {
                out.push(...out.splice(left.start, 2));
                changed = true;
            }
            out.push(op);
            stack.push({start: left.start});
            at++;
            continue;
        }
        for (let k = 0; k <= cells; k++) out.push(code[at + k]);
        at += 1 + cells;
        if (op === 0x41) stack.push({start, constant: a});
        else if (op === 0x20 || op === 0xf1) stack.push({start});
        else if (op === 0x45 || op === 0x28 || op === 0x2f) stack.push({start: stack.pop()?.start ?? NaN});
        else if (op === 0x21 || op === 0x1a || op === 0x0d) stack.pop();
        else if (op === 0x36 || op === 0x3b) { stack.pop(); stack.pop(); }
        else if (op === 0x10) {
            const n = arity(a), args = stack.splice(stack.length - n, n);
            stack.push({start: n ? args[0]?.start ?? NaN : start});
        } else if (op >= 0x02 && op <= 0x04) {
            if (op === 0x04) stack.pop();
            blocks.push({value: a === 0x7f, height: stack.length});
        } else if (op === 0x05) stack.length = blocks.at(-1).height;
        else if (op === 0x0b && blocks.length) {
            const block = blocks.pop();
            stack.length = block.height;
            if (block.value) stack.push({start: NaN});
        }
    }
    return changed ? out : null;
}

// select.rotate: the frontend emits every loop as
//     block; loop; C; eqz; br_if 1; B; br 0; end; end
// which runs C, a taken skip over the exit jump, B and a taken jump back per iteration.
// Rotated, the loop is
//     block; C; eqz; br_if 0; loop; B; C; br_if 0; end; end
// and each iteration ends in one backward conditional branch. C is evaluated at the same
// points as before (once before every iteration and once to exit). Labels inside B keep
// their meaning; C is copied only if every branch in it targets a block inside C.
function rotateLoops(code) {
    const next = at => at + 1 + OPERAND_CELLS[code[at]];
    // Matching `end` of the block or loop opened at `at`.
    function close(at) {
        let depth = 0;
        for (let k = at; k < code.length; k = next(k)) {
            const op = code[k];
            if (op >= 0x02 && op <= 0x04) depth++;
            else if (op === 0x0b && --depth === 0) return k;
        }
        return -1;
    }
    let changed = false;
    function emit(from, to, out) {
        for (let at = from; at < to;) {
            if (code[at] === 0x02 && code[at + 1] === 0x40 && code[at + 2] === 0x03 && code[at + 3] === 0x40) {
                const loopEnd = close(at + 2), blockEnd = close(at);
                if (loopEnd > 0 && blockEnd === loopEnd + 1 && code[loopEnd - 2] === 0x0c && code[loopEnd - 1] === 0) {
                    // C: from the loop body's start to the first top-level `eqz; br_if 1`.
                    let depth = 0, k = at + 4, condEnd = -1, internal = true;
                    for (; k < loopEnd; k = next(k)) {
                        const op = code[k];
                        if (depth === 0 && op === 0x45 && code[k + 1] === 0x0d && code[k + 2] === 1) { condEnd = k; break; }
                        if (op >= 0x02 && op <= 0x04) depth++;
                        else if (op === 0x0b) depth--;
                        else if ((op === 0x0c || op === 0x0d) && code[k + 1] >= depth) internal = false;
                        else if (op === 0x0f || op === 0x00) internal = false;
                    }
                    if (condEnd > 0 && internal) {
                        const cond = code.slice(at + 4, condEnd);
                        out.push(0x02, 0x40, ...cond, 0x45, 0x0d, 0, 0x03, 0x40);
                        emit(condEnd + 3, loopEnd - 2, out);
                        out.push(...cond, 0x0d, 0, 0x0b, 0x0b);
                        changed = true;
                        at = blockEnd + 1;
                        continue;
                    }
                }
            }
            const n = next(at);
            for (let j = at; j < n; j++) out.push(code[j]);
            at = n;
        }
    }
    for (let at = 0; at < code.length; at = next(at)) if (OPERAND_CELLS[code[at]] < 0) return null;
    const out = [];
    emit(0, code.length, out);
    return changed ? out : null;
}

// A function the inliner may copy: short, no literal stores (their table is per function),
// no calls to itself, and not an async state machine. Records which parameters the body
// writes and which it uses as checked-address operands.
function inlineCandidate(fn, code, limits, guarded) {
    if (fn.async || guarded || fn.literals || code.length > limits.calleeCells) return null;
    const written = fn.params.map(() => false), addressed = fn.params.map(() => false);
    for (let at = 0; at < code.length;) {
        const op = code[at], n = OPERAND_CELLS[op];
        if (n < 0 || op === 0xf2 || (op === 0x10 && code[at + 1] === fn.index)) return null;
        if (op === 0x21 && code[at + 1] < fn.params.length) written[code[at + 1]] = true;
        if (op === 0xf1) for (const v of [code[at + 1], code[at + 2]]) if (v < fn.params.length) addressed[v] = true;
        at += 1 + n;
    }
    return {params: fn.params.length, written, addressed};
}

// Assign permanent homes only in framed scalar functions with a checked access.
function planLocations(fn, options, inlineCall) {
    const tape = fn.code;
    // Forwarding and capacity reuse need a checked access; saved homes apply to any framed function.
    if (!options.saved && !tape.includes(0xf1)) return null;
    const reads = new Map(), writes = new Set(), scores = new Map();
    let receiver, straight = true, pure = true, leaf = true, loops = 0, ifs = 0;
    // Estimated executions per invocation: four inside a loop. Saved homes cost a fixed
    // save and restore per call, so their estimate also halves under each enclosing if:
    // a value used only on a rarely taken path should stay in its slot.
    // nested: four times per enclosing loop level (at most three) instead of four for any loop.
    function weigh(local, scale = 1) {
        const loopWeight = options.nested ? 4 ** Math.min(loops, 3) : loops ? 4 : 1;
        const weight = loopWeight * (options.saved ? scale / (1 << Math.min(ifs, 3)) : 1);
        scores.set(local, (scores.get(local) ?? 0) + weight);
    }
    // capacities: each checked access to buffer local b scores b's capacity, key -1 - b.
    const capacityUses = new Map();
    function read(local) {
        reads.set(local, (reads.get(local) ?? 0) + 1);
        weigh(local);
    }
    // share: first and last tape offset of each local, whether its first occurrence is a
    // read, and every loop's extent, for the live intervals planSavedHomes compares.
    const first = new Map(), last = new Map(), readFirst = new Set(), loopSpans = [], loopStarts = [];
    function occur(local, offset, isRead) {
        if (!first.has(local)) {
            first.set(local, offset);
            if (isRead) readFirst.add(local);
        }
        last.set(local, offset);
    }
    const blocks = [];
    // A checked address whose index local was set by the preceding operation; the
    // forwarding decision needs the final read count, so it is resolved after the walk.
    const candidates = [];
    let prevOpcode = -1, prevOffset = -1, prevA = -1, prev2Opcode = -1, prev2Offset = -1;
    for (let at = 0; at < tape.length;) {
        const offset = at, opcode = tape[at++];
        const cells = OPERAND_CELLS[opcode];
        // An opcode the planner does not know gets no plan; the emitter reports it.
        if (cells < 0) return null;
        const a = cells > 0 ? tape[at] : undefined, b = cells > 1 ? tape[at + 1] : undefined;
        at += cells;
        if (at > tape.length) throw new Error("truncated Typed inspection operation");
        if (options.share) {
            if (opcode === 0x20 || opcode === 0xf2) occur(a, offset, true);
            else if (opcode === 0x21) occur(a, offset, false);
            else if (opcode === 0xf1) { occur(a, offset, true); occur(b, offset, true); }
        }
        if (opcode === 0xf1) {
            if (straight && receiver === undefined) receiver = a;
            if (options.capacities) {
                const before = scores.get(-1);
                weigh(-1);
                capacityUses.set(a, (capacityUses.get(a) ?? 0) + scores.get(-1) - (before ?? 0));
                scores.delete(-1);
            }
            read(a); read(b);
            if (prevOpcode === 0x21 && prevA === b)
                candidates.push({id: b, at: prev2Opcode === 0x41 ? prev2Offset : prevOffset});
        }
        if (opcode === 0x20 || opcode === 0xf2) read(a);
        // constants: a literal the emitter would load into a register, scored like a local.
        if (opcode === 0x41 && options.constants && constantForm(tape, offset + 1, options.select) === "register")
            weigh("c" + a);
        if (opcode === 0x21) {
            writes.add(a);
            // A homed write turns a store into a move: worth less than a read, which disappears.
            if (options.saved) weigh(a, 0.5);
        }
        if (opcode === 0x10 && !inlineCall(a)) leaf = false;
        if (opcode === 0x36 || opcode === 0x3b || opcode === 0xf2) pure = false;
        if (opcode >= 0x02 && opcode <= 0x04) {
            blocks.push(opcode);
            if (opcode === 0x03) { loops++; loopStarts.push(offset); }
            if (opcode === 0x04) ifs++;
        }
        if (opcode === 0x0b) {
            const closed = blocks.pop();
            if (closed === 0x03) { loops--; loopSpans.push([loopStarts.pop(), offset]); }
            if (closed === 0x04) ifs--;
        }
        if (opcode >= 0x02 && opcode <= 0x0f) straight = false;
        prev2Opcode = prevOpcode; prev2Offset = prevOffset;
        prevOpcode = opcode; prevOffset = offset; prevA = a;
    }
    if (!options.capacity || !pure || !leaf || writes.has(receiver)) receiver = undefined;
    // A capacity register replaces a7 caching. A buffer's capacity header is written only by
    // the host, and a checked store at index i < capacity writes at 4 + 2i, so no store reaches
    // a header: the value read at entry stays valid. Only unwritten parameters qualify, so the
    // buffer is the same for the whole call; each use saves a load, at one load per call.
    if (options.capacities) {
        receiver = undefined;
        for (const [local, uses] of capacityUses)
            if (local < fn.params.length && !writes.has(local) && uses > 1) scores.set(-1 - local, uses - 1);
    }
    const forward = new Set(), homes = new Map();
    if (options.forward) for (const {id, at} of candidates) {
        if (reads.get(id) !== 1) continue;
        forward.add(at);
        scores.delete(id);
    }
    const direct = Boolean(options.direct);
    let intervals;
    if (options.share) {
        // Every Typed declaration has an initializer and is re-initialized on each iteration
        // of a loop that contains it, so a value crosses a loop's back edge only for a local
        // that also occurs before the loop: those intervals are widened to the whole loop,
        // innermost loops first. Parameters are live from entry; a local first read before
        // any write (a generated continuation slot) is live everywhere.
        intervals = new Map();
        for (const [local, start] of first) {
            if (readFirst.has(local) && local >= fn.params.length) continue;
            intervals.set(local, [local < fn.params.length ? -1 : start, last.get(local)]);
        }
        for (let p = 0; p < fn.params.length; p++) if (!intervals.has(p)) intervals.set(p, [-1, -1]);
        loopSpans.sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
        for (const [ls, le] of loopSpans)
            for (const span of intervals.values())
                if (span[0] < ls && span[1] >= ls && span[1] < le) span[1] = le;
    }
    if (options.saved) planSavedHomes(fn, scores, homes, leaf, receiver !== undefined, intervals);
    else if (options.homes && leaf) {
        let reg = A0 + Math.max(1, fn.params.length);
        const end = A0 + (receiver === undefined ? 8 : 7);
        for (const [id,score] of [...scores].sort((a,b)=>b[1]-a[1])) {
            if (reg >= end || score < 2) break;
            homes.set(id, reg++);
        }
    }
    return {receiver,forward,homes,direct};
}

// Callee-saved registers a function may claim as homes. Each claimed register costs a
// save in the prologue and a restore in the epilogue, but survives calls. s0 stays free.
const SAVED_REGISTERS = [9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]; // s1, s2..s11
const isSavedRegister = reg => reg === 9 || (reg >= 18 && reg <= 27);

// Homes for every framed function. A leaf first keeps parameter i >= 1 in its incoming
// register a_i and uses the spare argument registers, which cost nothing; a0 is the
// emitter's scratch (capacity loads, division checks, results) and a7 holds a cached
// capacity. Any function may then claim s1..s11 for a local whose estimated accesses per
// call exceed twice the two instructions of save and restore. The factor of two absorbs
// the static estimate's optimism about branches; on the opening ray frame it gave the
// fewest instructions of the factors 1-4 (diary, PICOCALC-RAY-PARITY Step 4). Scores fall
// in sorted order and costs rise along the free list, so the first unaffordable local
// ends the assignment.
const SAVED_MARGIN = 2;
function planSavedHomes(fn, scores, homes, leaf, capacityCached, intervals) {
    const free = [], opened = [];
    // share: a register already holding homes takes another local whose live interval
    // overlaps none of theirs, at no further cost. Keys without an interval (capacities,
    // constants, slots live everywhere) occupy their register for the whole function.
    const span = id => intervals?.get(id) ?? [-Infinity, Infinity];
    const disjoint = (r, [s, e]) => r.spans.every(([s2, e2]) => e < s2 || s > e2);
    if (leaf) {
        const lastIncoming = capacityCached ? Math.min(fn.params.length, 7) : fn.params.length;
        for (let p = 1; p < lastIncoming; p++) if ((scores.get(p) ?? 0) >= 2) {
            homes.set(p, A0 + p);
            opened.push({reg: A0 + p, spans: [span(p)]});
        }
        for (let reg = A0 + Math.max(1, fn.params.length); reg < A0 + (capacityCached ? 7 : 8); reg++)
            free.push({reg, cost: 0});
    }
    for (const reg of SAVED_REGISTERS) free.push({reg, cost: 2});
    for (const [id, score] of [...scores].sort((a, b) => b[1] - a[1])) {
        if (homes.has(id)) continue;
        const own = span(id);
        const shared = intervals && score >= 1 ? opened.find(r => disjoint(r, own)) : undefined;
        if (shared) {
            homes.set(id, shared.reg);
            shared.spans.push(own);
            continue;
        }
        if (!free.length || score <= (free[0].cost ? SAVED_MARGIN * free[0].cost : 1)) {
            if (intervals) continue;
            break;
        }
        const reg = free.shift().reg;
        homes.set(id, reg);
        opened.push({reg, spans: [own]});
    }
}

// Named code-generation policies. "default" applies every native optimization that has
// passed the host differential, the historical replays and a paired P4 trial; a caller
// that passes no options gets it. "stock" is the code generation of 2026-11-21 before
// those became defaults, kept as the control arm for experiments. Fields given in the
// options object override the selected policy; false or null switches one off.
// PIE loop lowering stays opt-in: it needs typed-pie-loops.js and saved under 1% of a
// ray frame for about 70 ms of cold compile on the P4.
const POLICIES = Object.freeze({
    default: Object.freeze({
        inlineGuardedReturns: true,
        operandLocations: Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true,
            capacities: true, nested: true, constants: true, share: true}),
        select: Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true,
            commute: true, rotate: true, shortBranches: true}),
        inline: true,
    }),
    stock: Object.freeze({}),
});

function resolveOptions(options) {
    const name = options?.policy ?? "default";
    if (!Object.hasOwn(POLICIES, name)) throw new TypeError("unknown RV32 code-generation policy " + name);
    const resolved = {...POLICIES[name]};
    for (const key in options ?? {}) if (options[key] !== undefined) resolved[key] = options[key];
    return resolved;
}

function compile(source, imports = [], maxSourceLength, requested) {
    const options = resolveOptions(requested);
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
    const inlining = options?.inline ? {...INLINE_DEFAULTS, ...(options.inline === true ? {} : options.inline)} : null;
    const inlineLibrary = new Map();
    if (policy !== undefined && typeof policy !== "boolean" && typeof policy !== "function")
        throw new TypeError("expected a boolean or caller selector for inlineGuardedReturns");
    function lower(fn) {
        if (inspect && (inspect.function === undefined || inspect.function === fn.name))
            fn.nativeInspection = {leafDecision: "eligible for frameless lowering"};
        let libraryCopy;
        if (inlining) {
            const arity = index => callables[index].params.length;
            // The library copy inlines every candidate call; the function's own code only those
            // in its loops.
            // Expansion only grows a tape, so a function already over the callee limit is
            // never a library candidate and needs no fully expanded copy.
            const all = fn.code.length <= inlining.calleeCells ? inlineCalls(fn, inlineLibrary, inlining, arity, true) : null;
            libraryCopy = all ?? {code: fn.code, nlocals: fn.nlocals};
            const loops = inlineCalls(fn, inlineLibrary, inlining, arity, false);
            if (loops) {
                fn.code = loops.code;
                fn.nlocals = loops.nlocals;
            }
        }
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
        if (options?.select?.commute) {
            const commuted = commuteConstants(fn.code, index => callables[index].params.length);
            if (commuted) fn.code = commuted;
        }
        if (options?.select?.rotate) {
            const rotated = rotateLoops(fn.code);
            if (rotated) fn.code = rotated;
        }
        let compiled = lowerLeaf(fn, callables, targets, options?.select);
        if (!compiled) {
            const plan = options?.operandLocations ? planLocations(fn, {...options.operandLocations, select: options.select},
                index => Emitter === GuardedReturnCode && targets[index]?.guardedReturn) : undefined;
            const emit = longBranches => {
                const emitter = new Emitter(fn, callables, targets);
                emitter.select = options?.select;
                emitter.longBranches = longBranches;
                if (plan !== undefined) emitter.locations = plan;
                return emitter.lower();
            };
            try {
                compiled = emit(false);
            } catch (error) {
                if (error !== SHORT_BRANCH_RANGE) throw error;
                compiled = emit(true);
            }
        }
        const index = imported.length + code.length;
        const candidate = inlining && inlineCandidate(fn, libraryCopy.code, inlining, targets[index]?.guardedReturn);
        if (candidate) inlineLibrary.set(index, {...candidate, nlocals: libraryCopy.nlocals, code: libraryCopy.code.slice(),
            loops: loopDepth(libraryCopy.code)});
        inlining?.report?.push({name: fn.name, cells: fn.code.length, locals: fn.params.length + fn.nlocals,
            libraryCells: candidate ? libraryCopy.code.length : undefined});
        code.push(compiled);
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

globalThis.typedRv32 = {compile, linkSlot, policies: POLICIES};
})();
