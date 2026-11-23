// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.
// The RV32 backend's core: encoding, the emitters, the planner, the pass registry, policies, compile, linkSlot.
// This code executes in the host tools and can execute in a bare QuickJS realm.
(() => {
"use strict";

// rv32/encoding/registers.js
// RV32 registers and the instruction encoders.
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

// rv32/encoding/tape.js
// The tape's opcodes, block types, effects and walkers (compiler/typed/tape.js, loaded first).
const {UNREACHABLE, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, CALL, DROP, LOCAL_GET, LOCAL_SET,
    I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S,
    I32_LE_S, I32_GE_S, I32_GE_U, I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_SHL, I32_SHR_S,
    CHECKED_ADDRESS, LITERAL_STORES, UNCHECKED_ADDRESS, I32, VOID, STORES,
    cells: CELLS, effects: EFFECTS, next: opNext, close: opClose} = typedTape;

// rv32/emit/addresses.js
// FunctionCode's checked and unchecked buffer addresses.

class AddressMethods {
    // The address of receiver[index + j]: checked against the capacity, or unchecked (UNCHECKED_ADDRESS, in a
    // copy of a loop that the version pass proved in range), and read at once when a UTF-16 load
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
        const loads = tape[this.at] === I32_LOAD16_U && tape[this.at+2] === 4;
        // select.loadHomes: a fused load whose value a homed local takes next loads into the
        // home (destination()), not into a stack register and a move. The address registers
        // are read by the load itself, so the home may be one of them.
        const fused = (offset, from) => {
            this.at += 3;
            const stored = this.select?.loadHomes ? this.destination() : undefined;
            this.load(stored ?? out, offset, from, 5);
            if (stored === undefined) this.push(out); else this.result(stored, stored);
        };
        if (pointer) {
            if (loads) return fused(pointer.disp, pointer.reg);
            this.emit(instruction.i(0x13, out, 0, pointer.reg, pointer.disp - 4));
        } else if (unchecked && j) {
            this.emit(instruction.i(0x13, out, 1, index, 1));
            this.emit(instruction.r(0x33, out, 0, base, out));
            if (loads && 4 + 2 * j <= 2047) return fused(4 + 2 * j, out);
            if (2 * j <= 2047) this.emit(instruction.i(0x13, out, 0, out, 2 * j));
            else {
                this.constant(T6, 2 * j);
                this.emit(instruction.r(0x33, out, 0, out, T6));
            }
        } else if (constant >= 0 && constant <= 1021 && loads) {
            return fused(4 + 2 * constant, base);
        } else {
            this.emit(instruction.i(0x13, out, 1, index, 1));
            this.emit(instruction.r(0x33, out, 0, base, out));
        }
        this.push(out);
    }

}

// rv32/encoding/division.js
// Division by a constant without a divide.
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

// rv32/encoding/selection.js
// Instruction-selection tables: ALU operations, fused predicates, immediate forms, constantForm.

const ALU = new Map([
    [I32_ADD,[0,0]], [I32_SUB,[0,0x20]], [I32_MUL,[0,1]], [I32_DIV_S,[4,1]], [I32_REM_S,[6,1]],
    [I32_SHL,[1,0]], [I32_SHR_S,[5,0x20]],
]);

// select.branches: the branch funct3 taken when the predicate holds, and whether the
// instruction's operands are reversed. From PICOCALC-RV32-BRANCH 02-predicate-fusion.patch.
const PREDICATES = new Map([
    [I32_EQZ,[0,false]], // eqz (right operand is zero)
    [I32_EQ,[0,false]], // eq
    [I32_NE,[1,false]], // ne
    [I32_LT_S,[4,false]], // lt_s
    [I32_GT_S,[4,true]],  // gt_s
    [I32_LE_S,[5,true]],  // le_s
    [I32_GE_S,[5,false]], // ge_s
    [I32_GE_U,[7,false]], // ge_u
]);

const fitsImmediate = n => n >= -2048 && n <= 2047;
const powerOfTwo = n => n > 0 && (n & (n - 1)) === 0 ? 31 - Math.clz32(n) : -1;

// select.immediates: an operation whose right operand is a literal, as I-type instructions.
// Each entry returns [funct3, immediate] pairs, applied in order to the result register; the
// first reads the left operand. null keeps the register form.
const IMMEDIATE_FORMS = new Map([
    [I32_ADD, c => fitsImmediate(c) ? [[0, c]] : null],                       // addi
    [I32_SUB, c => fitsImmediate(-c) ? [[0, -c]] : null],                     // addi -c
    [I32_MUL, c => c === 1 ? [[0, 0]] : powerOfTwo(c) > 0 ? [[1, powerOfTwo(c)]] : null], // mv, slli
    [I32_SHL, c => [[1, c & 31]]],                                            // slli
    [I32_SHR_S, c => [[5, 0x400 | (c & 31)]]],                                  // srai
    [I32_LT_S, c => fitsImmediate(c) ? [[2, c]] : null],                       // slti
    [I32_LE_S, c => c < 2047 && c >= -2049 ? [[2, c + 1]] : null],             // a <= c as a < c+1
    [I32_GE_S, c => fitsImmediate(c) ? [[2, c], [4, 1]] : null],               // !(a < c)
    [I32_GE_U, c => fitsImmediate(c) ? [[3, c], [4, 1]] : null],               // !(a <u c)
    [I32_EQ, c => fitsImmediate(c) ? [[4, c], [3, 1]] : null],               // xori, seqz
]);

// How select lowers the literal at tape[at] (an i32.const operand cell), given the next
// operation: "zero" (read x0), "divide", "immediate", or "register" (it needs a register:
// a fused branch compare, a large or unfoldable operand, a store value, an argument).
// The emitter and the planner both use this, so a constant home is planned exactly where
// the emitter would otherwise load the literal.
function constantForm(tape, at, s) {
    const c = tape[at], next = tape[at + 1];
    const consumer = tape[at + 2] === I32_EQZ ? tape[at + 3] : tape[at + 2];
    if (s?.branches && PREDICATES.has(next) && (consumer === IF || consumer === BR_IF))
        return s.immediates && c === 0 ? "zero" : "register";
    if (s?.divisions && (next === I32_DIV_S || next === I32_REM_S) && (c >= 3 || powerOfTwo(c) > 0) &&
        !(next === I32_REM_S && powerOfTwo(c) < 0)) return "divide";
    if (!s?.immediates) return "register";
    if (c === 0) return "zero";
    return IMMEDIATE_FORMS.get(next)?.(c) ? "immediate" : "register";
}

// rv32/emit/arithmetic.js
// FunctionCode's binary operations, constant selection and division by constants.

class ArithmeticMethods {
    binary(op) {
        const b = this.pop(T6);
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        const alu = ALU.get(op);
        if (alu) {
            if (op === I32_DIV_S || op === I32_REM_S) {
                this.emit(instruction.b(1, b, ZERO, 8));
                this.emit(0x00100073);
            }
            if (op === I32_DIV_S) {
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
        } else if (op === I32_EQ || op === I32_NE) {
            this.emit(instruction.r(0x33, out, 4, a, b)); // xor
            if (op === I32_EQ) this.emit(instruction.i(0x13, out, 3, out, 1)); // seqz
            else this.emit(instruction.r(0x33, out, 3, ZERO, out)); // snez
        } else {
            const unsigned = op === I32_GE_U;
            if (![I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U].includes(op))
                throw new SyntaxError("unsupported RV32 operator " + op);
            const swap = op === I32_GT_S || op === I32_LE_S;
            this.emit(instruction.r(0x33, out, unsigned ? 3 : 2, swap ? b : a, swap ? a : b));
            if (op === I32_LE_S || op === I32_GE_S || unsigned)
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
            this.divideByConstant(next === I32_REM_S, c, nonNegative);
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
    // nonNegative (the facts pass): the dividend is known >= 0, so no rounding bias or sign
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

}

// rv32/emit/branches.js
// FunctionCode's branches, labels and structured control.

const SHORT_BRANCH_RANGE = Symbol("a forward branch target is beyond the conditional-branch range");

class BranchMethods {
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


    // Whether the operation at `at` (after a predicate) is a branch the predicate can fuse with.
    fusible(at) {
        const tape = this.program.code;
        const consumer = tape[at] === I32_EQZ ? tape[at + 1] : tape[at];
        return consumer === IF || consumer === BR_IF;
    }

    branchTarget() {
        const block = this.control.at(-1 - this.cell());
        return block.op === LOOP ? block.start : block.end;
    }

    // select.branches: a comparison consumed by if or br_if becomes one conditional branch.
    fuseBranch(op) {
        const encoding = PREDICATES.get(op);
        if (!encoding || !this.fusible(this.at)) return false;
        const negate = this.program.code[this.at] === I32_EQZ;
        const consumer = this.program.code[this.at + Number(negate)];
        this.at += 1 + Number(negate);
        const [kind, swap] = encoding;
        const right = op === I32_EQZ ? ZERO : this.pop(T6);
        const left = this.pop(T5);
        // As at every control operation, pending direct reads move to their stack registers.
        this.materialize();
        const a = swap ? right : left;
        const b = swap ? left : right;
        const whenTrue = kind ^ Number(negate);
        if (consumer === IF) this.begin(consumer, whenTrue ^ 1, a, b);
        else this.branch(whenTrue, a, b, this.branchTarget());
        return true;
    }

    begin(op, kind = 0, a, b = ZERO) {
        const type = this.cell();
        if (type !== VOID && type !== I32) throw new SyntaxError("unsupported RV32 control result");
        const condition = op === IF ? a ?? this.pop(T5) : ZERO;
        const block = {op, depth: this.depth, value: type === I32, start: {}, alternate: {}, end: {}};
        this.control.push(block);
        this.mark(block.start);
        if (op === IF) this.branch(kind, condition, b, block.alternate);
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

}

// rv32/plan/saved-homes.js
// Callee-saved homes.

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
function planSavedHomes(fn, scores, homes, leaf, capacityCached, intervals, reuseArgs) {
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
        // reuseArgs: the argument register of a parameter without its own home there is free once
        // the prologue has written the parameter to its slot or home. Only a plain local, first
        // written in the body, may take it: parameter, capacity and pointer homes are filled in
        // the prologue, from the incoming registers (RAY-PARITY Step 21).
        if (reuseArgs) for (let p = 1; p < lastIncoming; p++) if (!homes.has(p)) free.push({reg: A0 + p, cost: 0, localsOnly: true});
    }
    for (const reg of SAVED_REGISTERS) free.push({reg, cost: 2});
    for (const [id, score] of [...scores].sort((a, b) => b[1] - a[1])) {
        if (homes.has(id)) continue;
        const own = span(id);
        const plain = typeof id === "number" && id >= fn.params.length;
        const shared = intervals && score >= 1 ? opened.find(r => (plain || !r.localsOnly) && disjoint(r, own)) : undefined;
        if (shared) {
            homes.set(id, shared.reg);
            shared.spans.push(own);
            continue;
        }
        const at = free.findIndex(f => plain || !f.localsOnly);
        if (at < 0 || score <= (free[at].cost ? SAVED_MARGIN * free[at].cost : 1)) {
            if (intervals) continue;
            break;
        }
        const [{reg, localsOnly}] = free.splice(at, 1);
        homes.set(id, reg);
        opened.push({reg, spans: [own], localsOnly});
    }
}

// rv32/emit/calls.js
// FunctionCode's calls and the callee-saved registers its prologue saves.

class CallMethods {
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


    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

}

// rv32/emit/homes.js
// FunctionCode's register homes: local reads and writes, direct reads, pointer homes.

class HomeMethods {
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
        // A constant written to the source: the pointer is base + 4 + 2 * (K0 + c), one addition.
        // The constant is the operation before the set, or the current one when destination()
        // folded the set into it.
        const tape = this.program.code;
        let constant;
        if (plan.skips) for (const o of [this.currentOp, this.previousOp]) if (o !== undefined && tape[o] === I32_CONST && o + 2 === at) constant = tape[o + 1];
        for (const {reg, r, K0, other} of list) {
            if (step !== undefined) {
                this.emit(instruction.i(0x13, reg, 0, reg, 2 * step));
                continue;
            }
            const base = plan.homes.get(r), offset = 4 + 2 * (K0 + (constant ?? 0));
            if (constant !== undefined && other === undefined && base !== undefined && offset >= -2048 && offset <= 2047) {
                this.emit(instruction.i(0x13, reg, 0, base, offset));
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

}

// rv32/emit/inspection.js
// The native inspection view: per-operation word ranges for typed-inspect and the workbench.

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
        if (op === CALL && this.inlinedGuard) {
            decisions.push("inline guarded return from verified i32 helper");
            this.inlinedGuard = false;
        } else if (op === CALL) {
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

// rv32/emit/mixin.js
// FunctionCode is one class written in several files: each file holds a group of its methods as a class of its
// own, and mixin() copies their methods onto FunctionCode's prototype, as class methods (not enumerable). The
// prototype chain stays one level deep, so a method call costs what it did when the methods shared one class
// body. A group's methods use no `super`; a name defined twice is an error.
function mixin(target, ...groups) {
    for (const group of groups) {
        for (const name of Object.getOwnPropertyNames(group.prototype)) {
            if (name === "constructor") continue;
            if (Object.hasOwn(target.prototype, name)) throw new Error(target.name + "." + name + " is defined twice");
            Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(group.prototype, name));
        }
    }
}

// rv32/emit/stack.js
// FunctionCode's operand stack: loads, stores, constants, result destinations, spills.

class StackMethods {
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
        if (!this.select?.results || !plan || tape[this.at] !== LOCAL_SET || plan.forward.has(this.at)) return undefined;
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

}

// rv32/emit/function-code.js
// FunctionCode, the streaming emitter: one pass over a function's tape that writes RV32 words.

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

    step(op) {
        const plan = this.locations;
        this.previousOp = this.currentOp;
        this.currentOp = this.at - 1;
        const skip = plan?.skips?.get(this.at - 1);
        if (skip) {
            for (const {reg} of plan.pointerWrites.get(skip.local)) this.emit(instruction.i(0x13, reg, 0, reg, 2 * skip.inc));
            this.at = skip.end;
            this.currentOp = undefined;
            return false;
        }
        if (op >= BLOCK && op <= RETURN) this.materialize();
        if (plan?.forward.has(this.at - 1)) {
            const site = this.at - 1, tape = this.program.code;
            const constant = op === I32_CONST ? this.cell() : undefined;
            // [const c] set t access r t, or set t access r t: access is CHECKED_ADDRESS or UNCHECKED_ADDRESS (with j).
            const accessAt = constant === undefined ? site + 2 : site + 4;
            const unchecked = tape[accessAt] === UNCHECKED_ADDRESS, j = unchecked ? tape[accessAt + 3] : 0;
            const direct = unchecked && constant >= 0 && constant + j <= 1021 && tape[accessAt + 4] === I32_LOAD16_U && tape[accessAt + 6] === 4;
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
        if (op === LOCAL_GET && plan && this.versioned && this.program.code[this.at + 1] === I32_LOAD && this.program.code[this.at + 3] === 0) {
            const home = plan.homes.get(-1 - this.program.code[this.at]);
            if (home !== undefined) {
                this.at += 4;
                this.pushHome(home);
                return false;
            }
        }
        if (op === LOCAL_GET && this.capacityReady && this.program.code[this.at] === plan.receiver &&
            this.program.code[this.at+1] === I32_LOAD && this.program.code[this.at+3] === 0) {
            this.at += 4;
            this.push(A0 + 7);
            return false;
        }
        if (this.select?.branches && op >= I32_EQZ && op <= I32_GE_U && this.fuseBranch(op)) return false;
        if (op === I32_CONST && this.select && this.selectConstant()) return false;
        switch (op) {
        case UNREACHABLE: this.emit(0x00100073); break;  // Wasm unreachable
        case BLOCK: case LOOP: case IF: this.begin(op); break;
        case ELSE: {
            const block = this.control.at(-1);
            this.jump(block.end);
            this.mark(block.alternate);
            this.depth = block.depth;
            break;
        }
        case END: return this.end();
        case BR: case BR_IF: {
            const block = this.control.at(-1 - this.cell());
            const target = block.op === LOOP ? block.start : block.end;
            if (op === BR_IF) this.branch(1, this.pop(T5), ZERO, target);
            else this.jump(target);
            break;
        }
        case RETURN: this.move(A0, this.pop(A0)); this.jump(this.exit); break;
        case CALL: this.call(this.cell()); break;
        case DROP: this.depth--; break;
        case LOCAL_GET: {
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
        case LOCAL_SET: {
            const value = this.pop(T5), local = this.cell();
            this.writeLocal(value, local);
            this.pointersAfterWrite(local, this.at - 2, value);
            break;
        }
        case I32_LOAD: case I32_LOAD16_U: case I32_STORE: case I32_STORE16: {
            this.cell(); // alignment hint
            const offset = this.cell();
            if (offset > 2047) throw new SyntaxError("RV32 field offset exceeds the instruction range");
            if (op === I32_LOAD || op === I32_LOAD16_U) {
                const base = this.pop(T5);
                const stored = this.destination();
                const out = stored ?? this.resultRegister();
                this.load(out, offset, base, op === I32_LOAD ? 2 : 5); // lw or lhu
                this.result(out, stored);
            } else {
                const value = this.pop(T6);
                this.store(value, offset, this.pop(T5), op === I32_STORE ? 2 : 1); // sw or sh
            }
            break;
        }
        case I32_CONST: {
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
        case I32_EQZ: {
            const value = this.pop(T5);
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.emit(instruction.i(0x13, out, 3, value, 1));
            this.result(out, stored);
            break;
        }
        case CHECKED_ADDRESS: { // checked UTF-16 address, before any payload load or write RHS
            const receiver = this.cell(), position = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5);
            break;
        }
        case UNCHECKED_ADDRESS: { // unchecked UTF-16 address of receiver[position + j] (the version pass)
            const receiver = this.cell(), position = this.cell(), j = this.cell();
            this.readLocal(T5, position);
            this.checkedAddress(receiver, T5, undefined, undefined, true, j);
            break;
        }
        case LITERAL_STORES: { // ordered UTF-16 stores after the complete range check
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
mixin(FunctionCode, StackMethods, HomeMethods, AddressMethods, BranchMethods, ArithmeticMethods, CallMethods);

// rv32/emit/guarded-return.js
// Guarded scalar returns: a tiny unary helper's body, applied at the call site.

// Describe a tiny unary integer helper only after its verified operation tape is available.
// Accepted body: if (x <relation> K) return -x or C; return x.
// The branch below skips the taken action when the source predicate is false.
const GUARDED_FALSE = new Map([
    [I32_EQ,[1,false]], [I32_NE,[0,false]], // eq: bne, ne: beq
    [I32_LT_S,[5,false]], [I32_GT_S,[5,true]],  // lt: bge x,K; gt: bge K,x
    [I32_LE_S,[4,true]], [I32_GE_S,[4,false]],  // le: blt K,x; ge: blt x,K
]);

function guardedReturnSummary(fn) {
    const t = fn.code;
    if (fn.nlocals || fn.params.length !== 1 || fn.params[0] !== "i32" || fn.result !== "i32" ||
        (t.length !== 14 && t.length !== 17)) return null;
    const branch = GUARDED_FALSE.get(t[4]);
    if (!branch || t[0] !== LOCAL_GET || t[1] !== 0 || t[2] !== I32_CONST || t[5] !== IF ||
        t[6] !== VOID || t[7] !== I32_CONST) return null;
    const negate = t.length === 17;
    if (negate && (t[8] !== 0 || t[9] !== LOCAL_GET || t[10] !== 0 || t[11] !== I32_SUB)) return null;
    const tail = t.length - 5;
    if (t[tail] !== RETURN || t[tail+1] !== END || t[tail+2] !== LOCAL_GET ||
        t[tail+3] !== 0 || t[tail+4] !== END) return null;
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

// rv32/emit/leaf-code.js
// LeafCode: frameless leaves.

// An allowlist keeps any new operation with a possible frame dependency on the
// ordinary path until its frameless lowering is reviewed.
const LEAF_OPERATIONS = new Set([
    BLOCK, IF, ELSE, END, BR, BR_IF, RETURN, DROP, LOCAL_GET, I32_CONST, I32_EQZ,
    I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, ...ALU.keys(),
]);
const LEAF_SPILL = Symbol("frameless function needs an operand spill");

class LeafCode extends FunctionCode {
    spill() { throw LEAF_SPILL; }

    step(op) {
        if (op !== LOCAL_GET) return super.step(op);
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
        const op = fn.code[at++];
        if (!LEAF_OPERATIONS.has(op) || at + CELLS[op] > fn.code.length)
            return declineLeaf(fn, "operation outside frameless allowlist");
        at += CELLS[op];
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

// rv32/plan/locations.js
// planLocations: operand homes, pointer groups and pointer-only skips.

// Assign permanent homes only in framed scalar functions with a checked access.
function planLocations(fn, options, inlineCall) {
    const tape = fn.code;
    // Forwarding and capacity reuse need a checked access; saved homes apply to any framed function.
    if (!options.saved && !tape.includes(CHECKED_ADDRESS) && !tape.includes(UNCHECKED_ADDRESS)) return null;
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
        const cells = CELLS[opcode];
        // An opcode the planner does not know gets no plan; the emitter reports it.
        if (cells < 0) return null;
        const a = cells > 0 ? tape[at] : undefined, b = cells > 1 ? tape[at + 1] : undefined;
        at += cells;
        if (at > tape.length) throw new Error("truncated Typed inspection operation");
        if (options.pointers) {
            if ((opcode === LOCAL_GET || opcode === LITERAL_STORES) && !writes.has(a)) readEarly.add(a);
            if (opcode === CHECKED_ADDRESS || opcode === UNCHECKED_ADDRESS) for (const x of [a, b]) if (!writes.has(x)) readEarly.add(x);
            if (opcode === LOCAL_SET) {
                // L = L + c or L = c + L: the three preceding operations.
                let inc;
                if (prevOpcode === I32_ADD) {
                    if (prev2Opcode === I32_CONST && prev3Opcode === LOCAL_GET && prev3A === a) inc = prev2A;
                    else if (prev2Opcode === LOCAL_GET && prev2A === a && prev3Opcode === I32_CONST) inc = prev3A;
                }
                if (!writesOf.has(a)) writesOf.set(a, []);
                writesOf.get(a).push({at: offset, w: weightNow(), inc, depth: loops});
            }
            if ((opcode === CHECKED_ADDRESS || opcode === UNCHECKED_ADDRESS) && prevOpcode === LOCAL_SET && prevA === b) {
                // r[L], r[L + k], r[k + L] and r[L + M] for locals L and M, the index expression
                // being the operations before the local.set.
                let L, M, k = 0;
                if (prev2Opcode === LOCAL_GET) L = prev2A;
                else if (prev2Opcode === I32_ADD) {
                    if (prev3Opcode === I32_CONST && prev4Opcode === LOCAL_GET) { L = prev4A; k = prev3A; }
                    else if (prev3Opcode === LOCAL_GET && prev4Opcode === I32_CONST) { L = prev3A; k = prev4A; }
                    else if (prev3Opcode === LOCAL_GET && prev4Opcode === LOCAL_GET && prev3A !== prev4A) { L = Math.min(prev3A, prev4A); M = Math.max(prev3A, prev4A); }
                }
                if (opcode === UNCHECKED_ADDRESS) k += tape[offset + 3];
                if (L !== undefined && L !== b && M !== b) pointerAccesses.push({at: prevOffset, r: a, L, M, k, w: weightNow(), depth: loops});
            }
        }
        if (options.share) {
            if (opcode === LOCAL_GET || opcode === LITERAL_STORES) occur(a, offset, true);
            else if (opcode === LOCAL_SET) occur(a, offset, false);
            else if (opcode === CHECKED_ADDRESS || opcode === UNCHECKED_ADDRESS) { occur(a, offset, true); occur(b, offset, true); }
        }
        if (opcode === UNCHECKED_ADDRESS) {
            read(a); read(b);
            if (prevOpcode === LOCAL_SET && prevA === b)
                candidates.push({id: b, at: prev2Opcode === I32_CONST ? prev2Offset : prevOffset});
        }
        if (opcode === CHECKED_ADDRESS) {
            if (straight && receiver === undefined) receiver = a;
            if (options.capacities) {
                const before = scores.get(-1);
                weigh(-1);
                capacityUses.set(a, (capacityUses.get(a) ?? 0) + scores.get(-1) - (before ?? 0));
                scores.delete(-1);
            }
            read(a); read(b);
            if (prevOpcode === LOCAL_SET && prevA === b)
                candidates.push({id: b, at: prev2Opcode === I32_CONST ? prev2Offset : prevOffset});
        }
        if (opcode === LOCAL_GET || opcode === LITERAL_STORES) read(a);
        // constants: a literal the emitter would load into a register, scored like a local.
        if (opcode === I32_CONST && options.constants && constantForm(tape, offset + 1, options.select) === "register")
            weigh("c" + a);
        if (opcode === LOCAL_SET) {
            writes.add(a);
            // A homed write turns a store into a move: worth less than a read, which disappears.
            if (options.saved) weigh(a, 0.5);
        }
        if (opcode === CALL && !inlineCall(a)) leaf = false;
        if (EFFECTS[opcode] & STORES) pure = false;
        if (opcode >= BLOCK && opcode <= IF) {
            blocks.push(opcode);
            if (opcode === LOOP) { loops++; loopStarts.push(offset); }
            if (opcode === IF) ifs++;
        }
        if (opcode === END) {
            const closed = blocks.pop();
            if (closed === LOOP) { loops--; loopSpans.push([loopStarts.pop(), offset]); }
            if (closed === IF) ifs--;
        }
        if (opcode >= BLOCK && opcode <= RETURN) straight = false;
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
    if (options.saved) planSavedHomes(fn, scores, homes, leaf, receiver !== undefined, intervals, options.reuseArgs);
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
    // operandLocations.pointerOnly: a source whose every read is either a covered access of its
    // own single-source pointer group (one read each) or its own step L = L + c (one read each)
    // is read only through the pointer: its steps need only advance the pointer, so the emitter
    // replaces `get L; const c; add; set L` by `addi p, p, 2c` (skips: statement start -> step).
    const skips = options.pointerOnly ? new Map() : undefined;
    if (skips) for (const [key, g] of groups) {
        if (homes.get(key) === undefined || !g.covered || g.M !== undefined) continue;
        const steps = (writesOf.get(g.L) ?? []).filter(w => w.inc !== undefined);
        const covered = [...groups.values()].filter(h => h.L === g.L && h.M === undefined && homes.get("p" + h.r + ":" + h.L) !== undefined)
            .reduce((n, h) => n + h.covered.length, 0);
        if (g.L < fn.params.length || reads.get(g.L) !== covered + steps.length) continue;
        if (!steps.every(w => increments.has(w.at))) continue;
        // After a skipped step L is stale, so in the innermost loop around each step every read of
        // L must be an unchecked access (which needs no index) or a step. A checked access needs
        // L's value for its bounds check; the slow copy of a versioned loop recomputes L from its
        // definition, which is not a step, so its checked accesses see the exact value.
        const L = g.L, unchecked = q => tape[q] === UNCHECKED_ADDRESS;
        const safeRead = q => (tape[q + 2] === LOCAL_SET && unchecked(q + 4)) ||
            (tape[q + 2] === I32_CONST && tape[q + 4] === I32_ADD && tape[q + 5] === LOCAL_SET && (tape[q + 6] === L || unchecked(q + 7))) ||
            (q >= 2 && tape[q - 2] === I32_CONST && tape[q + 2] === I32_ADD && tape[q + 3] === LOCAL_SET && unchecked(q + 5));
        let stale = false;
        for (const w of steps) {
            const span = loopSpans.filter(([s0, e0]) => s0 <= w.at && w.at <= e0).sort((x, y) => y[0] - x[0])[0];
            if (!span) { stale = true; break; }
            for (let q = span[0]; q < span[1] && !stale; q = opNext(tape, q)) {
                const op = tape[q];
                if ((op === LOCAL_GET || op === LITERAL_STORES) && tape[q + 1] === L && !(op === LOCAL_GET && safeRead(q))) stale = true;
                if ((op === CHECKED_ADDRESS || op === UNCHECKED_ADDRESS) && (tape[q + 1] === L || tape[q + 2] === L)) stale = true;
            }
        }
        if (stale) continue;
        for (const w of steps) skips.set(w.at - 5, {end: w.at + 2, local: g.L, inc: w.inc});
    }
    // scores and intervals are what planSavedHomes chose from; only observePlan reads them.
    return {receiver,forward,homes,direct,pointers,pointerWrites,increments,skips,scores,intervals};
}

// rv32/analysis/storeless.js
// Which functions store nothing (the hoist option of the version pass asks it about callees).

// A function stores nothing when its tape has no operation with the STORES effect and calls only such
// functions. Imports and functions not yet declared are assumed to store. callables grows as the front end
// declares functions; a lowered function's tape is released, so the hoist option records the answer for each
// function before any pass rewrites it.
function storelessAnalysis(callables, importCount) {
    const memo = new Map();
    return function storeless(index) {
        if (memo.has(index)) return memo.get(index);
        memo.set(index, false);
        const tape = index >= importCount ? callables[index]?.code : undefined;
        let result = Boolean(tape);
        for (let at = 0; result && at < tape.length; at = opNext(tape, at)) {
            const op = tape[at];
            if (!(CELLS[op] >= 0) || EFFECTS[op] & STORES) result = false;
            else if (op === CALL) result = storeless(tape[at + 1]);
        }
        memo.set(index, result);
        return result;
    };
}

// rv32/passes/registry.js
// The tape passes, in the one order the pipeline runs them. A policy names a subset (policy.js); compile.js
// runs it. The table is part of the core bundle (typed-rv32.js); each pass's code is in its group's bundle,
// which installs it here when it loads.
//
//   name     the pass's name in a policy, in timing rows and, for a transform, in observeTape
//   group    the bundle that holds its code (GROUPS)
//   kind     "transform" rewrites fn.code and is observed after it runs; "analysis" leaves a result in the
//            function's context; "option" has no stage of its own and changes the pass it needs
//   needs    passes that must precede it in the same list
//
// A group installs, per pass, any of:
//   setup(unit)        once per compile, before the first function; unit is the compile's context
//   start(fn, ctx)     before any stage, on the tape as the front end wrote it (timed as `startName`)
//   run(fn, ctx)       the stage
//   finish(fn, ctx)    after the function is emitted (timed as `finishName`)
// ctx is the function's context: Object.create(unit) with passes (a Set), index, Emitter and the results
// of earlier stages (libraryCopy, ranges, origin, facts). unit holds options, callables, targets, arity and
// storeless.
const PASSES = [
    // inline is observed at the "inline" checkpoint, after the guarded-return and PIE stages (compile.js).
    {name: "inline", group: "inline", kind: "transform", observe: false},
    {name: "commute", group: "inline", kind: "transform"},
    {name: "conjunctions", group: "loops", kind: "transform"},
    {name: "sets", group: "loops", kind: "transform"},
    {name: "rotate", group: "inline", kind: "transform"},
    {name: "ranges", group: "loops", kind: "analysis"},
    {name: "version", group: "loops", kind: "transform", needs: ["rotate"]},
    {name: "hoist", group: "loops", kind: "option", needs: ["version"]},
    {name: "induction", group: "loops", kind: "option", needs: ["version"]},
    {name: "split", group: "loops", kind: "transform"},
    {name: "facts", group: "loops", kind: "analysis", needs: ["ranges"]},
];
PASSES.forEach((pass, order) => pass.order = order);

// The bundle file of each group, next to typed-rv32.js.
const GROUPS = Object.freeze({inline: "typed-rv32-inline.js", loops: "typed-rv32-loops.js"});

// A transform's result is the rewritten tape, or null when it changed nothing.
const replaceTape = (fn, code) => { if (code) fn.code = code; };

function passByName(name) {
    const pass = PASSES.find(pass => pass.name === name);
    if (!pass) throw new TypeError("unknown RV32 pass " + name);
    return pass;
}

const installed = new Set();
function installPasses(group, stages) {
    for (const [name, stage] of Object.entries(stages)) {
        const pass = passByName(name);
        if (pass.group !== group) throw new Error("the RV32 pass " + name + " belongs to the group " + pass.group);
        Object.assign(pass, stage);
    }
    installed.add(group);
}

// Make sure the groups of these passes are loaded. A host that loads compiler files on demand (the P4's
// typed_p4.c, which keeps every file's bytecode) defines globalThis.typedRv32Load(file), which evaluates
// the file in this realm; a host without it loads every group file after typed-rv32.js.
function loadPasses(names) {
    for (const name of names) {
        const {group} = passByName(name);
        if (installed.has(group)) continue;
        globalThis.typedRv32Load?.(GROUPS[group]);
        if (!installed.has(group))
            throw new Error("the RV32 pass " + name + " needs " + GROUPS[group] + "; load it after typed-rv32.js");
    }
}

// rv32/policy.js
// Named code-generation policies. A policy is a list of tape passes (passes/registry.js, in pipeline order) and
// the parameters of the stages that are not tape passes: guarded-return inlining, the operand-location
// planner (operandLocations) and the emitter's instruction selection (select).
//
// "default" applies every native optimization that has passed the host differential, the historical
// replays and a paired P4 trial; a caller that passes no options gets it. "stock" is the code generation of
// 2026-11-21 before those became defaults, kept as the control arm for experiments.
// PIE loop lowering stays opt-in (pieLoops): it needs typed-pie-loops.js and saved under 1% of a ray frame
// for about 70 ms of cold compile on the P4.

const DEFAULT_SELECT = Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true,
    shortBranches: true});
const DEFAULT_LOCATIONS = Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true,
    capacities: true, nested: true, constants: true, share: true, pointers: true});
const DEFAULT_POLICY = Object.freeze({
    passes: Object.freeze(["inline", "commute", "rotate", "version", "split"]),
    inlineGuardedReturns: true,
    operandLocations: DEFAULT_LOCATIONS,
    select: DEFAULT_SELECT,
});
const POLICIES = Object.freeze({
    // "interactive" is for worlds that the device compiles while a person waits (the boot worlds):
    // RAY-PARITY's Step 6 set, operand locations and instruction selection without a tape pass. On the
    // P4 it compiles Agenda in 0.98 s and Editor in 3.35 s against 2.75 s and 7.90 s for "default"
    // (PICOCALC-COMPILE-BUDGET Step 2), inside their 1.7 s and 6 s deadlines.
    interactive: Object.freeze({
        passes: Object.freeze([]),
        inlineGuardedReturns: true,
        operandLocations: Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true}),
        select: Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true}),
    }),
    // "balanced" is "default" without loop versioning and split locals (RAY-PARITY's Step 11 set), for
    // worlds with a long boot compile whose loops gain little from versioning: Chess with the 3D painter
    // compiles in 3.76 s instead of 4.66 s on the P4 (6 s deadline), and versioning saves its engine 0.45%
    // of instructions (PICOCALC-COMPILE-BUDGET Step 6).
    balanced: Object.freeze({...DEFAULT_POLICY, passes: Object.freeze(["inline", "commute", "rotate"])}),
    default: DEFAULT_POLICY,
    // "kernel" is "default" plus what only a compute kernel can afford to compile: the division facts
    // (ranges, facts) cost Chess's boot compile about a quarter more, past its budget, but take the ray
    // frame from 16.25 to 15.27 ms on the P4 (RAY-PARITY Step 15); value sets take it to 13.84 ms for 6%
    // more compile time (Step 17), hoisted loop invariants to 12.45 ms for 11% more (Step 18), fused
    // conjunctions and loads into homes to 11.43 ms for 1% more (Step 19). Induction variables with
    // pointer-only sources take it to 11.17 ms for 1.5% more (Step 20). Locals in the argument registers
    // of unhomed parameters take it to 10.99 ms at no compile cost (Step 21). The ray tracer uses it.
    kernel: Object.freeze({
        ...DEFAULT_POLICY,
        passes: Object.freeze(["inline", "commute", "conjunctions", "sets", "rotate", "ranges", "version", "hoist",
            "induction", "split", "facts"]),
        operandLocations: Object.freeze({...DEFAULT_LOCATIONS, pointerOnly: true, reuseArgs: true}),
        select: Object.freeze({...DEFAULT_SELECT, loadHomes: true}),
    }),
    stock: Object.freeze({passes: Object.freeze([])}),
});

// Options select a policy (default "default"); any other field given replaces the policy's field, and an
// undefined one leaves it. `enable` and `disable` add passes to and remove passes from the resulting list
// (an added pass takes its place in pipeline order), so a study can toggle one pass by name.
function resolveOptions(options) {
    const name = options?.policy ?? "default";
    if (!Object.hasOwn(POLICIES, name)) throw new TypeError("unknown RV32 code-generation policy " + name);
    const resolved = {...POLICIES[name]};
    for (const key in options ?? {}) if (options[key] !== undefined) resolved[key] = options[key];
    let passes = resolved.passes ?? [];
    if (!Array.isArray(passes)) throw new TypeError("RV32 passes must be a list of pass names");
    if (resolved.enable || resolved.disable) {
        const chosen = new Set(passes);
        for (const pass of resolved.enable ?? []) chosen.add(pass);
        for (const pass of resolved.disable ?? []) chosen.delete(pass);
        for (const pass of chosen) passByName(pass);
        passes = PASSES.filter(pass => chosen.has(pass.name)).map(pass => pass.name);
    }
    let last = -1;
    for (const name of passes) {
        const pass = passByName(name);
        if (pass.order <= last) throw new TypeError("RV32 passes run in pipeline order: " + PASSES.map(p => p.name).join(", "));
        last = pass.order;
        for (const need of pass.needs ?? []) if (!passes.includes(need))
            throw new TypeError("RV32 pass " + name + " needs " + need);
    }
    for (const key in resolved.select || {}) if (PASSES.some(pass => pass.name === key))
        throw new TypeError("select." + key + " is the RV32 pass \"" + key + "\"; name it in passes or enable");
    if (resolved.operandLocations?.split !== undefined)
        throw new TypeError("operandLocations.split is the RV32 pass \"split\"; name it in passes or enable");
    if (resolved.inline !== undefined && (typeof resolved.inline !== "object" || resolved.inline === null))
        throw new TypeError("inline holds the inliner's limits; the RV32 pass \"inline\" is named in passes or enable");
    resolved.passes = passes;
    return resolved;
}

// rv32/compile.js
// compile: the front end's functions, one at a time, through the policy's pipeline to RV32 words, then the
// image's layout and relocations.

// Per function, the stages before the emitter run in this order: the policy's passes in registry order, with
// three stages that are not tape passes after inline: the guarded-return summary (inlineGuardedReturns), the
// PIE lowering (pieLoops, which may take the whole function) and the "inline" checkpoint, where observeTape
// sees the tape that enters the other passes. Then lowerLeaf, or planLocations and FunctionCode; then each
// pass's finish.
function compile(source, imports = [], maxSourceLength, requested) {
    const options = resolveOptions(requested);
    loadPasses(options.passes);
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
    const guarded = options?.inlineGuardedReturns;
    if (guarded !== undefined && typeof guarded !== "boolean" && typeof guarded !== "function")
        throw new TypeError("expected a boolean or caller selector for inlineGuardedReturns");
    const mode = options?.pieLoops;
    if (mode !== undefined) {
        if (mode !== "scalar" && mode !== "pie" && mode !== "pie-empty" && typeof mode !== "function") throw new TypeError("unknown PIE loop compilation mode");
        if (!globalThis.typedPieLoops) throw new Error("load typed-pie-loops.js for PIE loop compilation");
    }
    const passes = new Set(options.passes);
    const chosen = PASSES.filter(pass => passes.has(pass.name));
    const unit = {options, callables, targets, arity: index => callables[index].params.length,
        storeless: storelessAnalysis(callables, imported.length)};
    for (const pass of chosen) pass.setup?.(unit);
    const starts = chosen.filter(pass => pass.start);
    const finishes = chosen.filter(pass => pass.finish);
    const stages = chosen.filter(pass => pass.run);
    const inlined = stages[0]?.name === "inline" ? [stages.shift()] : [];
    if (guarded) inlined.push({name: "guarded", run(fn, ctx) {
        // Only our internal definition targets can acquire summaries. A forward call
        // uses the ordinary ABI in both streaming and buffered compilation.
        const summary = guardedReturnSummary(fn);
        if (summary) targets[ctx.index].guardedReturn = summary;
        if (guarded === true || guarded(fn.name)) ctx.Emitter = GuardedReturnCode;
    }});
    if (mode !== undefined) inlined.push({name: "pie", terminal: true,
        run: (fn, ctx) => typedPieLoops.lower(fn, callables, targets, mode, ctx.Emitter, instruction)});
    stages.unshift(...inlined, {name: "inline", checkpoint: true});

    // timing: an array that receives {fn, pass, ms, cells} for every stage a function runs (cells: the
    // tape's length after it), plus one {fn: null, pass: "compile", ms} row for the whole call. The
    // clock is options.clock, performance.now or Date.now; it is read only when timing is given.
    const timing = options?.timing;
    const clock = options?.clock ?? (globalThis.performance ? () => performance.now() : Date.now);
    function time(fn, pass, run) {
        if (!timing) return run();
        const start = clock();
        const result = run();
        timing.push({fn: fn.name, pass, ms: clock() - start, cells: fn.code ? fn.code.length : 0});
        return result;
    }
    function lower(fn) {
        const index = imported.length + code.length;
        const ctx = Object.assign(Object.create(unit), {passes, index, Emitter: FunctionCode, origin: local => local});
        for (const pass of starts) time(fn, pass.startName ?? pass.name, () => pass.start(fn, ctx));
        if (inspect && (inspect.function === undefined || inspect.function === fn.name))
            fn.nativeInspection = {leafDecision: "eligible for frameless lowering"};
        // observeTape(name, phase, code, nlocals): a read-only view of the tape after each transform, for
        // tools (the trace-REPL workbench). It sees a copy and cannot change the output.
        const observe = phase => options?.observeTape?.(fn.name, phase, fn.code.slice(), fn.nlocals);
        for (const stage of stages) {
            if (stage.checkpoint) {
                observe(stage.name);
                continue;
            }
            const lowered = time(fn, stage.name, () => stage.run(fn, ctx));
            if (stage.terminal && lowered) {
                code.push(lowered);
                if (fn.literals) fn.literals = null;
                return;
            }
            if (stage.kind === "transform" && stage.observe !== false) observe(stage.name);
        }
        const {Emitter, facts} = ctx;
        let compiled = time(fn, "leaf", () => lowerLeaf(fn, callables, targets, options?.select, facts));
        if (!compiled) {
            const plan = options?.operandLocations ? time(fn, "plan", () => planLocations(fn, {...options.operandLocations, select: options.select},
                index => Emitter === GuardedReturnCode && targets[index]?.guardedReturn)) : undefined;
            // observePlan(name, plan): a read-only view of the operand-location plan, for tools.
            if (plan) options?.observePlan?.(fn.name, plan);
            const emit = longBranches => {
                const emitter = new Emitter(fn, callables, targets);
                emitter.select = options?.select;
                emitter.versioned = passes.has("version");
                emitter.facts = facts;
                emitter.longBranches = longBranches;
                if (plan !== undefined) emitter.locations = plan;
                return emitter.lower();
            };
            compiled = time(fn, "emit", () => {
                try {
                    return emit(false);
                } catch (error) {
                    if (error !== SHORT_BRANCH_RANGE) throw error;
                    return emit(true);
                }
            });
        }
        for (const pass of finishes) time(fn, pass.finishName ?? pass.name, () => pass.finish(fn, ctx));
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

    const started = timing ? clock() : 0;
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
    if (timing) timing.push({fn: null, pass: "compile", ms: clock() - started, cells: 0});
    return {image, entries, records: typedWasm.recordLayouts(records), enums: typedWasm.enumLayouts(enums),
        distinct: [...distinct], relocations, importCount: imports.length,
        signatures: functions.map(({name, params, result}) => ({name, params, result})),
        ...(asyncLayout && {asyncLayout}), ...(asyncSource && {asyncSource})};
}

// rv32/link.js
// linkSlot: place a compiled program in a native world's reactor.

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

// rv32/index.js
// The core bundle's entry (typed-rv32.js): publishes globalThis.typedRv32. The pass groups are separate
// bundles (passes/registry.js, GROUPS) that install their passes when they load.

globalThis.typedRv32 = {compile, linkSlot, policies: POLICIES,
    passes: PASSES.map(({name, group, kind, needs}) => ({name, group, kind, needs: needs ?? [], file: GROUPS[group]}))};

// The names the pass-group bundles import from this one.
globalThis.typedRv32Modules = {BLOCK, BR, BR_IF, CALL, CELLS, CHECKED_ADDRESS, DROP, ELSE, END, I32, I32_ADD, I32_CONST, I32_DIV_S, I32_EQ, I32_EQZ, I32_GE_S, I32_GE_U, I32_GT_S, I32_LE_S, I32_LOAD, I32_LOAD16_U, I32_LT_S, I32_MUL, I32_NE, I32_REM_S, I32_SHL, I32_SHR_S, I32_STORE, I32_STORE16, I32_SUB, IF, LITERAL_STORES, LOCAL_GET, LOCAL_SET, LOOP, RETURN, UNCHECKED_ADDRESS, UNREACHABLE, VOID, installPasses, opClose, opNext, replaceTape};
})();
