// Register classes in the RV32 backend (compiler/typed/rv32/encoding/registers.js): a synthetic float tape
// fragment goes through the planner (plan/) and the emitter (emit/) with f32 locals and parameters, and its
// image runs on the reference interpreter (bench/host/rv32-interp.js, RV32F). The tape has no float operations
// yet (PICOCALC-TYPED-F32 adds them): the fragment's additions are calls to an intrinsic import `fadd` that the
// test's emitter lowers to fadd.s, so the planner sees only real tape operations.
import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import test from "node:test";
import {runInThisContext} from "node:vm";

const read = file => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
for (const file of ["compiler/typed/tape.js", "compiler/typed/typed-wasm.js", "bench/host/rv32-interp.js"])
    runInThisContext(read(file), {filename: file});
const rv32 = path => import(new URL("../../compiler/typed/rv32/" + path, import.meta.url));
const {FunctionCode} = await rv32("emit/function-code.js");
const {planLocations} = await rv32("plan/locations.js");
const {POLICIES} = await rv32("policy.js");
const {encoder} = await rv32("encoding/instructions.js");
const ENCODE = new Proxy({}, {get: (_, key) => encoder(key)});
const {F, X, FA0, T5, T6, REGISTER_CLASSES, argumentRegisters, classOf, isSavedRegister} = await rv32("encoding/registers.js");
const T = typedTape;

const bits = x => new Uint32Array(new Float32Array([x]).buffer)[0];
const float = n => new Float32Array(new Uint32Array([n]).buffer)[0];
const [FT10, FT11] = REGISTER_CLASSES[F].scratch;

// function f(a: f32, b: f32, n: i32): f32 {
//     let t: f32 = a; let i: i32 = 0;
//     while (i < n) { t = fadd(t, b); t = fadd(t, b); i = i + 1; }
//     return twice(t);
// }
// fadd (import 0) is the intrinsic; twice(x: f32): f32 (function 1) is ordinary code, called by the ilp32f
// convention with its argument and result in fa0.
const fn = {
    name: "f", params: ["f32", "f32", "i32"], result: "f32", nlocals: 2, localTypes: ["f32", "i32"],
    code: [
        T.LOCAL_GET, 0, T.LOCAL_SET, 3, T.I32_CONST, 0, T.LOCAL_SET, 4,
        T.BLOCK, T.VOID, T.LOOP, T.VOID,
        T.LOCAL_GET, 4, T.LOCAL_GET, 2, T.I32_GE_S, T.BR_IF, 1,
        T.LOCAL_GET, 3, T.LOCAL_GET, 1, T.CALL, 0, T.LOCAL_SET, 3,
        T.LOCAL_GET, 3, T.LOCAL_GET, 1, T.CALL, 0, T.LOCAL_SET, 3,
        T.LOCAL_GET, 4, T.I32_CONST, 1, T.I32_ADD, T.LOCAL_SET, 4,
        T.BR, 0, T.END, T.END,
        T.LOCAL_GET, 3, T.CALL, 1, T.END,
    ],
};
const callables = [{name: "fadd", params: ["f32", "f32"], result: "f32"}, {name: "twice", params: ["f32"], result: "f32"}];

class IntrinsicCode extends FunctionCode {
    call(index) {
        if (this.functions[index].name !== "fadd") return super.call(index);
        // An operand is an f home (a direct read) or an integer stack register holding the value's bits.
        const right = this.pop(T6), left = this.pop(T5);
        const a = classOf(left) === F ? left : (this.move(FT10, left), FT10);
        const b = classOf(right) === F ? right : (this.move(FT11, right), FT11);
        this.emit(ENCODE.fadd_s(FT10, a, b));
        this.push(FT10);
    }
}

function build(policy) {
    const {operandLocations, select} = POLICIES[policy];
    const plan = planLocations(structuredClone(fn), {...operandLocations, select}, () => false);
    const targets = [{importIndex: 0}, {global: true}];
    const emitter = new IntrinsicCode(fn, callables, targets);
    emitter.select = select;
    emitter.locations = plan;
    const code = emitter.lower();
    // twice: fadd.s fa0, fa0, fa0; ret
    const twice = [ENCODE.fadd_s(FA0, FA0, FA0), ENCODE.jalr(0, 0, 1)];
    targets[1].at = code.words.length;
    for (const {from, target, rd} of code.calls) code.words[from] = ENCODE.jal(rd, 4 * (target.at - from));
    const words = [...code.words, ...twice];
    const image = new Uint8Array(4 * words.length);
    words.forEach((w, i) => new DataView(image.buffer).setUint32(4 * i, w, true));
    return {plan, words, program: {image, entries: {f: 0, twice: 4 * code.words.length}, relocations: []}};
}

test("ilp32f argument registers: integers in a0-a7, f32 in fa0-fa7, each class counted on its own", () => {
    assert.deepEqual([...argumentRegisters(["i32", "f32", "bool", "f32"])], [10, 42, 11, 43]);
    assert.deepEqual([...argumentRegisters(fn.params)], [42, 43, 10]);
    // Beyond eight of a class (PICOCALC-TYPED-VALUES): an f32 takes the next integer register, then the stack words
    // (-1 - k for word k); an integer the stack words.
    const nine = argumentRegisters([...Array(9).fill("f32"), "i32"]);
    assert.deepEqual([...nine], [42, 43, 44, 45, 46, 47, 48, 49, 10, 11]);
    assert.equal(nine.stack, 0);
    const spilled = argumentRegisters([...Array(9).fill("i32"), "f32", ...Array(9).fill("f32"), "i32"]);
    assert.deepEqual([...spilled], [10, 11, 12, 13, 14, 15, 16, 17, -1, 42, 43, 44, 45, 46, 47, 48, 49, -2, -3, -4]);
    assert.equal(spilled.stack, 4);
    assert.deepEqual(REGISTER_CLASSES[F].homes.map(r => r - 32), [8, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);
    assert(REGISTER_CLASSES[F].homes.every(isSavedRegister) && REGISTER_CLASSES[X].homes.every(isSavedRegister));
});

for (const policy of ["interactive", "default", "kernel"]) {
    test("a float fragment is planned, emitted and run through the register classes (" + policy + ")", () => {
        const {plan, words, program} = build(policy);
        // RV32_DUMP=DIR writes each image, for objdump -D -b binary -m riscv:rv32.
        if (process.env.RV32_DUMP) writeFileSync(process.env.RV32_DUMP + "/float-fragment-" + policy + ".bin", program.image);
        // t (local 3) and b (parameter 1) take callee-saved float homes, i (local 4) an integer one.
        for (const [id, cls] of [[3, F], [1, F], [4, X]]) {
            const home = plan.homes.get(id);
            assert(home !== undefined && classOf(home) === cls && isSavedRegister(home), id + " -> " + home);
        }
        // The prologue saves the claimed fs registers with fsw and the epilogue restores them with flw.
        const saved = [...new Set(plan.homes.values())].filter(r => classOf(r) === F);
        for (const reg of saved) {
            assert(words.some(w => (w & 0x707f) === 0x2027 && ((w >>> 20) & 31) === (reg & 31)), "fsw " + reg);
            assert(words.some(w => (w & 0x707f) === 0x2007 && ((w >>> 7) & 31) === (reg & 31)), "flw " + reg);
        }
        for (const [a, b, n] of [[1.5, 0.25, 0], [1.5, 0.25, 3], [-2, 0.1, 10], [1e30, 1e30, 7]]) {
            const fregisters = new Uint32Array(32);
            for (let r = 0; r < 32; r++) fregisters[r] = 0x5a5a0000 + r;
            fregisters[10] = bits(a);
            fregisters[11] = bits(b);
            const run = typedRv32Interp.run(program, "f", [n], new Uint8Array(16), {fregisters});
            let t = Math.fround(a);
            const fb = Math.fround(b);
            for (let i = 0; i < n; i++) t = Math.fround(Math.fround(t + fb) + fb);
            assert.equal(float(run.fregisters[10]), Math.fround(2 * t), [a, b, n].join(" "));
            for (const reg of REGISTER_CLASSES[F].saved) assert.equal(run.fregisters[reg & 31], 0x5a5a0000 + (reg & 31), "fs survives");
        }
    });
}
