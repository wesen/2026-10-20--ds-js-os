// RV32 registers, their classes and the six integer instruction formats. A register is a number: x_n is n, f_n is
// 32 + n, so reg >> 5 is its class and integer code keeps its numbers. The formats below must not get an f register.
export const X = 0, F = 1;
export const ZERO = 0, RA = 1, SP = 2, S0 = 8, A0 = 10, T5 = 30, T6 = 31;
export const F0 = 32, FA0 = 42, FT10 = 62, FT11 = 63;
export const STACK_REGISTERS = [5, 6, 7, 28, 29]; // t0–t4
export const classOf = reg => reg >> 5;

// ilp32f per class: arguments (the first returns), callee-saved, homes the planner may claim (not s0), the
// emitter's operand-stack and scratch registers, and (f only) the temporaries a function that calls nothing may claim
// as homes at no cost (ft8, ft9).
const range = (from, to) => Array.from({length: to - from + 1}, (_, i) => from + i);
export const REGISTER_CLASSES = [
    {id: X, name: "x", arguments: range(10, 17), saved: [8, 9, ...range(18, 27)], homes: [9, ...range(18, 27)],
        temporaries: [5, 6, 7, 28, 29, 30, 31], stack: STACK_REGISTERS, scratch: [T5, T6]},
    {id: F, name: "f", arguments: range(42, 49), saved: [40, 41, ...range(50, 59)], homes: [40, 41, ...range(50, 59)],
        temporaries: [...range(32, 39), ...range(60, 63)], stack: range(32, 39), scratch: [62, 63], leafHomes: [60, 61]},
];

// f32 values live in f registers, every other Typed type in x registers.
export const typeClass = type => type === "f32" ? F : X;

// The emitter's operand stack per class: depth d is x STACK_REGISTERS[d] (t0-t4) or f F_STACK[d] (ft0-ft7), and
// both classes share the spill slot of depth d. An operand beyond its class's registers lives in its slot.
export const F_STACK = REGISTER_CLASSES[F].stack;
export const OPERAND_STACKS = [STACK_REGISTERS, F_STACK];

// A callee-saved register (of either class) that the planner may claim as a home.
export const isSavedRegister = reg => reg === 9 || (reg >= 18 && reg <= 27) || reg === 40 || reg === 41 || (reg >= 50 && reg <= 59);

// Each parameter's incoming location, as ilp32f passes it: integers take a0-a7 and f32 fa0-fa7, each class in order; an
// f32 beyond fa7 takes the next free integer register (its bits); a parameter with no register left takes the next
// stack word k, at the caller's sp + 4k, written here as -1 - k. out.stack is the number of stack words.
export function argumentRegisters(types) {
    const out = new Array(types.length);
    let x = 0, f = 0, k = 0;
    for (let i = 0; i < types.length; i++) {
        if (types[i] === "f32" && f < 8) out[i] = FA0 + f++;
        else if (x < 8) out[i] = A0 + x++;
        else out[i] = -1 - k++;
    }
    out.stack = k;
    return out;
}

// argumentRegisters of a descriptor, cached on it (fn.registers): every call site asks for its callee's.
export const calleeRegisters = fn => fn.registers ??= argumentRegisters(fn.params);

// Where a record result's leaves return (fn.results, PICOCALC-TYPED-VALUES): the integers in a0-a7 and the f32 in
// fa0-fa7, each class in order, as the arguments arrive; a leaf beyond its class's eight takes the next stack word k
// (-1 - k), at the caller's sp + 4k, which the callee writes before it returns. out.stack counts them.
export function resultLocations(types) {
    const out = new Array(types.length);
    let x = 0, f = 0, k = 0;
    for (let i = 0; i < types.length; i++) {
        if (types[i] === "f32") out[i] = f < 8 ? FA0 + f++ : -1 - k++;
        else out[i] = x < 8 ? A0 + x++ : -1 - k++;
    }
    out.stack = k;
    return out;
}

// resultLocations of a descriptor with a record result, cached on it (fn.returns); null for one result.
export const calleeResults = fn => fn.results ? fn.returns ??= resultLocations(fn.results) : null;

// The stack words a call of fn needs at the caller's sp: its stack parameters, or its stack results if more.
export const stackWords = fn => Math.max(calleeRegisters(fn).stack, calleeResults(fn)?.stack ?? 0);

// Whether parameter p of fn arrives in a register of its own class (not on the stack, not an f32 in an x register):
// only such a parameter may stay in its incoming register or feed the prologue's capacity and pointer homes.
export const inOwnRegister = (fn, p) => {
    const reg = calleeRegisters(fn)[p];
    return reg >= 0 && reg >> 5 === typeClass(fn.params[p]);
};

export const instruction = {
    r: (op, rd, f3, a, b, f7 = 0) => (f7 << 25) | (b << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    i: (op, rd, f3, a, imm) => (imm << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    s: (f3, a, b, imm) => ((imm >> 5) << 25) | (b << 20) | (a << 15) | (f3 << 12) | ((imm & 31) << 7) | 0x23,
    b: (f3, a, b, imm) => ((imm & 0x1000) << 19) | ((imm & 0x7e0) << 20) | (b << 20) |
        (a << 15) | (f3 << 12) | ((imm & 0x1e) << 7) | ((imm & 0x800) >> 4) | 0x63,
    j: (rd, imm) => ((imm & 0x100000) << 11) | ((imm & 0x7fe) << 20) | ((imm & 0x800) << 9) |
        (imm & 0xff000) | (rd << 7) | 0x6f,
};
