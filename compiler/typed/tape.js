// The tape: the Typed compiler's intermediate representation, defined once.
//
// A function's tape is a flat array of numbers. Each operation is one opcode cell followed by its
// operand cells, one number per operand (WebAssembly's LEB128 immediates as plain numbers). The
// opcodes are WebAssembly's, plus three pseudo-ops for UTF-16 text buffers (0xf1-0xf3). The front
// end (frontend/ in typed-wasm.js) writes it, the RV32 backend (typed-rv32.js, typed-pie-loops.js)
// reads and rewrites it, the Wasm backend (wasm/encode.js) serializes it with LEB128 immediates and
// the pseudo-ops expanded, and the tools decode it.
//
// Loaded before typed-wasm.js wherever the compiler is loaded; publishes globalThis.typedTape.
// The passes walk raw cells with `cells` and test opcodes with the named constants: decoding a
// tape into objects allocated several per operation and cost a bare QuickJS realm about a quarter
// of a compile. `decode` is for tools and tests.
(() => {
"use strict";

// Value types, as WebAssembly encodes them. A block's type cell is I32 or F32 (a value block) or VOID. ANY is not
// a Wasm type: in a row's pops or pushes it stands for the type of the local, callee or function the operation
// names (local.get, local.set, call, drop, return), which the row alone does not know.
const I32 = 0x7f, F32 = 0x7d, VOID = 0x40, ANY = 0;

// Effects, a bit set per opcode.
const STORES = 1;   // writes memory
const LOADS = 2;    // reads memory
const CALLS = 4;    // calls a function (the callee's effects are its own)
const BRANCHES = 8; // may transfer control away from the next operation
const TRAPS = 16;   // may trap (division checks, address checks, unreachable)
const CONTROL = 32; // opens, separates or closes a structured block, or leaves the function

// Operand formats, for decoding WebAssembly bytes and for tools: "type" is a block type cell,
// "u" an unsigned index or memory immediate, "s" a signed literal, "f" an f32 literal: the cell holds its IEEE
// bits as a signed i32 (exact, and comparable as a number), the Wasm bytes its four little-endian bytes.
// [code, constant name, operation name, operand formats, pops, pushes, effects]
// A call's pops are its callee's parameters (null: the callee's signature decides).
const ROWS = [
    [0x00, "UNREACHABLE", "unreachable", [], [], [], TRAPS | CONTROL | BRANCHES],
    [0x02, "BLOCK", "block", ["type"], [], [], CONTROL],
    [0x03, "LOOP", "loop", ["type"], [], [], CONTROL],
    [0x04, "IF", "if", ["type"], [I32], [], CONTROL | BRANCHES],
    [0x05, "ELSE", "else", [], [], [], CONTROL | BRANCHES],
    [0x0b, "END", "end", [], [], [], CONTROL],
    [0x0c, "BR", "br", ["u"], [], [], CONTROL | BRANCHES],
    [0x0d, "BR_IF", "br_if", ["u"], [I32], [], BRANCHES],
    [0x0f, "RETURN", "return", [], [ANY], [], CONTROL | BRANCHES],
    [0x10, "CALL", "call", ["u"], null, [ANY], CALLS],
    [0x1a, "DROP", "drop", [], [ANY], [], 0],
    [0x20, "LOCAL_GET", "local.get", ["u"], [], [ANY], 0],
    [0x21, "LOCAL_SET", "local.set", ["u"], [ANY], [], 0],
    [0x28, "I32_LOAD", "i32.load", ["u", "u"], [I32], [I32], LOADS],
    [0x2a, "F32_LOAD", "f32.load", ["u", "u"], [I32], [F32], LOADS],
    [0x2f, "I32_LOAD16_U", "i32.load16_u", ["u", "u"], [I32], [I32], LOADS],
    [0x36, "I32_STORE", "i32.store", ["u", "u"], [I32, I32], [], STORES],
    [0x38, "F32_STORE", "f32.store", ["u", "u"], [I32, F32], [], STORES],
    [0x3b, "I32_STORE16", "i32.store16", ["u", "u"], [I32, I32], [], STORES],
    [0x41, "I32_CONST", "i32.const", ["s"], [], [I32], 0],
    [0x43, "F32_CONST", "f32.const", ["f"], [], [F32], 0],
    [0x45, "I32_EQZ", "i32.eqz", [], [I32], [I32], 0],
    [0x46, "I32_EQ", "i32.eq", [], [I32, I32], [I32], 0],
    [0x47, "I32_NE", "i32.ne", [], [I32, I32], [I32], 0],
    [0x48, "I32_LT_S", "i32.lt_s", [], [I32, I32], [I32], 0],
    [0x49, "I32_LT_U", "i32.lt_u", [], [I32, I32], [I32], 0],
    [0x4a, "I32_GT_S", "i32.gt_s", [], [I32, I32], [I32], 0],
    [0x4b, "I32_GT_U", "i32.gt_u", [], [I32, I32], [I32], 0],
    [0x4c, "I32_LE_S", "i32.le_s", [], [I32, I32], [I32], 0],
    [0x4d, "I32_LE_U", "i32.le_u", [], [I32, I32], [I32], 0],
    [0x4e, "I32_GE_S", "i32.ge_s", [], [I32, I32], [I32], 0],
    [0x4f, "I32_GE_U", "i32.ge_u", [], [I32, I32], [I32], 0],
    // f32 comparisons: false when an operand is NaN, except ne (true), in WebAssembly and RV32F alike.
    [0x5b, "F32_EQ", "f32.eq", [], [F32, F32], [I32], 0],
    [0x5c, "F32_NE", "f32.ne", [], [F32, F32], [I32], 0],
    [0x5d, "F32_LT", "f32.lt", [], [F32, F32], [I32], 0],
    [0x5e, "F32_GT", "f32.gt", [], [F32, F32], [I32], 0],
    [0x5f, "F32_LE", "f32.le", [], [F32, F32], [I32], 0],
    [0x60, "F32_GE", "f32.ge", [], [F32, F32], [I32], 0],
    [0x6a, "I32_ADD", "i32.add", [], [I32, I32], [I32], 0],
    [0x6b, "I32_SUB", "i32.sub", [], [I32, I32], [I32], 0],
    [0x6c, "I32_MUL", "i32.mul", [], [I32, I32], [I32], 0],
    [0x6d, "I32_DIV_S", "i32.div_s", [], [I32, I32], [I32], TRAPS],
    [0x6e, "I32_DIV_U", "i32.div_u", [], [I32, I32], [I32], TRAPS],
    [0x6f, "I32_REM_S", "i32.rem_s", [], [I32, I32], [I32], TRAPS],
    [0x70, "I32_REM_U", "i32.rem_u", [], [I32, I32], [I32], TRAPS],
    [0x71, "I32_AND", "i32.and", [], [I32, I32], [I32], 0],
    [0x72, "I32_OR", "i32.or", [], [I32, I32], [I32], 0],
    [0x73, "I32_XOR", "i32.xor", [], [I32, I32], [I32], 0],
    // Shifts use the low five bits of the count, in WebAssembly and RV32 alike.
    [0x74, "I32_SHL", "i32.shl", [], [I32, I32], [I32], 0],
    [0x75, "I32_SHR_S", "i32.shr_s", [], [I32, I32], [I32], 0],
    [0x76, "I32_SHR_U", "i32.shr_u", [], [I32, I32], [I32], 0],
    // f32 arithmetic, rounded to nearest even. abs, neg and copysign change only the sign bit (NaN payloads kept);
    // ceil, floor and trunc round to an integral f32 (an |x| >= 2^23 is integral already).
    [0x8b, "F32_ABS", "f32.abs", [], [F32], [F32], 0],
    [0x8c, "F32_NEG", "f32.neg", [], [F32], [F32], 0],
    [0x8d, "F32_CEIL", "f32.ceil", [], [F32], [F32], 0],
    [0x8e, "F32_FLOOR", "f32.floor", [], [F32], [F32], 0],
    [0x8f, "F32_TRUNC", "f32.trunc", [], [F32], [F32], 0],
    [0x91, "F32_SQRT", "f32.sqrt", [], [F32], [F32], 0],
    [0x92, "F32_ADD", "f32.add", [], [F32, F32], [F32], 0],
    [0x93, "F32_SUB", "f32.sub", [], [F32, F32], [F32], 0],
    [0x94, "F32_MUL", "f32.mul", [], [F32, F32], [F32], 0],
    [0x95, "F32_DIV", "f32.div", [], [F32, F32], [F32], 0],
    [0x98, "F32_COPYSIGN", "f32.copysign", [], [F32, F32], [F32], 0],
    // i32 -> f32 and u32 -> f32, rounded to nearest even; the bits of an f32 as an i32 and back.
    [0xb2, "F32_CONVERT_I32_S", "f32.convert_i32_s", [], [I32], [F32], 0],
    [0xb3, "F32_CONVERT_I32_U", "f32.convert_i32_u", [], [I32], [F32], 0],
    [0xbc, "I32_REINTERPRET_F32", "i32.reinterpret_f32", [], [F32], [I32], 0],
    [0xbe, "F32_REINTERPRET_I32", "f32.reinterpret_i32", [], [I32], [F32], 0],
    // Pseudo-ops, only in the numeric tape. Each operand is a local, except where noted.
    // receiver position: the address of receiver[position], after checking position against the
    // receiver's capacity; an i32.load16_u or i32.store16 at offset 4 follows.
    [0xf1, "CHECKED_ADDRESS", "text.checked_address", ["u", "u"], [], [I32], TRAPS],
    // address literal: store the UTF-16 units of literal number `literal` (fn.literals) at
    // address + 4, after a check that covers the whole range.
    [0xf2, "LITERAL_STORES", "text.literal_stores", ["u", "u"], [], [], STORES],
    // receiver position j (j a number): the address of receiver[position + j] without a check;
    // written by loop versioning (the version pass) inside a loop whose range it has proved.
    [0xf3, "UNCHECKED_ADDRESS", "text.unchecked_address", ["u", "u", "u"], [], [I32], 0],
    // Where WebAssembly and RV32F differ, Typed takes RV32F's rule (one instruction on the device) and the Wasm
    // backend expands these to it. f32 -> i32 truncates toward zero and saturates; NaN gives 2^31 - 1 (fcvt.w.s
    // rtz; Wasm's i32.trunc_sat_f32_s gives 0). min and max return the other operand when one is NaN, the
    // canonical NaN when both are, and order -0 below +0 (fmin.s, fmax.s; Wasm's f32.min and f32.max give NaN).
    [0xf4, "I32_TRUNC_F32", "f32.to_i32", [], [F32], [I32], 0],
    [0xf5, "F32_MIN", "f32.min_num", [], [F32, F32], [F32], 0],
    [0xf6, "F32_MAX", "f32.max_num", [], [F32, F32], [F32], 0],
    // f32 -> u32 toward zero, saturating (negative values give 0); NaN gives 2^32 - 1 (fcvt.wu.s rtz; Wasm's
    // i32.trunc_sat_f32_u gives 0).
    [0xf7, "U32_TRUNC_F32", "f32.to_u32", [], [F32], [I32], 0],
    // Local arrays (PICOCALC-TYPED-VALUES). offset (a number): the address of byte `offset` of the function's array
    // area, fn.arrayBytes long (RV32: in the frame; WebAssembly: a static area at the top of the module's memory).
    [0xf8, "ARRAY_ADDRESS", "array.address", ["u"], [], [I32], 0],
    // offset bytes (numbers): zero `bytes` bytes of the array area from `offset`, where an array is declared.
    [0xf9, "ARRAY_ZERO", "array.zero", ["u", "u"], [], [], STORES],
];

const rows = [];
const byCode = new Array(256).fill(undefined);
const cells = new Int8Array(256).fill(-1);
const effects = new Uint8Array(256);
const constants = {};
for (const [code, constant, name, operands, pop, push, effect] of ROWS) {
    const row = Object.freeze({code, constant, name, cells: operands.length, operands: Object.freeze(operands),
        pop: pop && Object.freeze(pop), push: Object.freeze(push), effects: effect});
    rows.push(row);
    byCode[code] = row;
    cells[code] = operands.length;
    effects[code] = effect;
    constants[constant] = code;
}
const {BLOCK, IF, END} = constants;

// The offset of the operation after the one at `at`; NaN for an opcode outside the tape.
function next(tape, at) {
    const n = cells[tape[at]];
    return n >= 0 ? at + 1 + n : NaN;
}

// The offset of the `end` that closes the block, loop or if at `at`; -1 if there is none.
function close(tape, at) {
    let depth = 0;
    for (let k = at; k < tape.length; k = next(tape, k)) {
        const op = tape[k];
        if (op >= BLOCK && op <= IF) depth++;
        else if (op === END && --depth === 0) return k;
    }
    return -1;
}

function name(code) {
    const row = byCode[code];
    return row ? row.name : undefined;
}

// Decode a tape into operation records {ordinal, offset, length, op, opcode, operands}.
// `wasm` reads WebAssembly bytes instead: LEB128 immediates (a block type is one byte).
function decode(tape, wasm = false) {
    const operations = [];
    let at = 0;
    function operand(format) {
        if (!wasm || format === "type") return tape[at++];
        if (format === "f") {
            const value = tape[at] | tape[at + 1] << 8 | tape[at + 2] << 16 | tape[at + 3] << 24;
            at += 4;
            return value;
        }
        let value = 0;
        for (let bits = 0; bits <= 28; bits += 7) {
            const part = tape[at++];
            if (part === undefined) break;
            value += (part & 127) * 2 ** bits;
            if (!(part & 128)) return format === "s" && (part & 64) ? value - 2 ** (bits + 7) : value;
        }
        throw new Error("invalid tape operand");
    }
    while (at < tape.length) {
        const offset = at;
        const opcode = tape[at++];
        const row = byCode[opcode];
        if (!row) throw new Error("unknown tape opcode " + opcode + " at " + offset);
        const operands = row.operands.map(operand);
        if (at > tape.length) throw new Error("truncated tape operation at " + offset);
        operations.push({ordinal: operations.length, offset, length: at - offset, op: row.name, opcode, operands});
    }
    return operations;
}

// Opcode names, types, effect bits and functions share one namespace; a clash is a bug here.
const tape = {I32, F32, VOID, ANY, STORES, LOADS, CALLS, BRANCHES, TRAPS, CONTROL,
    rows: Object.freeze(rows), cells, effects, row: code => byCode[code], next, close, name, decode};
for (const key in constants) {
    if (Object.hasOwn(tape, key)) throw new Error("tape name " + key + " is defined twice");
    tape[key] = constants[key];
}
globalThis.typedTape = Object.freeze(tape);
})();
