// The instruction table: every instruction the RV32 backend may emit, as one row each, and ENCODE, an encoder
// per row. RV32IM, the Zicsr instructions (the backend touches only fflags, frm and fcsr), all of RV32F and the
// Espressif PIE instructions of typed-pie-loops.js. tests/compiler/typed-rv32-encoding.test.mjs assembles every
// row with GNU as from the ESP toolchain and compares the words.
//
// A row is [mnemonic, match, operands]: match holds the fixed bits, and operands is the instruction's assembler
// syntax, whose fields (below) give both the bits and the encoder's arguments, in the order they appear:
// ENCODE.lw(rd, offset, base) for "xd, i12(x1)", ENCODE.fadd_s(rd, a, b, rm) for "fd, f1, f2, rm". The key is
// the mnemonic with "." replaced by "_". A register argument is a register number of encoding/registers.js
// (f_n is 32 + n); an encoder throws when it gets a register of the other class. rm, the rounding mode, may be
// omitted: it is then 7 (dynamic, frm), as GNU as assembles it.
import {REGISTER_NAMES} from "./registers.js";

export const ROUNDING = ["rne", "rtz", "rdn", "rup", "rmm", , , "dyn"];
export const CSR = {fflags: 1, frm: 2, fcsr: 3};

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

// The fields an operand string may name. Register fields: x/f for the class, d (rd, bit 7), 1 (rs1, bit 15),
// 2 (rs2, bit 20), 3 (rs3, bit 27). The PIE fields: qu/qv/qx/qy/qm the vector registers q0-q7 of the
// respective instruction forms, er/ed a PIE address register at bit 15/7, e2/e16 a post-increment.
export const INSTRUCTION_FIELDS = {
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
export const INSTRUCTION_ROWS = [
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
].map(([mnemonic, match, operands]) => ({mnemonic, key: mnemonic.replaceAll(".", "_"), match, operands,
    fields: operands.match(/[a-z]+\d*/g) ?? []}));

function encoder({match, fields}) {
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
export const ENCODE = Object.create(null);
for (const row of INSTRUCTION_ROWS) ENCODE[row.key] = encoder(row);

// Class-aware moves, loads and stores of one 32-bit value (the emitters' load, store and move use these).
export function moveWord(to, from) {
    if (to < 32) return from < 32 ? ENCODE.addi(to, from, 0) : ENCODE.fmv_x_w(to, from);
    return from < 32 ? ENCODE.fmv_w_x(to, from) : ENCODE.fsgnj_s(to, from, from);
}
export const loadWord = (reg, offset, base) => reg < 32 ? ENCODE.lw(reg, offset, base) : ENCODE.flw(reg, offset, base);
export const storeWord = (reg, offset, base) => reg < 32 ? ENCODE.sw(reg, offset, base) : ENCODE.fsw(reg, offset, base);

// The GNU as text of a row with the given encoder arguments (registers by number, q registers as 0-7, rm by
// number or undefined for the default; a branch or jump offset relative to the instruction): for tests and tools.
export function assembly(row, args) {
    let k = 0;
    const text = row.operands.replace(/[a-z]+\d*/g, field => {
        const v = args[k++];
        if (field === "rm") return v === undefined ? "" : ROUNDING[v];
        if (/^[xf][d123]$|^e[rd]$/.test(field)) return REGISTER_NAMES[v];
        if (field[0] === "q") return "q" + v;
        if (field === "b13" || field === "j21") return (v < 0 ? ".-" : ".+") + Math.abs(v);
        return String(v);
    });
    return (row.mnemonic + " " + text.replace(/, $/, "")).trim();
}
