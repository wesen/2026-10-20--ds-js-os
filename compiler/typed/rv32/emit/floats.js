// FunctionCode's f32 operations (RV32F). Operands live on the f operand stack (ft0-ft4, encoding/registers.js
// OPERAND_STACKS); ft10 and ft11 are the scratch registers of a spilled operand. Every rounding instruction names
// round-to-nearest-even statically, so frm never matters; a product and a sum are never fused.
import {encoder} from "../encoding/instructions.js";
import {F, FA0, FT10, FT11, T5, T6, ZERO, instruction} from "../encoding/registers.js";
import {F32_LOAD, F32_STORE, F32_CONST, F32_EQ, F32_NE, F32_LT, F32_GT, F32_LE, F32_GE, F32_ABS, F32_NEG, F32_CEIL,
    F32_FLOOR, F32_TRUNC, F32_SQRT, F32_ADD, F32_SUB, F32_MUL, F32_DIV, F32_COPYSIGN, F32_CONVERT_I32_S,
    I32_REINTERPRET_F32, F32_REINTERPRET_I32, I32_TRUNC_F32, F32_MIN, F32_MAX} from "../encoding/tape.js";

const RNE = 0, RTZ = 1, RDN = 2, RUP = 3;
const RETURNED = Symbol("computed in fa0 for the return that follows");
// The tape's f32 operations, by opcode: 1 for those FunctionCode.float lowers.
export const FLOAT_OPERATIONS = new Uint8Array(256);
for (const op of [F32_LOAD, F32_STORE, F32_CONST, F32_EQ, F32_NE, F32_LT, F32_GT, F32_LE, F32_GE, F32_ABS, F32_NEG,
    F32_CEIL, F32_FLOOR, F32_TRUNC, F32_SQRT, F32_ADD, F32_SUB, F32_MUL, F32_DIV, F32_COPYSIGN, F32_CONVERT_I32_S,
    I32_REINTERPRET_F32, F32_REINTERPRET_I32, I32_TRUNC_F32, F32_MIN, F32_MAX]) FLOAT_OPERATIONS[op] = 1;
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

export class FloatMethods {
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
        case F32_CONVERT_I32_S: case F32_REINTERPRET_I32: {
            const a = this.pop(T5);
            const [out, stored] = this.floatResult(F);
            this.emit(op === F32_CONVERT_I32_S ? encoder("fcvt_s_w")(out, a, RNE) : encoder("fmv_w_x")(out, a));
            return this.floatDone(out, stored);
        }
        case I32_TRUNC_F32: case I32_REINTERPRET_F32: {
            // fcvt.w.s rtz saturates, and gives 2^31 - 1 for NaN: Typed's rule (tape.js f32.to_i32).
            const a = this.pop(FT10);
            const [out, stored] = this.floatResult(0);
            this.emit(op === I32_TRUNC_F32 ? encoder("fcvt_w_s")(out, a, RTZ) : encoder("fmv_x_w")(out, a));
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
