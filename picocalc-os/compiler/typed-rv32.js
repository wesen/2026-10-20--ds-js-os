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
        this.pendingWrite = [tape[this.at + 1], this.at];
        this.at += 2;
        this.materialize(home);
        return home;
    }

    // Push a result computed in resultRegister(), unless destination() stored it already.
    result(out, stored) {
        if (stored === undefined) this.push(out);
        else if (this.pendingWrite) {
            const [local, at] = this.pendingWrite;
            this.pendingWrite = undefined;
            this.pointersAfterWrite(local, at, stored);
        }
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

    // p = r + 4 + 2(L + K0), or r + 4 + 2(L + M) when other holds M, for a pointer home
    // (operandLocations.pointers). base is read after value and other.
    pointerFrom(p, value, base, K0, other) {
        const offset = (4 + 2 * K0) | 0;
        if (other === undefined) this.emit(instruction.i(0x13, p, 1, value, 1));
        else {
            this.emit(instruction.r(0x33, p, 0, value, other));
            this.emit(instruction.i(0x13, p, 1, p, 1));
        }
        if (base === undefined) {
            base = T6;
            this.readLocal(T6, this.pendingBase);
        }
        this.emit(instruction.r(0x33, p, 0, p, base));
        if (offset >= -2048 && offset <= 2047) {
            if (offset) this.emit(instruction.i(0x13, p, 0, p, offset));
        } else {
            this.constant(T6, offset);
            this.emit(instruction.r(0x33, p, 0, p, T6));
        }
    }

    // After a write of local: keep every pointer home derived from it current.
    pointersAfterWrite(local, at, value) {
        const plan = this.locations, list = plan?.pointerWrites?.get(local);
        if (!list) return;
        const source = plan.homes.get(local) ?? value;
        const step = plan.increments.get(at);
        for (const {reg, r, K0, other} of list) {
            if (step !== undefined) {
                this.emit(instruction.i(0x13, reg, 0, reg, 2 * step));
                continue;
            }
            let second;
            if (other !== undefined) {
                second = plan.homes.get(other);
                if (second === undefined) {
                    this.readLocal(T6, other);
                    second = T6;
                }
            }
            // An unhomed receiver is loaded into t6 once value and other are consumed.
            this.pendingBase = r;
            this.pointerFrom(reg, source, plan.homes.get(r), K0, second);
        }
    }

    // The address of receiver[index + j]: checked against the capacity, or unchecked (0xf3, in a
    // copy of a loop that select.version proved in range), and read at once when a UTF-16 load
    // follows.
    checkedAddress(receiver, index, constant, pointer, unchecked = false, j = 0) {
        const capacity = this.locations?.homes.get(-1 - receiver);
        const cached = this.locations?.receiver === receiver;
        const reload = !unchecked && capacity === undefined && (!cached || !this.capacityReady);
        const base = this.locations?.homes.get(receiver) ?? T6;
        if (base === T6 && (reload || !pointer)) this.readLocal(base, receiver);
        const length = capacity ?? (cached ? A0 + 7 : A0);
        if (reload) this.load(length, 0, base);
        if (!unchecked) {
            if (cached) this.capacityReady = true;
            this.emit(instruction.b(6, index, length, 8));
            this.emit(0x00100073);
        }
        const out = this.resultRegister(), tape = this.program.code;
        const loads = tape[this.at] === 0x2f && tape[this.at+2] === 4;
        if (pointer) {
            if (loads) {
                this.at += 3;
                this.load(out, pointer.disp, pointer.reg, 5);
            } else this.emit(instruction.i(0x13, out, 0, pointer.reg, pointer.disp - 4));
        } else if (unchecked && j) {
            this.emit(instruction.i(0x13, out, 1, index, 1));
            this.emit(instruction.r(0x33, out, 0, base, out));
            if (loads && 4 + 2 * j <= 2047) {
                this.at += 3;
                this.load(out, 4 + 2 * j, out, 5);
            } else if (2 * j <= 2047) this.emit(instruction.i(0x13, out, 0, out, 2 * j));
            else {
                this.constant(T6, 2 * j);
                this.emit(instruction.r(0x33, out, 0, out, T6));
            }
        } else if (constant >= 0 && constant <= 1021 && loads) {
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
            const nonNegative = this.facts?.has(this.at + 1) ?? false;
            this.at += 2;
            this.divideByConstant(next === 0x6f, c, nonNegative);
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
    // nonNegative (select.facts): the dividend is known >= 0, so no rounding bias or sign
    // correction is needed: a shift, a mask, or the multiply-high and its shift alone.
    divideByConstant(remainder, d, nonNegative = false) {
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        const k = powerOfTwo(d);
        if (k === 0) this.move(out, a);
        else if (k > 0 && nonNegative) {
            if (!remainder) this.emit(instruction.i(0x13, out, 5, a, 0x400 | k));       // srai out,a,k
            else if (fitsImmediate(d - 1)) this.emit(instruction.i(0x13, out, 7, a, d - 1)); // andi out,a,d-1
            else {
                this.emit(instruction.i(0x13, out, 1, a, 32 - k));                       // slli out,a,32-k
                this.emit(instruction.i(0x13, out, 5, out, 32 - k));                     // srli out,out,32-k
            }
        } else if (k > 0) {
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
            if (nonNegative) {
                // The quotient's correction adds the dividend's sign bit, 0 here.
                if (shift) this.emit(instruction.i(0x13, out, 5, T6, 0x400 | shift));
                else this.move(out, T6);
            } else {
                if (shift) this.emit(instruction.i(0x13, T6, 5, T6, 0x400 | shift));
                this.emit(instruction.i(0x13, out, 5, a, 31));                // srli out,a,31
                this.emit(instruction.r(0x33, out, 0, out, T6));              // add out,out,t6
            }
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
            const site = this.at - 1, tape = this.program.code;
            const constant = op === 0x41 ? this.cell() : undefined;
            // [const c] set t access r t, or set t access r t: access is 0xf1 or 0xf3 (with j).
            const accessAt = constant === undefined ? site + 2 : site + 4;
            const unchecked = tape[accessAt] === 0xf3, j = unchecked ? tape[accessAt + 3] : 0;
            const direct = unchecked && constant >= 0 && constant + j <= 1021 && tape[accessAt + 4] === 0x2f && tape[accessAt + 6] === 4;
            const constantHome = constant === undefined ? undefined : plan.homes.get("c" + constant);
            const index = constant === undefined ? this.pop(T5) : constantHome ?? T5;
            if (constant !== undefined) {
                if (constantHome === undefined && !direct) this.constant(index, constant);
                this.at++; // local.set opcode following the literal
            }
            this.at += 2; // destination local and checked-address opcode
            const receiver = this.cell();
            this.at++; // proven single-use index local
            if (unchecked) this.at++; // j
            this.checkedAddress(receiver, index, constant === undefined ? undefined : constant + j,
                constant === undefined ? plan.pointers?.get(site) : undefined, unchecked, constant === undefined ? j : 0);
            return false;
        }
        // The capacity header of a buffer with a capacity home: the home itself.
        if (op === 0x20 && plan && this.select?.version && this.program.code[this.at + 1] === 0x28 && this.program.code[this.at + 3] === 0) {
            const home = plan.homes.get(-1 - this.program.code[this.at]);
            if (home !== undefined) {
                this.at += 4;
                this.pushHome(home);
                return false;
            }
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
        case 0x21: {
            const value = this.pop(T5), local = this.cell();
            this.writeLocal(value, local);
            this.pointersAfterWrite(local, this.at - 2, value);
            break;
        }
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
        case 0xf3: { // unchecked UTF-16 address of receiver[position + j] (select.version)
            const receiver = this.cell(), position = this.cell(), j = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5, undefined, undefined, true, j);
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
            if (typeof id === "string") {
                if (id[0] === "c") this.constant(reg, Number(id.slice(1)));
            } else if (id < 0) this.load(reg, 0, A0 - 1 - id);
        }
        // Pointer homes of parameters, from the incoming argument registers.
        for (const [local, list] of this.locations?.pointerWrites ?? [])
            if (local < count) for (const {reg, r, K0, other} of list) {
                if (other === undefined) this.pointerFrom(reg, A0 + local, A0 + r, K0);
                else if (other < count && local < other) this.pointerFrom(reg, A0 + local, A0 + r, K0, A0 + other);
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

function lowerLeaf(fn, callables, targets, select, facts) {
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
        leaf.facts = facts;
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
    [0x6a,0],[0x6b,0],[0x6c,0],[0x6d,0],[0x6f,0],[0x74,0],[0x75,0],[0xf1,2],[0xf2,2],[0xf3,3],
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
    // Until the first inlined call the output is a copy of the input, so the output length at
    // a call is its offset: a scan of the call sites decides exactly whether any is inlined.
    {
        let loops = 0, site = false;
        const opened = [];
        for (let at = 0; at < tape.length && !site;) {
            const opcode = tape[at], cells = OPERAND_CELLS[opcode];
            if (cells < 0) return null;
            if (opcode === 0x10 && (anywhere || loops > 0)) {
                const callee = library.get(tape[at + 1]);
                site = callee !== undefined && at + callee.code.length <= limits.callerCells &&
                    loops + callee.loops <= limits.maxLoopDepth;
            } else if (opcode >= 0x02 && opcode <= 0x04) {
                opened.push(opcode);
                if (opcode === 0x03) loops++;
            } else if (opcode === 0x0b && opened.length && opened.pop() === 0x03) loops--;
            at += 1 + cells;
        }
        if (!site) return null;
    }
    // Abstract operand stack, as parallel arrays: where each entry's cells start in the output,
    // and whether it is a plain local.get (kind 1) or i32.const (kind 2) of `value`; kind 0 is
    // any other value.
    const bases = new Map(), out = [], blocks = [], stackAt = [], stackKind = [], stackValue = [];
    let locals = fn.params.length + fn.nlocals, loops = 0, changed = false, sp = 0;
    const push = (at, kind, value) => { stackAt[sp] = at; stackKind[sp] = kind; stackValue[sp] = value; sp++; };
    const pop = n => { sp = Math.max(0, sp - n); };
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
            if (opcode === 0x20) push(start, 1, a);
            else if (opcode === 0x41) push(start, 2, a);
            else if (opcode === 0x21) {
                pop(1);
                for (let i = 0; i < sp; i++) if (stackKind[i] === 1 && stackValue[i] === a) stackKind[i] = 0;
            } else if (opcode === 0x1a || opcode === 0x0d) pop(1);
            else if (opcode === 0x45 || opcode === 0x28 || opcode === 0x2f) { pop(1); push(0, 0, 0); }
            else if ((opcode >= 0x46 && opcode <= 0x4f) || (opcode >= 0x6a && opcode <= 0x75)) { pop(2); push(0, 0, 0); }
            else if (opcode === 0x36 || opcode === 0x3b) pop(2);
            else if (opcode === 0xf1) push(0, 0, 0);
            else if (opcode === 0x10) { pop(arity(a)); push(0, 0, 0); }
            else if (opcode >= 0x02 && opcode <= 0x04) {
                if (opcode === 0x04) pop(1);
                blocks.push({op: opcode, value: a === 0x7f, height: sp});
                if (opcode === 0x03) loops++;
            } else if (opcode === 0x05) sp = blocks.at(-1).height;
            else if (opcode === 0x0b && blocks.length) {
                const block = blocks.pop();
                if (block.op === 0x03) loops--;
                sp = block.height;
                if (block.value) push(0, 0, 0);
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
        // The arguments are the top callee.params entries (Array.prototype.slice semantics when
        // the abstract stack is shorter).
        let first = sp - callee.params;
        if (first < 0) first = Math.max(0, sp + first);
        const subst = [];
        for (let i = first; i < sp; i++) {
            const kind = stackKind[i], n = i - first;
            let arg;
            if (kind !== 0 && !callee.written[n]) {
                const at0 = stackAt[i], value = stackValue[i];
                if (kind === 1 ? out[at0] === 0x20 && out[at0 + 1] === value : out[at0] === 0x41 && out[at0 + 1] === value)
                    if (kind === 1 || !callee.addressed[n]) arg = kind === 1 ? {at: at0, local: value} : {at: at0, constant: value};
            }
            subst.push(arg);
        }
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
        push(0, 0, 0);
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
// select.version: a rotated counted loop (rotateLoops)
//   block  get k (const n | get N) lt_s eqz br_if 0  loop  B  get k (n | N) lt_s br_if 0  end  end
// whose body B ends in k = k + s (1 <= s <= 64), with no other write of k or N in the loop, is
// emitted twice. Checked accesses r[i] in B whose index is a*k + b, M + a*k + b with M unwritten
// in the loop, or a constant, on an unwritten parameter r, are proved in range for every
// iteration by one guard before the loop: k ranges over [k0, N - 1], so the largest index is
// a*(N - 1) + b (+ M). If the guard holds, a copy of the loop runs with those accesses unchecked
// (0xf3 r t j: the address of r[t + j]); otherwise the original loop runs. An access that the
// fast copy leaves unchecked would not trap in the original either, so traps, their position
// and every store before them are unchanged. Affine locals are i = a*k + b written once in B
// and read only after that write in its own region. The guard keeps every term below 2^31:
// N <= 2^20, a <= 1024 and 0 <= b <= 2^20.
const VERSION_LIMITS = Object.freeze({coefficient: 1024, offset: 1 << 20, bound: 1 << 20, bodyCells: 2000});
function opNext(code, at) { return at + 1 + OPERAND_CELLS[code[at]]; }
function opClose(code, at) {
    let depth = 0;
    for (let k = at; k < code.length; k = opNext(code, k)) {
        const op = code[k];
        if (op >= 0x02 && op <= 0x04) depth++;
        else if (op === 0x0b && --depth === 0) return k;
    }
    return -1;
}
function versionLoops(code, params) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (!(OPERAND_CELLS[code[at]] >= 0)) return null;
    // A single-use index local can absorb the constant of its index into the access.
    const reads = new Map();
    const read = local => reads.set(local, (reads.get(local) ?? 0) + 1);
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (op === 0x20 || op === 0xf2) read(code[at + 1]);
        else if (op === 0xf1) { read(code[at + 1]); read(code[at + 2]); }
    }
    let changed = false;
    const out = transform(code);
    return changed ? out : null;

    function transform(src) {
        const out = [];
        let prev = -1, prev2 = -1;
        for (let at = 0; at < src.length;) {
            // k0 is a known non-negative constant when `const c; set k` precedes the loop.
            const k0Known = prev2 >= 0 && src[prev2] === 0x41 && src[prev2 + 1] >= 0 && src[prev] === 0x21 && src[prev + 1] === src[at + 3];
            const v = version(src, at, k0Known);
            if (v) {
                out.push(...v.cells);
                changed = true;
                prev = prev2 = -1;
                at = v.end;
                continue;
            }
            const n = opNext(src, at);
            for (let j = at; j < n; j++) out.push(src[j]);
            prev2 = prev; prev = at;
            at = n;
        }
        return out;
    }

    function version(src, at, k0Known) {
        if (src[at] !== 0x02 || src[at + 1] !== 0x40 || src[at + 2] !== 0x20 || src[at + 6] !== 0x48 || src[at + 7] !== 0x45 ||
            src[at + 8] !== 0x0d || src[at + 9] !== 0 || src[at + 10] !== 0x03 || src[at + 11] !== 0x40) return null;
        const k = src[at + 3], boundOp = src[at + 4], bound = src[at + 5];
        if (boundOp !== 0x41 && boundOp !== 0x20) return null;
        const loopEnd = opClose(src, at + 10), blockEnd = opClose(src, at);
        if (loopEnd < 0 || blockEnd !== loopEnd + 1) return null;
        const cond = src.slice(at + 2, at + 7);
        if (src.slice(loopEnd - 7, loopEnd).join() !== [...cond, 0x0d, 0].join()) return null;
        const bodyStart = at + 12, bodyEnd = loopEnd - 7;
        if (bodyEnd - bodyStart > VERSION_LIMITS.bodyCells) return null;
        const inc = bodyEnd - 7;
        if (inc < bodyStart || src[inc] !== 0x20 || src[inc + 1] !== k || src[inc + 2] !== 0x41 || src[inc + 4] !== 0x6a ||
            src[inc + 5] !== 0x21 || src[inc + 6] !== k || !(src[inc + 3] >= 1 && src[inc + 3] <= 64)) return null;
        if (boundOp === 0x41 && !(bound >= 1 && bound <= VERSION_LIMITS.bound)) return null;
        const ops = [], writes = new Map();
        for (let p = bodyStart; p < bodyEnd; p = opNext(src, p)) {
            ops.push({op: src[p], at: p, a: src[p + 1], b: src[p + 2]});
            if (src[p] === 0x21) writes.set(src[p + 1], (writes.get(src[p + 1]) ?? 0) + 1);
        }
        if (writes.get(k) !== 1 || (boundOp === 0x20 && writes.has(bound))) return null;
        const o = j => ops[j] ?? {};
        // End of the region that opens around ops[i]: the closing end or else of its construct.
        const regionEnd = i => {
            for (let j = i + 1, level = 0; j < ops.length; j++) {
                const op = ops[j].op;
                if (op >= 0x02 && op <= 0x04) level++;
                else if (op === 0x0b) { if (level-- === 0) return j; }
                else if (op === 0x05 && level === 0) return j;
            }
            return ops.length;
        };
        const affine = new Map();
        const formOf = (local, i) => {
            if (local === k) return {a: 1, b: 0};
            const f = affine.get(local);
            return f && f.def < i && i < f.end ? f : null;
        };
        const invariant = local => local !== k && !writes.has(local);
        // Affine form of the value that ops[i] consumes, from the operations just before it.
        function expression(i) {
            const scaled = (f, m, c) => f && {a: f.a * m, b: f.b * m + c};
            if (o(i - 1).op === 0x6a && o(i - 2).op === 0x41 && o(i - 3).op === 0x6c && o(i - 4).op === 0x41 && o(i - 5).op === 0x20)
                return scaled(formOf(o(i - 5).a, i), o(i - 4).a, o(i - 2).a);
            if (o(i - 1).op === 0x6a && o(i - 2).op === 0x6c && o(i - 3).op === 0x41 && o(i - 4).op === 0x20 && o(i - 5).op === 0x41)
                return scaled(formOf(o(i - 4).a, i), o(i - 3).a, o(i - 5).a);
            if (o(i - 1).op === 0x6c && o(i - 2).op === 0x41 && o(i - 3).op === 0x20) return scaled(formOf(o(i - 3).a, i), o(i - 2).a, 0);
            if (o(i - 1).op === 0x6a && o(i - 2).op === 0x41 && o(i - 3).op === 0x20) return scaled(formOf(o(i - 3).a, i), 1, o(i - 2).a);
            if (o(i - 1).op === 0x6a && o(i - 2).op === 0x20 && o(i - 3).op === 0x41) return scaled(formOf(o(i - 2).a, i), 1, o(i - 3).a);
            if (o(i - 1).op === 0x20) return scaled(formOf(o(i - 1).a, i), 1, 0);
            return null;
        }
        const inRange = f => f && f.a >= 0 && f.a <= VERSION_LIMITS.coefficient && f.b >= 0 && f.b <= VERSION_LIMITS.offset;
        const eligible = new Map(); // f1 offset -> {fold: offsets of the const and add, j}
        const limits = new Map();   // receiver -> Map(key "a" or "a:M" -> {a, b, M})
        const note = (r, f, M) => {
            if (!limits.has(r)) limits.set(r, new Map());
            const key = f.a + (M === undefined ? "" : ":" + M), m = limits.get(r);
            if (!m.has(key) || m.get(key).b < f.b) m.set(key, {a: f.a, b: f.b, M});
        };
        for (let i = 0; i < ops.length; i++) {
            const {op, a, b} = ops[i];
            if (op === 0x21 && a !== k && writes.get(a) === 1) {
                const f = expression(i);
                if (inRange(f)) affine.set(a, {...f, def: i, end: regionEnd(i)});
            }
            if (op !== 0xf1 || a >= params || o(i - 1).op !== 0x21 || o(i - 1).a !== b) continue;
            const e = i - 1, single = reads.get(b) === 1 && writes.get(b) === 1;
            let f = null, M, fold;
            if (o(e - 1).op === 0x41 && o(e - 1).a >= 0 && o(e - 1).a <= VERSION_LIMITS.offset) f = {a: 0, b: o(e - 1).a};
            else if (inRange(f = expression(e))) {
                // [x, const j, add] or [const j, x, add] before set t: j moves into the access.
                if (single && o(e - 1).op === 0x6a && (o(e - 2).op === 0x41 || o(e - 3).op === 0x41) &&
                    (o(e - 2).op === 0x41 ? o(e - 3).op === 0x20 : o(e - 2).op === 0x20)) {
                    const c = o(e - 2).op === 0x41 ? e - 2 : e - 3;
                    fold = {drop: [ops[c].at, ops[e - 1].at], j: ops[c].a};
                }
            } else {
                f = null;
                const sum = (x, y) => o(e - 1).op === 0x6a && o(e - 2).op === 0x20 && o(e - 3).op === 0x20 &&
                    invariant(o(e - x).a) && inRange(formOf(o(e - y).a, e)) ? [o(e - x).a, formOf(o(e - y).a, e)] : null;
                const pair = sum(3, 2) ?? sum(2, 3);
                if (pair) { M = pair[0]; f = {a: pair[1].a, b: pair[1].b}; }
                else if (o(e - 1).op === 0x20 && invariant(o(e - 1).a)) { M = o(e - 1).a; f = {a: 0, b: 0}; }
                else if (o(e - 1).op === 0x6a && o(e - 2).op === 0x41 && o(e - 3).op === 0x20 && invariant(o(e - 3).a) && inRange({a: 0, b: o(e - 2).a})) {
                    M = o(e - 3).a; f = {a: 0, b: o(e - 2).a};
                    if (single) fold = {drop: [ops[e - 2].at, ops[e - 1].at], j: o(e - 2).a};
                }
            }
            if (!f) continue;
            note(a, f, M);
            eligible.set(ops[i].at, fold ?? {drop: [], j: 0});
        }
        if (!eligible.size) return null;
        // Guard: each term pushes a failure condition and leaves the guard block with br_if 0.
        const terms = [];
        const cap = r => [0x20, r, 0x28, 2, 0];
        const largest = (a, b) => boundOp === 0x41 ? [0x41, a * (bound - 1) + b] : [0x20, bound, 0x41, a, 0x6c, 0x41, b - a, 0x6a];
        if (!k0Known) terms.push(0x20, k, 0x41, 0, 0x48, 0x0d, 0);
        if (boundOp === 0x20) terms.push(0x20, bound, 0x41, VERSION_LIMITS.bound, 0x4a, 0x0d, 0);
        for (const [r, m] of limits) {
            const plain = [...m.values()].filter(x => x.M === undefined), shifted = [...m.values()].filter(x => x.M !== undefined);
            if (boundOp === 0x41 && plain.length) {
                const top = Math.max(...plain.map(x => x.a * (bound - 1) + x.b));
                terms.push(0x41, top, ...cap(r), 0x4e, 0x0d, 0);
            } else for (const x of plain) terms.push(...largest(x.a, x.b), ...cap(r), 0x4e, 0x0d, 0);
            if (shifted.length) terms.push(...cap(r), 0x41, 0, 0x48, 0x0d, 0);
            for (const M of new Set(shifted.map(x => x.M))) terms.push(0x20, M, 0x41, 0, 0x48, 0x0d, 0);
            for (const x of shifted) terms.push(...largest(x.a, x.b), ...cap(r), 0x20, x.M, 0x6b, 0x4e, 0x0d, 0);
        }
        // The fast body: unchecked accesses, and branches that leave the loop one level further
        // out (the loop now sits inside the guard block).
        const fast = [], drop = new Set([...eligible.values()].flatMap(x => x.drop));
        for (let p = bodyStart, depth = 0; p < bodyEnd; p = opNext(src, p)) {
            const op = src[p];
            if (drop.has(p)) continue;
            if (op === 0xf1 && eligible.has(p)) { fast.push(0xf3, src[p + 1], src[p + 2], eligible.get(p).j); continue; }
            if ((op === 0x0c || op === 0x0d) && src[p + 1] > depth) { fast.push(op, src[p + 1] + 1); continue; }
            if (op >= 0x02 && op <= 0x04) depth++;
            else if (op === 0x0b) depth--;
            for (let j = p; j < opNext(src, p); j++) fast.push(src[j]);
        }
        const cells = [0x02, 0x40, ...cond, 0x45, 0x0d, 0,
            0x02, 0x40, ...terms,
            0x03, 0x40, ...transform(fast), ...cond, 0x0d, 0, 0x0b,
            0x0c, 1,
            0x0b,
            0x03, 0x40, ...src.slice(bodyStart, bodyEnd), ...cond, 0x0d, 0, 0x0b,
            0x0b];
        return {cells, end: blockEnd + 1};
    }
}

// operandLocations.split: give every web of a local its own local id. A web starts at a write;
// every later occurrence inside the region that holds that write (a block, loop, if-arm or
// else-arm, or the body) belongs to it, because in structured code the write precedes them on
// every path through that region. An occurrence outside the current web's region starts a new
// web if it is a write; a read there makes the local unsplittable. Webs never read each other's
// writes, so the renaming is exact. Two inlined copies of one callee, or the two copies of a
// versioned loop, then have separate intervals for share.
function splitLocals(code, params, nlocals) {
    const uses = new Map(), path = [];
    let region = 0;
    const note = (cell, write) => {
        const id = code[cell];
        if (id < params) return;
        if (!uses.has(id)) uses.set(id, []);
        uses.get(id).push({cell, write, path: path.slice()});
    };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (!(OPERAND_CELLS[op] >= 0)) return null;
        if (op === 0x05) { path.pop(); path.push(region++); }
        else if (op === 0x0b) path.pop();
        if (op === 0x20 || op === 0xf2) note(at + 1, false);
        else if (op === 0x21) note(at + 1, true);
        else if (op === 0xf1 || op === 0xf3) { note(at + 1, false); note(at + 2, false); }
        if (op >= 0x02 && op <= 0x04) path.push(region++);
    }
    const inside = (outer, inner) => outer.length <= inner.length && outer.every((x, i) => inner[i] === x);
    const out = code.slice();
    let fresh = params + nlocals;
    const origin = [];
    for (const [local, occurrences] of uses) {
        const webs = [];
        let current = null, splittable = true;
        for (const o of occurrences) {
            if (current && inside(current.path, o.path)) { current.cells.push(o.cell); continue; }
            if (!o.write) { splittable = false; break; }
            current = {path: o.path, cells: [o.cell]};
            webs.push(current);
        }
        if (!splittable || webs.length < 2) continue;
        for (const web of webs.slice(1)) {
            const id = fresh++;
            origin.push(local);
            for (const cell of web.cells) out[cell] = id;
        }
    }
    // origin[i] is the local that fresh local params + nlocals + i was split from.
    return fresh === params + nlocals ? null : {code: out, nlocals: fresh - params, origin};
}

// select.facts: division and remainder by a positive constant whose dividend is never
// negative, so the emitter can drop the rounding bias and the sign correction. Two steps:
// localRanges gives every local one interval, the join of every value written to it anywhere,
// on the tape after rotation and before versioning; divisionFacts then evaluates the final tape
// (after versioning and splitting) with those intervals. Versioning and splitting change where a
// value is computed and which local holds it, never which values a local can hold, so the
// intervals stay valid: a split local takes the interval of the local it came from.
const RANGE_TOP = Object.freeze([-2147483648, 2147483647]);
const rangeFits = (lo, hi) => lo >= -2147483648 && hi <= 2147483647 ? [lo, hi] : RANGE_TOP;
const rangeJoin = (x, y) => !x ? y : !y ? x : [Math.min(x[0], y[0]), Math.max(x[1], y[1])];

// One abstract interpretation of a tape over intervals; null is "no value yet" (bottom).
// rangeOf(local) answers reads, onWrite(at, local, value) sees each local.set, and
// onDivide(at, dividend) each division or remainder by a positive constant. Buffer reads are
// [0, 65535], comparisons [0, 1], arithmetic that could leave the i32 range is unknown. Value
// blocks join the values reaching their end. Returns false on an operation it does not model.
function rangePass(code, arity, rangeOf, onWrite, onDivide) {
    const stack = [], blocks = [];
    let dead = false;
    const pop = () => stack.length ? stack.pop() : RANGE_TOP;
    const top = () => stack.length ? stack.at(-1) : RANGE_TOP;
    const reach = target => { if (target?.value) target.result = rangeJoin(target.result, top()); };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at], a = code[at + 1];
        if (dead && op !== 0x05 && op !== 0x0b && !(op >= 0x02 && op <= 0x04)) continue;
        if (dead && op >= 0x02 && op <= 0x04) { blocks.push({op, value: false, height: stack.length, result: null, deadEntry: true}); continue; }
        switch (op) {
        case 0x41: stack.push([a, a]); break;
        case 0x20: stack.push(rangeOf(a)); break;
        case 0x21: onWrite(at, a, pop()); break;
        case 0x1a: pop(); break;
        case 0x0d: pop(); reach(blocks[blocks.length - 1 - a]); break;
        case 0x0c: reach(blocks[blocks.length - 1 - a]); dead = true; break;
        case 0x0f: pop(); dead = true; break;
        case 0x00: dead = true; break;
        case 0x45: pop(); stack.push([0, 1]); break;
        case 0x28: pop(); stack.push(RANGE_TOP); break;
        case 0x2f: pop(); stack.push([0, 65535]); break;
        case 0x36: case 0x3b: pop(); pop(); break;
        case 0xf1: case 0xf3: stack.push(RANGE_TOP); break;
        case 0xf2: break;
        case 0x10: for (let i = arity(a); i > 0; i--) pop(); stack.push(RANGE_TOP); break;
        case 0x02: case 0x03: case 0x04:
            if (op === 0x04) pop();
            blocks.push({op, value: a === 0x7f, height: stack.length, result: null});
            break;
        case 0x05: case 0x0b: {
            const block = op === 0x05 ? blocks.at(-1) : blocks.pop();
            if (!block) break;
            if (block.value && !dead) block.result = rangeJoin(block.result, top());
            stack.length = block.height;
            dead = block.deadEntry ?? false;
            if (op === 0x0b && block.value) stack.push(block.result ?? RANGE_TOP);
            break;
        }
        default: {
            if (!((op >= 0x46 && op <= 0x4f) || (op >= 0x6a && op <= 0x75))) return false;
            const y = pop(), x = pop();
            let r = RANGE_TOP;
            if (op <= 0x4f) r = [0, 1];
            else if (!x || !y) r = null;
            else if (op === 0x6a) r = rangeFits(x[0] + y[0], x[1] + y[1]);
            else if (op === 0x6b) r = rangeFits(x[0] - y[1], x[1] - y[0]);
            else if (op === 0x6c) {
                const p = [x[0] * y[0], x[0] * y[1], x[1] * y[0], x[1] * y[1]];
                r = rangeFits(Math.min(...p), Math.max(...p));
            } else if ((op === 0x6d || op === 0x6f) && y[0] === y[1] && y[0] > 0) {
                const d = y[0];
                onDivide(at, x);
                r = op === 0x6d ? [Math.trunc(x[0] / d), Math.trunc(x[1] / d)]
                    : x[0] >= 0 ? [0, Math.min(x[1], d - 1)] : [-(d - 1), d - 1];
            } else if (op === 0x75 && y[0] === y[1] && y[0] >= 0 && y[0] < 32) r = [x[0] >> y[0], x[1] >> y[0]];
            else if (op === 0x71 && y[0] === y[1] && y[0] >= 0) r = [0, y[0]];
            stack.push(r);
        }
        }
    }
    return true;
}

// Interval of every local that is written before it is read in tape order; a local missing
// from the result is unknown. The counter k of a rotated counted loop (the shape versionLoops
// matches: the test k < N enters the loop, its only write of k is a final k = k + s, and N is a
// constant or a local the loop does not write) is bounded by max(N) - 1 + s instead of growing
// pass by pass, since the increment only runs after k < N held.
function localRanges(code, params, arity) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (!(OPERAND_CELLS[code[at]] >= 0)) return null;
    const counters = new Map();
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        if (code[at] !== 0x02 || code[at + 1] !== 0x40 || code[at + 2] !== 0x20 || code[at + 6] !== 0x48 || code[at + 7] !== 0x45 ||
            code[at + 8] !== 0x0d || code[at + 9] !== 0 || code[at + 10] !== 0x03 || code[at + 11] !== 0x40) continue;
        const k = code[at + 3], boundOp = code[at + 4], bound = code[at + 5];
        if (boundOp !== 0x41 && boundOp !== 0x20) continue;
        const loopEnd = opClose(code, at + 10);
        if (loopEnd < 0 || opClose(code, at) !== loopEnd + 1) continue;
        const inc = loopEnd - 14;
        if (inc < at + 12 || code[inc] !== 0x20 || code[inc + 1] !== k || code[inc + 2] !== 0x41 || code[inc + 4] !== 0x6a ||
            code[inc + 5] !== 0x21 || code[inc + 6] !== k || !(code[inc + 3] >= 1 && code[inc + 3] <= 64)) continue;
        if (code[inc + 7] !== 0x20 || code[inc + 8] !== k || code[inc + 9] !== boundOp || code[inc + 10] !== bound ||
            code[inc + 11] !== 0x48 || code[inc + 12] !== 0x0d || code[inc + 13] !== 0) continue;
        let writes = 0, boundWritten = false;
        for (let p = at + 12; p < loopEnd; p = opNext(code, p)) if (code[p] === 0x21) {
            if (code[p + 1] === k) writes++;
            if (boundOp === 0x20 && code[p + 1] === bound) boundWritten = true;
        }
        if (writes === 1 && !boundWritten)
            counters.set(inc + 5, {bound: boundOp === 0x41 ? [bound, bound] : null, local: bound, step: code[inc + 3]});
    }
    const seen = new Set(), unknown = new Set();
    const touch = (x, write) => { if (x >= params && !seen.has(x) && !write) unknown.add(x); seen.add(x); };
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at];
        if (op === 0x20 || op === 0xf2) touch(code[at + 1], false);
        else if (op === 0x21) touch(code[at + 1], true);
        else if (op === 0xf1 || op === 0xf3) { touch(code[at + 1], false); touch(code[at + 2], false); }
    }
    const ranges = new Map();
    const rangeOf = local => local < params || unknown.has(local) ? RANGE_TOP : ranges.get(local) ?? null;
    // Intervals only grow. From the fourth pass a bound that still moves is widened: a falling
    // lower bound to 0 when it is still non-negative (the property divisions need), otherwise to
    // the i32 limit, and a rising upper bound to the i32 limit. Each bound then moves at most
    // twice more, so the passes are bounded. Without a fixed point there are no intervals.
    for (let round = 0; round < 16; round++) {
        const next = new Map();
        const onWrite = (at, local, value) => {
            const counter = counters.get(at);
            if (counter) {
                const k = rangeOf(local), n = counter.bound ?? rangeOf(counter.local);
                value = k && n ? rangeFits(k[0] + counter.step, n[1] + counter.step - 1) : null;
            }
            if (value) next.set(local, rangeJoin(next.get(local), value));
        };
        if (!rangePass(code, arity, rangeOf, onWrite, () => {})) return null;
        let stable = true;
        for (const [local, value] of next) {
            const old = ranges.get(local);
            let merged = rangeJoin(old, value);
            if (!old || old[0] !== merged[0] || old[1] !== merged[1]) {
                stable = false;
                if (round >= 3 && old) merged = [merged[0] < old[0] ? (merged[0] >= 0 ? 0 : RANGE_TOP[0]) : old[0],
                    merged[1] > old[1] ? RANGE_TOP[1] : old[1]];
            }
            ranges.set(local, merged);
        }
        if (stable) {
            for (const local of unknown) ranges.delete(local);
            return ranges;
        }
    }
    return null;
}

// Offsets of the division and remainder operations of the final tape whose dividend is known
// non-negative. origin maps a local of the final tape to the local of localRanges' tape.
function divisionFacts(code, params, arity, ranges, origin) {
    const facts = new Set();
    const rangeOf = local => local < params ? RANGE_TOP : ranges.get(origin(local)) ?? RANGE_TOP;
    return rangePass(code, arity, rangeOf, () => {}, (at, x) => { if (x && x[0] >= 0) facts.add(at); }) ? facts : null;
}

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
    if (!options.saved && !tape.includes(0xf1) && !tape.includes(0xf3)) return null;
    const reads = new Map(), writes = new Set(), scores = new Map();
    let receiver, straight = true, pure = true, leaf = true, loops = 0, ifs = 0;
    // Estimated executions per invocation: four inside a loop. Saved homes cost a fixed
    // save and restore per call, so their estimate also halves under each enclosing if:
    // a value used only on a rarely taken path should stay in its slot.
    // nested: four times per enclosing loop level (at most three) instead of four for any loop.
    function weightNow(scale = 1) {
        const loopWeight = options.nested ? 4 ** Math.min(loops, 3) : loops ? 4 : 1;
        return loopWeight * (options.saved ? scale / (1 << Math.min(ifs, 3)) : 1);
    }
    function weigh(local, scale = 1) {
        scores.set(local, (scores.get(local) ?? 0) + weightNow(scale));
    }
    // pointers: forwarded accesses r[L + k], every write of a local (with its increment when
    // it is L = L + c), and locals read before any write in tape order.
    const pointerAccesses = [], writesOf = new Map(), readEarly = new Set();
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
    let prevOpcode = -1, prevOffset = -1, prevA = -1, prev2Opcode = -1, prev2Offset = -1, prev2A = -1;
    let prev3Opcode = -1, prev3A = -1, prev4Opcode = -1, prev4A = -1;
    for (let at = 0; at < tape.length;) {
        const offset = at, opcode = tape[at++];
        const cells = OPERAND_CELLS[opcode];
        // An opcode the planner does not know gets no plan; the emitter reports it.
        if (cells < 0) return null;
        const a = cells > 0 ? tape[at] : undefined, b = cells > 1 ? tape[at + 1] : undefined;
        at += cells;
        if (at > tape.length) throw new Error("truncated Typed inspection operation");
        if (options.pointers) {
            if ((opcode === 0x20 || opcode === 0xf2) && !writes.has(a)) readEarly.add(a);
            if (opcode === 0xf1 || opcode === 0xf3) for (const x of [a, b]) if (!writes.has(x)) readEarly.add(x);
            if (opcode === 0x21) {
                // L = L + c or L = c + L: the three preceding operations.
                let inc;
                if (prevOpcode === 0x6a) {
                    if (prev2Opcode === 0x41 && prev3Opcode === 0x20 && prev3A === a) inc = prev2A;
                    else if (prev2Opcode === 0x20 && prev2A === a && prev3Opcode === 0x41) inc = prev3A;
                }
                if (!writesOf.has(a)) writesOf.set(a, []);
                writesOf.get(a).push({at: offset, w: weightNow(), inc, depth: loops});
            }
            if ((opcode === 0xf1 || opcode === 0xf3) && prevOpcode === 0x21 && prevA === b) {
                // r[L], r[L + k], r[k + L] and r[L + M] for locals L and M, the index expression
                // being the operations before the local.set.
                let L, M, k = 0;
                if (prev2Opcode === 0x20) L = prev2A;
                else if (prev2Opcode === 0x6a) {
                    if (prev3Opcode === 0x41 && prev4Opcode === 0x20) { L = prev4A; k = prev3A; }
                    else if (prev3Opcode === 0x20 && prev4Opcode === 0x41) { L = prev3A; k = prev4A; }
                    else if (prev3Opcode === 0x20 && prev4Opcode === 0x20 && prev3A !== prev4A) { L = Math.min(prev3A, prev4A); M = Math.max(prev3A, prev4A); }
                }
                if (opcode === 0xf3) k += tape[offset + 3];
                if (L !== undefined && L !== b && M !== b) pointerAccesses.push({at: prevOffset, r: a, L, M, k, w: weightNow(), depth: loops});
            }
        }
        if (options.share) {
            if (opcode === 0x20 || opcode === 0xf2) occur(a, offset, true);
            else if (opcode === 0x21) occur(a, offset, false);
            else if (opcode === 0xf1 || opcode === 0xf3) { occur(a, offset, true); occur(b, offset, true); }
        }
        if (opcode === 0xf3) {
            read(a); read(b);
            if (prevOpcode === 0x21 && prevA === b)
                candidates.push({id: b, at: prev2Opcode === 0x41 ? prev2Offset : prevOffset});
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
        prev4Opcode = prev3Opcode; prev4A = prev3A; prev3Opcode = prev2Opcode; prev3A = prev2A;
        prev2Opcode = prevOpcode; prev2Offset = prevOffset; prev2A = prevA;
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
    // pointers: for accesses r[L + k] to an unwritten parameter r, a home p = r + 4 + 2(L + K0)
    // turns slli, add and lhu 4(.) into lhu 2(k - K0)(p). Every write of L updates p: an
    // addi for L = L + c, otherwise a recompute. Addresses are computed modulo 2^32 as
    // before, so p + 2(k - K0) is exactly r + 2(L + k) and the access is unchanged.
    const groups = new Map();
    if (options.pointers && options.saved) {
        const params = fn.params.length;
        for (const access of pointerAccesses) {
            if (!forward.has(access.at) || access.r >= params || readEarly.has(access.L) || readEarly.has(access.M)) continue;
            const key = "p" + access.r + ":" + access.L + (access.M === undefined ? "" : "+" + access.M);
            if (!groups.has(key)) groups.set(key, {r: access.r, L: access.L, M: access.M, list: []});
            groups.get(key).list.push(access);
        }
        for (const [key, g] of groups) {
            const sorted = g.list.slice().sort((x, y) => x.k - y.k);
            const total = sorted.reduce((sum, x) => sum + x.w, 0);
            let seen = 0;
            g.K0 = sorted[0].k;
            for (const x of sorted) if ((seen += x.w) * 2 >= total) { g.K0 = x.k; break; }
            g.covered = g.list.filter(x => Math.abs(x.k - g.K0) <= 1000);
            const sources = g.M === undefined ? [g.L] : [g.L, g.M];
            // Initialized in the prologue only when every source is a parameter.
            let cost = sources.every(x => x < params) ? sources.length + 2 : 0;
            // For r[L + M]: a write outside the accesses' innermost loop runs once per entry of
            // that loop, so its weight is divided by a further 4 per level, as if inner loops
            // ran 16 times. (Applied to r[L + k] too, it converts conditional accesses whose
            // saving does not cover a per-iteration update.)
            const depth = Math.max(...g.covered.map(x => x.depth));
            for (const source of sources) for (const write of writesOf.get(source) ?? [])
                cost += write.w / (g.M === undefined ? 1 : 4 ** Math.max(0, depth - write.depth)) *
                    (write.inc !== undefined && Math.abs(2 * write.inc) <= 2047 ? 1 : sources.length + 3);
            const gain = 2 * g.covered.reduce((sum, x) => sum + x.w, 0) - cost;
            if (gain < 2) continue;
            scores.set(key, gain);
            if (intervals) {
                // p is written at every write of a source and read at the accesses, which
                // also read the sources: the hull of the sources' intervals covers both.
                const spans = sources.map(x => intervals.get(x) ?? [-Infinity, Infinity]);
                intervals.set(key, [Math.min(...spans.map(x => x[0])), Math.max(...spans.map(x => x[1]))]);
            }
        }
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
    const pointers = new Map(), pointerWrites = new Map(), increments = new Map();
    for (const [key, g] of groups) {
        const reg = homes.get(key);
        if (reg === undefined || !g.covered) continue;
        for (const x of g.covered) pointers.set(x.at, {reg, disp: 2 * (x.k - g.K0)});
        for (const [source, other] of g.M === undefined ? [[g.L, undefined]] : [[g.L, g.M], [g.M, g.L]]) {
            if (!pointerWrites.has(source)) pointerWrites.set(source, []);
            pointerWrites.get(source).push({reg, r: g.r, K0: g.K0, other});
        }
    }
    for (const local of pointerWrites.keys()) for (const write of writesOf.get(local) ?? [])
        if (write.inc !== undefined && Math.abs(2 * write.inc) <= 2047) increments.set(write.at, write.inc);
    return {receiver,forward,homes,direct,pointers,pointerWrites,increments};
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
// "interactive" is for worlds that the device compiles while a person waits (the boot worlds):
// RAY-PARITY's Step 6 set, operand locations and instruction selection without inlining or
// loop transforms. On the P4 it compiles Agenda in 0.98 s and Editor in 3.35 s against 2.75 s
// and 7.90 s for "default" (PICOCALC-COMPILE-BUDGET Step 2), inside their 1.7 s and 6 s deadlines.
const POLICIES = Object.freeze({
    interactive: Object.freeze({
        inlineGuardedReturns: true,
        operandLocations: Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true}),
        select: Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true}),
        inline: false,
    }),
    default: Object.freeze({
        inlineGuardedReturns: true,
        operandLocations: Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true,
            capacities: true, nested: true, constants: true, share: true, pointers: true, split: true}),
        select: Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true,
            commute: true, rotate: true, shortBranches: true, version: true}),
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
        // observeTape(name, phase, code, nlocals): a read-only view of each tape transform, for
        // tools (the trace-REPL workbench). It sees a copy and cannot change the output.
        const observe = phase => options?.observeTape?.(fn.name, phase, fn.code.slice(), fn.nlocals);
        observe("inline");
        if (options?.select?.commute) {
            const commuted = commuteConstants(fn.code, index => callables[index].params.length);
            if (commuted) fn.code = commuted;
            observe("commute");
        }
        const arity = index => callables[index].params.length;
        let ranges;
        if (options?.select?.rotate) {
            const rotated = rotateLoops(fn.code);
            if (rotated) fn.code = rotated;
            observe("rotate");
            if (options.select.facts) ranges = localRanges(fn.code, fn.params.length, arity);
            if (options.select.version) {
                const versioned = versionLoops(fn.code, fn.params.length);
                if (versioned) fn.code = versioned;
                observe("version");
            }
        }
        if (options?.select?.facts && !options.select.rotate) ranges = localRanges(fn.code, fn.params.length, arity);
        let origin = local => local;
        if (options?.operandLocations?.split) {
            const before = fn.params.length + fn.nlocals;
            const split = splitLocals(fn.code, fn.params.length, fn.nlocals);
            if (split) {
                fn.code = split.code;
                fn.nlocals = split.nlocals;
                origin = local => local >= before ? split.origin[local - before] : local;
            }
            observe("split");
        }
        const facts = ranges ? divisionFacts(fn.code, fn.params.length, arity, ranges, origin) ?? undefined : undefined;
        let compiled = lowerLeaf(fn, callables, targets, options?.select, facts);
        if (!compiled) {
            const plan = options?.operandLocations ? planLocations(fn, {...options.operandLocations, select: options.select},
                index => Emitter === GuardedReturnCode && targets[index]?.guardedReturn) : undefined;
            const emit = longBranches => {
                const emitter = new Emitter(fn, callables, targets);
                emitter.select = options?.select;
                emitter.facts = facts;
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
