// The tape's opcodes, block types, effects and walkers (compiler/typed/tape.js, loaded first).
const {UNREACHABLE, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, CALL, DROP, LOCAL_GET, LOCAL_SET,
    I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S,
    I32_LE_S, I32_GE_S, I32_GE_U, I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_SHL, I32_SHR_S,
    CHECKED_ADDRESS, LITERAL_STORES, UNCHECKED_ADDRESS, I32, VOID, STORES,
    cells: CELLS, effects: EFFECTS, next: opNext, close: opClose} = typedTape;

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
    const consumer = tape[at + 2] === I32_EQZ ? tape[at + 3] : tape[at + 2];
    if (s?.branches && PREDICATES.has(next) && (consumer === IF || consumer === BR_IF))
        return s.immediates && c === 0 ? "zero" : "register";
    if (s?.divisions && (next === I32_DIV_S || next === I32_REM_S) && (c >= 3 || powerOfTwo(c) > 0) &&
        !(next === I32_REM_S && powerOfTwo(c) < 0)) return "divide";
    if (!s?.immediates) return "register";
    if (c === 0) return "zero";
    return IMMEDIATE_FORMS.get(next)?.(c) ? "immediate" : "register";
}

