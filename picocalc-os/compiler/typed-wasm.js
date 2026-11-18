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
const BINARY = new Map([
    ["||", [1, "bool", "bool"]], ["&&", [2, "bool", "bool"]],
    ["===", [3, null, "bool", 0x46]], ["<", [4, "i32", "bool", OP.lt]],
    ["<=", [4, "i32", "bool", 0x4c]], [">", [4, "i32", "bool", 0x4a]],
    [">=", [4, "i32", "bool", 0x4e]], [">>", [5, "i32", "i32", 0x75]],
    ["+", [6, "i32", "i32", OP.add]], ["-", [6, "i32", "i32", OP.sub]],
    ["*", [7, "i32", "i32", 0x6c]], ["/", [7, "i32", "i32", OP.div]],
    ["%", [7, "i32", "i32", 0x6f]],
]);
const TOKEN = /\s*(?:\/\/[^\n]*(?:\n|$)\s*)*(?:(?<id>[a-zA-Z_]\w*)|(?<int>\d+)|(?<op>===|<=|>=|>>|\|\||&&|[{}():;,.=\-+*/%!<>]))/y;
const RESERVED = new Set(["function", "if", "const", "return", "bool", "i32",
    "true", "false", "Math", "let", "while", "string"]);

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
    constructor(source) {
        this.source = source;
        this.offset = 0;
        this.next();
    }

    next() {
        TOKEN.lastIndex = this.offset;
        const match = TOKEN.exec(this.source);
        if (match) {
            const value = match.groups.id ?? match.groups.int ?? match.groups.op;
            this.token = { value, kind: match.groups.id ? "id" : match.groups.int ? "int" : "op",
                at: TOKEN.lastIndex - value.length };
            this.offset = TOKEN.lastIndex;
            return;
        }
        this.token = { value: "", kind: "eof", at: this.offset };
        if (!/^\s*(?:\/\/[^\n]*(?:\n|$)\s*)*$/.test(this.source.slice(this.offset))) {
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

    type() {
        const { value } = this.token;
        if (value !== "i32" && value !== "bool" && value !== "string") this.fail("expected i32, bool or string");
        this.next();
        return value;
    }
}

class FunctionEmitter {
    constructor(lexer, functions) {
        this.functions = functions;
        this.lex = lexer;
        this.locals = new Map();
        this.code = [];
        this.nextLocal = 0;
        this.depth = 0;
    }

    local(name, type, mutable = false) {
        if (this.locals.has(name)) this.lex.fail("duplicate local " + name);
        const index = this.nextLocal++;
        this.locals.set(name, { type, index, mutable });
        return index;
    }

    want(type, expected) {
        if (type !== expected) this.lex.fail("expected " + expected + ", got " + type);
    }

    emitConst(value) {
        this.code.push(OP.const, ...signed(value));
    }

    emitLocal(op, index) {
        this.code.push(op, ...unsigned(index));
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
        this.emitLocal(OP.set, a);
        lex.expect(",");
        this.want(this.expr(), "i32");
        this.emitLocal(OP.set, b);
        lex.expect(")");
        this.emitLocal(OP.get, a);
        this.emitLocal(OP.get, b);
        this.code.push(OP.lt, OP.if, I32);
        this.emitLocal(OP.get, name === "min" ? a : b);
        this.code.push(OP.else);
        this.emitLocal(OP.get, name === "min" ? b : a);
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
            } else {
                this.emitConst(0);
                this.want(this.expr(8), "i32");
                this.code.push(OP.sub);
            }
            return "i32";
        }
        if (lex.token.kind === "int") {
            const value = Number(lex.token.value);
            if (value > 2147483647) lex.fail("i32 literal out of range");
            this.emitConst(value);
            lex.next();
            return "i32";
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
        const name = lex.ident();
        if (lex.accept("(")) {
            const callee = this.functions.get(name);
            if (!callee) lex.fail("unknown function " + name);
            for (let i = 0; i < callee.params.length; i++) {
                if (i) lex.expect(",");
                this.want(this.expr(), callee.params[i]);
            }
            lex.expect(")");
            this.code.push(0x10, ...unsigned(callee.index));
            return callee.result;
        }
        const binding = this.locals.get(name);
        if (!binding) lex.fail("unknown local " + name);
        this.emitLocal(OP.get, binding.index);
        if (binding.type === "string" && lex.accept(".")) {
            if (lex.accept("length")) {
                this.code.push(0x28, 2, 0);
                return "i32";
            }
            lex.expect("charCodeAt");
            lex.expect("(");
            const pos = this.nextLocal++;
            this.want(this.expr(), "i32");
            lex.expect(")");
            this.emitLocal(OP.set, pos);
            this.emitLocal(OP.get, pos);
            this.emitLocal(OP.get, binding.index);
            this.code.push(0x28, 2, 0, 0x4f, OP.if, VOID, 0x00, OP.end);
            this.emitLocal(OP.get, pos);
            this.emitConst(1);
            this.code.push(0x74, OP.add, 0x2f, 1, 4);
            return "i32";
        }
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
            if (!input && type === "string") this.lex.fail("string equality requires content comparison");
            const expected = input ?? type;
            this.want(type, expected);
            this.lex.next();
            if (op === "&&" || op === "||") {
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
            } else {
                this.want(this.expr(precedence + 1), expected);
                this.code.push(opcode);
            }
            type = result;
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

    statement(result) {
        const lex = this.lex;
        if (lex.accept("if")) {
            lex.expect("(");
            this.want(this.expr(), "bool");
            lex.expect(")");
            this.code.push(OP.if, VOID);
            this.result(result, true);
            this.code.push(OP.end);
            return;
        }
        if (lex.accept("while")) {
            lex.expect("(");
            this.code.push(0x02, VOID, 0x03, VOID);
            this.want(this.expr(), "bool");
            lex.expect(")");
            this.code.push(OP.eqz, 0x0d, 1);
            lex.expect("{");
            const enclosing = this.locals;
            this.locals = new Map(enclosing);
            while (!lex.accept("}")) this.statement(result);
            this.locals = enclosing;
            this.code.push(0x0c, 0, OP.end, OP.end);
            return;
        }
        if (lex.token.value === "const" || lex.token.value === "let") {
            const mutable = lex.token.value === "let";
            lex.next();
            const id = lex.ident();
            lex.expect(":");
            const type = lex.type();
            lex.expect("=");
            this.want(this.expr(), type);
            this.emitLocal(OP.set, this.local(id, type, mutable));
        } else {
            const id = lex.ident();
            const local = this.locals.get(id);
            if (!local || !local.mutable) lex.fail("expected mutable local " + id);
            lex.expect("=");
            this.want(this.expr(), local.type);
            this.emitLocal(OP.set, local.index);
        }
        lex.expect(";");
    }

    function() {
        const lex = this.lex;
        lex.expect("function");
        const name = lex.ident();
        const params = [];
        lex.expect("(");
        if (!lex.accept(")")) {
            do {
                const id = lex.ident();
                lex.expect(":");
                const type = lex.type();
                this.local(id, type);
                params.push(type);
            } while (lex.accept(","));
            lex.expect(")");
        }
        lex.expect(":");
        const result = lex.type();
        lex.expect("{");
        while (lex.token.value !== "return") this.statement(result);
        this.result(result, false);
        lex.expect("}");
        this.code.push(OP.end);
        const nlocals = this.nextLocal - params.length;
        const locals = nlocals ? [1, ...unsigned(nlocals), I32] : [0];
        const body = [...locals, ...this.code];
        return { name, params, result, body: [...unsigned(body.length), ...body] };
    }
}

function compile(source) {
    if (source.length > 64 * 1024) throw new SyntaxError("input limit exceeded");
    const lex = new Lexer(source);
    const declared = new Map();
    const functions = [];
    while (lex.token.kind !== "eof") {
        const fn = new FunctionEmitter(lex, declared).function();
        if (fn.name === "memory") lex.fail("reserved memory export");
        if (declared.has(fn.name)) lex.fail("duplicate function " + fn.name);
        declared.set(fn.name, {index: functions.length, params: fn.params, result: fn.result});
        functions.push(fn);
    }
    if (!functions.length) lex.fail("expected a function");

    const headers = functions.map(fn => [0x60, ...vec(fn.params.map(() => I32)), 1, I32]);
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
        signatures: functions.map(({ name, params, result }) => ({ name, params, result })),
    };
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

globalThis.compileTyped = source => compile(source).bytes;
globalThis.typedWasm = { compile, invoke };
})();
