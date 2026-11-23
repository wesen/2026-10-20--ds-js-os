// The RV32 backend's instruction table (compiler/typed/rv32/encoding/instructions.js) against GNU as from the
// ESP toolchain: every row, with edge and random operands, assembled in one file and compared word by word.
// The assembler is the newest riscv32-esp-elf-gcc's (as bench/lib/toolchain.sh chooses it, highest -dumpversion;
// P4_GCC overrides); without an ESP toolchain the cross-check is skipped and the table's own checks still run.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {homedir, tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

const {encoder, INSTRUCTION_ROWS: RAW_ROWS, instructionKey, instructionFields, moveWord, loadWord, storeWord} =
    await import(new URL("../../compiler/typed/rv32/encoding/instructions.js", import.meta.url));
const {instruction} = await import(new URL("../../compiler/typed/rv32/encoding/registers.js", import.meta.url));
const {assembly} = await import(new URL("../../compiler/typed/rv32/encoding/assembly.js", import.meta.url));
const INSTRUCTION_ROWS = RAW_ROWS.map(([mnemonic, match, operands]) =>
    ({mnemonic, key: instructionKey(mnemonic), match, operands, fields: instructionFields(operands)}));
// ENCODE.key: the table's encoders, all made (the compiler makes each on first use).
const ENCODE = Object.fromEntries(INSTRUCTION_ROWS.map(row => [row.key, encoder(row.key)]));

function espGcc() {
    if (process.env.P4_GCC) return process.env.P4_GCC;
    const root = join(homedir(), ".espressif/tools/riscv32-esp-elf");
    if (!existsSync(root)) return null;
    const found = [];
    for (const dir of readdirSync(root)) {
        const gcc = join(root, dir, "riscv32-esp-elf/bin/riscv32-esp-elf-gcc");
        if (!existsSync(gcc)) continue;
        found.push([execFileSync(gcc, ["-dumpversion"], {encoding: "utf8"}).trim(), gcc]);
    }
    const version = v => v.split(".").map(Number);
    found.sort((a, b) => {
        const [x, y] = [version(a[0]), version(b[0])];
        for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
        return a[1] < b[1] ? -1 : 1;
    });
    return found.at(-1)?.[1] ?? null;
}

// A small deterministic generator, so a failure reproduces.
let seed = 0x9e3779b9;
const random = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 2 ** 32);
const pick = list => list[Math.floor(random() * list.length)];
const between = (lo, hi, step = 1) => lo + step * Math.floor(random() * ((hi - lo) / step + 1));
const range = (lo, hi) => Array.from({length: hi - lo + 1}, (_, i) => lo + i);
const ESP = [...range(8, 15), ...range(24, 31)];

// Each field's edge values and a random value.
const DOMAINS = {
    xd: [() => between(0, 31), 0, 31], x1: [() => between(0, 31), 0, 31], x2: [() => between(0, 31), 0, 31],
    fd: [() => between(32, 63), 32, 63], f1: [() => between(32, 63), 32, 63], f2: [() => between(32, 63), 32, 63],
    f3: [() => between(32, 63), 32, 63],
    rm: [() => pick([0, 1, 2, 3, 4, 7, undefined]), undefined, 0, 4, 7],
    i12: [() => between(-2048, 2047), -2048, 2047, 0, -1], s12: [() => between(-2048, 2047), -2048, 2047, 0, -1],
    sh: [() => between(0, 31), 0, 31],
    b13: [() => between(-4096, 4094, 2), -4096, 4094, 0, 2],
    u20: [() => between(0, 0xfffff), 0, 0xfffff, 0x80000],
    j21: [() => between(-1048576, 1048574, 2), -1048576, 1048574, 0, 2],
    csr: [() => pick([1, 2, 3, between(0, 4095)]), 1, 2, 3],
    z5: [() => between(0, 31), 0, 31],
    qu: [() => between(0, 7), 0, 7], qv: [() => between(0, 7), 0, 7], qx: [() => between(0, 7), 0, 7],
    qy: [() => between(0, 7), 0, 7], qm: [() => between(0, 7), 0, 7],
    er: [() => pick(ESP), 8, 15, 24, 31], ed: [() => pick(ESP), 8, 15, 24, 31],
    e2: [() => between(-256, 254, 2), -256, 254, 0], e16: [() => between(-2048, 2032, 16), -2048, 2032, 0],
};

// Per row: every field at each of its edge values (the others random), then random operand lists.
function samples(row) {
    const out = [];
    const randomArgs = () => row.fields.map(f => DOMAINS[f][0]());
    row.fields.forEach((field, i) => {
        for (const edge of DOMAINS[field].slice(1)) {
            const args = randomArgs();
            args[i] = edge;
            out.push(args);
        }
    });
    for (let k = 0; k < (row.fields.length ? 24 : 1); k++) out.push(randomArgs());
    return out;
}

test("every row of the instruction table assembles to the same word with GNU as", t => {
    const gcc = espGcc();
    if (!gcc) return t.skip("no riscv32-esp-elf toolchain under ~/.espressif (set P4_GCC)");
    const as = gcc.replace(/gcc$/, "as"), objcopy = gcc.replace(/gcc$/, "objcopy");
    const cases = INSTRUCTION_ROWS.flatMap(row => samples(row).map(args => ({row, args, text: assembly(row, args)})));
    const dir = mkdtempSync(join(tmpdir(), "rv32-encoding-"));
    try {
        writeFileSync(join(dir, "table.S"), ".text\n.option norvc\n" + cases.map(c => c.text).join("\n") + "\n");
        execFileSync(as, ["-march=rv32imf_zicsr_xesppie", join(dir, "table.S"), "-o", join(dir, "table.o")]);
        execFileSync(objcopy, ["-O", "binary", "-j", ".text", join(dir, "table.o"), join(dir, "table.bin")]);
        const bytes = readFileSync(join(dir, "table.bin"));
        assert.equal(bytes.length, 4 * cases.length, "one word per line");
        const wrong = [];
        cases.forEach(({row, args, text}, i) => {
            const expected = bytes.readUInt32LE(4 * i), actual = ENCODE[row.key](...args);
            if (actual !== expected) wrong.push(text + ": table " + actual.toString(16) + ", as " + expected.toString(16));
        });
        assert.deepEqual(wrong, []);
        const rows = new Set(cases.map(c => c.row.key));
        assert.equal(rows.size, INSTRUCTION_ROWS.length);
        t.diagnostic(cases.length + " words over " + rows.size + " rows (" + as + ")");
    } finally {
        rmSync(dir, {recursive: true});
    }
});

test("the table covers RV32IM, Zicsr, all of RV32F and the PIE words, once each", () => {
    const keys = INSTRUCTION_ROWS.map(row => row.key);
    assert.equal(new Set(keys).size, keys.length);
    const rv32f = ["flw", "fsw", "fmadd.s", "fmsub.s", "fnmsub.s", "fnmadd.s", "fadd.s", "fsub.s", "fmul.s", "fdiv.s",
        "fsqrt.s", "fsgnj.s", "fsgnjn.s", "fsgnjx.s", "fmin.s", "fmax.s", "fcvt.w.s", "fcvt.wu.s", "fmv.x.w", "feq.s",
        "flt.s", "fle.s", "fclass.s", "fcvt.s.w", "fcvt.s.wu", "fmv.w.x"];
    const mnemonics = new Set(INSTRUCTION_ROWS.map(row => row.mnemonic));
    for (const m of [...rv32f, "mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu", "csrrw", "csrrsi",
        "lui", "auipc", "jal", "jalr", "fence", "ecall", "ebreak", "esp.vldbc.16.ip", "esp.vld.128.ip",
        "esp.vst.128.ip", "esp.vsub.s16", "esp.min.u16.a"]) assert(mnemonics.has(m), m);
    assert.equal(INSTRUCTION_ROWS.length, 40 + 8 + 6 + rv32f.length + 5);
});

test("the integer formats the emitters use agree with the table", () => {
    for (let k = 0; k < 2000; k++) {
        const [d, a, b] = [between(0, 31), between(0, 31), between(0, 31)], imm = between(-2048, 2047);
        assert.equal(instruction.r(0x33, d, 0, a, b) >>> 0, ENCODE.add(d, a, b));
        assert.equal(instruction.r(0x33, d, 0, a, b, 0x20) >>> 0, ENCODE.sub(d, a, b));
        assert.equal(instruction.r(0x33, d, 4, a, b, 1) >>> 0, ENCODE.div(d, a, b));
        assert.equal(instruction.i(0x13, d, 0, a, imm) >>> 0, ENCODE.addi(d, a, imm));
        assert.equal(instruction.i(0x13, d, 5, a, 0x400 | (imm & 31)) >>> 0, ENCODE.srai(d, a, imm & 31));
        assert.equal(instruction.i(0x03, d, 5, a, imm) >>> 0, ENCODE.lhu(d, imm, a));
        assert.equal(instruction.i(0x67, d, 0, a, imm) >>> 0, ENCODE.jalr(d, imm, a));
        assert.equal(instruction.s(1, a, b, imm) >>> 0, ENCODE.sh(b, imm, a));
        const branch = between(-4096, 4094, 2), jump = between(-1048576, 1048574, 2);
        assert.equal(instruction.b(5, a, b, branch) >>> 0, ENCODE.bge(a, b, branch));
        assert.equal(instruction.j(d, jump) >>> 0, ENCODE.jal(d, jump));
    }
});

test("an encoder rejects a register of the other class", () => {
    assert.throws(() => ENCODE.add(10, 42, 11), /x1 operand is not an integer register: 42/);
    assert.throws(() => ENCODE.fadd_s(42, 10, 43), /f1 operand is not a float register: 10/);
    assert.throws(() => ENCODE.flw(10, 0, 2), /fd operand/);
    assert.throws(() => ENCODE.esp_vld_128_ip(0, 10 - 4, 16), /PIE address register/);
    assert.equal(ENCODE.fmv_x_w(10, 42), 0xe0050553); // fmv.x.w a0, fa0
    assert.equal(moveWord(10, 11), ENCODE.addi(10, 11, 0));
    assert.equal(moveWord(42, 43), ENCODE.fsgnj_s(42, 43, 43));
    assert.equal(moveWord(42, 10), ENCODE.fmv_w_x(42, 10));
    assert.equal(moveWord(10, 42), ENCODE.fmv_x_w(10, 42));
    assert.equal(loadWord(50, 8, 2), ENCODE.flw(50, 8, 2));
    assert.equal(storeWord(9, -4, 2), ENCODE.sw(9, -4, 2));
});

test("every ALU and immediate form of instruction selection is a row of the table", async () => {
    // selection.js reads the tape's names, published by compiler/typed/tape.js.
    const {runInThisContext} = await import("node:vm");
    runInThisContext(readFileSync(new URL("../../compiler/typed/tape.js", import.meta.url), "utf8"));
    const {ALU, IMMEDIATE_FORMS} = await import(new URL("../../compiler/typed/rv32/encoding/selection.js", import.meta.url));
    const rowOf = (word, mask) => INSTRUCTION_ROWS.find(row => ((row.match & mask) >>> 0) === ((word & mask) >>> 0))?.mnemonic;
    const alu = [...ALU.values()].map(([f3, f7]) => rowOf(instruction.r(0x33, 0, f3, 0, 0, f7), 0xfe00707f));
    assert.deepEqual(alu.sort(), ["add", "and", "div", "mul", "or", "rem", "sll", "sra", "srl", "sub", "xor"]);
    const forms = new Set();
    for (const form of IMMEDIATE_FORMS.values()) for (const c of [0, 1, 2, 3, 8, 255, -5, 31])
        for (const [f3, imm] of form(c) ?? []) {
            const shift = f3 === 1 || f3 === 5;
            forms.add(rowOf(instruction.i(0x13, 0, f3, 0, imm), shift ? 0xfe00707f : 0x707f));
        }
    assert(!forms.has(undefined));
    for (const m of ["addi", "slli", "srai", "srli", "slti", "sltiu", "xori", "ori", "andi"]) assert(forms.has(m), m);
});
