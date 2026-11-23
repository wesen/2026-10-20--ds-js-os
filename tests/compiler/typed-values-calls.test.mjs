// Value types in Typed (PICOCALC-TYPED-VALUES), part two: more than eight parameters per register class, value
// records and record results, compiled to WebAssembly (run in Node) and to RV32 under every policy (run on the
// reference interpreter) against JavaScript models; the language rules; the shape of the RV32 code.
import assert from "node:assert/strict";
import test from "node:test";
import {words} from "./rv32-helpers.mjs";
import {differential, random, typedRv32} from "./values-helpers.mjs";

// ---- more than eight parameters per register class: ilp32f's stack words ----

// ints(a0..a11): twelve i32 (eight in a0-a7, four on the stack); floats(f0..f17, k): eighteen f32 and an i32 (eight in
// fa0-fa7, eight in a0-a7, three on the stack); mixed: twenty of each class interleaved. Wrappers with few arguments
// call them (the interpreter passes register arguments only), also with calls among the arguments, from small and
// large frames, and into a callee with a large frame.
const range = n => Array.from({length: n}, (_, i) => i);
const intTerms = n => range(n).map(i => (i % 2 ? " - " : " + ") + "a" + i + " * " + (i + 1)).join("").slice(3);
const floatTerms = n => range(n).map(i => "f" + i + " * " + (i + 0.5).toFixed(1)).join(" + ");
const STACK_PARAMS = `function ints(${range(12).map(i => "a" + i + ": i32").join(", ")}): i32 {
    return ${intTerms(12)};
}
function floats(${range(18).map(i => "f" + i + ": f32").join(", ")}, k: i32): f32 {
    return ${floatTerms(18)} + f32(k);
}
function mixed(${range(20).map(i => "a" + i + ": i32, f" + i + ": f32").join(", ")}): f32 {
    return ${range(20).map(i => "f32(a" + i + ") * f" + i).join(" + ")};
}
function callInts(x: i32): i32 {
    return ints(${range(12).map(i => "x + " + i).join(", ")});
}
function nestInts(x: i32): i32 {
    return ints(ints(${range(12).map(i => "x * " + i).join(", ")}), ${range(10).map(i => "x - " + i).join(", ")}, callInts(x + 1));
}
function callFloats(x: f32, k: i32): f32 {
    return floats(${range(18).map(i => "x + " + i + ".0").join(", ")}, k);
}
function callMixed(x: i32, y: f32): f32 {
    return mixed(${range(20).map(i => "x + " + i + ", y * " + (i + 1) + ".0").join(", ")});
}
function bigCaller(x: i32): i32 {
${range(480).map(i => "    const v" + i + " = x + " + i + ";").join("\n")}
    return ints(${range(12).map(i => "v" + (i * 40)).join(", ")}) + v479;
}
function bigCallee(${range(12).map(i => "a" + i + ": i32").join(", ")}): i32 {
${range(480).map(i => "    const v" + i + " = a" + (i % 12) + " + " + i + ";").join("\n")}
    return v0 - v11 + v479 + a11;
}
function callBig(x: i32): i32 {
    return bigCallee(${range(12).map(i => "x * " + (i + 1)).join(", ")});
}
`;

const intsModel = a => a.reduce((s, v, i) => (i % 2 ? s - Math.imul(v, i + 1) : s + Math.imul(v, i + 1)) | 0, 0);
const floatsModel = (f, k) => Math.fround(f.reduce((s, v, i) => i ? Math.fround(s + Math.fround(v * (i + 0.5))) : Math.fround(v * 0.5), 0) + k);
const mixedModel = (a, f) => a.reduce((s, v, i) => {
    const term = Math.fround(Math.fround(v) * f[i]);
    return i ? Math.fround(s + term) : term;
}, 0);

test("more than eight parameters per class pass on the stack (ilp32f), from small and large frames", async () => {
    const check = await differential(STACK_PARAMS, {
        callInts: {params: ["i32"], result: "i32"}, nestInts: {params: ["i32"], result: "i32"},
        callFloats: {params: ["f32", "i32"], result: "f32"}, callMixed: {params: ["i32", "f32"], result: "f32"},
        bigCaller: {params: ["i32"], result: "i32"}, callBig: {params: ["i32"], result: "i32"},
    });
    const r = random(0x51ac);
    for (let k = 0; k < 25; k++) {
        const x = r.below(2001) - 1000, y = Math.fround((r.below(2001) - 1000) / 64);
        const callInts = v => intsModel(range(12).map(i => v + i));
        check("callInts", [x], callInts(x));
        check("nestInts", [x], intsModel([intsModel(range(12).map(i => Math.imul(x, i))), ...range(10).map(i => x - i), callInts(x + 1)]));
        check("callFloats", [y, x], floatsModel(range(18).map(i => Math.fround(y + i)), x));
        check("callMixed", [x, y], mixedModel(range(20).map(i => x + i), range(20).map(i => Math.fround(y * (i + 1)))));
        check("bigCaller", [x], (intsModel(range(12).map(i => x + i * 40)) + x + 479) | 0);
        const a = range(12).map(i => Math.imul(x, i + 1));
        check("callBig", [x], (a[0] - (a[11] + 11) + (a[479 % 12] + 479) + a[11]) | 0);
    }
    // Where the parameters arrive (ilp32f): floats' f8..f15 in a0-a7, f16, f17 and k in the stack words 0-2.
    const program = typedRv32.compile(STACK_PARAMS, [], 1 << 20, {policy: "stock"});
    assert.deepEqual(program.signatures.find(s => s.name === "floats").params.length, 19);
    const sw = w => (w & 0x707f) === 0x2023 || (w & 0x707f) === 0x2027, rs1 = w => (w >>> 15) & 31, offset = w => ((w >> 25) << 5) | ((w >>> 7) & 31);
    // callFloats stores three words at sp + 0, 4, 8 before its call (fsw, fsw, sw).
    const stores = words(program, "callFloats").filter(w => sw(w) && rs1(w) === 2).map(offset);
    for (const o of [0, 4, 8]) assert(stores.includes(o), "sw to " + o + "(sp): " + stores);
});
