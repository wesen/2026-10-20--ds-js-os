// The RV32 conformance vectors (PICOCALC-RV32-CONFORMANCE): one instruction, its inputs, and what it must do.
//
//   node bench/rv32/vectors.mjs                  write bench/reference/rv32/vectors.jsonl
//   node bench/rv32/vectors.mjs --check          fail unless vectors.jsonl is what this script writes now
//   node bench/rv32/vectors.mjs --board DIR      write DIR/vectors.h and DIR/stubs.S for the P4 capture app
//
// Every vector executes one 32-bit instruction word at `pc` with the given registers, fcsr and memory window.
// Registers not named are zero. The expectation names the registers the instruction may change (the others must
// keep their values), fcsr, the memory window after the instruction, and the next pc, or `fault` for an encoding
// every executor must reject.
//
// Expectations come from two places. RV32F vectors (and every vector marked "board") take theirs from the ESP32-P4:
// bench/reference/rv32/p4-captured.jsonl, written by bench/board/rv32-capture.py. The integer vectors the board
// does not run (control flow, auipc, x0 and aliasing) take theirs from the small RV32I model in generate.mjs; for the integer
// vectors the board does run, this script requires the model and the board to agree. Without a capture for an F
// vector the script fails: the board, not a host, decides floating-point semantics.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {repoPath} from "../lib/repo.mjs";
import {generate, inputDigest, hex, PC, WINDOW, WINDOW_BYTES} from "./generate.mjs";

export {PC, IMAGE_BYTES, WINDOW, WINDOW_BYTES, MEMORY_BYTES, SENTINEL, hex} from "./generate.mjs";
export const VECTORS = repoPath("bench/reference/rv32/vectors.jsonl");
export const CAPTURE = repoPath("bench/reference/rv32/p4-captured.jsonl");
const u32 = n => n >>> 0;
const RD = 10, RS1 = 11, RS2 = 12, RS3 = 13;

// ---- the capture: expectations from the board ----

// Capture rows (after a header object): [id, word, input digest, x10, f10, fcsr, window?], hexadecimal.
function readCapture() {
    if (!existsSync(CAPTURE)) return new Map();
    const rows = readFileSync(CAPTURE, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
    return new Map(rows.filter(Array.isArray).map(r => [r[0], r]));
}

function fromBoard(c, [id, word, digest, x10, f10, fcsr, mem]) {
    if (num(word) !== c.word || digest !== inputDigest(c)) throw new Error(`capture of ${id} was made from other inputs; capture again`);
    return {x: {[RD]: num(x10)}, f: {[RD]: num(f10)}, fcsr: num(fcsr), mem};
}

const h = n => "0x" + u32(n).toString(16);
const regs = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, h(v)]));
const changed = (after, before) => Object.fromEntries(Object.entries(after).filter(([k, v]) => v !== (before[k] ?? 0)));

// The vectors with their expectations, as written to vectors.jsonl (numbers in minimal hexadecimal).
export function build() {
    const capture = readCapture();
    const problems = [];
    const lines = [];
    for (const c of generate()) {
        const board = c.board && capture.has(c.id) ? fromBoard(c, capture.get(c.id)) : null;
        let expect;
        if (c.expect) expect = c.expect;
        else if (c.model) {
            const m = c.model;
            expect = {};
            if (m.x && Object.keys(m.x).length) expect.x = regs(m.x);
            if (m.mem) expect.mem = bytesHex(m.mem);
            if (m.next !== undefined) expect.next = h(m.next);
            if (board) { // the board ran it too: the model must agree
                const x = changed(board.x, c.x);
                const same = JSON.stringify(regs(x)) === JSON.stringify(expect.x ?? {}) && board.fcsr === 0 &&
                    (board.mem ?? "") === (expect.mem ?? "");
                if (!same) problems.push(`${c.id}: board ${JSON.stringify(board)} model ${JSON.stringify(expect)}`);
            }
        } else if (board) {
            // An F vector: the registers the board changed, fcsr, the window.
            const x = changed(board.x, c.x), f = changed(board.f, c.f);
            expect = {...(Object.keys(x).length ? {x: regs(x)} : {}), ...(Object.keys(f).length ? {f: regs(f)} : {}),
                fcsr: h(board.fcsr), ...(board.mem ? {mem: board.mem} : {})};
        }
        if (!expect) { problems.push(`${c.id}: no capture`); continue; }
        lines.push(JSON.stringify(serial(c, expect)));
    }
    return {lines, problems};
}

const bytesHex = b => Array.from(b, v => v.toString(16).padStart(2, "0")).join("");

function serial(c, expect) {
    const v = {id: c.id, class: c.class, word: h(c.word)};
    if (Object.keys(c.x).length) v.x = regs(c.x);
    if (Object.keys(c.f).length) v.f = regs(c.f);
    if (c.fcsr) v.fcsr = h(c.fcsr);
    if (c.mem) v.mem = bytesHex(c.mem);
    if (c.board) v.board = true;
    v.expect = expect;
    return v;
}

// ---- the capture app's sources ----
// vectors.h: one row per board vector; stubs.S: one stub per distinct word (see bench/board/rv32-vectors).
export function boardSources(dir) {
    const cases = generate().filter(c => c.board);
    const words = [...new Set(cases.map(c => c.word))];
    const index = new Map(words.map((w, i) => [w, i]));
    const stubs = [".section .text.rv32vec,\"ax\",@progbits", ".option norvc"];
    words.forEach((w, i) => stubs.push(
        `.balign 4`, `.global rv32vec_stub_${i}`, `rv32vec_stub_${i}:`,
        `  mv t1, a0`, `  lw a1, 4(t1)`, `  lw a2, 8(t1)`, `  flw fa0, 12(t1)`, `  flw fa1, 16(t1)`, `  flw fa2, 20(t1)`,
        `  flw fa3, 24(t1)`, `  lw t0, 28(t1)`, `  fscsr t0`, `  lw a0, 0(t1)`, `  .word ${hex(w)}`, `  frcsr t0`,
        `  sw t0, 40(t1)`, `  sw a0, 32(t1)`, `  fsw fa0, 36(t1)`, `  ret`));
    const windows = cases.filter(c => c.mem);
    const windowIndex = new Map(windows.map((c, i) => [c.id, i]));
    const h = ["// Generated by bench/rv32/vectors.mjs --board; do not edit.", "#include <stdint.h>",
        `#define RV32VEC_COUNT ${cases.length}`, `#define RV32VEC_STUBS ${words.length}`, `#define RV32VEC_WINDOW ${hex(WINDOW)}u`,
        `#define RV32VEC_WINDOW_BYTES ${WINDOW_BYTES}`, `#define RV32VEC_DIGEST "${digestOf(cases)}"`,
        ...words.map((_, i) => `extern void rv32vec_stub_${i}(uint32_t *io);`),
        "static void (*const rv32vec_stubs[RV32VEC_STUBS])(uint32_t *) = {",
        ...words.map((_, i) => `  rv32vec_stub_${i},`), "};",
        "typedef struct { uint16_t stub, window; uint32_t x10, x11, x12, f10, f11, f12, f13, fcsr; } rv32vec;",
        "static const rv32vec rv32vec_cases[RV32VEC_COUNT] = {",
        ...cases.map(c => `  {${index.get(c.word)}, ${c.mem ? windowIndex.get(c.id) : 0xffff}, ${[RD, RS1, RS2].map(r => hex(c.x[r] ?? 0) + "u").join(", ")}, ` +
            `${[RD, RS1, RS2, RS3].map(r => hex(c.f[r] ?? 0) + "u").join(", ")}, ${hex(c.fcsr)}u},`),
        "};",
        `static const uint8_t rv32vec_windows[${Math.max(windows.length, 1)}][RV32VEC_WINDOW_BYTES] = {`,
        ...windows.map(c => "  {" + c.mem.map(b => "0x" + b.toString(16).padStart(2, "0")).join(",") + "},"), "};"];
    mkdirSync(dir, {recursive: true});
    writeFileSync(dir + "/vectors.h", h.join("\n") + "\n");
    writeFileSync(dir + "/stubs.S", stubs.join("\n") + "\n");
    writeFileSync(dir + "/cases.json", JSON.stringify(cases.map(c => ({id: c.id, word: hex(c.word), in: inputDigest(c), mem: !!c.mem}))) + "\n");
    return {cases: cases.length, stubs: words.length, digest: digestOf(cases)};
}

const digestOf = cases => createHash("sha256").update(cases.map(c => c.id + " " + inputDigest(c)).join("\n")).digest("hex").slice(0, 16);

// ---- reading the vectors ----
const num = v => parseInt(v, 16) >>> 0;
// Parsed vectors: registers as numbers, memory as a Uint8Array, expectations likewise.
export function load(path = VECTORS) {
    return readFileSync(path, "utf8").split("\n").filter(Boolean).map(line => {
        const v = JSON.parse(line);
        const regsOf = o => Object.fromEntries(Object.entries(o ?? {}).map(([k, x]) => [Number(k), num(x)]));
        const bytesOf = s => s === undefined ? undefined : Uint8Array.from(s.match(/../g), b => parseInt(b, 16));
        const e = v.expect;
        return {id: v.id, class: v.class, word: num(v.word), x: regsOf(v.x), f: regsOf(v.f), fcsr: v.fcsr ? num(v.fcsr) : 0,
            mem: bytesOf(v.mem), board: !!v.board,
            expect: e.fault ? {fault: e.fault} : {x: regsOf(e.x), f: regsOf(e.f), fcsr: e.fcsr === undefined ? 0 : num(e.fcsr),
                mem: bytesOf(e.mem), next: e.next === undefined ? PC + 4 : num(e.next)}};
    });
}

// Compare one executor's outcome with a vector. got: {fault} | {x: Int32Array|Uint32Array(32), f: Uint32Array(32), fcsr,
// mem: Uint8Array (the window), next}. Returns the differences as strings.
export function check(v, got) {
    const problems = [];
    if (v.expect.fault) {
        if (!got.fault) problems.push(`expected an illegal-instruction fault, got next ${hex(got.next)}`);
        return problems;
    }
    if (got.fault) return [`unexpected fault: ${got.fault}`];
    for (let r = 0; r < 32; r++) {
        const want = r === 0 ? 0 : v.expect.x[r] ?? v.x[r] ?? 0;
        if (u32(got.x[r]) !== want) problems.push(`x${r} ${hex(got.x[r])} != ${hex(want)}`);
        if (got.f) {
            const fwant = v.expect.f[r] ?? v.f[r] ?? 0;
            if (u32(got.f[r]) !== fwant) problems.push(`f${r} ${hex(got.f[r])} != ${hex(fwant)}`);
        }
    }
    if (got.f && u32(got.fcsr) !== v.expect.fcsr) problems.push(`fcsr ${hex(got.fcsr)} != ${hex(v.expect.fcsr)}`);
    const memWant = v.expect.mem ?? v.mem;
    if (memWant && bytesHex(got.mem) !== bytesHex(memWant)) problems.push(`memory ${bytesHex(got.mem)} != ${bytesHex(memWant)}`);
    if (u32(got.next) !== v.expect.next) problems.push(`next pc ${hex(got.next)} != ${hex(v.expect.next)}`);
    return problems;
}

export const isFloat = v => v.class.startsWith("f-");

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    if (args[0] === "--board") {
        const r = boardSources(args[1]);
        console.log(`${args[1]}: ${r.cases} board vectors, ${r.stubs} stubs, digest ${r.digest}`);
    } else {
        const {lines, problems} = build();
        if (problems.length) {
            console.error(problems.slice(0, 40).join("\n"));
            console.error(`${problems.length} vectors have no expectation or disagree with the model`);
            process.exit(1);
        }
        const text = lines.join("\n") + "\n";
        if (args[0] === "--check") {
            const now = existsSync(VECTORS) ? readFileSync(VECTORS, "utf8") : "";
            if (now !== text) { console.error(`${VECTORS} is stale: run node bench/rv32/vectors.mjs`); process.exit(1); }
            console.log(`vectors.jsonl: ${lines.length} vectors, up to date`);
        } else {
            mkdirSync(repoPath("bench/reference/rv32"), {recursive: true});
            writeFileSync(VECTORS, text);
            console.log(`${VECTORS}: ${lines.length} vectors`);
        }
    }
}
