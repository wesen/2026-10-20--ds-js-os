// This script runs in bare vendored QuickJS after all staged compiler modules.
(() => {
"use strict";
const nativeIndex = globalThis.__typedLexIndex;
if (typeof nativeIndex !== "function") throw new Error("run in INDEX mode");

function equal(actual, expected, where) {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error(where + "\nindexed: " + a + "\nreference: " + b);
}

function lane(provider, visit) {
    const previous = globalThis.__typedLexIndex;
    globalThis.__typedLexIndex = provider;
    try {
        return typedWasm.withLexIndices(visit);
    } finally {
        globalThis.__typedLexIndex = previous;
    }
}

function capture(run) {
    try {
        return ["ok", run()];
    } catch (error) {
        return [error.name, error.message];
    }
}

// Keep each token object until the end. The async parser similarly keeps tokens
// and annotates each one with its end offset.
function trace(source, from, to, seek, skip = false) {
    const tokens = [];
    const result = capture(() => {
        const lexer = new typedWasm.Lexer(source, from, to);
        if (seek !== undefined) {
            lexer.offset = seek;
            lexer.next();
        }
        let jumped = null;
        if (skip && lexer.token.value === "{") jumped = lexer.skipBody() ?? null;
        for (let turns = 0; turns < source.length + 4; turns++) {
            const token = lexer.token;
            token.fixtureEnd = lexer.offset;
            tokens.push(token);
            lexer.next();
            if (token.kind === "eof") {
                return [jumped, lexer.token.value, lexer.token.kind, lexer.token.at, lexer.offset];
            }
        }
        throw new Error("lexer did not reach EOF");
    });
    return [tokens, result];
}

const samples = [
    "", "  \r\n\t", "// end", "abc\t// trimmed comment\r\n next",
    "x//z\ny", "\t n!==42; // line\r\nreturn n === 4;",
    "{ a { b } \"{ } 🚀 λ\\n\\u0041\" }\n// eof",
    " { \"//{\\\"\\\\\\u0041\" } // eof",
    "?:", "bad \"unterminated", '"\\u00ZZ" @', 'λ _tok39 198',
    "enum Phase { First, Second } type Point = distinct i32;",
    ':"🙂"\n  false || true && x >>=0;',
    "x // c\u2028still comment\n\u205f!",
    "function g(out:buffer):i32 { return out.writeLiteral(0,\"é λ 🚀 \ud800\"); }",
    ">>> !== === == != > >= >> // braces {}",
];
let bounded = 0, indexedSamples = 0;

for (const source of samples) {
    if (nativeIndex(source) !== null) indexedSamples++;
    const cases = [];
    for (let from = -1; from <= source.length; from++) {
        for (let to = Math.max(0, from); to <= source.length; to++) {
            cases.push([from, to]);
            if (source[from] === "{") cases.push([from, to, undefined, true]);
        }
        cases.push([0, source.length, from]);
    }
    for (let i = 0; i < cases.length; i += 64) {
        const batch = cases.slice(i, i + 64);
        const wanted = lane(undefined, () => batch.map(args => trace(source, ...args)));
        lane(nativeIndex, () => {
            for (let j = 0; j < batch.length; j++)
                equal(trace(source, ...batch[j]), wanted[j], "range " + JSON.stringify([source, batch[j]]));
        });
    }
    bounded += cases.length;
}

let rng = 0xd37f4f1b;
function random(max) {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 0) % max;
}
const fragments = [" x", "18", " {", " }", "=", " >==", " \"", " \"λ🙂\"", " //🙂 \n",
    "!", "||", "<=", ";", "\\u", "\0", "\ufeff", "\u00a0", "\udc00", "\n", "a_0", "\r\v", "/"];
let randomIndexed = 0;
for (let i = 0; i < 1024; i++) {
    let source = "";
    const count = random(10);
    for (let j = 0; j < count; j++) source += fragments[random(fragments.length)];
    if (nativeIndex(source) !== null) randomIndexed++;
    const from = random(source.length + 1), to = from + random(source.length - from + 1);
    const seek = random(source.length + 1);
    for (const args of [[], [from, to], [0, source.length, seek, true]]) {
        const expected = lane(undefined, () => trace(source, ...args));
        equal(lane(nativeIndex, () => trace(source, ...args)), expected, "random " + JSON.stringify([source, args]));
    }
}

function compileTrace(source) {
    const wasm = capture(() => {
        const {bytes, ...meta} = typedWasm.compile(source, {asyncSource: true});
        return [Array.from(bytes), meta];
    });
    const options = {asyncSource: true};
    function rv(streamFunctions) {
        return capture(() => {
            const {image, ...meta} = typedRv32.compile(source, typedWorld.imports, 96 * 1024,
                {...options, streamFunctions});
            return [Array.from(image), meta];
        });
    }
    return [wasm, rv(true), rv(false)];
}

const duplicate = "function a(): i32 { @ return 0; } function a(): i32 { return 0; }";
const malformedString = 'function a(b:buffer): i32 { b.writeLiteral(0, "\\uXYZQ"); return 0; } ' +
    'function a(b:buffer): i32 { return 0; }';
const replacements = [
    duplicate, malformedString,
    "function a(): i32 { return nope; } function a(): i32 { return 0; }",
    "function a(): i32 { return b(); } function b(): i32 { return a(); }",
    "record A { x:i32; x:i32; } function a(a:A):i32{ return a.x; }",
    "enum P { A, B } function a(p:P):i32{ match(p) { A: { return 3; } } return 0; }",
    "type U = distinct i32; function a(x:U):i32 { return x; }",
    "function a(x:i32):bool { return x !== 7; }",
    "function a(x:i32):bool { return x != 7; }",
    'function a(b:buffer):i32 { return b.writeLiteral(0, "🧷"); }',
    "record WorldState { x:i32; } async function a(state:WorldState):i32{ " +
        "const text = typedSdkBuffer(0); await typedSdkYield(); return text.length; } " +
        "function b(state:WorldState):bool{ return start a(state); }",
    "record WorldState { x:i32; } async function a(state:WorldState):i32{ return 1; }\n" +
        "function b(state:WorldState):bool{ return start a(123); }",
    "record WorldState { x:i32; } async function a(state:WorldState):i32{ return 1; }\n" +
        "function b(state:WorldState):bool{ return start a(state); }",
];
const seed = "function f(a:i32):i32 { return a + 1; }";
for (const marker of ["\v", "\r\n", "\u1680", "\u2028", "\u3000", "\ufeff", "\u0085", "\ud800", "@", "// End\n", "//\u2028!\n", "/"]) {
    for (const at of [0, seed.indexOf("a:"), seed.indexOf("return"), seed.indexOf("+"), seed.length])
        replacements.push(seed.slice(0, at) + marker + seed.slice(at));
}
for (const source of replacements) {
    const expected = lane(undefined, () => compileTrace(source));
    equal(lane(nativeIndex, () => compileTrace(source)), expected, "compiler " + source);
}
equal(nativeIndex(duplicate), null, "native malformed body fallback");
if (!/duplicate function a/.test(compileTrace(duplicate)[0][1])) throw new Error("diagnostic order changed");

const scopeSources = [];
function countIndex(source) {
    scopeSources.push(source);
    return nativeIndex(source);
}
const task = "record WorldState { x:i32; } async function a(state:WorldState):i32{ state.x = 7; return 1; }\n" +
    "function b(state:WorldState):bool{ return start a(state); }";
const edited = task.replace("= 7", "= 8");
const start = lane(countIndex, () => typedWasm.compile(task, {asyncSource: true}));
const edit = lane(countIndex, () => typedWasm.compile(edited, {asyncSource: true}));
const again = lane(countIndex, () => typedWasm.compile(task, {asyncSource: true}));
equal(scopeSources, [task, start.asyncSource, edited, edit.asyncSource, task, again.asyncSource], "scoped index reuse");
equal(Array.from(start.bytes), Array.from(again.bytes), "fresh compilation preserves output");
if (start.bytes.every((byte, i) => byte === edit.bytes[i])) throw new Error("editing the source reused the old index");
scopeSources.length = 0;
lane(countIndex, () => {
    capture(() => typedWasm.compile(duplicate));
    typedWasm.compile(task);
});
equal(scopeSources.length, 3, "failed compilation releases scope");

print(JSON.stringify({bounded, indexedSamples, random: 3072, randomIndexed, compilerCases: replacements.length,
    indexLifetime: "original and lowered source are separate; fresh after repeat, edit and error"}));
})();
