// The front end's value types (PICOCALC-TYPED-VALUES): the conditional expression. Their methods are ExpressionParser's
// (copied onto its prototype below, as floats.js does).
class ValueParsing {
    // The conditional expression after its condition: if (result T) a else b end. The block type is the first
    // arm's, written once that arm is parsed; both arms have one type (a literal takes the other arm's).
    choice(condition) {
        const lex = this.lex;
        this.want(condition, "bool");
        lex.next();
        const at = this.code.length;
        this.code.push(IF, I32);
        const first = this.expr();
        lex.expect(":");
        if (first === "f32") this.code[at + 1] = F32;
        this.code.push(ELSE);
        const second = this.expr();
        this.code.push(END);
        return this.unify(first, second);
    }

    // The type of two values that meet (the arms of a conditional): one type, or a literal and an integer type.
    unify(a, b) {
        if (a === b) return a;
        const integer = type => type === "i32" || type === "u32" || this.distinct.has(type);
        if (a === LITERAL && (integer(b) || b === U32_LITERAL)) return b;
        if (b === LITERAL && (integer(a) || a === U32_LITERAL)) return a;
        if (unsignedType(a) && unsignedType(b)) return "u32";
        this.lex.fail("conditional arms have different types: " + scalarType(a) + " and " + scalarType(b));
    }
}
for (const name of Object.getOwnPropertyNames(ValueParsing.prototype))
    if (name !== "constructor") Object.defineProperty(ExpressionParser.prototype, name,
        Object.getOwnPropertyDescriptor(ValueParsing.prototype, name));
