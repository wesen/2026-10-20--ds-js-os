import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

const [output, gcc] = process.argv.slice(2);
assert(output && gcc, "usage: node 01-replay.mjs OUTPUT_DIR RV32_GCC");
const here = dirname(fileURLToPath(import.meta.url));
const day = resolve(here, "../../..");
const root = resolve(day, "../../../..");
const os = join(root, "picocalc-os");
const out = resolve(output);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = path => readFileSync(path, "utf8");
const write = (name, body) => writeFileSync(join(out, name), body);
mkdirSync(out, { recursive: true });
for (const file of ["typed-wasm.js", "typed-rv32.js", "mobile-painter.js"])
    runInThisContext(read(join(os, "compiler", file)), { filename: file });
const source = read(join(os, "worlds/chess/painter.typed"));
const asm = join(os, "port/esp32p4/main");
const reactor = join(out, "slot.elf");
const elf = join(out, "painter.elf");
execFileSync(gcc, ["-march=rv32imafc_zicsr_zifencei", "-mabi=ilp32f", "-Os", "-fPIC",
    "-shared", "-nostartfiles", "-nostdlib", "-e", "app_main", "-ffunction-sections",
    "-fdata-sections", "-Wl,--gc-sections", "-fvisibility=hidden", "-Wl,--strip-all",
    "-Wl,-z,max-page-size=16", "-o", reactor, join(asm, "mobile_painter_slot.c"),
    join(asm, "mobile_painter_slot.S")], { stdio: "inherit" });
const template = readFileSync(reactor);
const program = typedRv32.compile(source);
const linked = linkMobilePainter(source, template);
assert.deepEqual(linkMobilePainter(source, template, {streamFunctions: false}), linked);
assert.throws(() => linkMobilePainter("function paintChess(a: i32,b: i32): i32 {return a+b;}", template),
    /expected a closed paintChess/);
write("linked-painter.elf", linked);
const slot = template.indexOf(Buffer.from("4e454741565241444c533233", "hex"));
assert(slot >= 0, "ELF slot marker");
const linkedProgram = linked.slice(slot + 24, slot + 24 + program.image.length);
assert.deepEqual(linkedProgram, program.image);
write("painter.rv32", linkedProgram);

const replay = join(day, "PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/scripts/07-replay.mjs");
const trace = join(out, "replay");
execFileSync(process.execPath, [replay, trace], { stdio: "inherit" });
const load = name => read(join(trace, name + ".ndjson")).trimEnd().split("\n").map(line => JSON.parse(line));
const screens = load("control");
const states = load("states");
assert.equal(screens.length, states.length);

const rgb565 = hex => {
    const color = { ink: "#1d1c1a", muted: "#787369" }[hex] ?? hex;
    const v = parseInt(color.slice(1), 16);
    return ((v >> 19) & 31) << 11 | ((v >> 10) & 63) << 5 | ((v >> 3) & 31);
};
const units = t => Array.from(t, c => c.charCodeAt(0));
const line = (x, y, font, color, maxWidth, s) => [3, x, y, font, rgb565(color), maxWidth, s.length, ...units(s)];
const center = (n, y) => {
    const font = n.font === "s" ? 0 : 2;
    const cellWidth = font === 0 ? 6 : 8;
    const x = 8 + Math.max(0, Math.floor((304 - n.s.length * cellWidth) / 2));
    return line(x, y, font, n.color ?? "ink", 312 - x, n.s);
};
function commands({tree, hints}) {
    const [status, board, footer] = tree.kids;
    assert.equal(board.w, 228);
    assert.equal(board.h, 228);
    const canvas = board.ops.flatMap(([op, x, y, a, b, color]) =>
        op === "text" ? line(x + 46, y + 28, b === "s" ? 0 : 1, color, 0, a)
            : [op === "fill" ? 1 : 2, x + 46, y + 28, a, b, rgb565(color)]);
    return [...center(status, 6), ...canvas, ...(footer ? center(footer, 262) : []), 4, hints.length, ...units(hints)];
}

const wasm = new WebAssembly.Instance(new WebAssembly.Module(typedWasm.compile(source).bytes)).exports;
const cells = 90;
const capacity = 4096;
const address = 256;
const data = new DataView(wasm.memory.buffer);
const input = new Uint16Array(wasm.memory.buffer, 4, cells);
const result = new Uint16Array(wasm.memory.buffer, address + 4, capacity);
const sentinel = 0xaaaa;
const rowBytes = 4 + 2 * cells + 4 + 2 * capacity;
const fixtures = Buffer.alloc(rowBytes * states.length);
const counts = states.map((state, i) => {
    const abi = [...Array.from(state.b, c => parseInt(c, 16)),
        ...state.m.match(/../g).map(m => parseInt(m, 16)),
        ...state.f.flatMap(n => [n & 65535, n >>> 16])];
    const expected = commands(screens[i]);
    const id = screens[i].id;
    assert.equal(abi.length, cells, id);
    data.setUint32(0, cells, true);
    data.setUint32(address, capacity, true);
    input.set(abi);
    result.fill(sentinel);
    const written = wasm.paintChess(0, address);
    assert.equal(written, expected.length, id);
    assert.deepEqual(Array.from(result.subarray(0, written)), expected, id);
    assert(result.subarray(written).every(value => value === sentinel), id + " output tail");
    assert.deepEqual(Array.from(input), abi, id + " input");
    const row = i * rowBytes;
    fixtures.writeUInt32LE(cells, row);
    abi.forEach((unit, j) => fixtures.writeUInt16LE(unit, row + 4 + 2 * j));
    fixtures.writeUInt32LE(expected.length, row + 4 + 2 * cells);
    expected.forEach((unit, j) => fixtures.writeUInt16LE(unit, row + 8 + 2 * cells + 2 * j));
    return { id, words: written };
});
write("fixtures.bin", fixtures);
write("painter.S", [
    '.section .text.painter,"ax"', ".balign 4", "program:",
    ".incbin " + JSON.stringify(join(out, "painter.rv32")),
    ".global paintChess", ".set paintChess, program + " + program.entries.paintChess,
    '.section .rodata,"a"', ".balign 4", ".global fixtures_start,fixtures_end",
    "fixtures_start:", ".incbin " + JSON.stringify(join(out, "fixtures.bin")), "fixtures_end:", "",
].join("\n"));
const emulator = join(out, "rv32emu");
execFileSync("cc", ["-O2", join(root, "cji/tools/rv32/emu.c"), "-lm", "-o", emulator], { stdio: "inherit" });
execFileSync(gcc, ["-march=rv32im", "-mabi=ilp32", "-O2", "-nostdlib", "-fno-builtin",
    "-msmall-data-limit=0", "-mno-relax", "-Wl,-Ttext=0x10000", "-Wl,-e,_start",
    "-I" + join(os, "nucleus"), join(here, "02-native-driver.c"), join(out, "painter.S"), "-o", elf],
    { stdio: "inherit" });
execFileSync(emulator, [elf], { stdio: "inherit" });
const report = {
    sourceBytes: Buffer.byteLength(source), sourceSha256: hash(source),
    rv32Bytes: program.image.length, rv32Sha256: hash(program.image),
    slotElfBytes: linked.length, slotElfSha256: hash(linked), entryOffset: program.entries.paintChess,
    matchingCommandStreams: counts.length, maxWords: Math.max(...counts.map(c => c.words)), rows: counts,
};
write("receipt.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, rows: undefined }));
