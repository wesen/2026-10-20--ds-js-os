// The opening frame of worlds/raytrace/raytrace.typed as a reproducible host workload.
//
// Classic script (Node, trace-REPL goja sessions, QuickJS). Requires typedRv32Interp
// (tools/rv32-interp.js). Defines globalThis.typedRayBench.
//
// Memory layout matches the PICOCALC-SHADOW-CODEGEN and PICOCALC-OPERAND-HOMES profilers,
// so the SHA-256 of the returned bytes can be compared with their recorded digest:
//   0x40            pixel buffer: u32 capacity 25,600, then 25,600 RGB565 cells
//   0x40+4+51200+8  work buffer:  u32 capacity 2,048, cell 0 = stride 160
// Every other byte starts as 0xa5, so stray writes and padding damage change the digest.
(() => {
"use strict";

const PIXELS = 64;
const WORK = PIXELS + 4 + 2 * 25600 + 8;
const SIZE = WORK + 4 + 2 * 2048 + 8;
// Opening pose: sphere at (68, 61), light at (31, 25).
const OPENING = [PIXELS, WORK, 68, 61, 31, 25];

function openingMemory() {
    const bytes = new Uint8Array(SIZE).fill(0xa5);
    const view = new DataView(bytes.buffer);
    view.setUint32(PIXELS, 25600, true);
    view.setUint32(WORK, 2048, true);
    view.setUint16(WORK + 4, 160, true);
    return bytes;
}

// FNV-1a over the guest bytes: a quick identity check where SHA-256 is unavailable.
function fnv1a(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
    return (h >>> 0).toString(16).padStart(8, "0");
}

function openingFrame(program, options = {}) {
    const result = typedRv32Interp.run(program, "typedRayFrame", OPENING, openingMemory(),
        {limit: 40e6, ...options});
    if (result.trap) throw new Error("opening frame trapped at 0x" + result.at.toString(16));
    if (result.result !== 1) throw new Error("typedRayFrame returned " + result.result);
    return result;
}

// One row per function plus whole-frame totals, sorted by executed instructions.
function frameProfile(program, options) {
    const frame = openingFrame(program, options);
    const rows = typedRv32Interp.profile(program, frame.counts).filter(r => r.steps).sort((p, q) => q.steps - p.steps);
    const total = {name: "(frame)", steps: frame.steps};
    for (const key of ["spLoad", "spStore", "load", "store", "branch", "boundsTest", "capacityLoad", "call", "mul", "div"])
        total[key] = rows.reduce((sum, r) => sum + r[key], 0);
    return {imageBytes: program.image.length, steps: frame.steps, digest: fnv1a(frame.bytes), total, rows, bytes: frame.bytes};
}

globalThis.typedRayBench = {openingMemory, openingFrame, frameProfile, fnv1a, OPENING};
})();
