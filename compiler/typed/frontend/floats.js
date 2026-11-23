// The front end's f32 parts: the operators and Math functions on f32, the bits of an f32 literal, Math.min and
// Math.max (on two i32 or two f32), the address of an f32 buffer element, and the tape surgery of a negated or
// converted literal. Their methods are ExpressionParser's (copied onto its prototype below).
// The operators on two f32 operands: [result type, opcode]. No implicit conversion: an i32 operand is an error.
const FLOAT_BINARY = Object.assign(Object.create(null), {
    "+": ["f32", F32_ADD], "-": ["f32", F32_SUB], "*": ["f32", F32_MUL], "/": ["f32", F32_DIV],
    "===": ["bool", F32_EQ], "!==": ["bool", F32_NE], "<": ["bool", F32_LT], "<=": ["bool", F32_LE],
    ">": ["bool", F32_GT], ">=": ["bool", F32_GE],
});
// Math functions on f32: [parameter count, opcode]. min and max also take two i32 (minmax).
const FLOAT_MATH = Object.assign(Object.create(null), {
    sqrt: [1, F32_SQRT], abs: [1, F32_ABS], floor: [1, F32_FLOOR], ceil: [1, F32_CEIL], trunc: [1, F32_TRUNC],
    copysign: [2, F32_COPYSIGN],
});
// The IEEE bits of an f32, as the i32 the tape's f32.const cell holds.
const F32_BITS = new Int32Array(1), F32_VIEW = new Float32Array(F32_BITS.buffer);
const f32Bits = value => { F32_VIEW[0] = value; return F32_BITS[0]; };
class FloatParsing {
    // Remove n cells at `at` (a tape the front end is still writing; an inspection tape keeps its spans aligned).
    removeCells(at, n) {
        const code = this.code;
        code.copyWithin(at, at + n);
        code.length -= n;
        code.spans?.splice(at, n);
    }

    // Math.f(...): min and max on two i32 or two f32, the FLOAT_MATH functions, and the bit casts bitsOf(f32): i32 and
    // fromBits(i32): f32.
    math() {
        const lex = this.lex;
        { if (lex.token.value !== ".") lex.fail("expected ."); lex.next(); }
        const name = lex.ident();
        if (name === "min" || name === "max") return this.minmax(name);
        const rule = FLOAT_MATH[name];
        if (!rule && name !== "bitsOf" && name !== "fromBits") lex.fail("unknown Math function " + name);
        lex.expect("(");
        if (name === "fromBits") {
            this.want(this.expr(), "i32");
            lex.expect(")");
            this.code.push(F32_REINTERPRET_I32);
            return "f32";
        }
        this.want(this.expr(), "f32");
        if (rule?.[0] === 2) {
            lex.expect(",");
            this.want(this.expr(), "f32");
        }
        lex.expect(")");
        this.code.push(rule ? rule[1] : I32_REINTERPRET_F32);
        return rule ? "f32" : "i32";
    }

    minmax(name) {
        const lex = this.lex;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const a = this.nextLocal++;
        const b = this.nextLocal++;
        const first = this.expr();
        if (first === "f32") {
            // fmin.s and fmax.s (tape.js: f32.min_num, f32.max_num); a and b stay unused i32 locals.
            lex.expect(",");
            this.want(this.expr(), "f32");
            lex.expect(")");
            this.code.push(name === "min" ? F32_MIN : F32_MAX);
            return "f32";
        }
        this.want(first, "i32");
        this.emitIndex(LOCAL_SET, a);
        { if (lex.token.value !== ",") lex.fail("expected ,"); lex.next(); }
        this.want(this.expr(), "i32");
        this.emitIndex(LOCAL_SET, b);
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        this.emitIndex(LOCAL_GET, a);
        this.emitIndex(LOCAL_GET, b);
        this.code.push(I32_LT_S, IF, I32);
        this.emitIndex(LOCAL_GET, name === "min" ? a : b);
        this.code.push(ELSE);
        this.emitIndex(LOCAL_GET, name === "min" ? b : a);
        this.code.push(END);
        return "i32";
    }

    // The checked address of f32 element i of a buffer: UTF-16 units 2i and 2i + 1, the check on 2i + 1, the f32 at
    // offset 2 from the address of unit 2i + 1 (receiver + 4 + 4i, word-aligned). Leaves the address on the stack.
    floatAddress(receiver) {
        const position = this.nextLocal++;
        this.want(this.expr(), "i32");
        this.emitConst(1);
        this.code.push(I32_SHL);
        this.emitConst(1);
        this.code.push(I32_ADD);
        this.emitIndex(LOCAL_SET, position);
        this.codeUnitAddress(receiver, position);
    }
}
for (const name of Object.getOwnPropertyNames(FloatParsing.prototype))
    if (name !== "constructor") Object.defineProperty(ExpressionParser.prototype, name,
        Object.getOwnPropertyDescriptor(FloatParsing.prototype, name));
