// The front end's value types (PICOCALC-TYPED-VALUES): the conditional expression, the u32 conversion and value records.
// Their methods are ExpressionParser's (copied onto its prototype below, as floats.js does).
//
// A value record is scalar-replaced as it is parsed: a local of a value record type is one local per leaf (its scalar
// fields, nested value records flattened in field order), consecutive from binding.index, and an expression of a value
// record type leaves its leaves on the operand stack in that order, as a call of a function with a record result
// does (WebAssembly's multi-value). A field of a local is a local.get of its leaf; storing a value is one local.set
// per leaf, the last first; a parameter of a value record type is its leaves, as consecutive parameters.
class ValueParsing {
    // u32(x) after "u32": an integer keeps its bits; f32 -> u32 truncates toward zero and saturates, NaN gives 2^32 - 1
    // (tape.js f32.to_u32).
    unsignedConversion() {
        const lex = this.lex;
        lex.expect("(");
        const type = this.expr();
        lex.expect(")");
        if (type === "f32") this.code.push(U32_TRUNC_F32);
        else if (scalarType(type) !== "i32" && !unsignedType(type) && !this.enums.has(type) && !this.distinct.has(type))
            lex.fail("u32 conversion requires an integer or an f32, got " + scalarType(type));
        return "u32";
    }

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
        if (this.values?.has(first)) return this.valueChoice(at, first);
        if (first === "f32") this.code[at + 1] = F32;
        this.code.push(ELSE);
        const second = this.expr();
        this.code.push(END);
        return this.unify(first, second);
    }

    // A conditional of value records: a block type has one value, so each arm stores its leaves into the same fresh
    // locals (if (void) a; set; else b; set; end) and the result reads them.
    valueChoice(at, type) {
        this.code[at + 1] = VOID;
        const index = this.valueLocals(type);
        this.setLeaves(type, index);
        this.code.push(ELSE);
        this.want(this.expr(), type);
        this.setLeaves(type, index);
        this.code.push(END);
        this.pushLeaves(type, index);
        return type;
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

    // The number of operand-stack values of a type: a value record's leaves, else one.
    width(type) { return this.values?.get(type)?.leaves.length ?? 1; }

    // Consecutive locals for the leaves of a value record; the first one's index.
    valueLocals(type) {
        const first = this.nextLocal;
        for (const leaf of this.values.get(type).leaves) {
            const index = this.nextLocal++;
            if (leaf === "f32") (this.floatLocals ??= []).push(index);
        }
        return first;
    }

    // A named local of a value record type (a declaration or a parameter).
    valueLocal(name, type, mutable) {
        if (this.locals.has(name)) this.lex.fail("duplicate local " + name);
        const index = this.valueLocals(type);
        this.locals.set(name, {type, index, mutable});
        return index;
    }

    pushLeaves(type, index) {
        for (let k = 0, n = this.width(type); k < n; k++) this.emitIndex(LOCAL_GET, index + k);
    }

    setLeaves(type, index) {
        for (let k = this.width(type) - 1; k >= 0; k--) this.emitIndex(LOCAL_SET, index + k);
    }

    // Drop a value nobody reads: one drop per leaf.
    drop(type) {
        for (let k = this.width(type); k > 0; k--) this.code.push(DROP);
    }

    // Type(a, b, ...) after its "(": one argument per field, in field order, each of its field's type (a nested value
    // record takes any expression of its type). The leaves stay on the operand stack.
    construct(type) {
        const lex = this.lex;
        let first = true;
        for (const field of this.values.get(type).fields.values()) {
            if (!first) lex.expect(",");
            first = false;
            this.want(this.expr(), field.type);
        }
        lex.expect(")");
        return type;
    }

    valueField(type, name) {
        const field = this.values.get(type).fields.get(name);
        if (!field) this.lex.fail("unknown field " + type + "." + name);
        return field;
    }

    // Part of a value record held in locals from index: .field follows nested value records, then the part is read,
    // one local.get per leaf. A method call on a value takes its leaves as the receiver.
    valueRead(type, index) {
        const lex = this.lex;
        while (this.values.has(type) && lex.token.value === ".") {
            lex.next();
            const name = lex.ident();
            if (lex.token.value === "(") {
                this.pushLeaves(type, index);
                return this.memberCall(this.aliases?.methods.get(type), type, true, name);
            }
            const field = this.valueField(type, name);
            type = field.type;
            index += field.offset;
        }
        this.pushLeaves(type, index);
        return type;
    }

    // .name of a value record on the operand stack (a call's result, a constructor, a conditional): its leaves go to
    // fresh locals and the field is read from them.
    stackField(type, name) {
        const index = this.valueLocals(type);
        this.setLeaves(type, index);
        const field = this.valueField(type, name);
        return this.valueRead(field.type, index + field.offset);
    }
}
for (const name of Object.getOwnPropertyNames(ValueParsing.prototype))
    if (name !== "constructor") Object.defineProperty(ExpressionParser.prototype, name,
        Object.getOwnPropertyDescriptor(ValueParsing.prototype, name));
