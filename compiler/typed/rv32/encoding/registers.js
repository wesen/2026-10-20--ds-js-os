// RV32 registers, their classes and the six base instruction formats.
//
// A register is a number: 0-31 are the integer registers x0-x31, 32-63 the float registers f0-f31 (f_n is
// 32 + n). The class is reg >> 5 (X or F) and the field value reg & 31. Integer code is therefore unchanged:
// every integer register keeps its plain number, and only the float encoders mask (encoding/instructions.js).
// The integer formats below take field values as they are, so they must never see a float register.
export const X = 0, F = 1;
export const ZERO = 0, RA = 1, SP = 2, A0 = 10, T5 = 30, T6 = 31;
export const F0 = 32, FA0 = 42;
export const STACK_REGISTERS = [5, 6, 7, 28, 29]; // t0–t4
export const classOf = reg => reg >> 5;

// The register names GNU as accepts (ABI names), by register number.
export const REGISTER_NAMES = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1",
    "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11",
    "t3", "t4", "t5", "t6",
    "ft0", "ft1", "ft2", "ft3", "ft4", "ft5", "ft6", "ft7", "fs0", "fs1",
    "fa0", "fa1", "fa2", "fa3", "fa4", "fa5", "fa6", "fa7", "fs2", "fs3", "fs4", "fs5", "fs6", "fs7", "fs8", "fs9",
    "fs10", "fs11", "ft8", "ft9", "ft10", "ft11"];

// The ilp32f calling convention, one table per class. arguments: in order (the first also returns the
// result); saved: callee-saved; homes: the callee-saved registers the planner may claim (s0 stays free as a
// possible frame pointer; every fs register may be claimed); stack: the emitter's operand-stack registers;
// scratch: registers the emitter clobbers freely.
const range = (from, to) => Array.from({length: to - from + 1}, (_, i) => from + i);
export const REGISTER_CLASSES = [
    {id: X, name: "x", arguments: range(10, 17), saved: [8, 9, ...range(18, 27)], homes: [9, ...range(18, 27)],
        temporaries: [5, 6, 7, 28, 29, 30, 31], stack: STACK_REGISTERS, scratch: [T5, T6]},
    {id: F, name: "f", arguments: range(42, 49), saved: [40, 41, ...range(50, 59)], homes: [40, 41, ...range(50, 59)],
        temporaries: [...range(32, 39), ...range(60, 63)], stack: range(32, 36), scratch: [62, 63]},
];

// A Typed value type's register class: f32 lives in float registers, everything else (i32, bool, enums,
// records and buffers as addresses) in integer registers.
export const typeClass = type => type === "f32" ? F : X;

// A callee-saved register (of either class) that the planner may claim as a home.
export const isSavedRegister = reg => reg === 9 || (reg >= 18 && reg <= 27) || reg === 40 || reg === 41 || (reg >= 50 && reg <= 59);

// The incoming register of each parameter under ilp32f: the integer parameters take a0-a7 in order and the
// f32 parameters fa0-fa7, independently. More than eight of one class is outside the register convention.
export function argumentRegisters(types) {
    const out = new Array(types.length);
    let x = 0, f = 0;
    for (let i = 0; i < types.length; i++) {
        if (types[i] === "f32") out[i] = FA0 + f++;
        else out[i] = A0 + x++;
    }
    if (x > 8 || f > 8) throw new SyntaxError("RV32 supports up to eight register arguments");
    return out;
}

// argumentRegisters of a function descriptor's parameters, kept on the descriptor (fn.registers): a call site
// asks for its callee's on every call.
export const calleeRegisters = fn => fn.registers ??= argumentRegisters(fn.params);

export const instruction = {
    r: (op, rd, f3, a, b, f7 = 0) => (f7 << 25) | (b << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    i: (op, rd, f3, a, imm) => (imm << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    s: (f3, a, b, imm) => ((imm >> 5) << 25) | (b << 20) | (a << 15) | (f3 << 12) | ((imm & 31) << 7) | 0x23,
    b: (f3, a, b, imm) => ((imm & 0x1000) << 19) | ((imm & 0x7e0) << 20) | (b << 20) |
        (a << 15) | (f3 << 12) | ((imm & 0x1e) << 7) | ((imm & 0x800) >> 4) | 0x63,
    j: (rd, imm) => ((imm & 0x100000) << 11) | ((imm & 0x7fe) << 20) | ((imm & 0x800) << 9) |
        (imm & 0xff000) | (rd << 7) | 0x6f,
};
