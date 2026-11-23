// The front end's parser and type checker, part one: the tape writer and the expressions (prefix, postfix and
// binary operators, calls, members, buffer literals). There is no syntax tree: each construct is checked and its
// tape written as it is parsed.
//
// The tape's opcodes, block types and cell counts (tape.js, loaded first), shared by every later module of the bundle.
const {UNREACHABLE, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, CALL, DROP, LOCAL_GET, LOCAL_SET,
    I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S,
    I32_LE_S, I32_GE_S, I32_GE_U, I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_AND, I32_OR, I32_XOR,
    I32_SHL, I32_SHR_S, I32_SHR_U, RETURN, CHECKED_ADDRESS, LITERAL_STORES, UNCHECKED_ADDRESS, I32, VOID, cells: CELLS} = typedTape;
const LITERAL = Symbol("integer literal");
const scalarType = type => type === LITERAL ? "i32" : type;
// [precedence, operand type (null: any scalar), result type, opcode], with JavaScript's precedences. A distinct
// integer type passes through the NOMINAL levels (| ^ &, equality, relational, + -): two operands of one distinct
// type, or one and a literal, and an i32 result keeps the type. Shifts and * / % take and give i32.
const BINARY = Object.assign(Object.create(null), Object.fromEntries([
    ["||", [1, "bool", "bool"]], ["&&", [2, "bool", "bool"]],
    ["|", [3, "i32", "i32", I32_OR]], ["^", [4, "i32", "i32", I32_XOR]], ["&", [5, "i32", "i32", I32_AND]],
    ["===", [6, null, "bool", I32_EQ]], ["!==", [6, null, "bool", I32_NE]],
    ["<", [7, "i32", "bool", I32_LT_S]],
    ["<=", [7, "i32", "bool", I32_LE_S]], [">", [7, "i32", "bool", I32_GT_S]],
    [">=", [7, "i32", "bool", I32_GE_S]],
    ["<<", [8, "i32", "i32", I32_SHL]], [">>", [8, "i32", "i32", I32_SHR_S]], [">>>", [8, "i32", "i32", I32_SHR_U]],
    ["+", [9, "i32", "i32", I32_ADD]], ["-", [9, "i32", "i32", I32_SUB]],
    ["*", [10, "i32", "i32", I32_MUL]], ["/", [10, "i32", "i32", I32_DIV_S]],
    ["%", [10, "i32", "i32", I32_REM_S]],
]));
const NOMINAL = new Set([3, 4, 5, 6, 7, 9]);
const PREFIX = 11; // the operand of a prefix operator binds tighter than every binary operator

class ExpressionParser {
    constructor(lexer, functions, records, edges, functionBase, enums = new Map(), distinct = new Set(), aliases) {
        this.aliases = aliases;
        this.records = records;
        this.enums = enums;
        this.distinct = distinct;
        this.functions = functions;
        this.edges = edges;
        this.functionBase = functionBase;
        this.lex = lexer;
        this.locals = new Map();
        this.code = [];
        this.nextLocal = 0;
        this.depth = 0;
        this.controls = 0;
        this.loopExits = [];
    }

    local(name, type, mutable = false) {
        if (this.locals.has(name)) this.lex.fail("duplicate local " + name);
        const index = this.nextLocal++;
        this.locals.set(name, { type, index, mutable });
        return index;
    }

    want(type, expected) {
        if (type === expected || type === LITERAL && (expected === "i32" || this.distinct.has(expected))) return;
        if (expected === "bool" && type === "BoolExpr")
            this.lex.fail("per-hit BoolExpr cannot control scene construction; use a staged select");
        this.lex.fail("expected " + expected + ", got " + scalarType(type));
    }

    // The tape writer: one cell per opcode and per operand (tape.js). The backends read the tape; the Wasm
    // backend serializes it (encodeFunction).
    emitConst(value) { this.code.push(I32_CONST, value); }
    emitIndex(op, index) { this.code.push(op, index); }
    emitMemory(op, alignment, offset) { this.code.push(op, alignment, offset); }

    // The checked address of receiver[position] (a UTF-16 unit after the capacity word).
    codeUnitAddress(receiver, position) {
        this.code.push(CHECKED_ADDRESS, receiver, position);
    }

    // The checked stores of a literal's UTF-16 units from address + 4; fn.literals holds the text.
    emitLiteralStores(address, value) {
        this.literals ??= [];
        this.code.push(LITERAL_STORES, address, this.literals.push(value) - 1);
    }

    minmax() {
        const lex = this.lex;
        { if (lex.token.value !== ".") lex.fail("expected ."); lex.next(); }
        const name = lex.ident();
        if (name !== "min" && name !== "max") lex.fail("expected Math.min or Math.max");
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const a = this.nextLocal++;
        const b = this.nextLocal++;
        this.want(this.expr(), "i32");
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
    }

    prefix() {
        const lex = this.lex;
        switch (lex.token.value) {
        case "(": {
            lex.next();
            const type = this.expr();
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            return type;
        }
        case "!": {
            lex.next();
            this.want(this.expr(PREFIX), "bool");
            this.code.push(I32_EQZ);
            return "bool";
        }
        case "-": {
            lex.next();
            if (lex.token.kind === "int" && Number(lex.token.value) === 2147483648) {
                lex.next();
                this.emitConst(-2147483648);
                return LITERAL;
            }
            this.emitConst(0);
            const type = this.expr(PREFIX);
            this.want(type, "i32");
            this.code.push(I32_SUB);
            return type;
        }
        case "~": { // ~x is x ^ -1
            lex.next();
            const type = this.expr(PREFIX);
            this.want(type, "i32");
            this.emitConst(-1);
            this.code.push(I32_XOR);
            return type;
        }
        case "true": {
            lex.next();
            this.emitConst(1);
            return "bool";
        }
        case "false": {
            lex.next();
            this.emitConst(0);
            return "bool";
        }
        case "Math": {
            lex.next();
            this.minmax();
            return "i32";
        }
        case "i32": {
            lex.next();
            { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
            const type = this.expr();
            if (!this.enums.has(type) && !this.distinct.has(type))
                lex.fail("i32 conversion requires an enum or a distinct integer, got " + scalarType(type));
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            return "i32";
        }
        }
        if (lex.token.kind === "int") {
            const value = lex.integerValue();
            if (value > 2147483647) lex.fail("i32 literal out of range");
            this.emitConst(value);
            lex.next();
            return LITERAL;
        }
        const name = lex.ident();
        if ((lex.token.value === "(" && (lex.next(), true))) {
            const generatedType = lex.generatedWordType?.(name);
            if (generatedType || this.distinct.has(name)) {
                this.want(this.expr(), "i32");
                { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
                return generatedType ?? name;
            }
            return this.call(name);
        }
        const binding = this.locals.get(name);
        if (!binding && this.enums.has(name)) {
            { if (lex.token.value !== ".") lex.fail("expected ."); lex.next(); }
            const member = lex.ident();
            const value = this.enums.get(name).get(member);
            if (value === undefined) lex.fail("unknown enum member " + name + "." + member);
            this.emitConst(value);
            return name;
        }
        if (!binding && this.aliases?.namespaces.has(name)) {
            lex.expect(".");
            return this.memberCall(this.aliases.namespaces.get(name), name, false);
        }
        if (!binding) lex.fail("unknown local " + name);
        if (binding.patternPoint) {
            this.emitConst(0);
            return "SurfacePoint";
        }
        if (binding.type === "i32" || binding.type === "bool") {
            this.emitIndex(LOCAL_GET, binding.index);
            return binding.type;
        }
        if ((binding.type === "string" || binding.type === "buffer") && (lex.token.value === "." && (lex.next(), true))) {
            if (binding.type === "buffer" && (lex.token.value === "writeLiteral" && (lex.next(), true))) {
                this.emitConst(this.bufferLiteral(binding.index));
                return "i32";
            }
            if ((lex.token.value === "length" && (lex.next(), true))) {
                this.emitIndex(LOCAL_GET, binding.index);
                this.code.push(I32_LOAD, 2, 0);
                return "i32";
            }
            { if (lex.token.value !== "charCodeAt") lex.fail("expected charCodeAt"); lex.next(); }
            { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
            const pos = this.nextLocal++;
            this.want(this.expr(), "i32");
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            this.emitIndex(LOCAL_SET, pos);
            this.codeUnitAddress(binding.index, pos);
            this.code.push(I32_LOAD16_U, 1, 4);
            return "i32";
        }
        this.emitIndex(LOCAL_GET, binding.index);
        return binding.type;
    }

    expr(minPrecedence = 0) {
        const lex = this.lex;
        if (++this.depth > 128) lex.fail("expression nesting limit exceeded");
        let type = this.prefix();
        if (lex.token.value === ".") type = this.postfix(type);
        while (true) {
            const op = lex.token.value;
            const rule = BINARY[op];
            if (!rule || rule[0] < minPrecedence) break;
            const precedence = rule[0], input = rule[1], result = rule[2], opcode = rule[3];
            if (op === "&&" || op === "||") {
                this.want(type, "bool");
                lex.next();
                this.code.push(IF, I32);
                if (op === "&&") {
                    this.want(this.expr(precedence + 1), "bool");
                    this.code.push(ELSE);
                    this.emitConst(0);
                } else {
                    this.emitConst(1);
                    this.code.push(ELSE);
                    this.want(this.expr(precedence + 1), "bool");
                }
                this.code.push(END);
                type = "bool";
            } else {
                const numeric = NOMINAL.has(precedence);
                const nominal = numeric && this.distinct.has(type);
                if (!input && !nominal && scalarType(type) !== "i32" && type !== "bool" && !this.enums.has(type))
                    lex.fail("expected scalar equality operands");
                let expected = nominal || !input ? scalarType(type) : input;
                this.want(type, expected);
                lex.next();
                const right = this.expr(precedence + 1);
                if (numeric && type === LITERAL && this.distinct.has(right)) expected = right;
                this.want(right, expected);
                this.code.push(opcode);
                type = result === "i32" ? expected : result;
            }
        }
        this.depth--;
        return type;
    }

    bufferLiteral(receiver) {
        const lex = this.lex;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const position = this.nextLocal++, address = this.nextLocal++;
        this.want(this.expr(), "i32");
        this.emitIndex(LOCAL_SET, position);
        { if (lex.token.value !== ",") lex.fail("expected ,"); lex.next(); }
        if (lex.token.kind !== "str") lex.fail("expected a double-quoted string literal");
        const value = JSON.parse(lex.token.value);
        if (value.length > 1022) lex.fail("buffer literal exceeds 1022 UTF-16 units");
        lex.next();
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        if (!value.length) return 0;
        // Check the whole write before mutating the buffer. A negative start
        // is outside the unsigned bound even if the literal would end inside.
        this.codeUnitAddress(receiver, position);
        this.emitIndex(LOCAL_SET, address);
        this.emitIndex(LOCAL_GET, position);
        this.emitConst(value.length - 1);
        this.code.push(I32_ADD);
        this.emitIndex(LOCAL_GET, receiver);
        this.code.push(I32_LOAD, 2, 0, I32_GE_U, IF, VOID, UNREACHABLE, END);
        this.emitLiteralStores(address, value);
        return value.length;
    }

    patternBody() {
        const lex = this.lex;
        const parameter = lex.ident();
        lex.expect("=");
        lex.expect(">");
        if (!this.distinct.has("SurfacePoint")) lex.fail("pattern requires a distinct SurfacePoint type");
        if (lex.token.value === "{") lex.fail("pattern callbacks require one expression");
        const outer = this.locals.get(parameter);
        this.locals.set(parameter, {type: "SurfacePoint", mutable: false, patternPoint: true});
        try {
            const result = this.expr();
            if (lex.token.value === "=") lex.fail("pattern callback captures are read-only");
            if (!this.distinct.has(result) || !["ScalarExpr", "Vec2Expr", "BoolExpr", "ColorExpr"].includes(result))
                lex.fail("pattern must return a staged expression handle");
            lex.expect(")");
            return result;
        } finally {
            if (outer) this.locals.set(parameter, outer);
            else this.locals.delete(parameter);
        }
    }

    // The receiver value, when present, is already on the operand stack.
    memberCall(members, owner, receiver, name = this.lex.ident()) {
        const member = members?.get(name);
        if (!member) this.lex.fail("unknown member " + owner + "." + name);
        this.lex.expect("(");
        return this.call(member.target, receiver ? 1 : 0, member.options);
    }

    postfix(type) {
        const lex = this.lex;
        while (lex.accept(".")) {
            const name = lex.ident();
            if (lex.token.value === "(") {
                type = this.memberCall(this.aliases?.methods.get(type), scalarType(type), true, name);
            } else {
                const field = this.field(type, name);
                this.emitMemory(I32_LOAD, 2, field.offset);
                type = field.type;
            }
        }
        return type;
    }

    // A grouped options argument feeds the trailing scalar parameters of the
    // direct target. A literal has no address. Preserve written order even if
    // it differs from field order; spill only the suffix needing permutation.
    optionArgument(options) {
        const lex = this.lex;
        const fields = this.records.get(options);
        if (!lex.accept("{")) {
            this.want(this.expr(), options);
            const record = this.nextLocal++;
            this.emitIndex(LOCAL_SET, record);
            for (const field of fields.values()) {
                this.emitIndex(LOCAL_GET, record);
                this.emitMemory(I32_LOAD, 2, field.offset);
            }
            return;
        }
        const seen = new Set(), pending = new Map();
        while (lex.token.value !== "}") {
            const name = lex.ident();
            const field = fields.get(name);
            if (!field) lex.fail("unknown option " + options + "." + name);
            if (seen.has(name)) lex.fail("duplicate option " + options + "." + name);
            lex.expect(":");
            this.want(this.expr(), field.type);
            if (pending.size || field.offset !== 4 * seen.size) {
                const temp = this.nextLocal++;
                this.emitIndex(LOCAL_SET, temp);
                pending.set(name, temp);
            }
            seen.add(name);
            if (!lex.accept(",")) break;
        }
        lex.expect("}");
        for (const name of fields.keys()) {
            if (!seen.has(name)) lex.fail("missing option " + options + "." + name);
            if (pending.has(name)) this.emitIndex(LOCAL_GET, pending.get(name));
        }
    }

    call(name, first = 0, options = null) {
        const lex = this.lex;
        if (name === "pattern" && lex.token.kind === "id" && !this.functions.has(name)) {
            const look = new Lexer(lex.source, lex.token.at + lex.token.value.length, lex.end);
            if (look.token.value === "=" && lex.source[look.offset] === ">") return this.patternBody();
        }
        const callee = this.functions.get(name);
        if (!callee) lex.fail("unknown function " + name);
        const startField = lex.generatedStartFields?.get(name);
        if (startField) {
            const named = this.locals.get("state");
            const state = named?.type === "WorldState" ? named :
                [...this.locals.values()].find(local => local.type === "WorldState");
            if (!state) lex.fail("start requires an ambient WorldState binding");
            this.emitIndex(LOCAL_GET, state.index);
            this.emitMemory(I32_LOAD, 2, this.records.get("WorldState").get(startField).offset);
            this.code.push(I32_EQZ, IF, I32);
        }
        const end = options ? callee.params.length - this.records.get(options).size : callee.params.length;
        for (let i = first; i < end; i++) {
            if (i !== first) lex.expect(",");
            this.want(this.expr(), callee.params[i]);
        }
        if (options) {
            if (end !== first) lex.expect(",");
            this.optionArgument(options);
        }
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        this.emitIndex(CALL, callee.index);
        const ordinal = callee.index - this.functionBase;
        if (this.edges && ordinal >= 0 && !this.edges.includes(ordinal))
            this.edges.push(ordinal);
        if (startField) {
            this.code.push(ELSE);
            this.emitConst(0);
            this.code.push(END);
        }
        return callee.result;
    }

    field(type, name = this.lex.ident()) {
        const field = this.records.get(type)?.get(name);
        if (!field) this.lex.fail("unknown field " + scalarType(type) + "." + name);
        return field;
    }
}
