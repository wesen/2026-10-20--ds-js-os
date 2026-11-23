// The front end's lexer: the token regexp, the reserved words, and the lexical index a host may provide (the P4's C
// scanner) so that the lexer reads precomputed token rows instead of running the regexp.
const TOKEN = /\s*(?:\/\/[^\n]*(?:\n|$)\s*)*((?:[a-zA-Z_]\w*)|(?:0[xX]\w*)|(?:\d+\.\d+(?:[eE][+-]?\d+)?)|(?:\d+[eE][+-]?\d+)|(?:\d+)|(?:"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")|(?:!==|===|<=|>=|>>>|>>|<<|\|\||&&|[{}():;,.=\-+*/%!<>&|^~]))/y;
// The signature pass only needs delimiters. The body parser checks token syntax.
const BODY_TOKEN = /[{}]|\/\/[^\n]*|"(?:[^"\\\n]|\\[^\n])*"/g;
const RESERVED = new Set(["function", "if", "const", "return", "bool", "i32", "f32",
    "true", "false", "Math", "let", "while", "string", "record", "buffer",
    "else", "for", "break", "enum", "match", "type", "distinct",
    "async", "await"]);

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

    type(records, enums, distinct) {
        const { value } = this.token;
        if (value !== "i32" && value !== "f32" && value !== "bool" && value !== "string" && value !== "buffer" &&
            !records.has(value) && !enums?.has(value) && !distinct?.has(value))
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
