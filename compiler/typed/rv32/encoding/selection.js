// Instruction-selection tables: ALU operations, fused predicates, immediate forms, constantForm.
import {I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_SHL, I32_SHR_S, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, IF, BR_IF} from "./tape.js";

export const ALU = new Map([
    [I32_ADD,[0,0]], [I32_SUB,[0,0x20]], [I32_MUL,[0,1]], [I32_DIV_S,[4,1]], [I32_REM_S,[6,1]],
    [I32_SHL,[1,0]], [I32_SHR_S,[5,0x20]],
]);

// select.branches: the branch funct3 taken when the predicate holds, and whether the
// instruction's operands are reversed. From PICOCALC-RV32-BRANCH 02-predicate-fusion.patch.
export const PREDICATES = new Map([
    [I32_EQZ,[0,false]], // eqz (right operand is zero)
    [I32_EQ,[0,false]], // eq
    [I32_NE,[1,false]], // ne
    [I32_LT_S,[4,false]], // lt_s
    [I32_GT_S,[4,true]],  // gt_s
    [I32_LE_S,[5,true]],  // le_s
    [I32_GE_S,[5,false]], // ge_s
    [I32_GE_U,[7,false]], // ge_u
]);

export const fitsImmediate = n => n >= -2048 && n <= 2047;
export const powerOfTwo = n => n > 0 && (n & (n - 1)) === 0 ? 31 - Math.clz32(n) : -1;

// select.immediates: an operation whose right operand is a literal, as I-type instructions.
// Each entry returns [funct3, immediate] pairs, applied in order to the result register; the
// first reads the left operand. null keeps the register form.
export const IMMEDIATE_FORMS = new Map([
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
export function constantForm(tape, at, s) {
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

