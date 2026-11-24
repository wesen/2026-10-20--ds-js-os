// Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.
// The RV32 backend's core: encoding, the emitters, the planner, the pass registry, policies, compile, linkSlot.
// This code executes in the host tools and can execute in a bare QuickJS realm.
(() => {
"use strict";

// rv32/encoding/registers.js
// RV32 registers, their classes and the six integer instruction formats. A register is a number: x_n is n, f_n is
// 32 + n, so reg >> 5 is its class and integer code keeps its numbers. The formats below must not get an f register.
const X = 0, F = 1;
const ZERO = 0, RA = 1, SP = 2, S0 = 8, A0 = 10, T5 = 30, T6 = 31;
const F0 = 32, FA0 = 42, FT10 = 62, FT11 = 63;
const STACK_REGISTERS = [5, 6, 7, 28, 29]; // t0–t4
const classOf = reg => reg >> 5;

// ilp32f per class: arguments (the first returns), callee-saved, homes the planner may claim (not s0), the
// emitter's operand-stack and scratch registers, and (f only) the temporaries a function that calls nothing may claim
// as homes at no cost (ft8, ft9).
const range = (from, to) => Array.from({length: to - from + 1}, (_, i) => from + i);
const REGISTER_CLASSES = [
    {id: X, name: "x", arguments: range(10, 17), saved: [8, 9, ...range(18, 27)], homes: [9, ...range(18, 27)],
        temporaries: [5, 6, 7, 28, 29, 30, 31], stack: STACK_REGISTERS, scratch: [T5, T6]},
    {id: F, name: "f", arguments: range(42, 49), saved: [40, 41, ...range(50, 59)], homes: [40, 41, ...range(50, 59)],
        temporaries: [...range(32, 39), ...range(60, 63)], stack: range(32, 39), scratch: [62, 63], leafHomes: [60, 61]},
];

// f32 values live in f registers, every other Typed type in x registers.
const typeClass = type => type === "f32" ? F : X;

// The emitter's operand stack per class: depth d is x STACK_REGISTERS[d] (t0-t4) or f F_STACK[d] (ft0-ft7), and
// both classes share the spill slot of depth d. An operand beyond its class's registers lives in its slot.
const F_STACK = REGISTER_CLASSES[F].stack;
const OPERAND_STACKS = [STACK_REGISTERS, F_STACK];

// A callee-saved register (of either class) that the planner may claim as a home.
const isSavedRegister = reg => reg === 9 || (reg >= 18 && reg <= 27) || reg === 40 || reg === 41 || (reg >= 50 && reg <= 59);

// Each parameter's incoming location, as ilp32f passes it: integers take a0-a7 and f32 fa0-fa7, each class in order; an
// f32 beyond fa7 takes the next free integer register (its bits); a parameter with no register left takes the next
// stack word k, at the caller's sp + 4k, written here as -1 - k. out.stack is the number of stack words.
function argumentRegisters(types) {
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
const calleeRegisters = fn => fn.registers ??= argumentRegisters(fn.params);

// Where a record result's leaves return (fn.results, PICOCALC-TYPED-VALUES): the integers in a0-a7 and the f32 in
// fa0-fa7, each class in order, as the arguments arrive; a leaf beyond its class's eight takes the next stack word k
// (-1 - k), at the caller's sp + 4k, which the callee writes before it returns. out.stack counts them.
function resultLocations(types) {
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
const calleeResults = fn => fn.results ? fn.returns ??= resultLocations(fn.results) : null;

// The stack words a call of fn needs at the caller's sp: its stack parameters, or its stack results if more.
const stackWords = fn => Math.max(calleeRegisters(fn).stack, calleeResults(fn)?.stack ?? 0);

// Whether parameter p of fn arrives in a register of its own class (not on the stack, not an f32 in an x register):
// only such a parameter may stay in its incoming register or feed the prologue's capacity and pointer homes.
const inOwnRegister = (fn, p) => {
    const reg = calleeRegisters(fn)[p];
    return reg >= 0 && reg >> 5 === typeClass(fn.params[p]);
};

const instruction = {
    r: (op, rd, f3, a, b, f7 = 0) => (f7 << 25) | (b << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    i: (op, rd, f3, a, imm) => (imm << 20) | (a << 15) | (f3 << 12) | (rd << 7) | op,
    s: (f3, a, b, imm) => ((imm >> 5) << 25) | (b << 20) | (a << 15) | (f3 << 12) | ((imm & 31) << 7) | 0x23,
    b: (f3, a, b, imm) => ((imm & 0x1000) << 19) | ((imm & 0x7e0) << 20) | (b << 20) |
        (a << 15) | (f3 << 12) | ((imm & 0x1e) << 7) | ((imm & 0x800) >> 4) | 0x63,
    j: (rd, imm) => ((imm & 0x100000) << 11) | ((imm & 0x7fe) << 20) | ((imm & 0x800) << 9) |
        (imm & 0xff000) | (rd << 7) | 0x6f,
};

// rv32/encoding/instructions.js
// The instruction table: RV32IM, Zicsr, RV32F and the PIE words of typed-pie-loops.js, one row each, and encoder(),
// an encoder per row. A row is [mnemonic, fixed bits, assembler operands]; the operands' fields give the bits and
// the encoder's arguments in order: encoder("lw")(rd, offset, base) for "xd, i12(x1)". Keys replace "." by "_".
// Registers are numbers of registers.js (f_n = 32 + n); an encoder throws on the other class. An omitted rm is 7
// (dynamic), as GNU as assembles it. tests/compiler/typed-rv32-encoding.test.mjs checks every row against GNU as;
// encoding/assembly.js (not bundled) writes a row's assembler text. QuickJS keeps every function's source, so the
// comments here are short.

const CSR = {fflags: 1, frm: 2, fcsr: 3};

function wrongClass(field, r) { return new TypeError("RV32 " + field + " operand is not " + (field[0] === "f" ? "a float" : "an integer") + " register: " + r); }
const xField = (field, shift) => r => { if (r >>> 5) throw wrongClass(field, r); return r << shift; };
const fField = (field, shift) => r => { if (r >> 5 !== 1) throw wrongClass(field, r); return (r & 31) << shift; };
// PIE address registers: a 4-bit index of x8-x15 (0-7) and x24-x31 (8-15).
const espField = (field, shift) => r => {
    if (!(r & 8) || r >>> 5) throw new TypeError("RV32 " + field + " operand is not a PIE address register: " + r);
    return ((r & 7) | ((r >> 1) & 8)) << shift;
};
// A PIE post-increment: imm / scale as a signed 8-bit value, bit 0 at 9, bits 1-4 at 20-23, bits 5-7 at 28-30.
const espStep = scale => imm => { const k = imm / scale; return ((k & 1) << 9) | (((k >> 1) & 15) << 20) | (((k >> 5) & 7) << 28); };

// Fields: x/f + d, 1, 2, 3 (rd, rs1, rs2, rs3); PIE: qu/qv/qx/qy/qm the q register of each form, er/ed an
// address register at bit 15/7, e2/e16 a post-increment.
const INSTRUCTION_FIELDS = {
    xd: xField("xd", 7), x1: xField("x1", 15), x2: xField("x2", 20),
    fd: fField("fd", 7), f1: fField("f1", 15), f2: fField("f2", 20), f3: fField("f3", 27),
    rm: rm => (rm === undefined ? 7 : rm) << 12,
    i12: imm => imm << 20,
    sh: n => (n & 31) << 20,
    s12: imm => ((imm >> 5) << 25) | ((imm & 31) << 7),
    b13: imm => ((imm & 0x1000) << 19) | ((imm & 0x7e0) << 20) | ((imm & 0x1e) << 7) | ((imm & 0x800) >> 4),
    u20: imm => imm << 12,
    j21: imm => ((imm & 0x100000) << 11) | ((imm & 0x7fe) << 20) | ((imm & 0x800) << 9) | (imm & 0xff000),
    csr: n => n << 20,
    z5: n => (n & 31) << 15,
    qu: q => q << 10, qv: q => q << 20, qx: q => q << 29, qy: q => q << 26,
    qm: q => ((q & 1) << 24) | (((q >> 1) & 1) << 25) | (((q >> 2) & 1) << 19),
    er: espField("er", 15), ed: espField("ed", 7),
    e2: espStep(2), e16: espStep(16),
};

const R = "xd, x1, x2", I = "xd, x1, i12", LOAD = "xd, i12(x1)", STORE = "x2, s12(x1)", BRANCH = "x1, x2, b13";
const INSTRUCTION_ROWS = [
    // RV32I
    ["lui", 0x37, "xd, u20"], ["auipc", 0x17, "xd, u20"], ["jal", 0x6f, "xd, j21"], ["jalr", 0x67, LOAD],
    ["beq", 0x63, BRANCH], ["bne", 0x1063, BRANCH], ["blt", 0x4063, BRANCH], ["bge", 0x5063, BRANCH],
    ["bltu", 0x6063, BRANCH], ["bgeu", 0x7063, BRANCH],
    ["lb", 0x03, LOAD], ["lh", 0x1003, LOAD], ["lw", 0x2003, LOAD], ["lbu", 0x4003, LOAD], ["lhu", 0x5003, LOAD],
    ["sb", 0x23, STORE], ["sh", 0x1023, STORE], ["sw", 0x2023, STORE],
    ["addi", 0x13, I], ["slti", 0x2013, I], ["sltiu", 0x3013, I], ["xori", 0x4013, I], ["ori", 0x6013, I],
    ["andi", 0x7013, I],
    ["slli", 0x1013, "xd, x1, sh"], ["srli", 0x5013, "xd, x1, sh"], ["srai", 0x40005013, "xd, x1, sh"],
    ["add", 0x33, R], ["sub", 0x40000033, R], ["sll", 0x1033, R], ["slt", 0x2033, R], ["sltu", 0x3033, R],
    ["xor", 0x4033, R], ["srl", 0x5033, R], ["sra", 0x40005033, R], ["or", 0x6033, R], ["and", 0x7033, R],
    ["fence", 0x0ff0000f, ""], ["ecall", 0x73, ""], ["ebreak", 0x00100073, ""],
    // RV32M
    ["mul", 0x02000033, R], ["mulh", 0x02001033, R], ["mulhsu", 0x02002033, R], ["mulhu", 0x02003033, R],
    ["div", 0x02004033, R], ["divu", 0x02005033, R], ["rem", 0x02006033, R], ["remu", 0x02007033, R],
    // Zicsr
    ["csrrw", 0x1073, "xd, csr, x1"], ["csrrs", 0x2073, "xd, csr, x1"], ["csrrc", 0x3073, "xd, csr, x1"],
    ["csrrwi", 0x5073, "xd, csr, z5"], ["csrrsi", 0x6073, "xd, csr, z5"], ["csrrci", 0x7073, "xd, csr, z5"],
    // RV32F
    ["flw", 0x2007, "fd, i12(x1)"], ["fsw", 0x2027, "f2, s12(x1)"],
    ["fmadd.s", 0x43, "fd, f1, f2, f3, rm"], ["fmsub.s", 0x47, "fd, f1, f2, f3, rm"],
    ["fnmsub.s", 0x4b, "fd, f1, f2, f3, rm"], ["fnmadd.s", 0x4f, "fd, f1, f2, f3, rm"],
    ["fadd.s", 0x53, "fd, f1, f2, rm"], ["fsub.s", 0x08000053, "fd, f1, f2, rm"],
    ["fmul.s", 0x10000053, "fd, f1, f2, rm"], ["fdiv.s", 0x18000053, "fd, f1, f2, rm"],
    ["fsqrt.s", 0x58000053, "fd, f1, rm"],
    ["fsgnj.s", 0x20000053, "fd, f1, f2"], ["fsgnjn.s", 0x20001053, "fd, f1, f2"], ["fsgnjx.s", 0x20002053, "fd, f1, f2"],
    ["fmin.s", 0x28000053, "fd, f1, f2"], ["fmax.s", 0x28001053, "fd, f1, f2"],
    ["fcvt.w.s", 0xc0000053, "xd, f1, rm"], ["fcvt.wu.s", 0xc0100053, "xd, f1, rm"], ["fmv.x.w", 0xe0000053, "xd, f1"],
    ["feq.s", 0xa0002053, "xd, f1, f2"], ["flt.s", 0xa0001053, "xd, f1, f2"], ["fle.s", 0xa0000053, "xd, f1, f2"],
    ["fclass.s", 0xe0001053, "xd, f1"],
    ["fcvt.s.w", 0xd0000053, "fd, x1, rm"], ["fcvt.s.wu", 0xd0100053, "fd, x1, rm"], ["fmv.w.x", 0xf0000053, "fd, x1"],
    // Espressif PIE (the ESP32-P4's vector extension), the forms the PIE loop pass emits
    ["esp.vldbc.16.ip", 0x8600203b, "qu, er, e2"], ["esp.vld.128.ip", 0x0200203b, "qu, er, e16"],
    ["esp.vst.128.ip", 0x8200203b, "qu, er, e16"], ["esp.vsub.s16", 0x028406df, "qv, qx, qy"],
    ["esp.min.u16.a", 0x9090505b, "qm, ed"],
];

const instructionKey = mnemonic => mnemonic.replaceAll(".", "_");
const instructionFields = operands => operands.match(/[a-z]+\d*/g) ?? [];

function makeEncoder(match, fields) {
    const [a, b, c, d, e] = fields.map(name => INSTRUCTION_FIELDS[name]);
    switch (fields.length) {
    case 0: return () => match >>> 0;
    case 1: return p => (match | a(p)) >>> 0;
    case 2: return (p, q) => (match | a(p) | b(q)) >>> 0;
    case 3: return (p, q, r) => (match | a(p) | b(q) | c(r)) >>> 0;
    case 4: return (p, q, r, s) => (match | a(p) | b(q) | c(r) | d(s)) >>> 0;
    default: return (p, q, r, s, t) => (match | a(p) | b(q) | c(r) | d(s) | e(t)) >>> 0;
    }
}
// encoder(key): a row's encoder, made on first use and kept (all 85 at load cost QuickJS 35 KB).
const ENCODERS = Object.create(null);
function encoder(key) {
    const known = ENCODERS[key];
    if (known) return known;
    const row = INSTRUCTION_ROWS.find(([mnemonic]) => instructionKey(mnemonic) === key);
    if (!row) throw new TypeError("no RV32 instruction " + key);
    return ENCODERS[key] = makeEncoder(row[1], instructionFields(row[2]));
}

// Class-aware move, load and store of one word; the integer forms through the formats of registers.js.
function moveWord(to, from) {
    if (to < 32) return from < 32 ? instruction.i(0x13, to, 0, from, 0) >>> 0 : encoder("fmv_x_w")(to, from);
    return from < 32 ? encoder("fmv_w_x")(to, from) : encoder("fsgnj_s")(to, from, from);
}
const loadWord = (reg, offset, base) => reg < 32 ? instruction.i(0x03, reg, 2, base, offset) >>> 0 : encoder("flw")(reg, offset, base);
const storeWord = (reg, offset, base) => reg < 32 ? instruction.s(2, base, reg, offset) >>> 0 : encoder("fsw")(reg, offset, base);

// rv32/encoding/tape.js
// The tape's opcodes, block types, effects and walkers (compiler/typed/tape.js, loaded first).
const {UNREACHABLE, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, RETURN, CALL, DROP, LOCAL_GET, LOCAL_SET,
    I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S,
    I32_LE_S, I32_GE_S, I32_GE_U, I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_AND, I32_OR, I32_XOR, I32_SHL, I32_SHR_S, I32_SHR_U,
    CHECKED_ADDRESS, LITERAL_STORES, UNCHECKED_ADDRESS, I32, F32, VOID, STORES,
    F32_LOAD, F32_STORE, F32_CONST, F32_EQ, F32_NE, F32_LT, F32_GT, F32_LE, F32_GE, F32_ABS, F32_NEG, F32_CEIL,
    F32_FLOOR, F32_TRUNC, F32_SQRT, F32_ADD, F32_SUB, F32_MUL, F32_DIV, F32_COPYSIGN, F32_CONVERT_I32_S,
    I32_REINTERPRET_F32, F32_REINTERPRET_I32, I32_TRUNC_F32, F32_MIN, F32_MAX,
    I32_LT_U, I32_GT_U, I32_LE_U, I32_DIV_U, I32_REM_U, F32_CONVERT_I32_U, U32_TRUNC_F32, ARRAY_ADDRESS, ARRAY_ZERO,
    cells: CELLS, effects: EFFECTS, next: opNext, close: opClose, row: tapeRow} = typedTape;
// The f32 operations (a row that pops or pushes an f32): passes with an abstract operand stack take their pops and
// pushes from the row (tapeRow(op).pop.length, .push.length).
const FLOATING = new Uint8Array(256);
for (const row of typedTape.rows) if (row.pop && [...row.pop, ...row.push].includes(F32)) FLOATING[row.code] = 1;

// rv32/emit/stack.js
// FunctionCode's operand stack: loads, stores, constants, result destinations, spills.

// A large frame's second base: s0 = sp + LARGE_BASE reaches the slots at LARGE_BASE and above (function-code.js).
const LARGE_BASE = 2032;

class StackMethods {
    // A float register (32-63) loads and stores a word (flw, fsw); kind is the integer width (lw, lhu, sh...).
    load(reg, offset, base = SP, kind = 2) {
        if (base === SP) this.usesFrame = true;
        if (base === SP && offset >= LARGE_BASE && this.large) { base = S0; offset -= LARGE_BASE; }
        this.emit(reg < 32 ? instruction.i(0x03, reg, kind, base, offset) : loadWord(reg, offset, base));
    }

    store(reg, offset, base = SP, kind = 2) {
        if (base === SP) this.usesFrame = true;
        if (base === SP && offset >= LARGE_BASE && this.large) { base = S0; offset -= LARGE_BASE; }
        this.emit(reg < 32 ? instruction.s(kind, base, reg, offset) : storeWord(reg, offset, base));
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

    // Within a class mv or fmv.s; across classes fmv.x.w or fmv.w.x (the bits unchanged).
    move(to, from) {
        if (to !== from) this.emit((to | from) < 32 ? instruction.i(0x13, to, 0, from, 0) : moveWord(to, from));
    }


    slot(depth) { return (this.slotBase ?? 0) + 4 * (this.locals + depth); }

    spill(depth, reg) {
        this.store(reg, this.slot(depth));
        this.spillDepth = Math.max(this.spillDepth, depth + 1);
    }

    // The operand's class is the scratch register's: an f32 consumer pops with an f scratch (ft10, ft11).
    pop(scratch) {
        if (!this.depth) throw new SyntaxError("empty RV32 operand stack");
        const depth = --this.depth;
        const home = this.direct[depth];
        if (home !== undefined) {
            this.direct[depth] = undefined;
            return home;
        }
        const reg = OPERAND_STACKS[scratch >> 5][depth];
        if (reg !== undefined) return reg;
        this.load(scratch, this.slot(depth));
        return scratch;
    }

    // classes[d]: the register class of the operand at depth d (a call spills and reloads by it).
    push(reg) {
        const depth = this.depth++;
        this.direct[depth] = undefined;
        this.classes[depth] = reg >> 5;
        const home = OPERAND_STACKS[reg >> 5][depth];
        if (home === undefined) this.spill(depth, reg);
        else this.move(home, reg);
    }

    // The register a result of class cls (0 integer, 1 float) is computed in.
    resultRegister(cls = 0) { return OPERAND_STACKS[cls][this.depth] ?? (cls ? FT10 : T5); }

}

// rv32/emit/addresses.js
// FunctionCode's checked and unchecked buffer addresses.

class AddressMethods {
    // reg = the address of frame byte `offset` (a local array's element): sp + offset, or s0 + offset - 2032 when a
    // large frame's offset is beyond sp's reach.
    frameAddress(reg, offset) {
        this.usesFrame = true;
        if (offset >= LARGE_BASE && this.large) this.emit(instruction.i(0x13, reg, 0, S0, offset - LARGE_BASE));
        else this.emit(instruction.i(0x13, reg, 0, SP, offset));
    }

    // Zero `bytes` frame bytes from `offset` (array.zero): one sw zero per word up to 16 words, else a loop of t5
    // from the first word to t6, the end.
    zeroFrame(offset, bytes) {
        if (bytes <= 64) {
            for (let k = 0; k < bytes; k += 4) this.store(ZERO, offset + k);
            return;
        }
        this.frameAddress(T5, offset);
        if (bytes < 2048) this.emit(instruction.i(0x13, T6, 0, T5, bytes));
        else {
            this.constant(T6, bytes);
            this.emit(instruction.r(0x33, T6, 0, T6, T5));
        }
        this.emit(instruction.s(2, T5, ZERO, 0));
        this.emit(instruction.i(0x13, T5, 0, T5, 4));
        this.emit(instruction.b(1, T5, T6, -8) >>> 0); // bne t5, t6, the sw
    }

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
    [I32_AND,[7,0]], [I32_OR,[6,0]], [I32_XOR,[4,0]], [I32_SHL,[1,0]], [I32_SHR_S,[5,0x20]], [I32_SHR_U,[5,0]],
    [I32_DIV_U,[5,1]], [I32_REM_U,[7,1]], // divu, remu
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
    [I32_LT_U,[6,false]], // lt_u: bltu
    [I32_GT_U,[6,true]],  // gt_u: bltu, operands reversed
    [I32_LE_U,[7,true]],  // le_u: bgeu, operands reversed
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
    [I32_AND, c => fitsImmediate(c) ? [[7, c]] : null],                        // andi
    [I32_OR, c => fitsImmediate(c) ? [[6, c]] : null],                         // ori
    [I32_XOR, c => fitsImmediate(c) ? [[4, c]] : null],                        // xori (c = -1: not)
    [I32_SHL, c => [[1, c & 31]]],                                            // slli
    [I32_SHR_S, c => [[5, 0x400 | (c & 31)]]],                                  // srai
    [I32_SHR_U, c => [[5, c & 31]]],                                            // srli
    [I32_LT_S, c => fitsImmediate(c) ? [[2, c]] : null],                       // slti
    [I32_LE_S, c => c < 2047 && c >= -2049 ? [[2, c + 1]] : null],             // a <= c as a < c+1
    [I32_GE_S, c => fitsImmediate(c) ? [[2, c], [4, 1]] : null],               // !(a < c)
    [I32_GE_U, c => fitsImmediate(c) ? [[3, c], [4, 1]] : null],               // !(a <u c)
    [I32_EQ, c => fitsImmediate(c) ? [[4, c], [3, 1]] : null],               // xori, seqz
    [I32_LT_U, c => fitsImmediate(c) ? [[3, c]] : null],                       // sltiu (the immediate sign-extends to c)
    // u32 division and remainder by a power of two: srli, andi (c is never 0 here: constantForm gives "zero").
    [I32_DIV_U, c => powerOfTwo(c) >= 0 ? [[5, powerOfTwo(c)]] : null],
    [I32_REM_U, c => powerOfTwo(c) >= 0 && fitsImmediate(c - 1) ? [[7, c - 1]] : null],
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
        if (type !== VOID && type !== I32 && type !== F32) throw new SyntaxError("unsupported RV32 control result");
        const condition = op === IF ? a ?? this.pop(T5) : ZERO;
        const block = {op, depth: this.depth, value: type !== VOID, float: type === F32, start: {}, alternate: {}, end: {}};
        this.control.push(block);
        this.mark(block.start);
        if (op === IF) this.branch(kind, condition, b, block.alternate);
    }

    end() {
        const block = this.control.pop();
        if (!block) {
            this.returnValue();
            return true;
        }
        if (block.alternate.at === undefined) this.mark(block.alternate);
        this.mark(block.end);
        // Both arms put a result in the same home at the block's entry depth.
        this.depth = block.depth + Number(block.value);
        if (block.value) {
            this.direct[block.depth] = undefined;
            this.classes[block.depth] = Number(block.float);
        }
        return false;
    }

}

// rv32/emit/calls.js
// FunctionCode's calls and the callee-saved registers its prologue saves.

class CallMethods {
    call(index) {
        const callee = this.functions[index], count = callee.params.length;
        // A pending read of a call-free home (operandLocations.callFree) moves to the operand stack first: the argument
        // moves and the call write those registers.
        const unsaved = this.locations?.callFree;
        if (unsaved) for (let d = 0; d < this.depth; d++) if (unsaved.has(this.direct[d])) this.materializeAt(d);
        // ilp32f: integer arguments in a0-a7, f32 in fa0-fa7, each popped from its class's operand stack; an f32
        // beyond fa7 in the next integer register; the rest in the stack words at sp + 4k (outgoingWords).
        const incoming = calleeRegisters(callee);
        for (let i = count - 1; i >= 0; i--) {
            const arg = incoming[i], cls = typeClass(callee.params[i]);
            if (arg >= 0 && arg >> 5 === cls) this.move(arg, this.pop(arg));
            else {
                const value = this.pop(cls ? FT10 : T5);
                if (arg >= 0) this.move(arg, value);
                else this.store(value, 4 * (-1 - arg));
            }
        }
        // Only the values below the arguments survive the call. A pending direct read stays in
        // its home: a function that calls keeps homes only in callee-saved registers.
        // An operand deeper than its class's stack registers is in its slot already.
        const live = this.depth, direct = this.direct, classes = this.classes;
        for (let d = 0; d < live; d++) {
            const reg = direct[d] === undefined ? OPERAND_STACKS[classes[d]][d] : undefined;
            if (reg !== undefined) this.spill(d, reg);
        }
        this.usesFrame = true; // the return address
        this.jump(this.starts[index], RA);
        for (let d = 0; d < live; d++) {
            const reg = direct[d] === undefined ? OPERAND_STACKS[classes[d]][d] : undefined;
            if (reg !== undefined) this.load(reg, this.slot(d));
        }
        // A record result's leaves, in order, from their registers and the stack words at sp + 4k.
        const results = calleeResults(callee);
        if (!results) return this.push(callee.result === "f32" ? FA0 : A0);
        // The local.set operations that follow the call store its top leaves (the last first): under the kernel
        // policy (direct reads) each such leaf goes from its register or stack word to the local, not through the
        // operand stack (PICOCALC-CANDELA-KERNEL-CODEGEN). A leaf whose local's home is the register of a leaf
        // still to be read, or whose local.set the plan treats specially, ends the run.
        const plan = this.locations, tape = this.program.code, n = results.length;
        let fused = 0;
        if (plan?.direct && this.floating) {
            const pending = new Set(results.filter(reg => reg >= 0));
            for (; fused < n; fused++) {
                const at = this.at + 2 * fused, local = tape[at + 1], reg = results[n - 1 - fused];
                if (tape[at] !== LOCAL_SET || plan.forward.has(at) || plan.skips?.has(at) || plan.pointerWrites?.has(local)) break;
                pending.delete(reg);
                const home = plan.homes.get(local);
                if (home !== undefined && pending.has(home)) break;
            }
        }
        for (let i = 0; i < n - fused; i++) {
            const reg = results[i];
            if (reg >= 0) this.push(reg);
            else {
                const scratch = typeClass(callee.results[i]) ? FT10 : T5;
                this.load(scratch, 4 * (-1 - reg));
                this.push(scratch);
            }
        }
        for (let k = 0; k < fused; k++) {
            const i = n - 1 - k, reg = results[i], local = tape[this.at + 1];
            let value = reg;
            if (reg < 0) {
                const home = plan.homes.get(local);
                value = home ?? (typeClass(callee.results[i]) ? FT10 : T5);
                if (home !== undefined) this.materialize(home);
                this.load(value, 4 * (-1 - reg));
            }
            if (value !== plan.homes.get(local)) this.writeLocal(value, local);
            this.at += 2;
        }
    }

    // The function's result into a0 or fa0, or a record result's leaves into their registers and the caller's stack
    // words (calleeResults). Pending direct reads move to the operand stack first, so no leaf's move overwrites a home
    // another leaf still reads (a leaf keeps its parameters in a0-a7 and fa0-fa7).
    returnValue() {
        const results = calleeResults(this.program);
        if (!results) return this.move(this.returnRegister, this.pop(this.returnRegister));
        this.materialize();
        if (results.stack) this.callerStack(T6);
        for (let i = results.length - 1; i >= 0; i--) {
            const reg = results[i];
            if (reg >= 0) this.move(reg, this.pop(reg));
            else this.store(this.pop(typeClass(this.program.results[i]) ? FT10 : T5), 4 * (-1 - reg), T6);
        }
    }


    // The words of the stack-argument area at the bottom of the frame: the most any call of this function passes on
    // the stack. A program none of whose functions takes a stack word skips the walk.
    outgoingWords() {
        const functions = this.functions;
        functions.stackWords ??= functions.reduce((most, fn) => Math.max(most, stackWords(fn)), 0);
        if (!functions.stackWords) return 0;
        const tape = this.program.code;
        let words = 0;
        for (let at = 0; at < tape.length; at += 1 + CELLS[tape[at]])
            if (tape[at] === CALL) words = Math.max(words, stackWords(functions[tape[at + 1]]));
        return words;
    }

    // reg = the caller's sp, where the incoming stack words are: a placeholder lower() patches once the frame is known.
    callerStack(reg) {
        this.usesFrame = true;
        (this.callerStacks ??= []).push({at: this.words.length, reg});
        this.emit(0);
    }

    // Callee-saved registers that the plan uses as homes, saved below the return address.
    savedRegisters() {
        const homes = this.locations?.homes;
        return homes ? [...new Set(homes.values())].filter(isSavedRegister).sort((a, b) => a - b) : [];
    }

}

// rv32/emit/floats.js
// FunctionCode's f32 operations (RV32F). Operands live on the f operand stack (ft0-ft4, encoding/registers.js
// OPERAND_STACKS); ft10 and ft11 are the scratch registers of a spilled operand. Every rounding instruction names
// round-to-nearest-even statically, so frm never matters; a product and a sum are never fused.

const RNE = 0, RTZ = 1, RDN = 2, RUP = 3;
const RETURNED = Symbol("computed in fa0 for the return that follows");
// The tape's f32 operations, by opcode: 1 for those FunctionCode.float lowers.
const FLOAT_OPERATIONS = new Uint8Array(256);
for (const op of [F32_LOAD, F32_STORE, F32_CONST, F32_EQ, F32_NE, F32_LT, F32_GT, F32_LE, F32_GE, F32_ABS, F32_NEG,
    F32_CEIL, F32_FLOOR, F32_TRUNC, F32_SQRT, F32_ADD, F32_SUB, F32_MUL, F32_DIV, F32_COPYSIGN, F32_CONVERT_I32_S,
    I32_REINTERPRET_F32, F32_REINTERPRET_I32, I32_TRUNC_F32, F32_MIN, F32_MAX, F32_CONVERT_I32_U, U32_TRUNC_F32]) FLOAT_OPERATIONS[op] = 1;
// Two f32 operands, an f32 result: the encoder key and its rounding mode (undefined: sign injection, min, max).
const FLOAT_BINARY = new Map([
    [F32_ADD, ["fadd_s", RNE]], [F32_SUB, ["fsub_s", RNE]], [F32_MUL, ["fmul_s", RNE]], [F32_DIV, ["fdiv_s", RNE]],
    [F32_MIN, ["fmin_s"]], [F32_MAX, ["fmax_s"]], [F32_COPYSIGN, ["fsgnj_s"]],
]);
// Comparisons: the encoder key and whether the operands are swapped (a > b is b < a); ne is not eq.
const FLOAT_COMPARE = new Map([
    [F32_EQ, ["feq_s", false]], [F32_NE, ["feq_s", false]], [F32_LT, ["flt_s", false]], [F32_GT, ["flt_s", true]],
    [F32_LE, ["fle_s", false]], [F32_GE, ["fle_s", true]],
]);
const ROUNDING = new Map([[F32_FLOOR, RDN], [F32_CEIL, RUP], [F32_TRUNC, RTZ]]);

class FloatMethods {
    // An f32 constant into reg: lui (and addi) into t6 and fmv.w.x, or fmv.w.x from x0 for +0.
    floatConstant(reg, bits) {
        if (bits) this.constant(T6, bits);
        this.emit(encoder("fmv_w_x")(reg, bits ? T6 : ZERO));
    }

    // The destination of a result of class cls: the home of the local it is stored to next (destination()), or the
    // operand stack's register.
    // An f32 function's value that the next operation returns is computed in fa0 itself (a pending read of fa0).
    floatResult(cls) {
        if (this.floating && cls === F && this.returnRegister === FA0 && this.returning(this.at)) return [FA0, RETURNED];
        const stored = this.destination();
        return [stored ?? this.resultRegister(cls), stored];
    }

    // result() for floatResult's destinations.
    floatDone(out, stored) {
        if (stored === RETURNED) this.pushHome(out);
        else this.result(out, stored);
    }

    float(op) {
        const binary = FLOAT_BINARY.get(op);
        if (binary) {
            const b = this.pop(FT11), a = this.pop(FT10);
            const [out, stored] = this.floatResult(F);
            this.emit(binary[1] === undefined ? encoder(binary[0])(out, a, b) : encoder(binary[0])(out, a, b, binary[1]));
            return this.floatDone(out, stored);
        }
        const compare = FLOAT_COMPARE.get(op);
        if (compare) {
            const b = this.pop(FT11), a = this.pop(FT10);
            const [out, stored] = this.floatResult(0);
            this.emit(compare[1] ? encoder(compare[0])(out, b, a) : encoder(compare[0])(out, a, b));
            if (op === F32_NE) this.emit(instruction.i(0x13, out, 4, out, 1)); // xori out, out, 1
            return this.floatDone(out, stored);
        }
        const rounding = ROUNDING.get(op);
        if (rounding !== undefined) return this.round(rounding);
        switch (op) {
        case F32_CONST: {
            const bits = this.cell();
            const home = this.locations?.homes.get("f" + bits);
            if (home !== undefined) return this.pushHome(home);
            const [out, stored] = this.floatResult(F);
            this.floatConstant(out, bits);
            return this.floatDone(out, stored);
        }
        case F32_LOAD: {
            this.cell(); // alignment hint
            const offset = this.cell(), base = this.pop(T5);
            const [out, stored] = this.floatResult(F);
            this.load(out, offset, base);
            return this.floatDone(out, stored);
        }
        case F32_STORE: {
            this.cell();
            const offset = this.cell(), value = this.pop(FT11);
            this.store(value, offset, this.pop(T5));
            return;
        }
        case F32_ABS: case F32_NEG: case F32_SQRT: {
            const a = this.pop(FT10);
            const [out, stored] = this.floatResult(F);
            if (op === F32_SQRT) this.emit(encoder("fsqrt_s")(out, a, RNE));
            else this.emit(encoder(op === F32_ABS ? "fsgnjx_s" : "fsgnjn_s")(out, a, a));
            return this.floatDone(out, stored);
        }
        case F32_CONVERT_I32_S: case F32_CONVERT_I32_U: case F32_REINTERPRET_I32: {
            const a = this.pop(T5);
            const [out, stored] = this.floatResult(F);
            this.emit(op === F32_REINTERPRET_I32 ? encoder("fmv_w_x")(out, a) :
                encoder(op === F32_CONVERT_I32_S ? "fcvt_s_w" : "fcvt_s_wu")(out, a, RNE));
            return this.floatDone(out, stored);
        }
        case I32_TRUNC_F32: case U32_TRUNC_F32: case I32_REINTERPRET_F32: {
            // fcvt.w.s and fcvt.wu.s rtz saturate, and give 2^31 - 1 and 2^32 - 1 for NaN: Typed's rules (tape.js
            // f32.to_i32, f32.to_u32).
            const a = this.pop(FT10);
            const [out, stored] = this.floatResult(0);
            this.emit(op === I32_REINTERPRET_F32 ? encoder("fmv_x_w")(out, a) :
                encoder(op === I32_TRUNC_F32 ? "fcvt_w_s" : "fcvt_wu_s")(out, a, RTZ));
            return this.floatDone(out, stored);
        }
        }
        throw new SyntaxError("unsupported RV32 f32 operation " + op);
    }

    // floor, ceil, trunc: an |x| >= 2^23, an infinity or a NaN is its own result; any other x converts to an integer
    // in the rounding mode and back, exactly, with x's sign (so -0.5 gives -0 under ceil and trunc, -0 gives -0).
    //     mv out, x; fmv.x.w t6, x; slli t6, t6, 1; lui t5, 0x96000; bgeu t6, t5, done
    //     fcvt.w.s t6, x, rm; fcvt.s.w ft11, t6, rm; fsgnj.s out, ft11, x; done:
    round(rm) {
        const a = this.pop(FT10);
        // out is never ft11, which holds the converted value while x is still read.
        const [out, stored] = this.floatResult(F);
        this.move(out, a);
        this.emit(encoder("fmv_x_w")(T6, a));
        this.emit(instruction.i(0x13, T6, 1, T6, 1));
        this.emit(((0x96000 << 12) | (T5 << 7) | 0x37) >>> 0);
        this.emit(instruction.b(7, T6, T5, 16));
        this.emit(encoder("fcvt_w_s")(T6, a, rm));
        this.emit(encoder("fcvt_s_w")(FT11, T6, rm));
        this.emit(encoder("fsgnj_s")(out, FT11, a));
        this.floatDone(out, stored);
    }
}

// rv32/emit/homes.js
// FunctionCode's register homes: local reads and writes, direct reads, pointer homes.

class HomeMethods {
    readLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) this.move(reg, home);
        else this.load(reg, (this.slotBase ?? 0) + 4 * local);
    }

    writeLocal(reg, local) {
        const home = this.locations?.homes.get(local);
        if (home !== undefined) {
            // A pending read of this local must keep the value it had when it was pushed.
            this.materialize(home);
            this.move(home, reg);
        } else this.store(reg, (this.slotBase ?? 0) + 4 * local);
    }

    // Copy pending direct reads into their ordinary operand locations: every one, or only
    // those of one home register. Control flow calls this so that both arms of a join and
    // every loop iteration agree on where each operand lives.
    materialize(home) {
        for (let d = 0; d < this.depth; d++) {
            const h = this.direct[d];
            if (h === undefined || (home !== undefined && h !== home)) continue;
            this.direct[d] = undefined;
            const reg = OPERAND_STACKS[h >> 5][d];
            if (reg === undefined) this.spill(d, h);
            else this.move(reg, h);
        }
    }

    // materialize() for the operand at depth d alone.
    materializeAt(d) {
        const h = this.direct[d];
        this.direct[d] = undefined;
        const reg = OPERAND_STACKS[h >> 5][d];
        if (reg === undefined) this.spill(d, h);
        else this.move(reg, h);
    }

    pushHome(home) {
        this.classes[this.depth] = home >> 5;
        this.direct[this.depth++] = home;
    }

    // The register class of a local: its type (fn.params, fn.localTypes); 0 throughout an integer function.
    localClass(local) {
        if (!this.floating) return 0;
        const fn = this.program, params = fn.params.length;
        return (local < params ? fn.params[local] : fn.localTypes?.[local - params]) === "f32" ? 1 : 0;
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

// rv32/emit/function-code.js
// FunctionCode, the streaming emitter: one pass over a function's tape that writes RV32 words.

// Above this many bytes of locals and saved registers a function takes the large-frame form (see lower()).
const LARGE_FRAME_LOCALS = 1900;

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
        this.classes = [];
        this.exit = {};
        // ilp32f: an f32 result returns in fa0, every other in a0; a record result's leaves return as returnValue()
        // places them, and there is no single return register.
        this.returnRegister = program.results ? undefined : program.result === "f32" ? FA0 : A0;
        // A function with an f32 parameter, local or result: its frame is dropped when it uses none (dropsFrame), and
        // its result is computed in fa0 where the next operation returns it (floatResult). Integer functions keep the
        // code their pinned images record.
        this.floating = program.result === "f32" || program.params.includes("f32") || Boolean(program.localTypes) ||
            Boolean(program.results?.includes("f32"));
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
        // A return leaves every pending read behind, so an f32 function's return reads its value where it is.
        if (op >= BLOCK && op <= RETURN && !(this.floating && this.returning(this.at - 1))) this.materialize();
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
        case RETURN: this.returnValue(); this.jump(this.exit); break;
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
            const out = stored ?? this.resultRegister(this.localClass(local));
            this.readLocal(out, local);
            this.result(out, stored);
            break;
        }
        case LOCAL_SET: {
            const value = this.pop(this.localClass(this.program.code[this.at]) ? FT10 : T5), local = this.cell();
            this.writeLocal(value, local);
            this.pointersAfterWrite(local, this.at - 2, value);
            // An f32 function's `local.set x; local.get x` of a local in its slot: the stored register is the value
            // (PICOCALC-CANDELA-KERNEL-CODEGEN).
            const tape = this.program.code;
            if (this.floating && tape[this.at] === LOCAL_GET && tape[this.at + 1] === local && plan?.homes.get(local) === undefined &&
                !plan?.skips?.has(this.at) && !plan?.forward.has(this.at) && !plan?.pointerWrites?.has(local)) {
                this.at += 2;
                this.push(value);
            }
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
        case ARRAY_ADDRESS: { // a local array's element in the frame (array area offset)
            const offset = this.arrayBase + this.cell();
            const stored = this.destination();
            const out = stored ?? this.resultRegister();
            this.frameAddress(out, offset);
            this.result(out, stored);
            break;
        }
        case ARRAY_ZERO: {
            const offset = this.arrayBase + this.cell();
            this.zeroFrame(offset, this.cell());
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
        default:
            if (FLOAT_OPERATIONS[op]) this.float(op);
            else this.binary(op);
        }
        return false;
    }


    // Whether the operation at `at` returns from the function: a return, or the function's last end.
    returning(at) {
        const op = this.program.code[at];
        return op === RETURN || (op === END && this.control.length === 0);
    }

    // After lower(): this f32 function used no frame (no slot, spill, call or saved register), so it may be emitted
    // again with frameless set, without the prologue and epilogue.
    get dropsFrame() { return this.floating && !this.frameless && !this.bodyUsesFrame && this.savedRegisters().length === 0; }

    lower() {
        const count = this.program.params.length;
        const incoming = calleeRegisters(this.program);
        const saved = this.frameless ? [] : this.savedRegisters();
        // The stack-argument area of the calls this function makes, at the bottom of the frame (ilp32f: the caller's
        // sp + 4k): the slots start above it.
        const outgoing = this.frameless ? 0 : this.outgoingWords(), base = 4 * outgoing;
        // Local arrays (fn.arrayBytes, a multiple of 4): an area below the slots, above the stack-argument area and,
        // in a large frame, above ra, s0 and the saved registers.
        const arrays = this.program.arrayBytes ?? 0;
        // A large frame (more locals than sp's 12-bit offsets reach, PICOCALC-CANDELA-TYPED): ra, s0 and the saved
        // registers at the bottom (above the stack-argument area), the locals and spills above them, and s0 = sp + 2032
        // as the base of every slot at 2032 or more (load/store pick the base). Only functions with that many locals
        // take this form.
        this.large = !this.frameless && 4 * (outgoing + this.locals + saved.length + 2) + arrays > LARGE_FRAME_LOCALS;
        if (this.large) {
            this.arrayBase = base + 8 + 4 * saved.length;
            this.slotBase = this.arrayBase + arrays;
            this.emit(0);
            this.emit(0);
            this.emit(instruction.r(0x33, SP, 0, SP, T5, 0x20));
            this.emit(instruction.s(2, SP, RA, base));
            this.emit(instruction.s(2, SP, S0, base + 4));
            for (let k = 0; k < saved.length; k++) this.emit(storeWord(saved[k], base + 8 + 4 * k, SP));
            this.emit(instruction.i(0x13, S0, 0, SP, LARGE_BASE));
        } else if (!this.frameless) {
            // The frame size depends on the deepest spill, known only after the body, so the
            // prologue is emitted as placeholders and patched below.
            this.emit(0);
            this.emit(0);
            if (outgoing || arrays) this.slotBase = base + arrays;
            this.arrayBase = base;
        }
        if (!this.large) for (let k = 0; k < saved.length; k++) this.emit(0);
        for (let i = 0; i < count; i++) if (incoming[i] >= 0) this.writeLocal(incoming[i], i);
        // Parameters on the stack (ilp32f, beyond the argument registers): from the caller's sp, t5 here, into their
        // homes or slots.
        if (incoming.stack) {
            this.callerStack(T5);
            for (let i = 0; i < count; i++) if (incoming[i] < 0) {
                const home = this.locations?.homes.get(i), offset = 4 * (-1 - incoming[i]);
                if (home !== undefined) this.load(home, offset, T5);
                else {
                    this.load(T6, offset, T5);
                    this.store(T6, (this.slotBase ?? 0) + 4 * i);
                }
            }
        }
        // Capacity homes belong to unwritten parameters, still in their argument registers here.
        for (const [id, reg] of this.locations?.homes ?? []) {
            if (typeof id === "string") {
                if (id[0] === "c") this.constant(reg, Number(id.slice(1)));
                else if (id[0] === "f") this.floatConstant(reg, Number(id.slice(1)));
            } else if (id < 0) this.load(reg, 0, incoming[-1 - id]);
        }
        // Pointer homes of parameters, from the incoming argument registers.
        for (const [local, list] of this.locations?.pointerWrites ?? [])
            if (local < count) for (const {reg, r, K0, other} of list) {
                if (other === undefined) this.pointerFrom(reg, incoming[local], incoming[r], K0);
                else if (other < count && local < other) this.pointerFrom(reg, incoming[local], incoming[r], K0, incoming[other]);
            }
        while (this.at < this.program.code.length && !this.step(this.cell())) {}
        this.bodyUsesFrame = Boolean(this.usesFrame); // before the epilogue reloads ra
        if (this.frameless) {
            this.mark(this.exit);
            this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
            this.patchBranches();
            return this;
        }
        if (this.large) {
            const frame = (this.slotBase + 4 * (this.locals + this.spillDepth) + 15) & -16;
            if (frame > LARGE_BASE + 2047) throw new SyntaxError("RV32 function frame exceeds the instruction range");
            const lo = (frame << 20) >> 20;
            this.words[0] = (((frame - lo) & 0xfffff000) | (T5 << 7) | 0x37) >>> 0;
            this.words[1] = instruction.i(0x13, T5, 0, T5, lo) >>> 0;
            this.patchCallerStacks(S0, frame - LARGE_BASE);
            this.mark(this.exit);
            for (let k = 0; k < saved.length; k++) this.emit(loadWord(saved[k], base + 8 + 4 * k, SP));
            this.emit(instruction.i(0x03, RA, 2, SP, base));
            this.emit(instruction.i(0x03, S0, 2, SP, base + 4));
            this.emit(((frame - lo) & 0xfffff000) | (T5 << 7) | 0x37);
            this.emit(instruction.i(0x13, T5, 0, T5, lo));
            this.emit(instruction.r(0x33, SP, 0, SP, T5));
            this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
            this.patchBranches();
            return this;
        }
        const frame = (4 * (outgoing + this.locals + this.spillDepth + saved.length + 1) + arrays + 15) & -16;
        if (frame > 2032) throw new SyntaxError("RV32 function frame exceeds the instruction range");
        this.patchCallerStacks(SP, frame);
        this.words[0] = instruction.i(0x13, SP, 0, SP, -frame) >>> 0;
        this.words[1] = instruction.s(2, SP, RA, frame - 4) >>> 0;
        for (let k = 0; k < saved.length; k++)
            this.words[2 + k] = storeWord(saved[k], frame - 8 - 4 * k, SP);
        // Every return jumps here, so one restore sequence covers all exits.
        this.mark(this.exit);
        for (let k = 0; k < saved.length; k++) this.load(saved[k], frame - 8 - 4 * k);
        this.load(RA, frame - 4);
        this.emit(instruction.i(0x13, SP, 0, SP, frame));
        this.emit(instruction.i(0x67, ZERO, 0, RA, 0));
        this.patchBranches();
        return this;
    }

    // The caller's sp is the frame's top: sp + frame, or s0 + frame - 2032 in a large frame (callerStack).
    patchCallerStacks(from, offset) {
        for (const {at, reg} of this.callerStacks ?? []) this.words[at] = instruction.i(0x13, reg, 0, from, offset) >>> 0;
    }
}
mixin(FunctionCode, StackMethods, HomeMethods, AddressMethods, BranchMethods, ArithmeticMethods, CallMethods, FloatMethods);

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
// The f32 operations other than memory accesses need no frame either (they use t5, t6, ft10 and ft11 at most).
const LEAF_OPERATIONS = new Set([
    BLOCK, IF, ELSE, END, BR, BR_IF, RETURN, DROP, LOCAL_GET, I32_CONST, I32_EQZ,
    I32_EQ, I32_NE, I32_LT_S, I32_GT_S, I32_LE_S, I32_GE_S, I32_GE_U, I32_LT_U, I32_GT_U, I32_LE_U, ...ALU.keys(),
    ...[...FLOAT_OPERATIONS.keys()].filter(op => FLOAT_OPERATIONS[op] && op !== F32_LOAD && op !== F32_STORE),
]);
const LEAF_SPILL = Symbol("frameless function needs an operand spill");

class LeafCode extends FunctionCode {
    spill() { throw LEAF_SPILL; }

    step(op) {
        if (op !== LOCAL_GET) return super.step(op);
        const local = this.cell();
        if (local >= this.program.params.length) throw LEAF_SPILL;
        // select.leafParams: a frameless leaf never writes a parameter, so reads use it in place (a0-a7, fa0-fa7).
        const incoming = calleeRegisters(this.program)[local];
        if (this.select?.leafParams) this.pushHome(incoming);
        else this.push(incoming);
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
    if (fn.params.length > 8 || !fn.params.every(type => type === "i32" || type === "bool" || type === "f32" || type === "u32"))
        return declineLeaf(fn, "argument list outside leaf convention");
    // A record result's stack words are written through the caller's sp, which a frameless leaf does not compute.
    if (calleeResults(fn)?.stack) return declineLeaf(fn, "record result on the stack");
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

// rv32/plan/saved-homes.js
// Callee-saved homes, per register class.

// A function with an f32 parameter, local or result. Its leaves get more free registers than an integer function's
// (planSavedHomes); integer functions keep the plans their pinned images record.
const floatingFunction = fn => fn.result === "f32" || fn.params.includes("f32") || Boolean(fn.localTypes) ||
    Boolean(fn.results?.includes("f32"));

// The deepest operand stack of a leaf's tape (a leaf's only calls are guarded returns, which take and give one
// value): f operand-stack registers from there on are never used, so they are free homes.
function deepestStack(code) {
    let height = 0, deepest = 0;
    const blocks = [];
    for (let at = 0; at < code.length; at = opNext(code, at)) {
        const op = code[at], row = tapeRow(op);
        if (op >= BLOCK && op <= IF) {
            if (op === IF) height--;
            blocks.push({height, value: code[at + 1] !== VOID});
            continue;
        }
        if (op === ELSE) { height = blocks.at(-1).height; continue; }
        if (op === END) {
            const block = blocks.pop();
            if (block) height = block.height + Number(block.value);
            continue;
        }
        height += op === CALL ? 0 : row.push.length - row.pop.length;
        deepest = Math.max(deepest, height);
    }
    return deepest;
}

// An f32 leaf may keep its first integer parameter in a0 when nothing uses a0 as scratch: no buffer access (a
// capacity), no division check.
const A0_SCRATCH = new Set([CHECKED_ADDRESS, UNCHECKED_ADDRESS, LITERAL_STORES, I32_DIV_S, I32_REM_S]);
function a0Free(code) {
    for (let at = 0; at < code.length; at = opNext(code, at)) if (A0_SCRATCH.has(code[at])) return false;
    return true;
}

// The register class of a planner key: a parameter or frame local by its type (fn.params, and fn.localTypes for
// the frame locals when the front end gives them; a local without a type is an integer), every other key
// (capacities -1 - b, constants "c<n>", pointer homes "p...") by the integer class.
function keyClass(fn, id) {
    if (typeof id === "string") return id[0] === "f" ? F : X; // "f<bits>": an f32 constant
    if (id < 0) return X;
    const params = fn.params.length;
    return typeClass(id < params ? fn.params[id] : fn.localTypes?.[id - params]);
}

// Homes for every framed function. A leaf first keeps parameter i >= 1 in its incoming
// register a_i and uses the spare argument registers, which cost nothing; a0 is the
// emitter's scratch (capacity loads, division checks, results) and a7 holds a cached
// capacity. Any function may then claim s1..s11 for a local whose estimated accesses per
// call exceed twice the two instructions of save and restore. The factor of two absorbs
// the static estimate's optimism about branches; on the opening ray frame it gave the
// fewest instructions of the factors 1-4 (diary, PICOCALC-RAY-PARITY Step 4). Scores fall
// in sorted order and costs rise along the free list, so the first unaffordable local
// ends the assignment of its class.
// Each class has its own registers (encoding/registers.js REGISTER_CLASSES): an f32 local takes fa_i, a spare
// fa register or fs0..fs11 (ilp32f), by the same rules; fa0 stays free like a0.
const SAVED_MARGIN = 2;
// callFree (operandLocations.callFree, PICOCALC-CANDELA-KERNEL-CODEGEN): the tape offsets of a calling f32 function's
// calls (those a return does not follow at once). fa1-fa7, ft8 and ft9 are then free homes, at no cost, for plain
// locals whose live interval contains none of them: no call clobbers such a local while it lives, and the emitter
// moves a pending read of one to the operand stack before it sets up a call's arguments (calls.js). The registers so
// used are returned in the set callFree.
const CALL_FREE_HOMES = [43, 44, 45, 46, 47, 48, 49, 60, 61];
function planSavedHomes(fn, scores, homes, leaf, capacityCached, intervals, reuseArgs, callFree) {
    // A class without a key takes no part: an integer-only function plans exactly as before register classes.
    const floats = fn.params.includes("f32") || Boolean(fn.localTypes?.includes("f32"));
    const free = [], opened = [], closed = [false, !floats];
    // share: a register already holding homes takes another local whose live interval
    // overlaps none of theirs, at no further cost. Keys without an interval (capacities,
    // constants, slots live everywhere) occupy their register for the whole function.
    const span = id => intervals?.get(id) ?? [-Infinity, Infinity];
    const disjoint = (r, [s, e]) => r.spans.every(([s2, e2]) => e < s2 || s > e2);
    const crosses = ([s, e]) => callFree.some(c => s < c && c < e);
    if (callFree && !closed[F]) for (const reg of CALL_FREE_HOMES) free.push({reg, cls: F, cost: 0, localsOnly: true, callFree: true});
    if (leaf) {
        const incoming = calleeRegisters(fn);
        // An incoming register the leaf may keep: not a0 (the emitter's scratch), not a7 while it caches a capacity.
        // fa0 is only ever written by a return, so an f32 parameter may stay there, the first one included.
        const floating = floatingFunction(fn), a0 = floating && a0Free(fn.code);
        // A parameter on the stack, or an f32 in an x register, has no incoming register to keep.
        const keeps = p => inOwnRegister(fn, p) && (incoming[p] !== A0 || a0) && !(capacityCached && incoming[p] === A0 + 7);
        for (let p = 0; p < fn.params.length; p++) if (keeps(p) && (scores.get(p) ?? 0) >= 2) {
            homes.set(p, incoming[p]);
            opened.push({reg: incoming[p], cls: keyClass(fn, p), spans: [span(p)]});
        }
        for (const {id, arguments: args} of REGISTER_CLASSES) {
            if (closed[id]) continue;
            const used = incoming.filter(reg => reg >> 5 === id).length;
            for (let k = Math.max(1, used); k < (capacityCached && id === X ? 7 : 8); k++) free.push({reg: args[k], cls: id, cost: 0});
            if (floating) for (const reg of REGISTER_CLASSES[id].leafHomes ?? []) free.push({reg, cls: id, cost: 0});
        }
        if (floating) for (const reg of REGISTER_CLASSES[F].stack.slice(deepestStack(fn.code))) free.push({reg, cls: F, cost: 0});
        // reuseArgs: the argument register of a parameter without its own home there is free once
        // the prologue has written the parameter to its slot or home. Only a plain local, first
        // written in the body, may take it: parameter, capacity and pointer homes are filled in
        // the prologue, from the incoming registers (RAY-PARITY Step 21).
        if (reuseArgs) for (let p = 1; p < fn.params.length; p++)
            if (!homes.has(p) && keeps(p)) free.push({reg: incoming[p], cls: keyClass(fn, p), cost: 0, localsOnly: true});
    }
    for (const {id, homes: saved} of REGISTER_CLASSES) if (!closed[id]) for (const reg of saved) free.push({reg, cls: id, cost: 2});
    for (const [id, score] of [...scores].sort((a, b) => b[1] - a[1])) {
        if (homes.has(id)) continue;
        const cls = keyClass(fn, id);
        if (closed[cls]) continue;
        const own = span(id);
        const plain = typeof id === "number" && id >= fn.params.length;
        const callSafe = !callFree || !crosses(own);
        const shared = intervals && score >= 1 ? opened.find(r => r.cls === cls && (plain || !r.localsOnly) && disjoint(r, own) &&
            (callSafe || !r.callFree)) : undefined;
        if (shared) {
            homes.set(id, shared.reg);
            shared.spans.push(own);
            continue;
        }
        const at = free.findIndex(f => f.cls === cls && (plain || !f.localsOnly) && (callSafe || !f.callFree));
        if (at < 0 || score <= (free[at].cost ? SAVED_MARGIN * free[at].cost : 1)) {
            if (intervals) continue;
            closed[cls] = true;
            if (closed[X] && closed[F]) break;
            continue;
        }
        const [{reg, localsOnly, callFree: unsaved}] = free.splice(at, 1);
        homes.set(id, reg);
        opened.push({reg, cls, spans: [own], localsOnly, callFree: unsaved});
        if (unsaved) homes.callFree = (homes.callFree ?? new Set()).add(reg);
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
    let receiver, straight = true, pure = true, leaf = true, loops = 0, ifs = 0, guarded = false;
    // callFree: the offsets of the calls a return does not follow at once (saved-homes.js).
    const calls = [];
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
        // An f32 constant always needs a register (two or three instructions to make): key "f<bits>", class f. Its
        // home is made in the prologue, on every call, so a use counts 0.6: two unconditional uses, or one in a loop,
        // claim a free register; one unconditional and one conditional use do not.
        if (opcode === F32_CONST && options.constants && a !== 0) weigh("f" + a, 0.6);
        if (opcode === LOCAL_SET) {
            writes.add(a);
            // A homed write turns a store into a move: worth less than a read, which disappears.
            if (options.saved) weigh(a, 0.5);
        }
        if (opcode === CALL && !inlineCall(a)) {
            leaf = false;
            if (options.callFree && tape[at] !== RETURN && at !== tape.length - 1) calls.push(offset);
        } else if (opcode === CALL) guarded = true;
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
            if (local < fn.params.length && inOwnRegister(fn, local) && !writes.has(local) && uses > 1) scores.set(-1 - local, uses - 1);
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
            // The prologue makes a pointer home from the incoming registers: no parameter on the stack takes part.
            if (!inOwnRegister(fn, access.r) || [access.L, access.M].some(x => x < params && !inOwnRegister(fn, x))) continue;
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
    const callFree = options.callFree && !leaf && !guarded && intervals && floatingFunction(fn) ? calls : undefined;
    if (options.saved) planSavedHomes(fn, scores, homes, leaf, receiver !== undefined, intervals, options.reuseArgs, callFree);
    else if (options.homes && leaf) {
        let reg = A0 + Math.max(1, fn.params.length);
        const end = A0 + (receiver === undefined ? 8 : 7);
        for (const [id,score] of [...scores].sort((a,b)=>b[1]-a[1])) {
            if (keyClass(fn, id) !== X) continue; // homes without saved: integer argument registers only
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
    return {receiver,forward,homes,direct,pointers,pointerWrites,increments,skips,scores,intervals,callFree: homes.callFree};
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
//   kind     "transform" rewrites fn.code and is observed after it runs (observe: false, never; "changed", when its
//            run returns "changed"); "analysis" leaves a result in the
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
    // fields rewrites only functions with f32 field loads, and is observed with the next transform, so the observed
    // tapes of integer programs stay what they were.
    {name: "fields", group: "inline", kind: "transform", observe: false},
    {name: "commute", group: "inline", kind: "transform"},
    {name: "conjunctions", group: "kernel", kind: "transform"},
    {name: "sets", group: "kernel", kind: "transform"},
    {name: "rotate", group: "inline", kind: "transform"},
    {name: "ranges", group: "kernel", kind: "analysis"},
    {name: "version", group: "loops", kind: "transform", needs: ["rotate"]},
    {name: "hoist", group: "loops", kind: "option", needs: ["version"]},
    {name: "induction", group: "loops", kind: "option", needs: ["version"]},
    {name: "split", group: "loops", kind: "transform"},
    // rows and coalesce rewrite only f32 functions and are observed only when they change a tape, so integer programs'
    // observed tapes stay what they were.
    {name: "rows", group: "kernel", kind: "transform", observe: "changed"},
    {name: "coalesce", group: "kernel", kind: "transform", observe: "changed"},
    {name: "facts", group: "kernel", kind: "analysis", needs: ["ranges"]},
];
PASSES.forEach((pass, order) => pass.order = order);

// The bundle file of each group, next to typed-rv32.js: inline holds what "balanced" adds to the core, loops what
// "default" adds to "balanced", kernel what only "kernel" runs. A compile loads the groups its passes need.
const GROUPS = Object.freeze({inline: "typed-rv32-inline.js", loops: "typed-rv32-loops.js", kernel: "typed-rv32-kernel.js"});

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
    passes: Object.freeze(["inline", "fields", "commute", "rotate", "version", "split"]),
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
    balanced: Object.freeze({...DEFAULT_POLICY, passes: Object.freeze(["inline", "fields", "commute", "rotate"])}),
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
        passes: Object.freeze(["inline", "fields", "commute", "conjunctions", "sets", "rotate", "ranges", "version", "hoist",
            "induction", "split", "rows", "coalesce", "facts"]),
        operandLocations: Object.freeze({...DEFAULT_LOCATIONS, pointerOnly: true, reuseArgs: true, callFree: true}),
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
    // arity(index): a callee's parameter count (a value record parameter counts its leaves); arity.results(index): the
    // values its call pushes (a record result's leaves, else one). Passes with an abstract operand stack use both.
    const arity = index => callables[index].params.length;
    arity.results = index => callables[index].results?.length ?? 1;
    const unit = {options, callables, targets, arity,
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
        run: (fn, ctx) => typedPieLoops.lower(fn, callables, targets, mode, ctx.Emitter, encoder)});
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
            if (stage.kind === "transform" && (stage.observe === "changed" ? lowered === "changed" : stage.observe !== false))
                observe(stage.name);
        }
        const {Emitter, facts} = ctx;
        let compiled = time(fn, "leaf", () => lowerLeaf(fn, callables, targets, options?.select, facts));
        if (!compiled) {
            const plan = options?.operandLocations ? time(fn, "plan", () => planLocations(fn, {...options.operandLocations, select: options.select},
                index => Emitter === GuardedReturnCode && targets[index]?.guardedReturn)) : undefined;
            // observePlan(name, plan): a read-only view of the operand-location plan, for tools.
            if (plan) options?.observePlan?.(fn.name, plan);
            const emit = (longBranches, frameless) => {
                const emitter = new Emitter(fn, callables, targets);
                if (frameless) emitter.frameless = true;
                emitter.select = options?.select;
                emitter.versioned = passes.has("version");
                emitter.facts = facts;
                emitter.longBranches = longBranches;
                if (plan !== undefined) emitter.locations = plan;
                return emitter.lower();
            };
            compiled = time(fn, "emit", () => {
                let longBranches = false;
                const lowered = frameless => {
                    try {
                        return emit(longBranches, frameless);
                    } catch (error) {
                        if (error !== SHORT_BRANCH_RANGE) throw error;
                        longBranches = true;
                        return emit(true, frameless);
                    }
                };
                // An f32 function that used no frame is emitted again without one (FunctionCode.dropsFrame).
                const code = lowered(false);
                return code.dropsFrame ? lowered(true) : code;
            });
        }
        for (const pass of finishes) time(fn, pass.finishName ?? pass.name, () => pass.finish(fn, ctx));
        // Assembly reads a function's words, calls and descriptor (and, when inspected, its inspection): keeping only
        // those releases the emitter's plan and tables now instead of at the end of the compile. On the device the
        // emitters of a whole program held most of the compile heap (PICOCALC-CANDELA-KERNEL-CODEGEN).
        code.push(fn.nativeInspection ? compiled : {words: compiled.words, calls: compiled.calls, program: compiled.program});
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
        signatures: functions.map(typedWasm.publicSignature),
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
globalThis.typedRv32Modules = {ARRAY_ADDRESS, ARRAY_ZERO, BLOCK, BR, BR_IF, CALL, CELLS, CHECKED_ADDRESS, DROP, EFFECTS, ELSE, END, F32, F32_CONST, F32_LOAD, FLOATING, I32, I32_ADD, I32_AND, I32_CONST, I32_DIV_S, I32_DIV_U, I32_EQ, I32_EQZ, I32_GE_S, I32_GE_U, I32_GT_S, I32_GT_U, I32_LE_S, I32_LE_U, I32_LOAD, I32_LOAD16_U, I32_LT_S, I32_LT_U, I32_MUL, I32_NE, I32_OR, I32_REM_S, I32_REM_U, I32_SHL, I32_SHR_S, I32_SHR_U, I32_STORE, I32_STORE16, I32_SUB, I32_XOR, IF, LITERAL_STORES, LOCAL_GET, LOCAL_SET, LOOP, RETURN, STORES, UNCHECKED_ADDRESS, UNREACHABLE, VOID, floatingFunction, installPasses, opClose, opNext, replaceTape, tapeRow};
})();
