// Direct Wasm emitter for PicoCalc world sources. Runs in a bare QuickJS realm.
(() => {
"use strict";
const OP = {
    if: 0x04, else: 0x05, end: 0x0b, return: 0x0f,
    get: 0x20, set: 0x21, const: 0x41, eqz: 0x45,
    lt: 0x48, add: 0x6a, sub: 0x6b, div: 0x6d,
};
const I32 = 0x7f;
const VOID = 0x40;
const LITERAL = Symbol("integer literal");
const scalarType = type => type === LITERAL ? "i32" : type;
const BINARY = new Map([
    ["||", [1, "bool", "bool"]], ["&&", [2, "bool", "bool"]],
    ["===", [3, null, "bool", 0x46]], ["!==", [3, null, "bool", 0x47]],
    ["<", [4, "i32", "bool", OP.lt]],
    ["<=", [4, "i32", "bool", 0x4c]], [">", [4, "i32", "bool", 0x4a]],
    [">=", [4, "i32", "bool", 0x4e]], [">>", [5, "i32", "i32", 0x75]],
    ["+", [6, "i32", "i32", OP.add]], ["-", [6, "i32", "i32", OP.sub]],
    ["*", [7, "i32", "i32", 0x6c]], ["/", [7, "i32", "i32", OP.div]],
    ["%", [7, "i32", "i32", 0x6f]],
]);
const TOKEN = /\s*(?:\/\/[^\n]*(?:\n|$)\s*)*(?:(?<id>[a-zA-Z_]\w*)|(?<int>\d+)|(?<str>"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")|(?<op>!==|===|<=|>=|>>|\|\||&&|[{}():;,.=\-+*/%!<>]))/y;
// The signature pass only needs delimiters. The body parser checks token syntax.
const BODY_TOKEN = /[{}]|\/\/[^\n]*|"(?:[^"\\\n]|\\[^\n])*"/g;
const RESERVED = new Set(["function", "if", "const", "return", "bool", "i32",
    "true", "false", "Math", "let", "while", "string", "record", "buffer",
    "else", "for", "break", "enum", "match", "type", "distinct",
    "async", "await"]);

function unsigned(value) {
    const bytes = [];
    do {
        const part = value & 127;
        value >>>= 7;
        bytes.push(part | (value ? 128 : 0));
    } while (value);
    return bytes;
}

function signed(value) {
    const bytes = [];
    while (true) {
        const part = value & 127;
        value >>= 7;
        const done = (value === 0 && !(part & 64)) || (value === -1 && !!(part & 64));
        bytes.push(part | (done ? 0 : 128));
        if (done) return bytes;
    }
}

function vec(elements) {
    return [...unsigned(elements.length), ...elements.flat()];
}

function section(id, data) {
    return [id, ...unsigned(data.length), ...data];
}

class Lexer {
    constructor(source, start = 0, end = source.length) {
        this.source = source;
        this.offset = start;
        this.end = end;
        this.next();
    }

    next() {
        if (this.offset >= this.end) {
            this.token = {value: "", kind: "eof", at: this.offset};
            return;
        }
        TOKEN.lastIndex = this.offset;
        const match = TOKEN.exec(this.source);
        if (match && TOKEN.lastIndex <= this.end) {
            const {id, int, str, op} = match.groups;
            const value = id ?? int ?? str ?? op;
            this.token = { value, kind: id ? "id" : int ? "int" : str ? "str" : "op",
                at: TOKEN.lastIndex - value.length };
            this.offset = TOKEN.lastIndex;
            return;
        }
        this.token = { value: "", kind: "eof", at: this.offset };
        if (!/^\s*(?:\/\/[^\n]*(?:\n|$)\s*)*$/.test(this.source.slice(this.offset, this.end))) {
            this.fail("invalid token");
        }
    }

    fail(message) {
        const prefix = this.source.slice(0, this.token.at).split("\n");
        throw new SyntaxError(prefix.length + ":" + (prefix.at(-1).length + 1) + ": " + message);
    }

    accept(value) {
        if (this.token.value !== value) return false;
        this.next();
        return true;
    }

    expect(value) {
        if (!this.accept(value)) this.fail("expected " + value);
    }

    ident() {
        const { value, kind } = this.token;
        if (kind !== "id" || RESERVED.has(value)) this.fail("expected identifier");
        this.next();
        return value;
    }

    type(records, enums, distinct) {
        const { value } = this.token;
        if (value !== "i32" && value !== "bool" && value !== "string" && value !== "buffer" &&
            !records.has(value) && !enums?.has(value) && !distinct?.has(value))
            this.fail("unknown type " + value);
        this.next();
        return value;
    }

    skipBody() {
        BODY_TOKEN.lastIndex = this.offset;
        let depth = 1;
        for (let token; (token = BODY_TOKEN.exec(this.source)) && BODY_TOKEN.lastIndex <= this.end;) {
            if (token[0] === "{") depth++;
            if (token[0] === "}" && --depth === 0) {
                const end = BODY_TOKEN.lastIndex;
                this.offset = end;
                this.next();
                return end;
            }
        }
        this.offset = this.end;
        this.next();
    }
}

class FunctionEmitter {
    constructor(lexer, functions, records, edges, functionBase, enums = new Map(), distinct = new Set()) {
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
        this.lex.fail("expected " + expected + ", got " + scalarType(type));
    }

    emitConst(value) {
        if (value >= -64 && value < 64) this.code.push(OP.const, value & 127);
        else this.code.push(OP.const, ...signed(value));
    }

    emitIndex(op, index) {
        if (index < 128) this.code.push(op, index);
        else this.code.push(op, ...unsigned(index));
    }

    emitMemory(op, alignment, offset) {
        if (offset < 128) this.code.push(op, alignment, offset);
        else this.code.push(op, alignment, ...unsigned(offset));
    }

    minmax() {
        const lex = this.lex;
        lex.expect(".");
        const name = lex.ident();
        if (name !== "min" && name !== "max") lex.fail("expected Math.min or Math.max");
        lex.expect("(");
        const a = this.nextLocal++;
        const b = this.nextLocal++;
        this.want(this.expr(), "i32");
        this.emitIndex(OP.set, a);
        lex.expect(",");
        this.want(this.expr(), "i32");
        this.emitIndex(OP.set, b);
        lex.expect(")");
        this.emitIndex(OP.get, a);
        this.emitIndex(OP.get, b);
        this.code.push(OP.lt, OP.if, I32);
        this.emitIndex(OP.get, name === "min" ? a : b);
        this.code.push(OP.else);
        this.emitIndex(OP.get, name === "min" ? b : a);
        this.code.push(OP.end);
    }

    prefix() {
        const lex = this.lex;
        if (lex.accept("(")) {
            const type = this.expr();
            lex.expect(")");
            return type;
        }
        if (lex.accept("!")) {
            this.want(this.expr(8), "bool");
            this.code.push(OP.eqz);
            return "bool";
        }
        if (lex.accept("-")) {
            if (lex.token.kind === "int" && Number(lex.token.value) === 2147483648) {
                lex.next();
                this.emitConst(-2147483648);
                return LITERAL;
            }
            this.emitConst(0);
            const type = this.expr(8);
            this.want(type, "i32");
            this.code.push(OP.sub);
            return type;
        }
        if (lex.token.kind === "int") {
            const value = Number(lex.token.value);
            if (value > 2147483647) lex.fail("i32 literal out of range");
            this.emitConst(value);
            lex.next();
            return LITERAL;
        }
        if (lex.accept("true")) {
            this.emitConst(1);
            return "bool";
        }
        if (lex.accept("false")) {
            this.emitConst(0);
            return "bool";
        }
        if (lex.accept("Math")) {
            this.minmax();
            return "i32";
        }
        if (lex.accept("i32")) {
            lex.expect("(");
            const type = this.expr();
            if (!this.enums.has(type) && !this.distinct.has(type))
                lex.fail("i32 conversion requires an enum or a distinct integer, got " + scalarType(type));
            lex.expect(")");
            return "i32";
        }
        const name = lex.ident();
        if (lex.accept("(")) {
            const generatedType = lex.generatedWordType?.(name);
            if (generatedType || this.distinct.has(name)) {
                this.want(this.expr(), "i32");
                lex.expect(")");
                return generatedType ?? name;
            }
            return this.call(name);
        }
        const binding = this.locals.get(name);
        if (!binding && this.enums.has(name)) {
            lex.expect(".");
            const member = lex.ident();
            const value = this.enums.get(name).get(member);
            if (value === undefined) lex.fail("unknown enum member " + name + "." + member);
            this.emitConst(value);
            return name;
        }
        if (!binding) lex.fail("unknown local " + name);
        if (this.records.has(binding.type) && lex.accept(".")) {
            this.emitIndex(OP.get, binding.index);
            const field = this.field(binding.type);
            this.emitMemory(0x28, 2, field.offset);
            return field.type;
        }
        if ((binding.type === "string" || binding.type === "buffer") && lex.accept(".")) {
            if (binding.type === "buffer" && lex.accept("writeLiteral")) {
                this.emitConst(this.bufferLiteral(binding.index));
                return "i32";
            }
            if (lex.accept("length")) {
                this.emitIndex(OP.get, binding.index);
                this.code.push(0x28, 2, 0);
                return "i32";
            }
            lex.expect("charCodeAt");
            lex.expect("(");
            const pos = this.nextLocal++;
            this.want(this.expr(), "i32");
            lex.expect(")");
            this.emitIndex(OP.set, pos);
            this.codeUnitAddress(binding.index, pos);
            this.code.push(0x2f, 1, 4);
            return "i32";
        }
        this.emitIndex(OP.get, binding.index);
        return binding.type;
    }

    expr(minPrecedence = 0) {
        if (++this.depth > 128) this.lex.fail("expression nesting limit exceeded");
        let type = this.prefix();
        while (true) {
            const op = this.lex.token.value;
            const rule = BINARY.get(op);
            if (!rule || rule[0] < minPrecedence) break;
            const [precedence, input, result, opcode] = rule;
            if (op === "&&" || op === "||") {
                this.want(type, "bool");
                this.lex.next();
                this.code.push(OP.if, I32);
                if (op === "&&") {
                    this.want(this.expr(precedence + 1), "bool");
                    this.code.push(OP.else);
                    this.emitConst(0);
                } else {
                    this.emitConst(1);
                    this.code.push(OP.else);
                    this.want(this.expr(precedence + 1), "bool");
                }
                this.code.push(OP.end);
                type = "bool";
            } else {
                const numeric = precedence === 3 || precedence === 4 || precedence === 6;
                const nominal = numeric && this.distinct.has(type);
                if (!input && !nominal && scalarType(type) !== "i32" && type !== "bool" && !this.enums.has(type))
                    this.lex.fail("expected scalar equality operands");
                let expected = nominal || !input ? scalarType(type) : input;
                this.want(type, expected);
                this.lex.next();
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

    result(type, branch) {
        this.lex.expect("return");
        this.want(this.expr(), type);
        this.lex.expect(";");
        if (branch) this.code.push(OP.return);
    }

    codeUnitAddress(receiver, position) {
        this.emitIndex(OP.get, position);
        this.emitIndex(OP.get, receiver);
        this.code.push(0x28, 2, 0, 0x4f, OP.if, VOID, 0x00, OP.end);
        this.emitIndex(OP.get, receiver);
        this.emitIndex(OP.get, position);
        this.emitConst(1);
        this.code.push(0x74, OP.add);
    }

    bufferWrite(receiver) {
        const lex = this.lex;
        if (lex.accept("writeLiteral")) {
            this.bufferLiteral(receiver);
            return;
        }
        lex.expect("setCharCodeAt");
        lex.expect("(");
        const position = this.nextLocal++;
        this.want(this.expr(), "i32");
        this.emitIndex(OP.set, position);
        lex.expect(",");
        this.codeUnitAddress(receiver, position);
        this.want(this.expr(), "i32");
        lex.expect(")");
        this.code.push(0x3b, 1, 4); // i32.store16 into the buffer's data after its capacity
    }

    bufferLiteral(receiver) {
        const lex = this.lex;
        lex.expect("(");
        const position = this.nextLocal++, address = this.nextLocal++;
        this.want(this.expr(), "i32");
        this.emitIndex(OP.set, position);
        lex.expect(",");
        if (lex.token.kind !== "str") lex.fail("expected a double-quoted string literal");
        const value = JSON.parse(lex.token.value);
        if (value.length > 1022) lex.fail("buffer literal exceeds 1022 UTF-16 units");
        lex.next();
        lex.expect(")");
        if (!value.length) return 0;
        // Check the whole write before mutating the buffer. A negative start
        // is outside the unsigned bound even if the literal would end inside.
        this.codeUnitAddress(receiver, position);
        this.emitIndex(OP.set, address);
        this.emitIndex(OP.get, position);
        this.emitConst(value.length - 1);
        this.code.push(OP.add);
        this.emitIndex(OP.get, receiver);
        this.code.push(0x28, 2, 0, 0x4f, OP.if, VOID, 0x00, OP.end);
        for (let i = 0; i < value.length; i++) {
            this.emitIndex(OP.get, address);
            this.emitConst(value.charCodeAt(i));
            this.emitMemory(0x3b, 1, 4 + 2 * i);
        }
        return value.length;
    }

    call(name) {
        const lex = this.lex;
        const callee = this.functions.get(name);
        if (!callee) lex.fail("unknown function " + name);
        const startField = lex.generatedStartFields?.get(name);
        if (startField) {
            const named = this.locals.get("state");
            const state = named?.type === "WorldState" ? named :
                [...this.locals.values()].find(local => local.type === "WorldState");
            if (!state) lex.fail("start requires an ambient WorldState binding");
            this.emitIndex(OP.get, state.index);
            this.emitMemory(0x28, 2, this.records.get("WorldState").get(startField).offset);
            this.code.push(OP.eqz, OP.if, I32);
        }
        for (let i = 0; i < callee.params.length; i++) {
            if (i) lex.expect(",");
            this.want(this.expr(), callee.params[i]);
        }
        lex.expect(")");
        this.emitIndex(0x10, callee.index);
        const ordinal = callee.index - this.functionBase;
        if (this.edges && ordinal >= 0 && !this.edges.includes(ordinal))
            this.edges.push(ordinal);
        if (startField) {
            this.code.push(OP.else);
            this.emitConst(0);
            this.code.push(OP.end);
        }
        return callee.result;
    }

    field(type) {
        const name = this.lex.ident();
        const field = this.records.get(type)?.get(name);
        if (!field) this.lex.fail("unknown field " + type + "." + name);
        return field;
    }

    block(result) {
        if (++this.depth > 128) this.lex.fail("block nesting limit exceeded");
        this.lex.expect("{");
        const enclosing = this.locals;
        this.locals = new Map(enclosing);
        while (!this.lex.accept("}")) this.statement(result);
        this.locals = enclosing;
        this.depth--;
    }

    conditional(result) {
        const lex = this.lex;
        const enclosing = this.controls;
        do {
            if (this.controls - enclosing + this.depth >= 128) lex.fail("block nesting limit exceeded");
            lex.expect("(");
            this.want(this.expr(), "bool");
            lex.expect(")");
            this.code.push(OP.if, VOID);
            this.controls++;
            if (lex.token.value === "{") this.block(result);
            else this.result(result, true);
            if (!lex.accept("else")) break;
            this.code.push(OP.else);
            if (lex.accept("if")) continue;
            if (lex.token.value === "{") this.block(result);
            else this.result(result, true);
            break;
        } while (true);
        while (this.controls > enclosing) {
            this.code.push(OP.end);
            this.controls--;
        }
    }

    loop(result, counted) {
        const lex = this.lex;
        const enclosing = this.locals;
        lex.expect("(");
        if (counted) {
            this.locals = new Map(enclosing);
            if (lex.token.value === "let") this.declaration();
            else this.assignment(lex.ident());
            lex.expect(";");
        }
        // Expression control blocks close within expr(), before any break can appear.
        this.loopExits.push(this.controls);
        this.controls += 2;
        this.code.push(0x02, VOID, 0x03, VOID);
        this.want(this.expr(), "bool");
        this.code.push(OP.eqz, 0x0d, 1);
        let update;
        if (counted) {
            lex.expect(";");
            const loopCode = this.code;
            this.code = [];
            this.assignment(lex.ident());
            update = this.code;
            this.code = loopCode;
        }
        lex.expect(")");
        this.block(result);
        if (update) {
            for (const cell of update) this.code.push(cell);
        }
        this.code.push(0x0c, 0, OP.end, OP.end);
        this.controls -= 2;
        this.loopExits.pop();
        this.locals = enclosing;
    }

    declaration() {
        const lex = this.lex;
        const mutable = lex.token.value === "let";
        lex.next();
        const id = lex.ident();
        const annotation = lex.accept(":") ? lex.type(this.records, this.enums, this.distinct) : null;
        if (mutable && annotation !== null && lex.isGeneratedLocal?.(id) && lex.token.value === ";") {
            // Every continuation path reaches the original initializer or a reload
            // before reading this slot, including on targets with uninitialized frames.
            this.local(id, annotation, true);
            return;
        }
        lex.expect("=");
        const type = this.expr();
        if (annotation !== null) this.want(type, annotation);
        this.emitIndex(OP.set, this.local(id, annotation ?? scalarType(type), mutable));
    }

    assignment(id, statement = false) {
        const lex = this.lex;
        const local = this.locals.get(id);
        if (!local) lex.fail("unknown local " + id);
        if (statement && lex.accept(".")) {
            if (local.type === "buffer") this.bufferWrite(local.index);
            else {
                const field = this.field(local.type);
                this.emitIndex(OP.get, local.index);
                lex.expect("=");
                this.want(this.expr(), field.type);
                this.emitMemory(0x36, 2, field.offset);
            }
        } else {
            if (!local.mutable) lex.fail("expected mutable local " + id);
            lex.expect("=");
            this.want(this.expr(), local.type);
            this.emitIndex(OP.set, local.index);
        }
    }

    matchGroup(slot, values) {
        // A contiguous interval can be compared with one unsigned bound check,
        // including when the declared values cross zero or reach i32's limits.
        values.sort((a, b) => a - b);
        let joins = 0;
        for (let i = 0; i < values.length;) {
            const first = values[i++];
            let last = first;
            while (values[i] === last + 1) last = values[i++];
            if (first === last) {
                this.emitIndex(OP.get, slot);
                this.emitConst(first);
                this.code.push(0x46);
            } else {
                this.emitConst((last - first) | 0);
                this.emitIndex(OP.get, slot);
                if (first !== 0) {
                    this.emitConst(first);
                    this.code.push(OP.sub);
                }
                this.code.push(0x4f);
            }
            if (i < values.length) {
                this.code.push(OP.if, I32);
                this.emitConst(1);
                this.code.push(OP.else);
                joins++;
            }
        }
        while (joins-- > 0) this.code.push(OP.end);
    }

    match(result) {
        const lex = this.lex;
        lex.expect("(");
        const type = this.expr();
        const members = this.enums.get(type);
        if (!members) lex.fail("match requires an enum, got " + scalarType(type));
        lex.expect(")");
        const slot = this.nextLocal++;
        this.emitIndex(OP.set, slot);
        lex.expect("{");
        const seen = new Set();
        const enclosing = this.controls;
        while (!lex.accept("}")) {
            const values = [];
            do {
                const member = lex.ident();
                if (!members.has(member)) lex.fail("unknown case " + member + " in " + type);
                if (seen.has(member)) lex.fail("useless case " + member);
                seen.add(member);
                values.push(members.get(member));
            } while (lex.accept(","));
            lex.expect(":");
            this.matchGroup(slot, values);
            this.code.push(OP.if, VOID);
            this.controls++;
            this.block(result);
            this.code.push(OP.else);
        }
        const missing = [...members.keys()].filter(member => !seen.has(member));
        if (missing.length) lex.fail("match on " + type + " does not cover: " + missing.join(", "));
        this.code.push(0x00); // A raw ABI word outside the declared domain traps.
        while (this.controls > enclosing) {
            this.code.push(OP.end);
            this.controls--;
        }
    }

    statement(result) {
        const lex = this.lex;
        if (lex.accept("if")) {
            this.conditional(result);
            return;
        }
        if (lex.accept("match")) {
            this.match(result);
            return;
        }
        if (lex.token.value === "return") {
            this.result(result, true);
            return;
        }
        if (lex.token.value === "while" || lex.token.value === "for") {
            const counted = lex.accept("for");
            if (!counted) lex.expect("while");
            this.loop(result, counted);
            return;
        }
        if (lex.accept("break")) {
            const exit = this.loopExits.at(-1);
            if (exit === undefined) lex.fail("break outside a loop");
            lex.expect(";");
            this.emitIndex(0x0c, this.controls - exit - 1);
            return;
        }
        if (lex.token.value === "const" || lex.token.value === "let") {
            this.declaration();
        } else {
            const id = lex.ident();
            if (lex.accept("(")) {
                this.call(id);
                this.code.push(0x1a); // drop the unused call result
            } else {
                this.assignment(id, true);
            }
        }
        lex.expect(";");
    }

    function(fn) {
        const lex = this.lex;
        const {params, paramNames, result} = fn;
        for (let i = 0; i < params.length; i++) this.local(paramNames[i], params[i]);
        lex.offset = fn.bodyAt;
        lex.next();
        lex.expect("{");
        while (lex.token.value !== "return") this.statement(result);
        this.result(result, false);
        lex.expect("}");
        this.code.push(OP.end);
        fn.nlocals = this.nextLocal - params.length;
        fn.code = this.code;
        return this.finish(fn);
    }

    finish(fn) {
        const locals = fn.nlocals ? [1, ...unsigned(fn.nlocals), I32] : [0];
        const body = [...locals, ...fn.code];
        fn.body = [...unsigned(body.length), ...body];
        return fn;
    }
}

// The RV32 backend consumes one number per opcode and immediate. Only the
// Wasm writer needs variable-length integers and framed function bodies.
class NumericFunctionEmitter extends FunctionEmitter {
    emitConst(value) { this.code.push(OP.const, value); }
    emitIndex(op, index) { this.code.push(op, index); }
    emitMemory(op, alignment, offset) { this.code.push(op, alignment, offset); }
    finish(fn) { return fn; }
}

function scanSignatures(lex, records, declared, functionBase, enums, distinct, asyncSpans = false) {
    const functions = [];
    while (lex.token.kind !== "eof") {
        const start = lex.token.at;
        const async = asyncSpans && lex.accept("async");
        lex.expect("function");
        const name = lex.ident();
        if (name === "memory") lex.fail("reserved memory export");
        if (declared.has(name) || distinct.has(name)) lex.fail("duplicate function " + name);
        const params = [], paramNames = [];
        const paramAts = asyncSpans ? [] : null;
        lex.expect("(");
        if (!lex.accept(")")) {
            do {
                paramAts?.push(lex.token.at);
                const id = lex.ident();
                lex.expect(":");
                params.push(lex.type(records, enums, distinct));
                if (paramNames.includes(id)) lex.fail("duplicate local " + id);
                paramNames.push(id);
            } while (lex.accept(","));
            lex.expect(")");
        }
        lex.expect(":");
        const result = lex.type(records, enums, distinct);
        if (lex.token.value !== "{") lex.fail("expected {");
        const fn = {name, index: functionBase + functions.length, params, paramNames, result, bodyAt: lex.token.at};
        declared.set(name, fn);
        functions.push(fn);
        const end = lex.skipBody();
        if (asyncSpans) {
            if (end === undefined) lex.fail("unterminated function body");
            Object.assign(fn, {start, end, async, paramAts});
        }
    }
    return functions;
}

function checkAcyclic(functions, edges) {
    const colors = new Uint8Array(functions.length);
    const order = [], path = [], positions = [];
    for (let root = 0; root < functions.length; root++) {
        if (colors[root]) continue;
        path.push(root);
        positions.push(0);
        colors[root] = 1;
        while (path.length) {
            const at = path.length - 1;
            const fn = path[at];
            const to = edges[fn][positions[at]++];
            if (to === undefined) {
                path.pop();
                positions.pop();
                colors[fn] = 2;
                order.push(fn);
            } else if (colors[to] === 1) {
                const cycle = path.slice(path.indexOf(to)).concat(to);
                throw new SyntaxError("recursive call cycle: " + cycle.map(i => functions[i].name).join(" -> "));
            } else if (!colors[to]) {
                colors[to] = 1;
                path.push(to);
                positions.push(0);
            }
        }
    }
    return order;
}

function parseEnum(lex, name) {
    lex.expect("{");
    const members = new Map();
    const values = new Set();
    let next = 0;
    while (!lex.accept("}")) {
        const member = lex.ident();
        if (members.has(member)) lex.fail("duplicate member " + member + " in " + name);
        if (lex.accept("=")) {
            const negative = lex.accept("-");
            if (lex.token.kind !== "int") lex.fail("expected integer enum value");
            next = Number(lex.token.value) * (negative ? -1 : 1);
            lex.next();
        }
        if (next < -2147483648 || next > 2147483647) lex.fail("i32 enum value out of range");
        if (values.has(next)) lex.fail("duplicate enum value " + next + " in " + name);
        members.set(member, next | 0);
        values.add(next++);
        if (!lex.accept(",")) {
            lex.expect("}");
            break;
        }
    }
    if (!members.size) lex.fail("empty enum " + name);
    return members;
}

function parseDeclarations(lex, recordEnds) {
    const records = new Map();
    const enums = new Map();
    const distinct = new Set();
    while (lex.token.value === "record" || lex.token.value === "enum" || lex.token.value === "type") {
        const kind = lex.token.value;
        lex.next();
        const name = lex.ident();
        if (records.has(name) || enums.has(name) || distinct.has(name))
            lex.fail("duplicate " + kind + " " + name);
        if (kind === "enum") {
            enums.set(name, parseEnum(lex, name));
            continue;
        }
        if (kind === "type") {
            lex.expect("=");
            lex.expect("distinct");
            lex.expect("i32");
            lex.expect(";");
            distinct.add(name);
            continue;
        }
        const fields = new Map();
        lex.expect("{");
        while (lex.token.value !== "}") {
            const field = lex.ident();
            if (fields.has(field)) lex.fail("duplicate field " + field + " in " + name);
            lex.expect(":");
            const type = lex.type(records, enums, distinct);
            lex.expect(";");
            fields.set(field, {type, offset: fields.size * 4});
        }
        recordEnds?.set(name, lex.token.at);
        lex.expect("}");
        records.set(name, fields);
    }
    return {records, enums, distinct};
}

function compileFunctions(source, functionBase, imported = [], maxSourceLength = 64 * 1024, numericOperands = false, onFunction, onSignatures, options) {
    if (source.length > maxSourceLength) throw new SyntaxError("input limit exceeded");
    const lowered = globalThis.typedAsync?.rewrite(source, imported);
    try {
        const program = emitFunctions(lowered?.source ?? source, functionBase, imported,
            numericOperands, onFunction, onSignatures, lowered);
        if (lowered) {
            program.asyncLayout = lowered.layout;
            if (options?.asyncSource) program.asyncSource = lowered.source;
        }
        return program;
    } catch (error) {
        throw lowered?.remap(error) ?? error;
    }
}

function emitFunctions(source, functionBase, imported, numericOperands, onFunction, onSignatures, lowered) {
    const Emitter = numericOperands ? NumericFunctionEmitter : FunctionEmitter;
    const lex = new Lexer(source);
    if (lowered) {
        const generatedPrefix = lowered.prefix;
        lex.isGeneratedLocal = name => name.startsWith(generatedPrefix + "local_");
        lex.generatedWordType = name => name.startsWith(generatedPrefix + "word_")
            ? name.slice(generatedPrefix.length + "word_".length) : null;
        lex.generatedStartFields = lowered.startFields;
    }
    const declared = new Map(imported.map(fn => [fn.name, fn]));
    const {records, enums, distinct} = parseDeclarations(lex);
    for (const name of distinct) if (declared.has(name)) lex.fail("duplicate imported function " + name);
    const functions = scanSignatures(lex, records, declared, functionBase, enums, distinct);
    if (!functions.length) lex.fail("expected a function");
    if (onSignatures) onSignatures(functions);
    const edges = functions.map(() => []);
    for (const [i, fn] of functions.entries()) {
        new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct).function(fn);
        if (onFunction) onFunction(fn);
    }

    const order = checkAcyclic(functions, edges);
    return { functions, records, enums, distinct, edges, order };
}

function signature(fn) {
    return [0x60, ...vec(fn.params.map(() => I32)), 1, I32];
}

function recordLayouts(records) {
    return Object.fromEntries(Array.from(records, ([name, fields]) => [name, Object.fromEntries(fields)]));
}

function enumLayouts(enums) {
    return Object.fromEntries(Array.from(enums, ([name, members]) => [name, Object.fromEntries(members)]));
}

function compile(source, options) {
    const {functions, records, enums, distinct, asyncLayout, asyncSource} =
        compileFunctions(source, 0, [], undefined, false, undefined, undefined, options);
    const headers = functions.map(signature);
    const names = functions.map((fn, i) => [
        ...vec(Array.from(fn.name, char => char.charCodeAt(0))), 0, ...unsigned(i),
    ]);
    const bytes = Uint8Array.from([
        0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
        ...section(1, vec(headers)),
        ...section(3, vec(functions.map((_, i) => unsigned(i)))),
        ...section(5, [1, 1, 1, 1]),
        ...section(7, vec([...names, [...vec([109,101,109,111,114,121]), 2, 0]])),
        ...section(10, vec(functions.map(fn => fn.body))),
    ]);
    return {
        bytes,
        records: recordLayouts(records),
        enums: enumLayouts(enums),
        distinct: [...distinct],
        signatures: functions.map(({ name, params, result }) => ({ name, params, result })),
        ...(asyncLayout && {asyncLayout}),
        ...(asyncSource && {asyncSource}),
    };
}

class WasmReader {
    constructor(bytes) {
        this.bytes = bytes;
        this.offset = 0;
    }

    take(length) {
        const end = this.offset + length;
        if (end > this.bytes.length) throw new SyntaxError("truncated Wasm runtime");
        const bytes = this.bytes.subarray(this.offset, end);
        this.offset = end;
        return bytes;
    }

    byte() { return this.take(1)[0]; }

    uint() {
        let value = 0;
        for (let shift = 0; shift <= 28; shift += 7) {
            const part = this.byte();
            value += (part & 127) * 2 ** shift;
            if (!(part & 128) && value <= 0xffffffff) return value;
        }
        throw new SyntaxError("invalid Wasm u32");
    }

    sized() { return this.take(this.uint()); }

    vector(read) {
        const count = this.uint();
        if (count > this.bytes.length - this.offset) throw new SyntaxError("truncated Wasm vector");
        return Array.from({length: count}, () => read(this));
    }

    end() { return this.offset === this.bytes.length; }
}

function readSection(sections, id, read) {
    const section = sections.find(part => part.id === id);
    if (!section) throw new SyntaxError("missing Wasm runtime section " + id);
    const reader = new WasmReader(section.bytes);
    const result = read(reader);
    if (!reader.end()) throw new SyntaxError("trailing Wasm runtime section data " + id);
    return result;
}

function encodeModule(header, sections) {
    const result = new Uint8Array(header.length + sections.reduce(
        (sum, part) => sum + 1 + unsigned(part.bytes.length).length + part.bytes.length, 0));
    result.set(header);
    let offset = header.length;
    for (const {id, bytes} of sections) {
        const prefix = [id, ...unsigned(bytes.length)];
        result.set(prefix, offset);
        offset += prefix.length;
        result.set(bytes, offset);
        offset += bytes.length;
    }
    return result;
}

function encodeByteVector(elements) {
    const prefix = unsigned(elements.length);
    const result = new Uint8Array(prefix.length + elements.reduce((sum, bytes) => sum + bytes.length, 0));
    result.set(prefix);
    let at = prefix.length;
    for (const bytes of elements) {
        result.set(bytes, at);
        at += bytes.length;
    }
    return result;
}

// The trusted runtime owns memory, host imports, and world exports. Its
// direct calls to the exported slot keep their original function index.
function linkWorld(source, runtime, entries, imports = [], maxSourceLength, options) {
    const reader = new WasmReader(runtime);
    const header = reader.take(8);
    if (header.join(",") !== "0,97,115,109,1,0,0,0") throw new SyntaxError("invalid Wasm runtime header");
    const sections = [];
    while (!reader.end()) {
        const id = reader.byte(), bytes = reader.sized();
        if (id !== 0) sections.push({id, bytes}); // discard stale names and producer metadata
    }
    if (new Set(sections.map(part => part.id)).size !== sections.length) throw new SyntaxError("duplicate Wasm runtime section");
    const types = readSection(sections, 1, r => r.vector(t => {
        if (t.byte() !== 0x60) throw new SyntaxError("expected Wasm function type");
        return [0x60, ...vec(Array.from(t.sized())), ...vec(Array.from(t.sized()))];
    }));
    const importCount = sections.some(part => part.id === 2)
        ? readSection(sections, 2, r => r.vector(item => {
            item.sized();
            item.sized();
            if (item.byte() !== 0) throw new SyntaxError("expected a Wasm function import");
            return item.uint();
        }).length) : 0;
    const definitions = readSection(sections, 3, r => r.vector(item => item.uint()));
    const exports = readSection(sections, 7, r => r.vector(item => ({
        name: item.sized().join(","), kind: item.byte(), index: item.uint(),
    })));
    const bodies = readSection(sections, 10, r => r.vector(item => {
        const start = item.offset;
        item.sized();
        return item.bytes.subarray(start, item.offset);
    }));
    if (bodies.length !== definitions.length) throw new SyntaxError("mismatched Wasm runtime code and function counts");
    const base = importCount + definitions.length;
    const imported = imports.map(fn => {
        const name = Array.from(fn.name, ch => ch.charCodeAt(0)).join(",");
        const index = exports.find(item => item.name === name && item.kind === 0)?.index;
        if (!Number.isInteger(index) || index < importCount ||
            signature(fn).join(",") !== types[definitions[index - importCount]]?.join(","))
            throw new SyntaxError("Wasm runtime import signature mismatch for " + fn.name);
        return {...fn, index};
    });
    const {functions, records, enums, distinct, asyncLayout, asyncSource} =
        compileFunctions(source, base, imported, maxSourceLength, false, undefined, undefined, options);
    for (const entry of entries) {
        const bytesName = Array.from(entry, ch => ch.charCodeAt(0)).join(",");
        const slot = exports.find(item => item.name === bytesName && item.kind === 0)?.index - importCount;
        if (!Number.isInteger(slot) || slot < 0 || slot >= bodies.length)
            throw new SyntaxError("missing Wasm runtime function slot " + entry);
        const target = functions.findIndex(fn => fn.name === entry);
        if (target < 0 || signature(functions[target]).join(",") !== types[definitions[slot]]?.join(","))
            throw new SyntaxError("Wasm runtime slot signature mismatch for " + entry);
        const bridge = [0];
        for (let i = 0; i < functions[target].params.length; i++) bridge.push(OP.get, ...unsigned(i));
        bridge.push(0x10, ...unsigned(base + target), OP.end);
        bodies[slot] = [...unsigned(bridge.length), ...bridge];
    }
    const replacement = new Map([
        [1, vec([...types, ...functions.map(signature)])],
        [3, vec([...definitions.map(unsigned), ...functions.map((_, i) => unsigned(types.length + i))])],
        [10, encodeByteVector([...bodies, ...functions.map(fn => fn.body)])],
    ]);
    for (const part of sections) if (replacement.has(part.id)) part.bytes = replacement.get(part.id);
    return {bytes: encodeModule(header, sections), records: recordLayouts(records),
        enums: enumLayouts(enums), distinct: [...distinct],
        signatures: functions.map(({name, params, result}) => ({name, params, result})),
        ...(asyncLayout && {asyncLayout}), ...(asyncSource && {asyncSource})};
}

function invoke(exports, signature, args) {
    const i32 = n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;
    if (args.length !== signature.params.length) throw new TypeError("wrong argument count");
    const words = args.map((value, i) => {
        if (signature.params[i] === "bool" && typeof value === "boolean") return Number(value);
        if (signature.params[i] === "i32" && i32(value)) return value;
        throw new TypeError(signature.name + " expects " + signature.params[i] + " at argument " + i);
    });
    const value = exports[signature.name](...words);
    return signature.result === "bool" ? value !== 0 : value;
}

globalThis.compileTyped = (source, options) => {
    const {bytes, asyncLayout, asyncSource} = compile(source, options);
    if (asyncLayout) bytes.asyncLayout = asyncLayout;
    if (asyncSource) bytes.asyncSource = asyncSource;
    return bytes;
};
globalThis.typedWasm = {compile, linkWorld, invoke, compileFunctions, Lexer, FunctionEmitter,
    parseDeclarations, scanSignatures, checkAcyclic, inferredType: scalarType, recordLayouts, enumLayouts};
})();
