// Apply the lexical-index experiment to a staged copy of the typed compiler.
import {readFileSync, writeFileSync} from "node:fs";

const path = process.argv[2];
if (!path || !path.endsWith("/typed-wasm.js")) {
    console.error("usage: node 02-index-overlay.mjs STAGED_COMPILER/typed-wasm.js");
    process.exit(2);
}
let source = readFileSync(path, "utf8");

function replace(before, after) {
    const at = source.indexOf(before);
    if (at < 0 || source.indexOf(before, at + before.length) >= 0)
        throw new Error("compiler overlay anchor is absent or ambiguous: " + before.slice(0, 100));
    source = source.slice(0, at) + after + source.slice(at + before.length);
}

replace("class Lexer {", `// An index belongs to one exact source string in one compilation.
let lexicalScope = null;
const indexKinds = ["", "id", "int", "str", "op"];

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

class Lexer {`);
replace(`        this.end = end;
        this.next();
    }

    next() {`, `        this.end = end;
        const index = indexFor(source);
        if (index) {
            this.index = index;
            this.indexRow = 0;
            this.indexOffset = undefined;
            this.next = this.nextIndexed;
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
        // Async parsing retains these objects and may add an end offset.
        this.token = {value: symbol.value, kind: symbol.kind, at: rows[row]};
        this.offset = this.indexOffset = rows[row + 1];
        this.indexRow = row + 4;
    }

    next() {`);
replace(`    skipBody() {
        BODY_TOKEN.lastIndex = this.offset;`, `    skipBody() {
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
        BODY_TOKEN.lastIndex = this.offset;`);
replace(`    const lowered = globalThis.typedAsync?.rewrite(source, imported);
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
    }`, `    return withLexIndices(() => {
        const lowered = globalThis.typedAsync?.rewrite(source, imported);
        // The rewrite retains original source for diagnostics, not its lexer.
        if (lowered && lowered.source !== source) lexicalScope?.sources.delete(source);
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
    });`);
replace("    parseDeclarations, scanSignatures, checkAcyclic, inferredType: scalarType, recordLayouts, enumLayouts};",
    "    parseDeclarations, scanSignatures, checkAcyclic, inferredType: scalarType, recordLayouts, enumLayouts, withLexIndices};");

writeFileSync(path, source);
