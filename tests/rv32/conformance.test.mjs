// The RV32 conformance suite on the reference interpreter (bench/host/rv32-interp.js): every vector of
// bench/reference/rv32/vectors.jsonl, integer and RV32F, with the expectations captured on the ESP32-P4.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {repoPath} from "../../bench/lib/repo.mjs";
import {load, check, PC, IMAGE_BYTES, WINDOW, WINDOW_BYTES, MEMORY_BYTES} from "../../bench/rv32/vectors.mjs";

vm.runInThisContext(readFileSync(repoPath("bench/host/rv32-interp.js"), "utf8"));
const interp = globalThis.typedRv32Interp;
const EBREAK = 0x00100073;

// One vector: the word at PC in an image of ebreaks, so the next instruction traps where control went.
export function execute(v) {
    const image = new Uint8Array(IMAGE_BYTES);
    const view = new DataView(image.buffer);
    for (let at = 0; at < IMAGE_BYTES; at += 4) view.setUint32(at, EBREAK, true);
    view.setUint32(PC, v.word, true);
    const memory = new Uint8Array(MEMORY_BYTES);
    if (v.mem) memory.set(v.mem, WINDOW);
    const registers = new Int32Array(32), fregisters = new Uint32Array(32);
    for (const [r, value] of Object.entries(v.x)) registers[r] = value;
    for (const [r, value] of Object.entries(v.f)) fregisters[r] = value;
    try {
        const r = interp.run({image, entries: {v: PC}, relocations: []}, "v", [], memory,
            {stackBytes: 0, limit: 2, counts: false, checks: false, registers, fregisters, fcsr: v.fcsr});
        if (!r.trap) return {fault: "returned to the host"};
        return {x: r.registers, f: r.fregisters, fcsr: r.fcsr, mem: r.bytes.subarray(WINDOW, WINDOW + WINDOW_BYTES), next: r.at};
    } catch (e) {
        if (e instanceof interp.Rv32Fault) return {fault: e.message};
        throw e;
    }
}

test("the reference interpreter passes every conformance vector", () => {
    const vectors = load();
    const failures = [];
    const classes = {};
    for (const v of vectors) {
        const problems = check(v, execute(v));
        classes[v.class] = (classes[v.class] ?? 0) + 1;
        if (problems.length) failures.push(`${v.id}: ${problems.join("; ")}`);
    }
    assert.ok(vectors.length > 10000, `only ${vectors.length} vectors`);
    assert.deepEqual(failures.slice(0, 20), [], `${failures.length} of ${vectors.length} vectors fail`);
});
