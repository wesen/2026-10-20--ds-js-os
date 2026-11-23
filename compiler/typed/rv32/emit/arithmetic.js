// FunctionCode's binary operations, constant selection and division by constants.
import {divisionMagic} from "../encoding/division.js";
import {T6, T5, instruction, ZERO, A0} from "../encoding/registers.js";
import {ALU, constantForm, IMMEDIATE_FORMS, powerOfTwo, fitsImmediate} from "../encoding/selection.js";
import {I32_DIV_S, I32_REM_S, I32_EQ, I32_NE, I32_GE_U, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_LT_U, I32_GT_U, I32_LE_U,
    I32_DIV_U, I32_REM_U} from "../encoding/tape.js";

export class ArithmeticMethods {
    binary(op) {
        const b = this.pop(T6);
        const a = this.pop(T5);
        const stored = this.destination();
        const out = stored ?? this.resultRegister();
        const alu = ALU.get(op);
        if (alu) {
            if (op === I32_DIV_S || op === I32_REM_S || op === I32_DIV_U || op === I32_REM_U) {
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
            const unsigned = op === I32_GE_U || op === I32_LT_U || op === I32_GT_U || op === I32_LE_U;
            if (![I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, I32_LT_U, I32_GT_U, I32_LE_U].includes(op))
                throw new SyntaxError("unsupported RV32 operator " + op);
            // slt or sltu; a > b is b < a; a <= b and a >= b negate b < a and a < b.
            const swap = op === I32_GT_S || op === I32_LE_S || op === I32_GT_U || op === I32_LE_U;
            this.emit(instruction.r(0x33, out, unsigned ? 3 : 2, swap ? b : a, swap ? a : b));
            if (op === I32_LE_S || op === I32_GE_S || op === I32_GE_U || op === I32_LE_U)
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
