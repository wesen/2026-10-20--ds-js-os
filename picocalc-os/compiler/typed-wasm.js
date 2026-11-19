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
const TOKEN = /\s*(?:\/\/[^\n]*(?:\n|$)\s*)*(?:(?<id>[a-zA-Z_]\w*)|(?<int>\d+)|(?<str>"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")|(?<op>===|<=|>=|>>|\|\||&&|[{}():;,.=\-+*/%!<>]))/y;
const RESERVED = new Set(["function", "if", "const", "return", "bool", "i32",
    "true", "false", "Math", "let", "while", "string", "record", "buffer"]);

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
            const {id, int, str, op} = match.groups;
            const value = id ?? int ?? str ?? op;
            this.token = { value, kind: id ? "id" : int ? "int" : str ? "str" : "op",
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

    type(records) {
        const { value } = this.token;
        if (value !== "i32" && value !== "bool" && value !== "string" && value !== "buffer" && !records.has(value)) this.fail("unknown type " + value);
        this.next();
        return value;
    }
}

class FunctionEmitter {
    constructor(lexer, functions, records) {
        this.records = records;
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
        if (lex.accept("(")) return this.call(name);
        const binding = this.locals.get(name);
        if (!binding) lex.fail("unknown local " + name);
        if (this.records.has(binding.type) && lex.accept(".")) {
            this.emitLocal(OP.get, binding.index);
            const field = this.field(binding.type);
            this.code.push(0x28, 2, ...unsigned(field.offset));
            return field.type;
        }
        if ((binding.type === "string" || binding.type === "buffer") && lex.accept(".")) {
            if (binding.type === "buffer" && lex.accept("writeLiteral")) {
                this.emitConst(this.bufferLiteral(binding.index));
                return "i32";
            }
            if (lex.accept("length")) {
                this.emitLocal(OP.get, binding.index);
                this.code.push(0x28, 2, 0);
                return "i32";
            }
            lex.expect("charCodeAt");
            lex.expect("(");
            const pos = this.nextLocal++;
            this.want(this.expr(), "i32");
            lex.expect(")");
            this.emitLocal(OP.set, pos);
            this.codeUnitAddress(binding.index, pos);
            this.code.push(0x2f, 1, 4);
            return "i32";
        }
        this.emitLocal(OP.get, binding.index);
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
            if (!input && type !== "i32" && type !== "bool") this.lex.fail("expected scalar equality operands");
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

    codeUnitAddress(receiver, position) {
        this.emitLocal(OP.get, position);
        this.emitLocal(OP.get, receiver);
        this.code.push(0x28, 2, 0, 0x4f, OP.if, VOID, 0x00, OP.end);
        this.emitLocal(OP.get, receiver);
        this.emitLocal(OP.get, position);
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
        this.emitLocal(OP.set, position);
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
        this.emitLocal(OP.set, position);
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
        this.emitLocal(OP.set, address);
        this.emitLocal(OP.get, position);
        this.emitConst(value.length - 1);
        this.code.push(OP.add);
        this.emitLocal(OP.get, receiver);
        this.code.push(0x28, 2, 0, 0x4f, OP.if, VOID, 0x00, OP.end);
        for (let i = 0; i < value.length; i++) {
            this.emitLocal(OP.get, address);
            this.emitConst(value.charCodeAt(i));
            this.code.push(0x3b, 1, ...unsigned(4 + 2 * i));
        }
        return value.length;
    }

    call(name) {
        const lex = this.lex;
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

    statement(result) {
        const lex = this.lex;
        if (lex.accept("if")) {
            lex.expect("(");
            this.want(this.expr(), "bool");
            lex.expect(")");
            this.code.push(OP.if, VOID);
            if (lex.token.value === "{") this.block(result);
            else this.result(result, true);
            this.code.push(OP.end);
            return;
        }
        if (lex.accept("while")) {
            lex.expect("(");
            this.code.push(0x02, VOID, 0x03, VOID);
            this.want(this.expr(), "bool");
            lex.expect(")");
            this.code.push(OP.eqz, 0x0d, 1);
            this.block(result);
            this.code.push(0x0c, 0, OP.end, OP.end);
            return;
        }
        if (lex.token.value === "const" || lex.token.value === "let") {
            const mutable = lex.token.value === "let";
            lex.next();
            const id = lex.ident();
            const annotation = lex.accept(":") ? lex.type(this.records) : null;
            lex.expect("=");
            const type = this.expr();
            if (annotation !== null) this.want(type, annotation);
            this.emitLocal(OP.set, this.local(id, type, mutable));
        } else {
            const id = lex.ident();
            if (lex.accept("(")) {
                this.call(id);
                this.code.push(0x1a); // drop the unused call result
                lex.expect(";");
                return;
            }
            const local = this.locals.get(id);
            if (!local) lex.fail("unknown local " + id);
            if (lex.accept(".")) {
                if (local.type === "buffer") {
                    this.bufferWrite(local.index);
                } else {
                    const field = this.field(local.type);
                    this.emitLocal(OP.get, local.index);
                    lex.expect("=");
                    this.want(this.expr(), field.type);
                    this.code.push(0x36, 2, ...unsigned(field.offset));
                }
            } else {
                if (!local.mutable) lex.fail("expected mutable local " + id);
                lex.expect("=");
                this.want(this.expr(), local.type);
                this.emitLocal(OP.set, local.index);
            }
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
                const type = lex.type(this.records);
                this.local(id, type);
                params.push(type);
            } while (lex.accept(","));
            lex.expect(")");
        }
        lex.expect(":");
        const result = lex.type(this.records);
        lex.expect("{");
        while (lex.token.value !== "return") this.statement(result);
        this.result(result, false);
        lex.expect("}");
        this.code.push(OP.end);
        const nlocals = this.nextLocal - params.length;
        const locals = nlocals ? [1, ...unsigned(nlocals), I32] : [0];
        const body = [...locals, ...this.code];
        return { name, params, result, code: this.code, nlocals, body: [...unsigned(body.length), ...body] };
    }
}

function compileFunctions(source, functionBase, imported = [], maxSourceLength = 64 * 1024) {
    if (source.length > maxSourceLength) throw new SyntaxError("input limit exceeded");
    const lex = new Lexer(source);
    const declared = new Map(imported.map(fn => [fn.name, fn]));
    const records = new Map();
    while (lex.accept("record")) {
        const name = lex.ident();
        if (records.has(name)) lex.fail("duplicate record " + name);
        const fields = new Map();
        lex.expect("{");
        while (!lex.accept("}")) {
            const field = lex.ident();
            if (fields.has(field)) lex.fail("duplicate field " + field + " in " + name);
            lex.expect(":");
            const type = lex.type(records);
            lex.expect(";");
            fields.set(field, {type, offset: fields.size * 4});
        }
        records.set(name, fields);
    }
    const functions = [];
    while (lex.token.kind !== "eof") {
        const fn = new FunctionEmitter(lex, declared, records).function();
        if (fn.name === "memory") lex.fail("reserved memory export");
        if (declared.has(fn.name)) lex.fail("duplicate function " + fn.name);
        declared.set(fn.name, {index: functionBase + functions.length, params: fn.params, result: fn.result});
        functions.push(fn);
    }
    if (!functions.length) lex.fail("expected a function");

    return { functions, records };
}

function signature(fn) {
    return [0x60, ...vec(fn.params.map(() => I32)), 1, I32];
}

function recordLayouts(records) {
    return Object.fromEntries(Array.from(records, ([name, fields]) => [name, Object.fromEntries(fields)]));
}

function compile(source) {
    const { functions, records } = compileFunctions(source, 0);
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
        signatures: functions.map(({ name, params, result }) => ({ name, params, result })),
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
function linkWorld(source, runtime, entries, imports = [], maxSourceLength) {
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
    const {functions, records} = compileFunctions(source, base, imported, maxSourceLength);
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
        signatures: functions.map(({name, params, result}) => ({name, params, result}))};
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
globalThis.typedWasm = { compile, linkWorld, invoke, compileFunctions };
})();
