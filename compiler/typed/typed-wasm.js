// Generated from compiler/typed/frontend/ and compiler/typed/wasm/ by compiler/typed/frontend/build.mjs.
// Edit those files, not this one.
// The Typed front end (lexer, signature pass, parser and type checker writing the tape) and the WebAssembly
// backend (tape serializer, module writer, world linker). Runs in a bare QuickJS realm; publishes typedWasm.
(() => {
"use strict";

// ---- frontend/lexer.js
// The front end's lexer: the token regexp, the reserved words, and the lexical index a host may provide (the P4's C
// scanner) so that the lexer reads precomputed token rows instead of running the regexp.
const TOKEN = /\s*(?:\/\/[^\n]*(?:\n|$)\s*)*((?:[a-zA-Z_]\w*)|(?:0[xX]\w*)|(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(?:"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")|(?:!==|===|<=|>=|>>>|>>|<<|\|\||&&|[{}():;,.=\-+*/%!<>&|^~?\[\]]))/y;
// The signature pass only needs delimiters. The body parser checks token syntax.
const BODY_TOKEN = /[{}]|\/\/[^\n]*|"(?:[^"\\\n]|\\[^\n])*"/g;
const RESERVED = new Set(["function", "if", "const", "return", "bool", "i32", "f32", "u32",
    "true", "false", "Math", "let", "while", "string", "record", "buffer",
    "else", "for", "break", "continue", "enum", "match", "type", "distinct",
    "async", "await", "new"]);

// An index belongs to one exact source string in one compilation.
let lexicalScope = null;
const indexKinds = ["", "id", "int", "str", "op", "float"];

function withLexIndices(compile) {
    const provide = globalThis.__typedLexIndex;
    const previous = lexicalScope;
    lexicalScope = typeof provide === "function" ? {provide, sources: new Map()} : null;
    try {
        return compile();
    } finally {
        lexicalScope = previous;
    }
}

function indexFor(source) {
    if (!lexicalScope) return null;
    const {provide, sources} = lexicalScope;
    if (sources.has(source)) return sources.get(source);
    const buffers = provide(source);
    const index = buffers === null ? null : {
        rows: new Uint32Array(buffers[0]),
        symbols: new Uint32Array(buffers[1]),
        spellings: [],
    };
    sources.set(source, index);
    return index;
}

// A number token is "float" when it has a fraction or an exponent (1.5, 2e-3, 1.0), else "int" (decimal or hex).
function numberKind(value) {
    if (value.length > 1 && (value[1] === "x" || value[1] === "X")) return "int";
    for (let i = 1; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c === 46 || c === 101 || c === 69) return "float";
    }
    return "int";
}

class Lexer {
    constructor(source, start = 0, end = source.length, borrowCurrent = false) {
        this.source = source;
        this.offset = start;
        this.end = end;
        const index = indexFor(source);
        if (!index && borrowCurrent) {
            this.borrowCurrent = true;
            this.token = {value: "", kind: "eof", at: start};
        }
        if (index) {
            this.index = index;
            this.borrowCurrent = borrowCurrent;
            if (borrowCurrent) this.token = {value: "", kind: "eof", at: start};
            this.indexRow = 0;
            this.indexOffset = undefined;
            this.next = borrowCurrent && start === 0 && end === source.length
                ? this.nextWholeIndexed : this.nextIndexed;
        }
        this.next();
    }

    // Locate the next whole-source token when starting or after a seek.
    findIndexRow(at) {
        const rows = this.index.rows;
        let low = 0, high = rows.length / 4;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (rows[mid * 4] < at) low = mid + 1;
            else high = mid;
        }
        return low * 4;
    }

    nextWholeIndexed() {
        const row = this.indexRow;
        const {rows, symbols, spellings} = this.index;
        if (this.offset !== this.indexOffset || row >= rows.length) return this.nextIndexed();
        const ordinal = rows[row + 2];
        let symbol = spellings[ordinal];
        if (symbol === undefined) {
            const cell = ordinal * 3;
            symbol = {
                value: this.source.slice(symbols[cell], symbols[cell + 1]),
                kind: indexKinds[symbols[cell + 2]],
            };
            spellings[ordinal] = symbol;
        }
        const token = this.token;
        token.value = symbol.value;
        token.kind = symbol.kind;
        token.at = rows[row];
        this.offset = this.indexOffset = rows[row + 1];
        this.indexRow = row + 4;
    }

    nextIndexed() {
        const at = this.offset;
        if (at >= this.end) {
            this.token = {value: "", kind: "eof", at};
            return;
        }
        const {rows, symbols, spellings} = this.index;
        let row = this.indexRow;
        if (at !== this.indexOffset) {
            row = this.findIndexRow(at);
            if (at !== 0 && rows[row] !== at && (row === 0 || rows[row - 3] !== at)) {
                Lexer.prototype.next.call(this);
                return;
            }
        }
        if (row >= rows.length || rows[row + 1] > this.end) {
            // The reference regexp can backtrack over trivia in the tail,
            // exposing terminal comment slashes as ordinary operator tokens.
            Lexer.prototype.next.call(this);
            return;
        }
        const ordinal = rows[row + 2];
        let symbol = spellings[ordinal];
        if (symbol === undefined) {
            const cell = ordinal * 3;
            symbol = {
                value: this.source.slice(symbols[cell], symbols[cell + 1]),
                kind: indexKinds[symbols[cell + 2]],
            };
            spellings[ordinal] = symbol;
        }
        if (this.borrowCurrent) {
            this.token.value = symbol.value;
            this.token.kind = symbol.kind;
            this.token.at = rows[row];
        } else {
            // Range readers can retain these tokens across advances.
            this.token = {value: symbol.value, kind: symbol.kind, at: rows[row]};
        }
        this.offset = this.indexOffset = rows[row + 1];
        this.indexRow = row + 4;
    }

    next() {
        if (this.offset >= this.end) {
            this.token = {value: "", kind: "eof", at: this.offset};
            return;
        }
        TOKEN.lastIndex = this.offset;
        const match = TOKEN.exec(this.source);
        if (match && TOKEN.lastIndex <= this.end) {
            const value = match[1];
            const first = value.charCodeAt(0);
            const id = first === 95 || (first >= 65 && first <= 90) || (first >= 97 && first <= 122);
            const kind = id ? "id" : first >= 48 && first <= 57 ? numberKind(value) : first === 34 ? "str" : "op";
            const at = TOKEN.lastIndex - value.length;
            const current = this.borrowCurrent ? this.token : null;
            if (current) {
                current.value = value;
                current.kind = kind;
                current.at = at;
                this.token = current;
            } else {
                this.token = {value, kind, at};
            }
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

    // The value of the current "int" token: a decimal literal as written (its caller checks the range), a hex
    // literal (0x and one to eight hex digits) as the i32 of its 32 bits, so 0xffffffff is -1.
    integerValue() {
        const value = this.token.value;
        if (value.length < 2 || (value[1] !== "x" && value[1] !== "X")) return Number(value);
        if (!/^0[xX][0-9a-fA-F]{1,8}$/.test(value)) this.fail("invalid hex literal " + value);
        return Number(value) | 0;
    }

    // The value of the current "float" token, rounded to f32; a literal that rounds to infinity is an error.
    floatValue() {
        const value = Math.fround(Number(this.token.value));
        if (!Number.isFinite(value)) this.fail("f32 literal out of range " + this.token.value);
        return value;
    }

    accept(value) {
        if (this.token.value !== value) return false;
        this.next();
        return true;
    }

    expect(value) {
        if (this.token.value !== value) this.fail("expected " + value);
        this.next();
    }

    ident() {
        const { value, kind } = this.token;
        if (kind !== "id" || RESERVED.has(value)) this.fail("expected identifier");
        this.next();
        return value;
    }

    type(records, enums, distinct, values) {
        const { value } = this.token;
        if (value !== "i32" && value !== "f32" && value !== "u32" && value !== "bool" && value !== "string" && value !== "buffer" &&
            !records.has(value) && !enums?.has(value) && !distinct?.has(value) && !values?.has(value))
            this.fail("unknown type " + value);
        this.next();
        return value;
    }

    skipBody() {
        if (this.index && this.token.value === "{" && this.indexOffset === this.offset) {
            const row = this.indexRow - 4;
            const rows = this.index.rows;
            if (rows[row] === this.token.at) {
                const close = rows[row + 3];
                const end = close && rows[(close - 1) * 4 + 1];
                if (end && end <= this.end) {
                    this.indexRow = close * 4;
                    this.offset = this.indexOffset = end;
                    this.next();
                    return end;
                }
            }
        }
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

// ---- frontend/declarations.js
// The signature pass: records, value records, enums, distinct types, member aliases, function signatures, and the call
// graph's acyclicity check; and the layouts the backends publish.
//
// A value record parameter is its leaves, consecutive parameters in field order (fn.params, fn.paramNames "v.x"); the
// signature as written is fn.sourceParams and fn.sourceNames, present only when a value record appears. A value record
// result is fn.result (its name) and fn.results, the types of its leaves.
function scanSignatures(lex, records, declared, functionBase, enums, distinct, asyncSpans = false, values) {
    const functions = [];
    while (lex.token.kind !== "eof") {
        const start = lex.token.at;
        const async = asyncSpans && (lex.token.value === "async" && (lex.next(), true));
        { if (lex.token.value !== "function") lex.fail("expected function"); lex.next(); }
        const name = lex.ident();
        if (name === "memory") lex.fail("reserved memory export");
        if (declared.has(name) || distinct.has(name) || values?.has(name)) lex.fail("duplicate function " + name);
        const params = [], paramNames = [];
        const paramAts = asyncSpans ? [] : null;
        let sourceParams, sourceNames;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        if (!(lex.token.value === ")" && (lex.next(), true))) {
            const names = [], types = [];
            do {
                paramAts?.push(lex.token.at);
                const id = lex.ident();
                { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
                const type = lex.type(records, enums, distinct, values);
                if (names.includes(id)) lex.fail("duplicate local " + id);
                names.push(id);
                types.push(type);
                const value = values?.get(type);
                if (value) {
                    sourceParams = types;
                    for (let k = 0; k < value.leaves.length; k++) {
                        params.push(value.leaves[k]);
                        paramNames.push(id + "." + value.paths[k]);
                    }
                } else {
                    params.push(type);
                    paramNames.push(id);
                }
            } while ((lex.token.value === "," && (lex.next(), true)));
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            if (sourceParams) sourceNames = names;
        }
        { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
        const result = lex.type(records, enums, distinct, values);
        if (lex.token.value !== "{") lex.fail("expected {");
        const fn = {name, index: functionBase + functions.length, params, paramNames, result, bodyAt: lex.token.at};
        if (sourceParams) Object.assign(fn, {sourceParams, sourceNames});
        if (values?.has(result)) fn.results = values.get(result).leaves;
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
    { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
    const members = new Map();
    const values = new Set();
    let next = 0;
    while (!(lex.token.value === "}" && (lex.next(), true))) {
        const member = lex.ident();
        if (members.has(member)) lex.fail("duplicate member " + member + " in " + name);
        if ((lex.token.value === "=" && (lex.next(), true))) {
            const negative = (lex.token.value === "-" && (lex.next(), true));
            if (lex.token.kind !== "int") lex.fail("expected integer enum value");
            next = lex.integerValue() * (negative ? -1 : 1);
            lex.next();
        }
        if (next < -2147483648 || next > 2147483647) lex.fail("i32 enum value out of range");
        if (values.has(next)) lex.fail("duplicate enum value " + next + " in " + name);
        members.set(member, next | 0);
        values.add(next++);
        if (!(lex.token.value === "," && (lex.next(), true))) {
            { if (lex.token.value !== "}") lex.fail("expected }"); lex.next(); }
            break;
        }
    }
    if (!members.size) lex.fail("empty enum " + name);
    return members;
}

// Aliases live only in compiler metadata. Receiver and options signatures
// are checked once the normal forward-signature pass has seen every target.
function parseMembers(lex, members, owner, records) {
    if (members.has(owner)) lex.fail("duplicate member group " + owner);
    const entries = new Map();
    members.set(owner, entries);
    lex.expect("{");
    while (!lex.accept("}")) {
        const name = lex.ident();
        if (entries.has(name)) lex.fail("duplicate member " + owner + "." + name);
        let options = null;
        if (lex.accept("(")) {
            options = lex.ident();
            if (!records.get(options)?.size) lex.fail("expected a nonempty options record " + options);
            lex.expect(")");
        }
        lex.expect("=");
        const target = lex.ident();
        entries.set(name, {target, options, at: lex.token.at});
        lex.expect(";");
    }
}

function checkMembers(lex, aliases, declared, records) {
    if (!aliases) return;
    for (const groups of [aliases.namespaces, aliases.methods]) {
        const receiver = groups === aliases.methods;
        for (const [owner, members] of groups) for (const [name, member] of members) {
            const fail = message => { lex.token.at = member.at; lex.fail(owner + "." + name + ": " + message); };
            const fn = declared.get(member.target);
            if (!fn) fail("unknown target " + member.target);
            if (receiver && (fn.sourceParams ?? fn.params)[0] !== owner) fail("target must take " + owner + " as its first parameter");
            if (member.options) {
                const fields = records.get(member.options);
                const first = fn.params.length - fields.size;
                if (first < (receiver ? 1 : 0)) fail("too few parameters for " + member.options);
                let i = first;
                for (const [field, layout] of fields) {
                    if (fn.params[i++] !== layout.type) fail("wrong target type for option " + field);
                }
            }
        }
    }
}

// value record Name { field: type; ... }: a record whose variables are values, not references to memory. Its layout:
// fields (name -> {type, offset, width}, offset and width in leaves), leaves (the scalar type of each leaf, nested
// value records flattened in field order) and paths ("o.x", for parameter names).
function parseValueRecord(lex, name, records, enums, distinct, values) {
    const fields = new Map(), leaves = [], paths = [];
    lex.expect("{");
    while (lex.token.value !== "}") {
        const field = lex.ident();
        if (fields.has(field)) lex.fail("duplicate field " + field + " in " + name);
        lex.expect(":");
        const type = lex.type(records, enums, distinct, values);
        lex.expect(";");
        const nested = values.get(type);
        fields.set(field, {type, offset: leaves.length, width: nested ? nested.leaves.length : 1});
        if (nested) {
            leaves.push(...nested.leaves);
            for (const path of nested.paths) paths.push(field + "." + path);
        } else {
            leaves.push(type);
            paths.push(field);
        }
    }
    lex.next();
    if (!fields.size) lex.fail("empty value record " + name);
    return {fields, leaves, paths};
}

function parseDeclarations(lex, recordEnds) {
    const records = new Map();
    const enums = new Map();
    const distinct = new Set();
    const values = new Map();
    let aliases;
    while (lex.token.value === "record" || lex.token.value === "enum" || lex.token.value === "type" ||
           lex.token.value === "namespace" || lex.token.value === "methods" || lex.token.value === "value") {
        const kind = lex.token.value;
        lex.next();
        if (kind === "value") lex.expect("record");
        const name = lex.ident();
        if (kind === "methods" || kind === "namespace") {
            aliases ??= {namespaces: new Map(), methods: new Map()};
            if (kind === "methods") {
                if (!records.has(name) && !distinct.has(name) && !enums.has(name) && !values.has(name))
                    lex.fail("unknown receiver type " + name);
                parseMembers(lex, aliases.methods, name, records);
            } else {
                if (records.has(name) || enums.has(name) || distinct.has(name) || values.has(name))
                    lex.fail("namespace collides with type " + name);
                parseMembers(lex, aliases.namespaces, name, records);
            }
            continue;
        }
        if (records.has(name) || enums.has(name) || distinct.has(name) || values.has(name) || aliases?.namespaces.has(name))
            lex.fail("duplicate " + kind + " " + name);
        if (kind === "value") {
            values.set(name, parseValueRecord(lex, name, records, enums, distinct, values));
            continue;
        }
        if (kind === "enum") {
            enums.set(name, parseEnum(lex, name));
            continue;
        }
        if (kind === "type") {
            { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
            { if (lex.token.value !== "distinct") lex.fail("expected distinct"); lex.next(); }
            { if (lex.token.value !== "i32") lex.fail("expected i32"); lex.next(); }
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            distinct.add(name);
            continue;
        }
        const fields = new Map();
        { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
        while (lex.token.value !== "}") {
            const field = lex.ident();
            if (fields.has(field)) lex.fail("duplicate field " + field + " in " + name);
            { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
            const type = lex.type(records, enums, distinct);
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            fields.set(field, {type, offset: fields.size * 4});
        }
        recordEnds?.set(name, lex.token.at);
        { if (lex.token.value !== "}") lex.fail("expected }"); lex.next(); }
        records.set(name, fields);
    }
    return {records, enums, distinct, aliases, values};
}

function recordLayouts(records) {
    return Object.fromEntries(Array.from(records, ([name, fields]) => [name, Object.fromEntries(fields)]));
}

function enumLayouts(enums) {
    return Object.fromEntries(Array.from(enums, ([name, members]) => [name, Object.fromEntries(members)]));
}

// ---- frontend/expressions.js
// The front end's parser and type checker, part one: the tape writer and the expressions (prefix, postfix and
// binary operators, calls, members, buffer literals). There is no syntax tree: each construct is checked and its
// tape written as it is parsed.
//
// The tape's opcodes, block types and cell counts (tape.js, loaded first), shared by every later module of the bundle.
const {UNREACHABLE, BLOCK, LOOP, IF, ELSE, END, BR, BR_IF, CALL, DROP, LOCAL_GET, LOCAL_SET,
    I32_LOAD, I32_LOAD16_U, I32_STORE, I32_STORE16, I32_CONST, I32_EQZ, I32_EQ, I32_NE, I32_LT_S, I32_GT_S,
    I32_LE_S, I32_GE_S, I32_GE_U, I32_ADD, I32_SUB, I32_MUL, I32_DIV_S, I32_REM_S, I32_AND, I32_OR, I32_XOR,
    I32_SHL, I32_SHR_S, I32_SHR_U, RETURN, CHECKED_ADDRESS, LITERAL_STORES, UNCHECKED_ADDRESS, I32, VOID, cells: CELLS,
    F32, F32_LOAD, F32_STORE, F32_CONST, F32_EQ, F32_NE, F32_LT, F32_GT, F32_LE, F32_GE, F32_ABS, F32_NEG, F32_CEIL,
    F32_FLOOR, F32_TRUNC, F32_SQRT, F32_ADD, F32_SUB, F32_MUL, F32_DIV, F32_COPYSIGN, F32_CONVERT_I32_S,
    I32_REINTERPRET_F32, F32_REINTERPRET_I32, I32_TRUNC_F32, F32_MIN, F32_MAX,
    I32_LT_U, I32_GT_U, I32_LE_U, I32_DIV_U, I32_REM_U, F32_CONVERT_I32_U, U32_TRUNC_F32, ARRAY_ADDRESS, ARRAY_ZERO} = typedTape;
// An integer literal takes the integer type its context needs (i32, u32 or a distinct type); a decimal literal from
// 2^31 to 2^32 - 1 is a u32 (U32_LITERAL), its i32 cell holding the same 32 bits.
const LITERAL = Symbol("integer literal");
const U32_LITERAL = Symbol("u32 literal");
const scalarType = type => type === LITERAL ? "i32" : type === U32_LITERAL ? "u32" : type;
const unsignedType = type => type === "u32" || type === U32_LITERAL;
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
// Two literals give a literal (whose type its context decides) under the operators whose bits do not depend on
// signedness, and so does a literal shifted by << or >>> by any count; / % and >> are signed on literals, so their
// result is an i32.
const LITERAL_OPERATORS = new Set(["+", "-", "*", "&", "|", "^", "<<", ">>>"]);
// On u32 operands: the unsigned comparisons, division and remainder; >> is an error (>>> is the logical shift).
const UNSIGNED = Object.assign(Object.create(null), {"<": I32_LT_U, "<=": I32_LE_U, ">": I32_GT_U, ">=": I32_GE_U,
    "/": I32_DIV_U, "%": I32_REM_U});
const PREFIX = 11; // the operand of a prefix operator binds tighter than every binary operator

class ExpressionParser {
    constructor(lexer, functions, records, edges, functionBase, enums = new Map(), distinct = new Set(), aliases, values) {
        this.aliases = aliases;
        this.values = values;
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
        if (type === "f32") (this.floatLocals ??= []).push(index);
        return index;
    }

    want(type, expected) {
        if (type === expected || type === LITERAL && (expected === "i32" || expected === "u32" || this.distinct.has(expected)) ||
            type === U32_LITERAL && expected === "u32") return;
        if (type === U32_LITERAL) this.lex.fail("i32 literal out of range");
        if (expected === "bool" && type === "BoolExpr")
            this.lex.fail("per-hit BoolExpr cannot control scene construction; use a staged select");
        this.lex.fail("expected " + expected + ", got " + scalarType(type));
    }

    // The tape writer: one cell per opcode and per operand (tape.js). The backends read the tape; the Wasm
    // backend serializes it (encodeFunction).
    emitConst(value) { this.code.push(I32_CONST, value); }
    emitFloat(value) { this.code.push(F32_CONST, f32Bits(value)); }
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
            const at = this.code.length;
            this.emitConst(0);
            const type = this.expr(PREFIX);
            if (type === "f32") {
                // f32 negation flips the sign (-0.0 is -0); a literal's sign is flipped in its cell.
                this.removeCells(at, 2);
                if (this.code.length === at + 2 && this.code[at] === F32_CONST) this.code[at + 1] ^= 0x80000000;
                else this.code.push(F32_NEG);
                return type;
            }
            this.want(type, "i32");
            this.code.push(I32_SUB);
            return type;
        }
        case "~": { // ~x is x ^ -1
            lex.next();
            const type = this.expr(PREFIX);
            if (!unsignedType(type)) this.want(type, "i32");
            this.emitConst(-1);
            this.code.push(I32_XOR);
            return unsignedType(type) ? "u32" : type;
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
            return this.math();
        }
        case "i32": {
            lex.next();
            { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
            const type = this.expr();
            // f32 -> i32 truncates toward zero and saturates; NaN gives 2^31 - 1 (tape.js f32.to_i32). A u32 keeps its bits.
            if (type === "f32") this.code.push(I32_TRUNC_F32);
            else if (!this.enums.has(type) && !this.distinct.has(type) && !unsignedType(type))
                lex.fail("i32 conversion requires an f32, a u32, an enum or a distinct integer, got " + scalarType(type));
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            return "i32";
        }
        case "f32": {
            // i32 -> f32, rounded to nearest even; a literal is converted in its cell.
            lex.next();
            lex.expect("(");
            const at = this.code.length;
            const type = this.expr();
            lex.expect(")");
            if (type === "f32") return type;
            const unsigned = unsignedType(type);
            if (scalarType(type) !== "i32" && !this.distinct.has(type) && !unsigned)
                lex.fail("f32 conversion requires an i32 or a u32, got " + scalarType(type));
            if (this.code.length === at + 2 && this.code[at] === I32_CONST) {
                this.code[at] = F32_CONST;
                this.code[at + 1] = f32Bits(unsigned ? this.code[at + 1] >>> 0 : this.code[at + 1]);
            } else this.code.push(unsigned ? F32_CONVERT_I32_U : F32_CONVERT_I32_S);
            return "f32";
        }
        case "u32":
            lex.next();
            return this.unsignedConversion();
        }
        if (lex.token.kind === "float") {
            this.emitFloat(lex.floatValue());
            lex.next();
            return "f32";
        }
        if (lex.token.kind === "int") {
            const value = lex.integerValue();
            if (value > 4294967295) lex.fail("integer literal out of range");
            this.emitConst(value | 0);
            lex.next();
            return value > 2147483647 ? U32_LITERAL : LITERAL;
        }
        const name = lex.ident();
        if ((lex.token.value === "(" && (lex.next(), true))) {
            const generatedType = lex.generatedWordType?.(name);
            if (generatedType || this.distinct.has(name)) {
                this.want(this.expr(), "i32");
                { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
                return generatedType ?? name;
            }
            if (this.values?.has(name)) return this.construct(name);
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
        if (this.values?.has(binding.type)) return this.valueRead(binding.type, binding.index);
        if (binding.array) return this.arrayRead(binding.array);
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
            if (binding.type === "buffer" && lex.accept("getF32")) {
                lex.expect("(");
                this.floatAddress(binding.index);
                lex.expect(")");
                this.code.push(F32_LOAD, 2, 2);
                return "f32";
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
            } else if (type === "f32") {
                const float = FLOAT_BINARY[op];
                if (!float) lex.fail("operator " + op + " is not defined on f32");
                lex.next();
                this.want(this.expr(precedence + 1), "f32");
                this.code.push(float[1]);
                type = float[0];
            } else {
                const numeric = NOMINAL.has(precedence);
                const nominal = numeric && this.distinct.has(type);
                // u32 operands (or a literal and a u32) take the unsigned comparisons, division and remainder. A
                // shift's count is any integer; its left operand gives the type.
                let unsigned = unsignedType(type);
                const shift = precedence === 8;
                if (!unsigned && !input && !nominal && scalarType(type) !== "i32" && type !== "bool" && !this.enums.has(type))
                    lex.fail("expected scalar equality operands");
                if (unsigned && op === ">>") lex.fail("operator >> is not defined on u32; use >>>");
                let expected = unsigned ? "u32" : nominal || !input ? scalarType(type) : input;
                this.want(type, expected);
                lex.next();
                const right = this.expr(precedence + 1);
                if (shift) {
                    if (!unsignedType(right)) this.want(right, "i32");
                } else {
                    if (type === LITERAL && unsignedType(right)) {
                        unsigned = true;
                        expected = "u32";
                    } else if (numeric && type === LITERAL && this.distinct.has(right)) expected = right;
                    this.want(right, expected);
                }
                this.code.push(unsigned && UNSIGNED[op] ? UNSIGNED[op] : opcode);
                type = type === LITERAL && (right === LITERAL || shift) && LITERAL_OPERATORS.has(op) ? LITERAL :
                    result === "i32" ? expected : result;
            }
        }
        // c ? a : b, JavaScript's loosest operator above assignment and right-associative: each arm is a whole
        // expression, so a ? b : c ? d : e is a ? b : (c ? d : e).
        if (minPrecedence === 0 && lex.token.value === "?") type = this.choice(type);
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
            } else if (this.values?.has(type)) {
                type = this.stackField(type, name);
            } else {
                const field = this.field(type, name);
                this.emitMemory(field.type === "f32" ? F32_LOAD : I32_LOAD, 2, field.offset);
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
                this.emitMemory(field.type === "f32" ? F32_LOAD : I32_LOAD, 2, field.offset);
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
        // A value record argument leaves its leaves on the stack, the callee's consecutive parameters.
        const params = callee.sourceParams ?? callee.params;
        const end = options ? params.length - this.records.get(options).size : params.length;
        for (let i = first; i < end; i++) {
            if (i !== first) lex.expect(",");
            this.want(this.expr(), params[i]);
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

// ---- frontend/floats.js
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
        // Two i32, or two u32 (compared unsigned); a literal takes the other operand's type.
        if (!unsignedType(first) && first !== LITERAL) this.want(first, "i32");
        this.emitIndex(LOCAL_SET, a);
        { if (lex.token.value !== ",") lex.fail("expected ,"); lex.next(); }
        const second = this.expr();
        const unsigned = unsignedType(first) || first === LITERAL && unsignedType(second);
        this.want(second, unsigned ? "u32" : "i32");
        this.emitIndex(LOCAL_SET, b);
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        this.emitIndex(LOCAL_GET, a);
        this.emitIndex(LOCAL_GET, b);
        this.code.push(unsigned ? I32_LT_U : I32_LT_S, IF, I32);
        this.emitIndex(LOCAL_GET, name === "min" ? a : b);
        this.code.push(ELSE);
        this.emitIndex(LOCAL_GET, name === "min" ? b : a);
        this.code.push(END);
        return unsigned ? "u32" : "i32";
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

// ---- frontend/values.js
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

// ---- frontend/arrays.js
// Local arrays (PICOCALC-TYPED-VALUES): `const a = new Float32Array(16)`, JavaScript's typed arrays of a fixed length
// that live in the function. Their methods are ExpressionParser's (copied onto its prototype below, as values.js does).
//
// A function's arrays are one area of fn.arrayBytes bytes, each array at a byte offset in it; array.address pushes
// the address of an offset (RV32: in the frame; WebAssembly: a static area at the top of the module's memory, which
// is enough because a function is never active twice, the call graph being acyclic). The declaration zeroes the
// array (array.zero), as JavaScript's `new` and WGSL's `var` do, each time it runs. `a[i]` checks i against the
// length, unsigned, so a negative index traps too (`local.get i; i32.const n; i32.ge_u; if; unreachable; end`), then
// reads or writes the word at address + 4i. Two indices cost no check at run time: a literal, checked here, and the
// counter of a counted loop that proves it in range (countedRange, proveChecks). `a.length` is a literal. An array is
// not a value: it is not assigned, passed, returned or compared.
const ARRAY_ELEMENTS = new Map([["Int32Array", "i32"], ["Uint32Array", "u32"], ["Float32Array", "f32"]]);
const ARRAY_LIMIT = 1024;

class ArrayParsing {
    // `new T(n)` of `let|const id = new T(n)`, at "new": n an integer literal from 1 to ARRAY_LIMIT.
    arrayDeclaration(id, annotation) {
        const lex = this.lex;
        if (annotation !== null) lex.fail("an array takes the type of its new expression, without an annotation");
        lex.next();
        const type = lex.token.value, element = ARRAY_ELEMENTS.get(type);
        if (!element) lex.fail("expected Int32Array, Uint32Array or Float32Array after new");
        lex.next();
        lex.expect("(");
        const length = lex.token.kind === "int" ? Number(lex.token.value) : NaN;
        if (!(length >= 1 && length <= ARRAY_LIMIT)) lex.fail("an array's length is an integer literal from 1 to " + ARRAY_LIMIT);
        lex.next();
        lex.expect(")");
        if (this.locals.has(id)) lex.fail("duplicate local " + id);
        const offset = this.arrayBytes ?? 0;
        this.arrayBytes = offset + 4 * length;
        this.locals.set(id, {type, array: {offset, length, element}});
        this.code.push(ARRAY_ZERO, offset, 4 * length);
    }

    // `[i]` after an array's name: the element's address on the operand stack, checked.
    arrayElement(array) {
        const lex = this.lex, code = this.code;
        lex.expect("[");
        const start = code.length;
        const type = this.expr();
        lex.expect("]");
        if (type !== LITERAL && type !== U32_LITERAL && type !== "i32" && type !== "u32")
            lex.fail("an array index is an i32 or a u32, got " + scalarType(type));
        const {offset, length} = array;
        if (code.length === start + 2 && code[start] === I32_CONST) {
            const index = code[start + 1] >>> 0;
            if (index >= length) lex.fail("array index " + index + " out of range for length " + length);
            this.truncate(start);
            code.push(ARRAY_ADDRESS, offset + 4 * index);
            return;
        }
        // A local is read again for the address; any other index is computed once into a fresh local.
        let local;
        if (code.length === start + 2 && code[start] === LOCAL_GET) {
            local = code[start + 1];
            this.truncate(start);
            // The counter of an enclosing counted loop below the length: the check may go when the loop ends.
            for (let k = (this.countedLoops?.length ?? 0) - 1; k >= 0; k--) {
                const proof = this.countedLoops[k];
                if (proof.local !== local || proof.code !== code) continue;
                if (proof.bound <= length) (this.boundChecks ??= []).push({at: code.length, proof});
                break;
            }
        } else this.emitIndex(LOCAL_SET, local = this.nextLocal++);
        this.emitIndex(LOCAL_GET, local);
        this.emitConst(length);
        code.push(I32_GE_U, IF, VOID, UNREACHABLE, END, ARRAY_ADDRESS, offset);
        this.emitIndex(LOCAL_GET, local);
        this.emitConst(2);
        code.push(I32_SHL, I32_ADD);
    }

    // A counted loop's range proof, after its header: `for (k = c; k < n; k = k + s)` (the tape `const c; set k`,
    // `get k; const n; lt; eqz; br_if 1` and the update `get k; const s; add; set k`) holds k below n whenever its
    // body starts, when the body never writes k: unsigned for lt_u, and for lt_s when c and s are not negative, so k
    // never is. initAt is where the header's initialization starts, conditionAt its condition.
    countedRange(initAt, conditionAt, update) {
        const code = this.code;
        if (conditionAt - initAt !== 8 || code.length !== conditionAt + 8 || code[initAt] !== I32_CONST ||
            code[initAt + 2] !== LOCAL_SET) return null;
        const local = code[initAt + 3], first = code[initAt + 1];
        if (code[conditionAt] !== LOCAL_GET || code[conditionAt + 1] !== local || code[conditionAt + 2] !== I32_CONST)
            return null;
        if (update.length !== 7 || update[0] !== LOCAL_GET || update[1] !== local || update[2] !== I32_CONST ||
            update[4] !== I32_ADD || update[5] !== LOCAL_SET || update[6] !== local) return null;
        const bound = code[conditionAt + 3], compare = code[conditionAt + 4], step = update[3];
        if (compare === I32_LT_U) return {local, bound: bound >>> 0, code};
        if (compare === I32_LT_S && first >= 0 && step >= 0 && bound >= 0 && bound <= 1 << 30 && step <= 1 << 30)
            return {local, bound, code};
        return null;
    }

    // A counted loop's body has ended at the tape's end, from bodyAt: unless it writes the counter, the checks of
    // the counter it recorded are removed (nine cells each; the positions of later checks move down).
    proveChecks(proof, bodyAt) {
        const code = this.code, checks = this.boundChecks ?? [];
        this.boundChecks = checks.filter(check => check.proof !== proof);
        for (let at = bodyAt; at < code.length; at += 1 + CELLS[code[at]])
            if (code[at] === LOCAL_SET && code[at + 1] === proof.local) return;
        const mine = checks.filter(check => check.proof === proof).sort((x, y) => y.at - x.at);
        for (const {at} of mine) {
            if (code[at] !== LOCAL_GET || code[at + 1] !== proof.local || code[at + 4] !== I32_GE_U || code[at + 5] !== IF ||
                code[at + 7] !== UNREACHABLE || code[at + 8] !== END) throw new Error("array check moved at " + at);
            code.copyWithin(at, at + 9);
            code.length -= 9;
            code.spans?.splice(at, 9);
            for (const check of this.boundChecks) if (check.at > at) check.at -= 9;
        }
    }

    // Drop the tape from start (an inspection tape's spans too).
    truncate(start) {
        this.code.length = start;
        if (this.code.spans) this.code.spans.length = start;
    }

    // An array's name in an expression: `a[i]` or `a.length`.
    arrayRead(array) {
        const lex = this.lex;
        if (lex.accept(".")) {
            if (lex.ident() !== "length") lex.fail("an array has only .length");
            this.emitConst(array.length);
            return LITERAL;
        }
        if (lex.token.value !== "[") lex.fail("an array is not a value; index it or read its length");
        this.arrayElement(array);
        this.emitMemory(array.element === "f32" ? F32_LOAD : I32_LOAD, 2, 0);
        return array.element;
    }

    // `a[i] = e;` as a statement.
    arrayAssignment(array, statement) {
        const lex = this.lex;
        if (!statement || lex.token.value !== "[") lex.fail("an array is not assignable; assign its elements");
        this.arrayElement(array);
        lex.expect("=");
        this.want(this.expr(), array.element);
        this.emitMemory(array.element === "f32" ? F32_STORE : I32_STORE, 2, 0);
    }
}
for (const name of Object.getOwnPropertyNames(ArrayParsing.prototype))
    if (name !== "constructor") Object.defineProperty(ExpressionParser.prototype, name,
        Object.getOwnPropertyDescriptor(ArrayParsing.prototype, name));

// ---- frontend/statements.js
// The front end's parser and type checker, part two: blocks, conditionals, loops, match, declarations and
// assignments, and one function's body. typed-async.js (async/body.js) subclasses FunctionEmitter as its TypeChecker.

// Whether a loop body that starts after the `{` at `from` contains the word continue (outside comments and strings).
// Nested loops' continues count too: an unneeded continue block costs no instruction. One test per source decides
// whether any body needs the scan, so a program without continue pays one search per source.
const CONTINUE_SCAN = /[{}]|\/\/[^\n]*|"(?:[^"\\\n]|\\[^\n])*"|\bcontinue\b/g;
let continueSource = null, continueFound = false;
function bodyContinues(source, from) {
    if (source !== continueSource) {
        continueSource = source;
        continueFound = source.includes("continue");
    }
    if (!continueFound) return false;
    CONTINUE_SCAN.lastIndex = from;
    for (let depth = 1, token; (token = CONTINUE_SCAN.exec(source));) {
        if (token[0] === "{") depth++;
        else if (token[0] === "}") { if (--depth === 0) return false; }
        else if (token[0] === "continue") return true;
    }
    return false;
}

class FunctionEmitter extends ExpressionParser {
    result(type, branch) {
        { if (this.lex.token.value !== "return") this.lex.fail("expected return"); this.lex.next(); }
        this.want(this.expr(), type);
        { if (this.lex.token.value !== ";") this.lex.fail("expected ;"); this.lex.next(); }
        if (branch) this.code.push(RETURN);
    }

    bufferWrite(receiver) {
        const lex = this.lex;
        if ((lex.token.value === "writeLiteral" && (lex.next(), true))) {
            this.bufferLiteral(receiver);
            return;
        }
        if (lex.accept("setF32")) {
            lex.expect("(");
            this.floatAddress(receiver);
            lex.expect(",");
            this.want(this.expr(), "f32");
            lex.expect(")");
            this.code.push(F32_STORE, 2, 2);
            return;
        }
        { if (lex.token.value !== "setCharCodeAt") lex.fail("expected setCharCodeAt"); lex.next(); }
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const position = this.nextLocal++;
        this.want(this.expr(), "i32");
        this.emitIndex(LOCAL_SET, position);
        { if (lex.token.value !== ",") lex.fail("expected ,"); lex.next(); }
        this.codeUnitAddress(receiver, position);
        this.want(this.expr(), "i32");
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        this.code.push(I32_STORE16, 1, 4); // i32.store16 into the buffer's data after its capacity
    }

    block(result) {
        if (++this.depth > 128) this.lex.fail("block nesting limit exceeded");
        { if (this.lex.token.value !== "{") this.lex.fail("expected {"); this.lex.next(); }
        const enclosing = this.locals;
        this.locals = new Map(enclosing);
        while (!(this.lex.token.value === "}" && (this.lex.next(), true))) this.statement(result);
        this.locals = enclosing;
        this.depth--;
    }

    conditional(result) {
        const lex = this.lex;
        const enclosing = this.controls;
        do {
            if (this.controls - enclosing + this.depth >= 128) lex.fail("block nesting limit exceeded");
            { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
            this.want(this.expr(), "bool");
            { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
            this.code.push(IF, VOID);
            this.controls++;
            if (lex.token.value === "{") this.block(result);
            else this.result(result, true);
            if (!(lex.token.value === "else" && (lex.next(), true))) break;
            this.code.push(ELSE);
            if ((lex.token.value === "if" && (lex.next(), true))) continue;
            if (lex.token.value === "{") this.block(result);
            else this.result(result, true);
            break;
        } while (true);
        while (this.controls > enclosing) {
            this.code.push(END);
            this.controls--;
        }
    }

    loop(result, counted) {
        const lex = this.lex;
        const enclosing = this.locals;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const initAt = this.code.length;
        if (counted) {
            this.locals = new Map(enclosing);
            if (lex.token.value === "let") this.declaration();
            else this.assignment(lex.ident());
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
        }
        // Expression control blocks close within expr(), before any break can appear. A loop is
        //     block; loop; C; eqz; br_if 1; B; [update]; br 0; end; end
        // and break is a br to the outer block. When the body has a continue, B is block; B; end and continue is a br
        // to that block's end, which reaches the update and the back edge: a br to the loop itself would skip the
        // update, and the condition once the rotate pass has moved it to the bottom.
        const exit = this.controls;
        this.loopExits.push(exit);
        this.controls += 2;
        this.code.push(BLOCK, VOID, LOOP, VOID);
        const conditionAt = this.code.length;
        this.want(this.expr(), "bool");
        this.code.push(I32_EQZ, BR_IF, 1);
        let update;
        if (counted) {
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            const loopCode = this.code;
            this.code = this.inspection ? this.inspection.tape() : [];
            this.assignment(lex.ident());
            update = this.code;
            this.code = loopCode;
        }
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        // A counted loop's range proof removes its counter's array checks (frontend/arrays.js) when it holds.
        const proof = counted && this.arrayBytes ? this.countedRange(initAt, conditionAt, update) : null;
        if (proof) (this.countedLoops ??= []).push(proof);
        const bodyAt = this.code.length;
        const continues = lex.token.value === "{" && bodyContinues(lex.source, lex.offset);
        (this.loopContinues ??= []).push(continues ? exit + 2 : -1);
        if (continues) {
            this.code.push(BLOCK, VOID);
            this.controls++;
        }
        this.block(result);
        if (continues) {
            this.code.push(END);
            this.controls--;
        }
        this.loopContinues.pop();
        if (proof) {
            this.countedLoops.pop();
            this.proveChecks(proof, bodyAt);
        }
        if (update) {
            if (this.inspection) this.code.append(update);
            else for (const cell of update) this.code.push(cell);
        }
        this.code.push(BR, 0, END, END);
        this.controls -= 2;
        this.loopExits.pop();
        this.locals = enclosing;
    }

    declaration() {
        const lex = this.lex;
        const mutable = lex.token.value === "let";
        lex.next();
        const id = lex.ident();
        const annotation = (lex.token.value === ":" && (lex.next(), true)) ? lex.type(this.records, this.enums, this.distinct, this.values) : null;
        if (mutable && annotation !== null && lex.isGeneratedLocal?.(id) && lex.token.value === ";") {
            // Every continuation path reaches the original initializer or a reload
            // before reading this slot, including on targets with uninitialized frames.
            this.local(id, annotation, true);
            return;
        }
        { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
        if (lex.token.value === "new") return this.arrayDeclaration(id, annotation);
        const type = this.expr();
        if (annotation !== null) this.want(type, annotation);
        const declared = annotation ?? scalarType(type);
        if (this.values?.has(declared)) this.setLeaves(declared, this.valueLocal(id, declared, mutable));
        else this.emitIndex(LOCAL_SET, this.local(id, declared, mutable));
    }

    assignment(id, statement = false) {
        const lex = this.lex;
        const local = this.locals.get(id);
        if (!local) lex.fail("unknown local " + id);
        if (this.values?.has(local.type)) return this.valueAssignment(id, local, statement);
        if (local.array) return this.arrayAssignment(local.array, statement);
        if (statement && (lex.token.value === "." && (lex.next(), true))) {
            if (local.type === "buffer") this.bufferWrite(local.index);
            else {
                const name = lex.ident();
                this.emitIndex(LOCAL_GET, local.index);
                if (lex.token.value === "(") {
                    let type = this.memberCall(this.aliases?.methods.get(local.type), local.type, true, name);
                    if (lex.token.value === ".") type = this.postfix(type);
                    this.drop(type);
                    return;
                }
                const field = this.field(local.type, name);
                { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
                this.want(this.expr(), field.type);
                this.emitMemory(field.type === "f32" ? F32_STORE : I32_STORE, 2, field.offset);
            }
        } else {
            if (!local.mutable) lex.fail("expected mutable local " + id);
            { if (lex.token.value !== "=") lex.fail("expected ="); lex.next(); }
            this.want(this.expr(), local.type);
            this.emitIndex(LOCAL_SET, local.index);
        }
    }

    // An assignment to a value record local or a part of it: v = e, v.f = e, v.o.f = e (a mutable local), a store
    // through a record reference it holds (v.r.f = e), a method call on a part of it, or a buffer write.
    valueAssignment(id, local, statement) {
        const lex = this.lex;
        let type = local.type, index = local.index;
        while (statement && this.values.has(type) && lex.token.value === ".") {
            lex.next();
            const name = lex.ident();
            if (lex.token.value === "(") {
                this.pushLeaves(type, index);
                let result = this.memberCall(this.aliases?.methods.get(type), type, true, name);
                if (lex.token.value === ".") result = this.postfix(result);
                this.drop(result);
                return;
            }
            const field = this.valueField(type, name);
            type = field.type;
            index += field.offset;
        }
        if (statement && lex.accept(".")) {
            if (type === "buffer") return this.bufferWrite(index);
            const name = lex.ident();
            this.emitIndex(LOCAL_GET, index);
            if (lex.token.value === "(") {
                let result = this.memberCall(this.aliases?.methods.get(type), type, true, name);
                if (lex.token.value === ".") result = this.postfix(result);
                this.drop(result);
                return;
            }
            const field = this.field(type, name);
            lex.expect("=");
            this.want(this.expr(), field.type);
            this.emitMemory(field.type === "f32" ? F32_STORE : I32_STORE, 2, field.offset);
            return;
        }
        if (!local.mutable) lex.fail("expected mutable local " + id);
        lex.expect("=");
        this.want(this.expr(), type);
        this.setLeaves(type, index);
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
                this.emitIndex(LOCAL_GET, slot);
                this.emitConst(first);
                this.code.push(I32_EQ);
            } else {
                this.emitConst((last - first) | 0);
                this.emitIndex(LOCAL_GET, slot);
                if (first !== 0) {
                    this.emitConst(first);
                    this.code.push(I32_SUB);
                }
                this.code.push(I32_GE_U);
            }
            if (i < values.length) {
                this.code.push(IF, I32);
                this.emitConst(1);
                this.code.push(ELSE);
                joins++;
            }
        }
        while (joins-- > 0) this.code.push(END);
    }

    match(result) {
        const lex = this.lex;
        { if (lex.token.value !== "(") lex.fail("expected ("); lex.next(); }
        const type = this.expr();
        const members = this.enums.get(type);
        if (!members) lex.fail("match requires an enum, got " + scalarType(type));
        { if (lex.token.value !== ")") lex.fail("expected )"); lex.next(); }
        const slot = this.nextLocal++;
        this.emitIndex(LOCAL_SET, slot);
        { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
        const seen = new Set();
        const enclosing = this.controls;
        while (!(lex.token.value === "}" && (lex.next(), true))) {
            const values = [];
            do {
                const member = lex.ident();
                if (!members.has(member)) lex.fail("unknown case " + member + " in " + type);
                if (seen.has(member)) lex.fail("useless case " + member);
                seen.add(member);
                values.push(members.get(member));
            } while ((lex.token.value === "," && (lex.next(), true)));
            { if (lex.token.value !== ":") lex.fail("expected :"); lex.next(); }
            this.matchGroup(slot, values);
            this.code.push(IF, VOID);
            this.controls++;
            this.block(result);
            this.code.push(ELSE);
        }
        const missing = [...members.keys()].filter(member => !seen.has(member));
        if (missing.length) lex.fail("match on " + type + " does not cover: " + missing.join(", "));
        this.code.push(UNREACHABLE); // A raw ABI word outside the declared domain traps.
        while (this.controls > enclosing) {
            this.code.push(END);
            this.controls--;
        }
    }

    statement(result) {
        const lex = this.lex;
        switch (lex.token.value) {
        case "if":
            lex.next();
            this.conditional(result);
            return;
        case "match":
            lex.next();
            this.match(result);
            return;
        case "return":
            this.result(result, true);
            return;
        case "while":
            lex.next();
            this.loop(result, false);
            return;
        case "for":
            lex.next();
            this.loop(result, true);
            return;
        case "break": {
            lex.next();
            const exit = this.loopExits.at(-1);
            if (exit === undefined) lex.fail("break outside a loop");
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            this.emitIndex(BR, this.controls - exit - 1);
            return;
        }
        case "continue": {
            lex.next();
            const target = this.loopContinues?.at(-1);
            if (target === undefined) lex.fail("continue outside a loop");
            if (target < 0) lex.fail("continue the loop's body scan did not find");
            { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
            this.emitIndex(BR, this.controls - target - 1);
            return;
        }
        case "const": case "let":
            this.declaration();
            break;
        default: {
            const id = lex.ident();
            if ((lex.token.value === "(" && (lex.next(), true))) {
                let type = this.call(id);
                if (lex.token.value === ".") type = this.postfix(type);
                this.drop(type); // drop the unused call result
            } else if (!this.locals.has(id) && this.aliases?.namespaces.has(id)) {
                lex.expect(".");
                let type = this.memberCall(this.aliases.namespaces.get(id), id, false);
                if (lex.token.value === ".") type = this.postfix(type);
                this.drop(type);
            } else {
                this.assignment(id, true);
            }
        }
        }
        { if (lex.token.value !== ";") lex.fail("expected ;"); lex.next(); }
    }

    function(fn) {
        const lex = this.lex;
        const {params, paramNames, result, sourceParams} = fn;
        // A value record parameter is its leaves, consecutive parameters: one value local.
        if (sourceParams) for (let i = 0; i < sourceParams.length; i++) {
            if (this.values?.has(sourceParams[i])) this.valueLocal(fn.sourceNames[i], sourceParams[i], false);
            else this.local(fn.sourceNames[i], sourceParams[i]);
        }
        else for (let i = 0; i < params.length; i++) this.local(paramNames[i], params[i]);
        lex.offset = fn.bodyAt;
        lex.next();
        { if (lex.token.value !== "{") lex.fail("expected {"); lex.next(); }
        while (lex.token.value !== "return") this.statement(result);
        this.result(result, false);
        { if (lex.token.value !== "}") lex.fail("expected }"); lex.next(); }
        this.code.push(END);
        fn.nlocals = this.nextLocal - params.length;
        fn.code = this.code;
        return this.finish(fn);
    }

    finish(fn) {
        if (this.literals) fn.literals = this.literals;
        if (this.arrayBytes) fn.arrayBytes = this.arrayBytes;
        // fn.localTypes: the type class of each frame local ("f32" or "i32"), only when one is an f32; the RV32
        // planner and the Wasm local declarations read it.
        const params = fn.params.length;
        const floats = this.floatLocals?.filter(index => index >= params);
        if (floats?.length) {
            fn.localTypes = Array(fn.nlocals).fill("i32");
            for (const index of floats) fn.localTypes[index - params] = "f32";
        }
        return fn;
    }
}

// ---- frontend/inspect.js
// The front end's inspection events: the tape's operations of each inspected function, with source spans.
class InspectionCallbackError extends Error {
    constructor(cause) { super("Typed inspection callback failed", {cause}); }
}

function emitInspection(inspect, event) {
    try {
        inspect.emit(event);
    } catch (error) {
        // compileFunctions rethrows the observer's own error, never as a compiler diagnostic.
        throw new InspectionCallbackError(error);
    }
}

class InspectionTape extends Array {
    constructor(source) {
        super();
        this.source = source;
        this.spans = [];
    }

    push(...cells) {
        const span = this.source();
        for (let i = 0; i < cells.length; i++) this.spans.push(span);
        return super.push(...cells);
    }

    append(other) {
        for (let i = 0; i < other.length; i++) {
            super.push(other[i]);
            this.spans.push(other.spans[i]);
        }
    }
}

// The tape's operations (tape.js), each with the source span of the token at which its opcode was written.
function inspectOperations(tape) {
    const operations = typedTape.decode(tape);
    for (const operation of operations) operation.source = {...tape.spans[operation.offset]};
    return operations;
}

// The front end's event for one function: its tape's operations, locals and source. A backend that writes another
// encoding of the same operations (the Wasm backend) describes them in its own terms (describeWasmFunction).
function inspectFunction(emitter, fn, inspect, origin) {
    const lex = emitter.lex;
    const unit = origin ? "generated" : "original";
    const source = () => {
        const {at, value} = lex.token;
        return {unit, start: at, end: at + value.length, precision: "emission-token",
            ...(origin && {origin})};
    };
    const locals = [];
    const local = emitter.local;
    emitter.local = function (name, type, mutable = false) {
        const index = local.call(this, name, type, mutable);
        const parameter = index < fn.params.length;
        // Parameters are installed before the emitter seeks to the body.
        locals.push({index, name, type, mutable, parameter, source: parameter ? null : source()});
        return index;
    };
    emitter.inspection = {tape: () => new InspectionTape(source)};
    emitter.code = emitter.inspection.tape();
    emitter.function(fn);
    const operations = inspectOperations(fn.code);
    fn.code = Array.from(fn.code);
    emitInspection(inspect, {
        kind: "frontend", target: "tape", function: fn.name, index: fn.index,
        params: fn.params.slice(), result: fn.result, locals, localCount: emitter.nextLocal, operations,
        ...(origin && {sourceText: lex.source}),
    });
}

function finishFunction(emitter, fn, inspect, origin) {
    if (inspect && (inspect.function === undefined || inspect.function === fn.name))
        inspectFunction(emitter, fn, inspect, origin);
    else
        emitter.function(fn);
}

// ---- frontend/compile.js
// The front end's entry: compileFunctions parses a program and hands each function's tape to the backend
// before parsing the next (streaming), with the async lowering (typed-async.js) when the source needs it.
// Parse and check `source`, writing each function's tape (fn.code, fn.nlocals, fn.literals) and handing it to
// onFunction before the next function is parsed. The fifth parameter is unused: the front end has one output.
function compileFunctions(source, functionBase, imported = [], maxSourceLength = 64 * 1024, unused, onFunction, onSignatures, options) {
    if (source.length > maxSourceLength) throw new SyntaxError("input limit exceeded");
    const inspect = options?.inspect;
    if (inspect && typeof inspect.emit !== "function") throw new TypeError("Typed inspection needs an emit callback");
    return withLexIndices(() => {
        const lowered = globalThis.typedAsync?.rewrite(source, imported);
        try {
            const program = lowered
                ? emitSpanFunctions(lowered, functionBase, imported, onFunction, onSignatures, inspect)
                : emitFunctions(source, functionBase, imported, onFunction, onSignatures, inspect);
            if (lowered) {
                program.asyncLayout = lowered.layout;
                if (options?.asyncSource) program.asyncSource = lowered.source;
            }
            return program;
        } catch (error) {
            if (error instanceof InspectionCallbackError) throw error.cause;
            throw error;
        }
    });
}

function configureGeneratedLexer(lex, lowered) {
    const generatedPrefix = lowered.prefix;
    lex.isGeneratedLocal = name => name.startsWith(generatedPrefix + "local_");
    lex.generatedWordType = name => name.startsWith(generatedPrefix + "word_")
        ? name.slice(generatedPrefix.length + "word_".length) : null;
    lex.generatedStartFields = lowered.startFields;
    return lex;
}

const position = (source, at) => {
    const lines = source.slice(0, at).split("\n");
    return lines.length + ":" + (lines.at(-1).length + 1);
};

// A diagnostic of lex, a lexer over a piece of the lowered program (a rewritten body, or the generated functions)
// that starts at offset `base` of it, at the position in the source the author wrote (lowered.originalAt): an error
// in lowered code needs no second compile. Lexer.fail names lex.token, which is still the failing token. Mapping here
// rather than in an overridden fail keeps the lexers' shapes, which the compile's peak heap notices (8 KB on Editor).
function originalError(error, lex, lowered, base) {
    if (!(error instanceof SyntaxError)) return error;
    const here = position(lex.source, lex.token.at) + ": ";
    if (!error.message.startsWith(here)) return error;
    const at = lowered.originalAt(base + lex.token.at);
    return new SyntaxError(position(lowered.plan.original, at) + ": " + error.message.slice(here.length));
}

function emitSpanFunctions(lowered, functionBase, imported, onFunction, onSignatures, inspect) {
    const {original, declarations, fields, bodies, generated} = lowered.plan;
    const {enums, distinct, aliases, values} = declarations;
    const records = new Map(declarations.records);
    if (fields.length) {
        const state = new Map(records.get("WorldState"));
        for (const {name, type} of fields) state.set(name, {type, offset: state.size * 4});
        records.set("WorldState", state);
    }
    const declared = new Map(imported.map(fn => [fn.name, fn]));
    for (const name of distinct)
        if (declared.has(name)) throw new SyntaxError("duplicate imported function " + name);

    const functions = lowered.ordinarySignatures.slice();
    for (const [ordinal, fn] of functions.entries()) {
        fn.index = functionBase + ordinal;
        declared.set(fn.name, fn);
    }
    const originalLex = configureGeneratedLexer(new Lexer(original, 0, original.length, true), lowered);
    const generatedLex = configureGeneratedLexer(new Lexer(generated, 0, generated.length, true), lowered);
    const ordinaryCount = functions.length;
    let generatedSignatures;
    try {
        generatedSignatures = scanSignatures(generatedLex, records, declared, functionBase + ordinaryCount, enums, distinct,
            false, values);
    } catch (error) {
        throw originalError(error, generatedLex, lowered, lowered.generatedAt);
    }
    for (const fn of generatedSignatures) {
        fn.bodyAt += lowered.generatedAt;
        functions.push(fn);
    }
    if (!functions.length) throw new SyntaxError("expected a function");
    checkMembers(originalLex, aliases, declared, records);
    if (onSignatures) onSignatures(functions);
    const edges = functions.map(() => []);
    for (const [i, fn] of functions.entries()) {
        const virtualAt = fn.bodyAt;
        let lex = originalLex, base;
        if (i >= ordinaryCount) {
            lex = generatedLex;
            base = lowered.generatedAt;
            fn.bodyAt -= base;
        } else {
            const body = bodies[i];
            if (body.text !== undefined) {
                lex = configureGeneratedLexer(new Lexer(body.text, 0, body.text.length, true), lowered);
                base = body.from;
            }
            fn.bodyAt = body.at;
        }
        try {
            const emitter = new FunctionEmitter(lex, declared, records, edges[i], functionBase, enums, distinct, aliases, values);
            if (inspect) finishFunction(emitter, fn, inspect,
                lex === originalLex ? undefined : lex === generatedLex ? "synthetic-source" : "rewritten-body");
            else emitter.function(fn);
        } catch (error) {
            throw base === undefined ? error : originalError(error, lex, lowered, base);
        } finally {
            fn.bodyAt = virtualAt;
        }
        if (onFunction) onFunction(fn);
    }
    return {functions, records, enums, distinct, edges, order: checkAcyclic(functions, edges)};
}

function emitFunctions(source, functionBase, imported, onFunction, onSignatures, inspect) {
    const lex = new Lexer(source, 0, source.length, true);
    const declared = new Map(imported.map(fn => [fn.name, fn]));
    const {records, enums, distinct, aliases, values} = parseDeclarations(lex);
    for (const name of distinct) if (declared.has(name)) lex.fail("duplicate imported function " + name);
    const functions = scanSignatures(lex, records, declared, functionBase, enums, distinct, false, values);
    if (!functions.length) lex.fail("expected a function");
    checkMembers(lex, aliases, declared, records);
    if (onSignatures) onSignatures(functions);
    const edges = functions.map(() => []);
    for (const [i, fn] of functions.entries()) {
        const emitter = new FunctionEmitter(lex, declared, records, edges[i], functionBase, enums, distinct, aliases, values);
        if (inspect) finishFunction(emitter, fn, inspect);
        else emitter.function(fn);
        if (onFunction) onFunction(fn);
    }

    const order = checkAcyclic(functions, edges);
    return { functions, records, enums, distinct, edges, order };
}

// ---- wasm/encode.js
// The WebAssembly backend, part one: a tape serialized as a Wasm function body. An operation's opcode is its Wasm
// opcode and its operand cells become LEB128 immediates (signed for i32.const; a block type cell, 0x40 or 0x7f, is its
// own one-byte encoding). The text pseudo-ops expand to the Wasm sequences they stand for.
function pushUnsigned(out, value) {
    do {
        const part = value & 127;
        value >>>= 7;
        out.push(part | (value ? 128 : 0));
    } while (value);
}

function unsigned(value) {
    const bytes = [];
    pushUnsigned(bytes, value);
    return bytes;
}

function pushSigned(out, value) {
    while (true) {
        const part = value & 127;
        value >>= 7;
        const done = (value === 0 && !(part & 64)) || (value === -1 && !!(part & 64));
        out.push(part | (done ? 0 : 128));
        if (done) return;
    }
}

// text.checked_address receiver position: trap unless position < capacity (unsigned), then receiver + 2 * position.
function pushCheckedAddress(out, receiver, position) {
    out.push(LOCAL_GET);
    pushUnsigned(out, position);
    out.push(LOCAL_GET);
    pushUnsigned(out, receiver);
    out.push(I32_LOAD, 2, 0, I32_GE_U, IF, VOID, UNREACHABLE, END, LOCAL_GET);
    pushUnsigned(out, receiver);
    out.push(LOCAL_GET);
    pushUnsigned(out, position);
    out.push(I32_CONST, 1, I32_SHL, I32_ADD);
}

// text.literal_stores address literal: one i32.store16 per UTF-16 unit, from address + 4. The tape's check of the
// whole range precedes it.
function pushLiteralStores(out, address, text) {
    for (let i = 0; i < text.length; i++) {
        out.push(LOCAL_GET);
        pushUnsigned(out, address);
        out.push(I32_CONST);
        pushSigned(out, text.charCodeAt(i));
        out.push(I32_STORE16, 1);
        pushUnsigned(out, 4 + 2 * i);
    }
}

// f32.to_i32 (RV32F's fcvt.w.s rtz): i32.trunc_sat_f32_s, but 2^31 - 1 for NaN. `scratch` is an f32 local.
function pushTruncate(out, scratch) {
    out.push(LOCAL_SET);
    pushUnsigned(out, scratch);
    out.push(I32_CONST, 0xff, 0xff, 0xff, 0xff, 0x07, LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(0xfc, 0x00, LOCAL_GET); // i32.trunc_sat_f32_s
    pushUnsigned(out, scratch);
    out.push(LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(F32_NE, 0x1b); // NaN: select 2^31 - 1
}

// f32.to_u32 (RV32F's fcvt.wu.s rtz): i32.trunc_sat_f32_u, but 2^32 - 1 for NaN. `scratch` is an f32 local.
function pushTruncateUnsigned(out, scratch) {
    out.push(LOCAL_SET);
    pushUnsigned(out, scratch);
    out.push(I32_CONST, 0x7f, LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(0xfc, 0x01, LOCAL_GET); // i32.trunc_sat_f32_u
    pushUnsigned(out, scratch);
    out.push(LOCAL_GET);
    pushUnsigned(out, scratch);
    out.push(F32_NE, 0x1b); // NaN: select 2^32 - 1
}

// f32.min_num and f32.max_num (RV32F's fmin.s, fmax.s): the other operand when one is NaN, else f32.min or f32.max,
// which order -0 below +0 as fmin.s does. a and b are f32 scratch locals:
//   select(select(min(a, b), a, b === b), b, a === a)
function pushMinMax(out, op, a, b) {
    const get = local => { out.push(LOCAL_GET); pushUnsigned(out, local); };
    out.push(LOCAL_SET);
    pushUnsigned(out, b);
    out.push(LOCAL_SET);
    pushUnsigned(out, a);
    get(a); get(b); out.push(op === F32_MIN ? 0x96 : 0x97);
    get(a); get(b); get(b); out.push(F32_EQ, 0x1b);
    get(b); get(a); get(a); out.push(F32_EQ, 0x1b);
}

// The local declarations of a body: runs of one value type.
function localGroups(types) {
    const groups = [];
    for (const type of types) {
        const last = groups.at(-1);
        if (last && last[1] === type) last[0]++;
        else groups.push([1, type]);
    }
    return [...unsigned(groups.length), ...groups.flatMap(([count, type]) => [...unsigned(count), type])];
}

// array.address offset: the static address fn.arrayBase + offset. array.zero offset bytes: memory.fill (bulk memory).
function pushArray(out, fn, op, offset, bytes) {
    out.push(I32_CONST);
    pushSigned(out, fn.arrayBase + offset);
    if (op === ARRAY_ZERO) {
        out.push(I32_CONST, 0, I32_CONST);
        pushSigned(out, bytes);
        out.push(0xfc, 0x0b, 0x00);
    }
}

// fn.body: the framed body (size, locals, instructions) of fn's tape. `marks`, when given, receives the byte offset
// of each tape operation within the instructions, by ordinal. Returns the instructions' length.
function encodeFunction(fn, marks) {
    const tape = fn.code, out = [];
    // The expansions of f32.to_i32, f32.min_num and f32.max_num use two f32 scratch locals after the function's own.
    const first = fn.params.length + fn.nlocals;
    let scratch = false;
    for (let at = 0; at < tape.length;) {
        const op = tape[at];
        const n = CELLS[op];
        if (marks) marks.push(out.length);
        // Most operands fit one LEB128 byte; those take the short paths.
        if (op === ARRAY_ADDRESS || op === ARRAY_ZERO) {
            pushArray(out, fn, op, tape[at + 1], tape[at + 2]);
        } else if (n === 1 && op !== I32_CONST && op !== F32_CONST && tape[at + 1] < 128) {
            out.push(op, tape[at + 1]);
        } else if (n === 0 && op < I32_TRUNC_F32) {
            out.push(op);
        } else if (op === I32_CONST) {
            const value = tape[at + 1];
            if (value >= -64 && value < 64) out.push(op, value & 127);
            else {
                out.push(op);
                pushSigned(out, value);
            }
        } else if (op === CHECKED_ADDRESS) {
            pushCheckedAddress(out, tape[at + 1], tape[at + 2]);
        } else if (op === LITERAL_STORES) {
            pushLiteralStores(out, tape[at + 1], fn.literals[tape[at + 2]]);
        } else if (op === F32_CONST) {
            const bits = tape[at + 1];
            out.push(op, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, bits >>> 24);
        } else if (op === I32_TRUNC_F32) {
            scratch = true;
            pushTruncate(out, first);
        } else if (op === U32_TRUNC_F32) {
            scratch = true;
            pushTruncateUnsigned(out, first);
        } else if (op === F32_MIN || op === F32_MAX) {
            scratch = true;
            pushMinMax(out, op, first, first + 1);
        } else if (n < 0 || op === UNCHECKED_ADDRESS) {
            throw new Error("no Wasm encoding for tape opcode " + op + " at " + at);
        } else {
            out.push(op);
            for (let k = 1; k <= n; k++) pushUnsigned(out, tape[at + k]);
        }
        at += 1 + n;
    }
    const types = fn.localTypes ? fn.localTypes.map(type => type === "f32" ? F32 : I32) : Array(fn.nlocals).fill(I32);
    if (scratch) types.push(F32, F32);
    const locals = !types.length ? [0] : !fn.localTypes && !scratch ? [1, ...unsigned(fn.nlocals), I32] : localGroups(types);
    fn.body = unsigned(locals.length + out.length).concat(locals, out);
    return out.length;
}

// Compile source's functions with the front end and serialize each tape as it arrives; the tapes are released.
// Inspection: the front end's event for a function describes its tape; this backend reports the same function's
// Wasm operations instead, each with the source of the tape operation it encodes, and keeps their byte ranges
// for the emission event (inspectWasmEmission).
function compileWasmFunctions(source, functionBase, imported, maxSourceLength, options) {
    const inspect = options?.inspect;
    let tapeEvent = null;
    const frontOptions = inspect && typeof inspect.emit === "function"
        ? {...options, inspect: {function: inspect.function, emit(event) { tapeEvent = event; }}} : options;
    // Local arrays: each function's area below the previous one's, from the top of the module's memory.
    let arrayTop = (options?.memoryPages ?? 1) * 65536;
    return compileFunctions(source, functionBase, imported, maxSourceLength, undefined, fn => {
        if (fn.arrayBytes) {
            fn.arrayBase = arrayTop -= fn.arrayBytes;
            if (arrayTop < 0) throw new SyntaxError("local arrays exceed the module's memory");
        }
        const event = tapeEvent;
        tapeEvent = null;
        const marks = event ? [] : undefined;
        const length = encodeFunction(fn, marks);
        if (event) describeWasmFunction(fn, event, marks, length, inspect);
        fn.code = null;
        fn.literals = null;
    }, undefined, frontOptions);
}

// ---- wasm/module.js
// The WebAssembly backend, part two: a module of Typed functions (compile), and the reader and writer of
// module sections that linkWorld uses.
function vec(elements) {
    return [...unsigned(elements.length), ...elements.flat()];
}

function section(id, data) {
    return [id, ...unsigned(data.length), ...data];
}

// A Typed type as a Wasm value type: f32 is F32, every other type an i32.
const valueType = type => type === "f32" ? F32 : I32;

// A record result is several results (WebAssembly's multi-value), one per leaf.
function signature(fn) {
    return [0x60, ...vec(fn.params.map(valueType)), ...vec((fn.results ?? [fn.result]).map(valueType))];
}

// What compile, linkWorld and typedRv32.compile publish of each function.
const publicSignature = ({name, params, result, results}) => ({name, params, result, ...(results && {results})});

// options.maxSourceLength (default 64 KiB) and options.memoryPages (the exported memory's fixed size in 64 KiB pages,
// default 1) serve large programs such as the Candela kernel (PICOCALC-CANDELA-TYPED); the defaults keep every module.
function compile(source, options) {
    const {functions, records, enums, distinct, asyncLayout, asyncSource} =
        compileWasmFunctions(source, 0, [], options?.maxSourceLength, options);
    const pages = options?.memoryPages ?? 1;
    const headers = functions.map(signature);
    const names = functions.map((fn, i) => [
        ...vec(Array.from(fn.name, char => char.charCodeAt(0))), 0, ...unsigned(i),
    ]);
    const bytes = Uint8Array.from([
        0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
        ...section(1, vec(headers)),
        ...section(3, vec(functions.map((_, i) => unsigned(i)))),
        ...section(5, [1, 1, ...unsigned(pages), ...unsigned(pages)]),
        ...section(7, vec([...names, [...vec([109,101,109,111,114,121]), 2, 0]])),
        ...section(10, vec(functions.map(fn => fn.body))),
    ]);
    if (options?.inspect && functions.some(fn => fn[inspectedWasm])) {
        try {
            inspectWasmEmission(bytes, functions, options.inspect);
        } catch (error) {
            if (error instanceof InspectionCallbackError) throw error.cause;
            throw error;
        }
    }
    return {
        bytes,
        records: recordLayouts(records),
        enums: enumLayouts(enums),
        distinct: [...distinct],
        signatures: functions.map(publicSignature),
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

// ---- wasm/inspect.js
// The WebAssembly backend's inspection events: each inspected function's Wasm operations and their byte ranges in
// the final module.
const inspectedWasm = Symbol("Wasm inspection ranges");

function describeWasmFunction(fn, event, marks, length, inspect) {
    const tapeOperations = event.operations;
    const operations = typedTape.decode(fn.body.slice(fn.body.length - length), true);
    let j = 0;
    for (const operation of operations) {
        while (j + 1 < marks.length && marks[j + 1] <= operation.offset) j++;
        operation.source = {...tapeOperations[j].source};
    }
    // Do not let the callback mutate the internal placement information.
    fn[inspectedWasm] = {length, ranges: operations.map(({ordinal, offset, length}) => ({ordinal, offset, length}))};
    emitInspection(inspect, {...event, target: "wasm", operations});
}

function inspectWasmEmission(bytes, functions, inspect) {
    const reader = new WasmReader(bytes);
    reader.take(8);
    while (!reader.end()) {
        const id = reader.byte();
        const size = reader.uint();
        if (id !== 10) {
            reader.take(size);
            continue;
        }
        const sectionEnd = reader.offset + size;
        if (reader.uint() !== functions.length) throw new Error("unexpected Wasm code section count");
        for (const fn of functions) {
            const bodySize = reader.uint();
            const start = reader.offset;
            const end = start + bodySize;
            const inspected = fn[inspectedWasm];
            if (inspected) {
                const instructionsStart = end - inspected.length;
                const ranges = inspected.ranges.map(({ordinal, offset, length}) => {
                    const from = instructionsStart + offset;
                    const to = from + length;
                    return {ordinal, start: from, end: to, bytes: Array.from(bytes.subarray(from, to))};
                });
                emitInspection(inspect, {kind: "emission", target: "wasm", function: fn.name, index: fn.index,
                    start, end, instructionsStart, ranges});
            }
            reader.take(bodySize);
        }
        if (reader.offset !== sectionEnd) throw new Error("unexpected Wasm code section size");
        return;
    }
    throw new Error("missing Wasm code section for Typed inspection");
}

// ---- wasm/link.js
// The WebAssembly backend, part three: a Typed world linked into a trusted Wasm reactor; and what the bundle
// publishes.
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
        compileWasmFunctions(source, base, imported, maxSourceLength, options);
    // The runtime owns a linked world's memory, so there is no static area for local arrays.
    const arrays = functions.find(fn => fn.arrayBytes);
    if (arrays) throw new SyntaxError("local arrays need a module's own memory; a linked Wasm world has none (" + arrays.name + ")");
    for (const entry of entries) {
        const bytesName = Array.from(entry, ch => ch.charCodeAt(0)).join(",");
        const slot = exports.find(item => item.name === bytesName && item.kind === 0)?.index - importCount;
        if (!Number.isInteger(slot) || slot < 0 || slot >= bodies.length)
            throw new SyntaxError("missing Wasm runtime function slot " + entry);
        const target = functions.findIndex(fn => fn.name === entry);
        if (target < 0 || signature(functions[target]).join(",") !== types[definitions[slot]]?.join(","))
            throw new SyntaxError("Wasm runtime slot signature mismatch for " + entry);
        const bridge = [0];
        for (let i = 0; i < functions[target].params.length; i++) bridge.push(LOCAL_GET, ...unsigned(i));
        bridge.push(CALL, ...unsigned(base + target), END);
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
        signatures: functions.map(publicSignature),
        ...(asyncLayout && {asyncLayout}), ...(asyncSource && {asyncSource})};
}

function invoke(exports, signature, args) {
    const i32 = n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;
    if (args.length !== signature.params.length) throw new TypeError("wrong argument count");
    const words = args.map((value, i) => {
        if (signature.params[i] === "bool" && typeof value === "boolean") return Number(value);
        if (signature.params[i] === "i32" && i32(value)) return value;
        if (signature.params[i] === "u32" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return value | 0;
        if (signature.params[i] === "f32" && typeof value === "number") return value;
        throw new TypeError(signature.name + " expects " + signature.params[i] + " at argument " + i);
    });
    const value = exports[signature.name](...words);
    return signature.result === "bool" ? value !== 0 : signature.result === "u32" ? value >>> 0 : value;
}

// What the bundle publishes. typed-async.js uses the front end's pieces; typed-rv32.js uses compileFunctions and the
// layouts.
globalThis.compileTyped = (source, options) => {
    const {bytes, asyncLayout, asyncSource} = compile(source, options);
    if (asyncLayout) bytes.asyncLayout = asyncLayout;
    if (asyncSource) bytes.asyncSource = asyncSource;
    return bytes;
};
globalThis.typedWasm = {compile, linkWorld, invoke, compileFunctions, Lexer, FunctionEmitter,
    parseDeclarations, scanSignatures, checkAcyclic, inferredType: scalarType, recordLayouts, enumLayouts, withLexIndices,
    publicSignature};
})();
