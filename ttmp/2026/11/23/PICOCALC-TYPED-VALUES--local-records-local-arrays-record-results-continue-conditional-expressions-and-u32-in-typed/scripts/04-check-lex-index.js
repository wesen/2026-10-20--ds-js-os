// Copied from PICOCALC-TYPED-BITWISE's 02-check-lex-index.js, with PICOCALC-TYPED-VALUES' syntax added (?:, continue,
// u32, value records, local arrays).
// Evaluated by 03-qjs-lex-index after compiler/typed/tape.js, typed-wasm.js and typed-rv32.js, from the repository
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
const values = `function pick(a: i32, b: u32, c: f32): i32 {
    let s = 0;
    for (let i = 0; i < a; i = i + 1) {
        if (i % 3 === 0) { continue; }
        s = s + (i > 2 ? i : -i) + i32(b / 3000000000 % 7 >>> 1);
    }
    while (s > 100) { s = s - 7; if (s === 50) { continue; } }
    return c > 1.0 ? s : a<3?1:b>7?2:3;
}
`;
const records = `value record Vec3 { x: f32; y: f32; z: f32; }
value record Ray { o: Vec3; d: Vec3; k: i32; }
methods Vec3 { dot = dot; }
function dot(a: Vec3, b: Vec3): f32 { return a.x * b.x + a.y * b.y + a.z * b.z; }
function at(r: Ray, t: f32): Vec3 { return Vec3(r.o.x + r.d.x * t, r.o.y + r.d.y * t, r.o.z + r.d.z * t); }
function use(value: i32, t: f32): f32 {
    let v = Vec3(1.0, 2.0, f32(value));
    v.y = v.y + 1.0;
    const r = Ray(v, Vec3(0.0, 0.0, 1.0), value);
    const p = value > 0 ? at(r, t) : r.d;
    return p.dot(v) + at(r, 2.0).z;
}
`;
const arrays = `function stacked(n: i32, x: f32): f32 {
    const stack = new Int32Array(48);
    const ring = new Float32Array(8);
    const bits = new Uint32Array(0x10);
    let sp = 0;
    stack[sp] = n; sp = sp + 1;
    while (sp > 0) { sp = sp - 1; const v = stack[sp]; if (v > 1 && sp < 46) { stack[sp] = v / 2; sp = sp + 1; } ring[v & 7] = x; }
    bits[n & 15] = 4000000000;
    return ring[0] + ring[stack.length - 41] + f32(bits[n & 15] / 3);
}
`;
const sources = {
    bitwise,
    values,
    records,
    arrays,
    arraysAdjacent: "a[i]=b[j[k]]+c[0x1f];d[ -1 ]a]][[ new Int32Array(3)",
    valuesAdjacent: "a?b:c?d:e ?? ?. a? .5 x?y:z continue;continued u32(x)?1:2",
    // Tokens that touch: >>>= is >>> then =, <<< is << then <, &&& is && then &, 0x1fz is one (invalid) literal.
    adjacent: "a>>>=b<<<c&&&d|||e^~f 0x1fz 0x 0X 07x 1x2 ~~a",
    badHex: "function f(): i32 { return 0x1g; }",
    longHex: "function f(): i32 { return 0x123456789; }",
    ray: readFile("apps/typed/raytrace/raytrace.typed"),
};
let checked = 0, failures = 0;
for (const [name, source] of Object.entries(sources)) {
    const reference = lane(undefined, () => tokens(source));
    const indexed = lane(nativeIndex, () => tokens(source));
    const used = lane(nativeIndex, () => nativeIndex(source) !== null);
    // An index that declines a source (a character it does not know) leaves the lexer to the regexp: correct, but
    // the device then pays the regexp. Every source here is made of tokens the index must know.
    if (!used) { failures++; print("INDEX DECLINED", name); }
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
