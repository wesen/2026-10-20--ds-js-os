// Evaluated by 01-qjs-lex-index after compiler/typed/tape.js, typed-wasm.js and typed-rv32.js, from the repository
// root. For each source: the tokens of the reference lexer and of the native index agree (value, kind, offset), and
// the Wasm module and the RV32 image compiled with the index equal those compiled without it.
(() => {
"use strict";
const nativeIndex = globalThis.__typedLexIndex;
if (typeof nativeIndex !== "function") throw new Error("the native index is not installed");

function lane(provider, visit) {
    const previous = globalThis.__typedLexIndex;
    globalThis.__typedLexIndex = provider;
    try { return typedWasm.withLexIndices(visit); } finally { globalThis.__typedLexIndex = previous; }
}

function tokens(source) {
    const out = [];
    try {
        const lex = new typedWasm.Lexer(source);
        for (; lex.token.kind !== "eof"; lex.next()) out.push(lex.token.kind + ":" + lex.token.value + "@" + lex.token.at);
    } catch (error) {
        out.push(error.name + ": " + error.message);
    }
    return out.join(" ");
}

function outputs(source) {
    let wasm, rv32;
    try { wasm = Array.from(typedWasm.compile(source).bytes).join(","); } catch (error) { wasm = error.message; }
    try { rv32 = Array.from(typedRv32.compile(source, [], 1 << 20, {policy: "kernel"}).image).join(","); }
    catch (error) { rv32 = error.message; }
    return [wasm, rv32];
}

const bitwise = `function pcgH(v: i32): i32 {
    const st = v * 747796405 + 0xac564b05;
    const w = ((st >>> ((st >>> 28) + 4)) ^ st) * 277803737;
    return (w >>> 22) ^ w;
}
function mix(a: i32, b: i32): i32 { return ~a & 0xFF | b << 3 ^ a >> 2 >>> 1 & 0X7f; }
function flags(a: i32): i32 { if ((a & 1) === 1 && a >= 0x10 && a<<2 > 0) { return 1; } return 0; }
`;
const sources = {
    bitwise,
    // Tokens that touch: >>>= is >>> then =, <<< is << then <, &&& is && then &, 0x1fz is one (invalid) literal.
    adjacent: "a>>>=b<<<c&&&d|||e^~f 0x1fz 0x 0X 07x 1x2 ~~a",
    badHex: "function f(): i32 { return 0x1g; }",
    longHex: "function f(): i32 { return 0x123456789; }",
    ray: readFile("apps/typed/raytrace/raytrace.typed"),
    // PICOCALC-TYPED-F32: float literals (a fraction, an exponent, or both) and the tokens around them.
    floats: "1.5 1. .5 1e5 1e+5 1e- 1.5e 1.5e-3x 0x1e5 2E10 1.2.3 07.5 1e5e5 9.99e+38 a.b1.5 x1.5 1..5 3e+ 4E-0",
    floatProgram: "function f(a: f32, b: f32): f32 { return a * 2.5e-3 + -1.0 / (b - 0.5E+1) + Math.sqrt(f32(3)); }",
};
let checked = 0, failures = 0;
for (const [name, source] of Object.entries(sources)) {
    const reference = lane(undefined, () => tokens(source));
    const indexed = lane(nativeIndex, () => tokens(source));
    const used = lane(nativeIndex, () => nativeIndex(source) !== null);
    if (reference !== indexed) { failures++; print("TOKENS DIFFER", name, "\n reference:", reference, "\n indexed:", indexed); }
    const [a, b] = [lane(undefined, () => outputs(source)), lane(nativeIndex, () => outputs(source))];
    if (a[0] !== b[0] || a[1] !== b[1]) { failures++; print("OUTPUT DIFFERS", name); }
    print(name, "index", used ? "used" : "declined", "tokens", reference.split(" ").length,
        "wasm", a[0].length > 200 ? "bytes" : a[0], "rv32", a[1].length > 200 ? "bytes" : a[1]);
    checked++;
}
print(failures ? failures + " FAILURES" : "AGREE " + checked + " of " + checked);
if (failures) throw new Error("the native index disagrees with the reference lexer");
})();
