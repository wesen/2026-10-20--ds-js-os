// Optional arm. Reuse the current indexed token for non-retaining parsers only.
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("usage: node 10-reuse-token-overlay.mjs STAGED_INDEX_COMPILER");
function patch(file, edits) {
    const path = join(directory, file);
    let source = readFileSync(path, "utf8");
    for (const [before, after] of edits) {
        const at = source.indexOf(before);
        if (at < 0 || source.indexOf(before, at + before.length) >= 0)
            throw new Error(file + " does not contain a unique overlay anchor: " + before.slice(0, 80));
        source = source.slice(0, at) + after + source.slice(at + before.length);
    }
    writeFileSync(path, source);
}

patch("typed-wasm.js", [
    ["constructor(source, start = 0, end = source.length) {",
        "constructor(source, start = 0, end = source.length, borrowCurrent = false) {"],
    [`            this.index = index;
            this.indexRow = 0;`, `            this.index = index;
            this.borrowCurrent = borrowCurrent;
            if (borrowCurrent) this.token = {value: "", kind: "eof", at: start};
            this.indexRow = 0;`],
    [`        // Async parsing retains these objects and may add an end offset.
        this.token = {value: symbol.value, kind: symbol.kind, at: rows[row]};`, `        if (this.borrowCurrent) {
            this.token.value = symbol.value;
            this.token.kind = symbol.kind;
            this.token.at = rows[row];
        } else {
            // Range readers can retain these tokens across advances.
            this.token = {value: symbol.value, kind: symbol.kind, at: rows[row]};
        }`],
    ["    const lex = new Lexer(source);", "    const lex = new Lexer(source, 0, source.length, true);"],
]);
patch("typed-async.js", [
    ["    const lex = new typedWasm.Lexer(source);",
        "    const lex = new typedWasm.Lexer(source, 0, source.length, true);"],
]);
