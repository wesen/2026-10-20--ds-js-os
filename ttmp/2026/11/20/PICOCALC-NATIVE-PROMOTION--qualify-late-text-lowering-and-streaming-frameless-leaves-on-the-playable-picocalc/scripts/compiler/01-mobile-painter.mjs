// Compare the maintained mobile painter through its actual linker and modeled execution.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";
import {join} from "node:path";

const [baselinePath, fixturePath, reactorPath, output] = process.argv.slice(2);
assert(baselinePath && fixturePath && reactorPath && output, "usage: node 01-mobile-painter.mjs BASELINE FIXTURES REACTOR OUTPUT");
const baseline = "5f77855";
const {runRv32} = await import(new URL("../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs", import.meta.url));
const source = readFileSync("picocalc-os/worlds/chess/painter-3d.typed", "utf8");
const fixture = readFileSync(fixturePath);
const reactor = readFileSync(reactorPath);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const stride = 4 + 180 + 4 + 8192;
assert.equal(fixture.length, 47 * stride);
assert.equal(sha(source), "6ff9dc8a9e3ad3cc9a877c4ed9ebbb6b535941acba7c63e29e87edc4c5337214");
function compiler(dir) {
    const ctx = createContext({});
    for (const name of ["typed-wasm.js", "typed-rv32.js", "mobile-painter.js"]) {
        const path = join(dir,name);
        const code = readFileSync(path);
        runInContext(code.toString(), ctx, {filename:path});
    }
    const native = ctx.typedRv32.compile(source, [], 16384);
    const wasm = ctx.typedWasm.compile(source).bytes;
    const linked = ctx.linkMobilePainter(source, reactor);
    assert.equal(linked.length, reactor.length);
    assert.equal(native.relocations.length, 0);
    assert.throws(() => ctx.linkMobilePainter("function paintChess(a: i32): i32 { return a; }", reactor),
        /expected a closed paintChess/);
    assert.deepEqual(ctx.linkMobilePainter(source, reactor, {streamFunctions:false}), linked);
    return {native, wasm, linked};
}
const stock = compiler(baselinePath);
const promoted = compiler("picocalc-os/compiler");
assert.equal(sha(stock.native.image), "da8e33f9d0cd37fe446ad7a4398c142b92df58da048efd16e974aaf7845f4364",
    "pre-promotion renderer instructions");
assert.equal(sha(promoted.wasm), sha(stock.wasm));

const wasm = new WebAssembly.Instance(new WebAssembly.Module(stock.wasm)).exports;
const cap = 12288, state = 91, out = 256;
const memory = new Uint8Array(wasm.memory.buffer, 0, out + 4 + (cap + 1) * 2);
const view = new DataView(memory.buffer);
const outputWords = new Uint16Array(memory.buffer, out + 4, cap + 1);
view.setUint32(0, state, true);
view.setUint32(out, cap, true);
const rows = [];
for (const index of [0, 7, 10, 12, 19]) {
    for (let i = 0; i < 90; i++) view.setUint16(4 + 2 * i, fixture.readUInt16LE(index * stride + 4 + 2 * i), true);
    for (let phase = 0; phase < 32; phase++) {
        view.setUint16(4 + 2 * 90, phase, true);
        outputWords.fill(0xcafe);
        const input = memory.slice();
        const count = wasm.paintChess(0, out);
        assert(count > 0 && count <= cap);
        assert(outputWords.subarray(count).every(word => word === 0xcafe));
        const row = {index, phase, words:count, memorySHA256:sha(memory)};
        for (const [arm, {native}] of Object.entries({stock, promoted})) {
            const run = runRv32(native, "paintChess", [0, out], [], {}, input, undefined, 3000000);
            assert.equal(run.trap, false);
            assert.equal(run.result, count);
            assert.deepEqual(run.bytes, memory, arm + " position " + index + " phase " + phase);
            row[arm + "Steps"] = run.steps;
        }
        rows.push(row);
    }
}
const arms = Object.fromEntries(Object.entries({stock, promoted}).map(([name, result]) => [name, {
    wasmSHA256:sha(result.wasm), imageSHA256:sha(result.native.image), imageBytes:result.native.image.length,
    linkedSHA256:sha(result.linked), linkedBytes:result.linked.length,
}]));
writeFileSync(output, JSON.stringify({baseline, sourceSHA256:sha(source), fixtureSHA256:sha(fixture),
    reactorSHA256:sha(reactor), arms, frameCount:rows.length, rows}, null, 2) + "\n");
