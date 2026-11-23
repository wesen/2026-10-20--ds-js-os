// RV32 registers, their classes and the six integer instruction formats. A register is a number: x_n is n, f_n is
// 32 + n, so reg >> 5 is its class and integer code keeps its numbers. The formats below must not get an f register.
export const X = 0, F = 1;
export const ZERO = 0, RA = 1, SP = 2, A0 = 10, T5 = 30, T6 = 31;
export const F0 = 32, FA0 = 42, FT10 = 62, FT11 = 63;
export const STACK_REGISTERS = [5, 6, 7, 28, 29]; // t0–t4
export const classOf = reg => reg >> 5;

// ilp32f per class: arguments (the first returns), callee-saved, homes the planner may claim (not s0), the
// emitter's operand-stack and scratch registers.
const range = (from, to) => Array.from({length: to - from + 1}, (_, i) => from + i);
export const REGISTER_CLASSES = [
    {id: X, name: "x", arguments: range(10, 17), saved: [8, 9, ...range(18, 27)], homes: [9, ...range(18, 27)],
        temporaries: [5, 6, 7, 28, 29, 30, 31], stack: STACK_REGISTERS, scratch: [T5, T6]},
    {id: F, name: "f", arguments: range(42, 49), saved: [40, 41, ...range(50, 59)], homes: [40, 41, ...range(50, 59)],
        temporaries: [...range(32, 39), ...range(60, 63)], stack: range(32, 36), scratch: [62, 63]},
];

// f32 values live in f registers, every other Typed type in x registers.
export const typeClass = type => type === "f32" ? F : X;

// The emitter's operand stack per class: depth d is x STACK_REGISTERS[d] (t0-t4) or f F_STACK[d] (ft0-ft4), and
// both classes share the spill slot of depth d. An operand beyond the registers lives in its slot.
export const F_STACK = [32, 33, 34, 35, 36];
export const OPERAND_STACKS = [STACK_REGISTERS, F_STACK];

// A callee-saved register (of either class) that the planner may claim as a home.
export const isSavedRegister = reg => reg === 9 || (reg >= 18 && reg <= 27) || reg === 40 || reg === 41 || (reg >= 50 && reg <= 59);

// Each parameter's incoming register: integers take a0-a7, f32 fa0-fa7, each class in order.
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

// argumentRegisters of a descriptor, cached on it (fn.registers): every call site asks for its callee's.
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
