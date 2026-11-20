import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createContext, runInContext} from "node:vm";

const [stage, output] = process.argv.slice(2);
assert(stage && output, "usage: node 07-qualify-build.mjs BUILD_WORKSPACE RECEIPT.json");
const system = resolve(stage, "tree/picocalc-os");
const component = resolve(stage, "build/esp-idf/main");
const get = (base, name) => readFileSync(resolve(base, name));
const hash = value => createHash("sha256").update(value).digest("hex");
const context = createContext({});
for (const name of ["typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js", "mobile-painter.js"]) {
    runInContext(get(system, "compiler/" + name).toString(), context, {filename:name});
}

function jumpDelta(word) {
    assert.equal(word & 0xfff, 0x6f, "entry stub is an unlinked JAL into the native slot");
    return ((word >> 31) << 20) | ((word >>> 21 & 1023) << 1) |
        ((word >>> 20 & 1) << 11) | (word & 0xff000);
}

function qualifySlot(program, reactor, linked, entryNames) {
    const magic = Buffer.from([0x4e,0x45,0x47,0x41,0x56,0x52,0x41,0x44,0x4c,0x53,0x32,0x33]);
    const slot = reactor.indexOf(magic);
    assert(slot >= 0 && reactor.indexOf(magic, slot + 1) < 0);
    const capacity = reactor.readUInt32LE(slot + 12);
    const codeStart = 20 + 4 * (entryNames.length + program.importCount);
    const entries = Object.fromEntries(entryNames.map((name, i) => {
        const stub = 20 + 4 * i;
        const delta = jumpDelta(linked.readUInt32LE(slot + stub));
        assert.equal(stub + delta, codeStart + program.entries[name]);
        assert(program.entries[name] < program.image.length);
        return [name, program.entries[name]];
    }));
    const usable = capacity - codeStart;
    assert(program.image.length <= usable);
    const imported = new Set(program.relocations.map(r => r.offset));
    const actualCode = linked.subarray(slot + codeStart, slot + codeStart + program.image.length);
    for (let i = 0; i < actualCode.length; i += 4) {
        if (imported.has(i)) assert.equal(actualCode.readUInt32LE(i) & 0xfff, 0xef, "relocated call uses ra");
        else assert.deepEqual(actualCode.subarray(i,i+4), Buffer.from(program.image.subarray(i,i+4)));
    }
    return {capacity, usable, codeBytes:program.image.length, headroom:usable-program.image.length,
        entries, imports:program.importCount, relocations:program.relocations.length,
        linkedBytes:linked.length, linkedSHA256:hash(linked), templateSHA256:hash(reactor)};
}

const painterSource = get(system, "worlds/chess/painter-3d.typed");
const chessSource = get(component, "chess.typed");
const embedded = get(component, "chess-painter-source.typed");
assert(painterSource.length > 0 && painterSource.length <= 16384);
assert(chessSource.includes(embedded), "game bundle contains the generated source writer");
const writer = (await WebAssembly.instantiate(context.typedWasm.compile(embedded.toString()).bytes)).instance.exports;
const view = new DataView(writer.memory.buffer);
view.setUint32(0, 16384, true);
const count = writer.chessPainterSource(0);
assert.equal(count, painterSource.length);
const reconstructed = Buffer.alloc(count);
for (let i = 0; i < count; i++) {
    const unit = view.getUint16(4 + 2*i, true);
    assert(unit > 0 && unit < 128);
    reconstructed[i] = unit;
}
assert.deepEqual(reconstructed, painterSource, "game's typed writer reproduces exact authorized bytes");

const painterTemplate = get(component, "mobile-painter-slot.elf");
const painterProgram = context.typedRv32.compile(painterSource.toString(), [], 16384);
const painterLinked = Buffer.from(context.linkMobilePainter(painterSource.toString(), new Uint8Array(painterTemplate)));
const painter = qualifySlot(painterProgram, painterTemplate, painterLinked, ["paintChess"]);
assert.equal(painter.capacity, 32768);

const chessTemplate = get(component, "typed-chess-3d-reactor.elf");
const chessProgram = context.typedRv32.compile(chessSource.toString(), context.typedWorld.imports, 96*1024);
const chessLinked = Buffer.from(context.compileTypedWorldRv32(chessSource.toString(), new Uint8Array(chessTemplate)));
const chess = qualifySlot(chessProgram, chessTemplate, chessLinked, context.typedWorld.entries);
assert.equal(chess.capacity, 262144);

const idfConfig = get(stage, "sdkconfig").toString();
const required = ["CONFIG_SPIRAM=y", "CONFIG_SPIRAM_SPEED=200", "CONFIG_CACHE_L2_CACHE_LINE_SIZE=64",
    "CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ=360"];
for (const option of required) assert(idfConfig.split("\n").includes(option), option);

const info = {
    painterSource: {bytes:painterSource.length, sha256:hash(painterSource), embeddedWriterMatches:true},
    chessSource: {bytes:chessSource.length, sha256:hash(chessSource)},
    painter, chess, idfConfig:required,
    firmwareSHA256: hash(get(stage, "build/picocalc-os-p4.bin")),
    partitionSHA256: hash(get(stage, "build/partition_table/partition-table.bin")),
};
writeFileSync(output, JSON.stringify(info,null,2)+"\n");
console.log(JSON.stringify(info));
