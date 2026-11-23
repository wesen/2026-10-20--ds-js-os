// The Go machine's f32 fixture (PICOCALC-TYPED-F32): Typed programs, their cases and WebAssembly's results, for
// tools/trace-repl/pkg/traceapi/f32_test.go, which compiles each program with the working tree's compiler in goja,
// runs every case on the Go machine (tools/trace-repl/pkg/tracerv32) under every policy and compares bit for bit.
// The fixture holds only sources and WebAssembly's results, so it changes with the language, not with RV32 output.
//
//   node tests/compiler/typed-f32-fixture.mjs           write tools/trace-repl/pkg/traceapi/testdata/f32-differential.json
//   node tests/compiler/typed-f32-fixture.mjs --check   exit 1 unless the file is what this writes
import {readFileSync, writeFileSync} from "node:fs";
import {HAND, HAND_FUNCTIONS, MATH, MATH_FUNCTIONS, POLICIES, bits, floatInput, generated, generatedInputs, mathInputs, random, realm}
    from "./f32-cases.mjs";

const OUT = new URL("../../tools/trace-repl/pkg/traceapi/testdata/f32-differential.json", import.meta.url);

export async function fixture() {
    const {typedWasm} = realm();
    const programs = [];
    async function add(source, list) {
        const compiled = typedWasm.compile(source);
        const exports = (await WebAssembly.instantiate(compiled.bytes)).instance.exports;
        const cases = [];
        for (const {name, args} of list) {
            const {params, result} = compiled.signatures.find(s => s.name === name);
            const value = exports[name](...args);
            cases.push({name, params, result, args: args.map((a, i) => params[i] === "f32" ? bits(a) : a),
                expect: result === "f32" ? bits(value) : value});
        }
        programs.push({source, cases});
    }
    const {source, functions} = generated(0xf32f32, 120);
    const r = random(91);
    await add(source, functions.flatMap(fn => generatedInputs(r, 4).map(args => ({name: fn.name, args}))));
    const h = random(13);
    await add(HAND, Object.entries(HAND_FUNCTIONS).flatMap(([name, params]) =>
        Array.from({length: 24}, () => ({name, args: params.map(type => type === "f32" ? floatInput(h) : h.below(9))}))));
    const m = random(17);
    await add(MATH, Object.keys(MATH_FUNCTIONS).flatMap(name => mathInputs(m, name, 30).map(args => ({name, args}))));
    return {policies: POLICIES, programs};
}

if (import.meta.url === "file://" + process.argv[1]) {
    const text = JSON.stringify(await fixture()) + "\n";
    if (process.argv.includes("--check")) {
        if (readFileSync(OUT, "utf8") !== text) {
            console.error("tools/trace-repl/pkg/traceapi/testdata/f32-differential.json is stale: node tests/compiler/typed-f32-fixture.mjs");
            process.exit(1);
        }
    } else writeFileSync(OUT, text);
}
