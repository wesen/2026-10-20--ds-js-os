import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import "./04-typed-wasm.js";

const {compile, invoke} = globalThis.typedWasm;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = name => readFileSync(new URL(name, import.meta.url), "utf8");

const typedSource = read("scroll.typed");
const compositorSource = read("../../../../../../../picocalc-os/js/system/compositor.js");
const scrollSource = compositorSource.match(/^function scrollStart\([^]*?\n}/m)[0];
assert.equal(typedSource.trimEnd().replace(/: i32/g, ""), scrollSource);
const jsScroll = vm.runInNewContext("(" + scrollSource + ")");

function instantiate(source) {
    const { bytes, signatures } = compile(source);
    assert.deepEqual(bytes, globalThis.compileTyped(source));
    assert(WebAssembly.validate(bytes));
    const module = new WebAssembly.Module(bytes);
    assert.deepEqual(WebAssembly.Module.imports(module), []);
    const { exports } = new WebAssembly.Instance(module);
    return {
        bytes,
        call(name, ...args) {
            const signature = signatures.find(fn => fn.name === name);
            return invoke(exports, signature, args);
        },
    };
}

const scroll = instantiate(typedSource);
let differentialCount = 0;
for (let count = 0; count <= 140; count++) {
    for (let visible = 1; visible <= 64; visible++) {
        for (let sel = -1; sel <= count + 2; sel++) {
            assert.equal(scroll.call("scrollStart", sel, count, visible), jsScroll(sel, count, visible));
            differentialCount++;
        }
    }
}
for (const args of [[2147483647, 2147483647, 1], [2147483646, 2147483647, 2],
                    [2147483647, 2147483647, 1073741824], [-2147483648, 4, 1]]) {
    assert.equal(scroll.call("scrollStart", ...args), jsScroll(...args));
    differentialCount++;
}

const probes = instantiate([
    "function add(a: i32, b: i32): i32 { return a + b; }",
    "function multiply(a: i32, b: i32): i32 { return a * b; }",
    "function div(a: i32, b: i32): i32 { return a / b; }",
    "function truth(flag: bool): bool { return !!flag; }",
    "function guard(flag: bool, n: i32): bool { return flag && n / 0 < 2; }",
    "function orGuard(flag: bool, n: i32): bool { return flag || n / 0 < 2; }",
    "function ordering(a: i32, b: i32): bool { return a === b || a > b; }",
    "function local(x: i32): i32 { const delta: i32 = 2; return x + delta; }",
    "function minLiteral(): i32 { return -2147483648; }",
].join("\n"));

const examples = [];
function example(label, expected, jsValue, calculate) {
    const typedValue = calculate();
    assert.equal(typedValue, expected);
    examples.push({ label, js: String(jsValue), typed: String(typedValue) });
}
function trap(label, jsValue, calculate) {
    assert.throws(calculate, WebAssembly.RuntimeError);
    examples.push({ label, js: String(jsValue), typed: "trap" });
}
example("i32 addition wraps", -2147483648, 2147483647 + 1,
        () => probes.call("add", 2147483647, 1));
example("i32 multiplication wraps", -2, 2147483647 * 2,
        () => probes.call("multiply", 2147483647, 2));
example("i32 division truncates toward zero", -3, -7 / 2,
        () => probes.call("div", -7, 2));
trap("i32 division by zero", 7 / 0, () => probes.call("div", 7, 0));
trap("i32 division overflow", -2147483648 / -1, () => probes.call("div", -2147483648, -1));
example("&& short circuit", false, false && 7 / 0 < 2, () => probes.call("guard", false, 7));
trap("&& evaluates right when true", true && 7 / 0 < 2, () => probes.call("guard", true, 7));
example("|| short circuit", true, true || 7 / 0 < 2, () => probes.call("orGuard", true, 7));
trap("|| evaluates right when false", false || 7 / 0 < 2, () => probes.call("orGuard", false, 7));
example("scroll outside the UI domain can wrap", 0, jsScroll(3, 10, -2147483648),
        () => scroll.call("scrollStart", 3, 10, -2147483648));

assert.equal(probes.call("truth", false), false);
assert.equal(probes.call("truth", true), true);
assert.equal(probes.call("ordering", 2, 2), true);
assert.equal(probes.call("ordering", 2, 3), false);
assert.equal(probes.call("local", 9), 11);
assert.equal(probes.call("minLiteral"), -2147483648);
assert.throws(() => probes.call("truth", 1), TypeError);
assert.throws(() => scroll.call("scrollStart", "5", 10, 3), TypeError);
assert.throws(() => scroll.call("scrollStart", 5.5, 10, 3), TypeError);
assert.throws(() => scroll.call("scrollStart", 5, 2147483648, 3), TypeError);
assert.throws(() => scroll.call("scrollStart", 5, 10), TypeError);
examples.push({ label: "UI boundary rejects a numeric string",
    js: String(jsScroll("5", 10, 3)), typed: "host bridge rejects" });
examples.push({ label: "bool argument is explicit", js: String(!!1), typed: "host bridge rejects" });

const rejections = [
    ["mixed integer and bool addition", "function f(a: i32, b: bool): i32 { return a + b; }",
        /expected i32, got bool/],
    ["no i32 truthiness", "function f(a: i32): i32 { if (a) return 1; return 0; }",
        /expected bool, got i32/],
    ["wrong return type", "function f(): bool { return 1; }", /expected bool, got i32/],
    ["out-of-range literal", "function f(): i32 { return 2147483648; }", /literal out of range/],
    ["no float number type", "function f(): i32 { return 1.5; }", /expected ;/],
    ["locals need a prior declaration", "function f(): i32 { return counter; }", /unknown local counter/],
    ["logic checks even an unreachable arm", "function f(): bool { return false && 1; }",
        /expected bool, got i32/],
].map(([label, source, diagnostic]) => {
    let message;
    assert.throws(() => compile(source), error => {
        message = error.message;
        return error instanceof SyntaxError && diagnostic.test(message);
    });
    return { label, source, message };
});

console.log(JSON.stringify({
    node: process.version,
    engine: "Node/V8 WebAssembly.Module, import-free typed functions",
    compiler_sha256: hash(read("04-typed-wasm.js")),
    scroll: {
        original_function_sha256: hash(scrollSource),
        typed_source_sha256: hash(typedSource),
        wasm_bytes: scroll.bytes.length,
        wasm_sha256: hash(scroll.bytes),
        wasm_hex: Buffer.from(scroll.bytes).toString("hex"),
        differential_count: differentialCount,
        bounded_inputs: "count 0..140, visible 1..64, sel -1..count+2, plus four i32 edge cases",
    },
    boundary_probe_wasm_bytes: probes.bytes.length,
    examples,
    rejections,
}, null, 2));
