import assert from "node:assert/strict";
import {readFileSync, readdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createContext, runInContext} from "node:vm";

const [work, wasmPath, elfPath, preEditor] = process.argv.slice(2);
assert(work && wasmPath && elfPath && preEditor,
    "usage: node 08-check-bounded-dispatch.mjs STAGES WASM_REACTOR ELF_REACTOR PRE_E_EDITOR");
const repo = fileURLToPath(new URL("../../../../../../", import.meta.url));
const day = join(repo, "ttmp", "2026", "11", "19");
const language = readdirSync(day).find(name => name.startsWith("PICOCALC-LANGUAGE-E--"));
const originalOracle = readFileSync(join(day, language, "scripts", "15-check-span-reuse.mjs"), "utf8");
const stage = join(work, "extended-oracle.mjs");
const oracle = originalOracle
    .replace('"indexed-spans", "composed"]', '"indexed-spans", "composed", "parser", "compact", "table-cursor", "indexed-parser", "composed-direct", "composed-portable"]')
    .replace('mode === "composed"', 'mode.startsWith("composed")')
    .replace('const positives = [editor, fixture, simple, commented, long, fixture.replace("state.x + 1", "state.x + 9")];',
        'const positives = [editor, fixture, simple, commented, long, fixture.replace("state.x + 1", "state.x + 9"), readFileSync(process.argv[5], "utf8")];');
assert(oracle.includes('"composed-portable"]') && oracle.includes("readFileSync(process.argv[5]"));
writeFileSync(stage, oracle);
await import(pathToFileURL(stage).href);

function realm(lane) {
    const ctx = createContext();
    for (const mod of ["typed-wasm","typed-async","typed-rv32","typed-world"])
        runInContext(readFileSync(join(work, lane, mod + ".js"), "utf8"), ctx);
    return ctx;
}
const plain = realm("stock");
const compilers = [realm("compact"), realm("table-cursor"), realm("composed-portable")];

function trace(ctx, source, seek, end, borrow) {
    try {
        const lex = new ctx.typedWasm.Lexer(source, 0, end, borrow);
        lex.offset = seek;
        lex.next();
        const tokens = [];
        for (let i = 0; i <= source.length + 2; i++) {
            const {value, kind, at} = lex.token;
            tokens.push([value, kind, at, lex.offset]);
            if (kind === "eof") return tokens;
            lex.next();
        }
        throw Error("no EOF");
    } catch (error) {
        return [error.name, error.message];
    }
}
const small = [
    "", "   ", " // terminal comment", "n // terminal comment\n",
    "x // nested comment }\n x", "1!===x", ">>>>= && || %",
    "a\v\r\tz", "abc è", 'a "😀λ\\u0042" b',
    '"\\u123Z" @', "// comment \r\n return k",
    "identifier.789 if for distinct \u00a0await", "\ufeff\u2004 a \u2028 b",
    "/+*={})[]", "x\u0085y", "0\0a", "\ud800 X", "x  // ĉ λ \u2028 😀 plus",
];
for (const whitespace of ["\n", "\r", "\t", "\v", " ", "\u2028", "\u3000", "\u1680"])
    for (const suffix of ["<=x", "!==i", "0", "/ a", "// a", "=+a", "& b", "λ"])
        small.push("var1" + whitespace + suffix);
let checked = 0;
for (const source of small) {
    for (let start = -1; start <= source.length; start++) {
        for (let end = Math.max(0, start); end <= source.length; end++) {
            const baseline = trace(plain, source, start, end, false);
            for (const compiler of compilers)
                assert.deepEqual(trace(compiler, source, start, end, true), baseline,
                    "lexer range " + JSON.stringify([source, start, end]));
            checked++;
        }
    }
}
const edited = readFileSync(join(work, "stock", "editor.typed"), "utf8");
const input = readFileSync(elfPath);
for (const mode of ["composed-direct", "composed-portable"]) {
    const fallback = realm(mode);
    assert.equal(fallback.__typedLexIndex, undefined);
    assert.deepEqual(Buffer.from(fallback.compileTypedWorldRv32(edited, input)),
        Buffer.from(plain.compileTypedWorldRv32(edited, input)));
}
console.log(JSON.stringify({borrowedLexerCases: checked, asciiVariants: compilers.length, nodeFallbackIdentity: true}));
