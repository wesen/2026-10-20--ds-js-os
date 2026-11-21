// Run from the repository root with Node. See reference/04-host-qualification-diary.md.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createContext, runInContext} from "node:vm";
import {checkEdgeCases} from "./edge-cases.mjs";

const [releaseName, outputName] = process.argv.slice(2);
assert(releaseName && outputName, "usage: node qualify.mjs RELEASE_APP.bin RESULT.json");
const baseline = "5f77855";
const root = process.cwd();
const day = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const wave = join(day, "PICOCALC-NATIVE-WAVE--six-parallel-experiments-in-handheld-compiler-construction");
const fixture = join(wave, "scripts/director/heldout");
const model = join(day, "PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs");
const {runRv32} = await import(pathToFileURL(model));
const json = path => JSON.parse(readFileSync(path, "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const lock = json(join(wave, "various/director/heldout-lock.json"));
for (const [file, digest] of Object.entries(lock.files))
    assert.equal(sha(readFileSync(join(fixture, file))), digest, file);
const release = readFileSync(releaseName);
const releaseInputs = json(join(wave, "various/04-deps/release-inputs.json"));
assert.equal(sha(release), releaseInputs.applicationSHA256, "ordinary release identity");

const paths = ["compiler/typed-wasm.js", "compiler/typed-async.js", "compiler/typed-rv32.js",
    "compiler/typed-world.js", "worlds/files/compile.js", "worlds/agenda/compile.js"];
function compiler(revision) {
    const ctx = createContext({});
    const hashes = {};
    for (const path of paths) {
        const file = "picocalc-os/" + path;
        const source = revision ? execFileSync("git", ["show", revision + ":" + file]) : readFileSync(file);
        runInContext(source.toString(), ctx, {filename:file});
        hashes[path] = sha(source);
    }
    return {ctx, hashes};
}
const stock = compiler(baseline), candidate = compiler();
const report = {baseline, releaseSHA256:sha(release), candidateSources:candidate.hashes};
const modes = [["default", undefined], ["buffered", {streamFunctions:false}]];
const pinned = json(join(wave, "various/director/composition.json")).find(x => x.name === "late-leaf");
const source = readFileSync(join(fixture, "burst.typed"), "utf8");
const stockWasm = stock.ctx.typedWasm.compile(source).bytes;
const targetWasm = candidate.ctx.typedWasm.compile(source).bytes;
assert.equal(sha(targetWasm), sha(stockWasm));
report.heldOut = {wasmSHA256:sha(targetWasm), modes:{}};

// Keep the committed input generator and all original expected-value checks. Supply only
// its compiled programs, input directory, output file and the fuller RV32 instruction model.
const oracle = readFileSync(join(fixture, "01-burst-oracle.mjs"), "utf8");
function replaceOnce(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, () => after);
}
const scratch = mkdtempSync(join(tmpdir(), "native-promotion-oracle-"));
try {
    for (const [mode, opts] of modes) {
        const image = candidate.ctx.typedRv32.compile(source, [], undefined, opts);
        assert.equal(sha(image.image), pinned.rv32SHA256, mode + " combined image");
        const output = join(scratch, mode + ".json");
        let script = replaceOnce(oracle, "const dir = dirname(fileURLToPath(import.meta.url));",
            "const dir = " + JSON.stringify(fixture) + ";");
        script = replaceOnce(script, "const [output] = process.argv.slice(2);", "const output = " + JSON.stringify(output) + ";");
        script = replaceOnce(script, "output && process.argv.length === 3", "output");
        script = replaceOnce(script, "const wasm = typedWasm.compile(source);", "const wasm = globalThis.promotionWasm;");
        script = replaceOnce(script, "const native = typedRv32.compile(source);", "const native = globalThis.promotionRv32;");
        script = replaceOnce(script, 'pathToFileURL(resolve(day,branch,"scripts/07-rv32.mjs"))', JSON.stringify(pathToFileURL(model).href));
        globalThis.promotionWasm = {bytes:targetWasm};
        globalThis.promotionRv32 = image;
        const file = join(scratch, mode + ".mjs");
        writeFileSync(file, script);
        await import(pathToFileURL(file));
        const observed = json(output);
        for (const key of Object.keys(observed)) assert.deepEqual(observed[key], pinned[key], mode + " " + key);
        report.heldOut.modes[mode] = observed;
    }
} finally {
    delete globalThis.promotionWasm;
    delete globalThis.promotionRv32;
    rmSync(scratch, {recursive:true, force:true});
}
report.edges = checkEdgeCases(stock.ctx, candidate.ctx, runRv32);

// These three sources and two native reactors were found byte-for-byte in the same
// verified firmware using the corresponding maintained Typed sources and build products.
const extra = {
    "files.typed":[381044,2830,"df59c45a5852408b4753f1cc23046c8f5c1762892e48a23b55c1b46746b4de26"],
    "reminder.typed":[344232,6784,"3a87219d048c63151bdd9e15109d9f09c72b2c5e64bfa7405665c8a2e30d6460"],
    "entry.typed":[333484,10747,"ff7ee79b7cab4300544bf8bc544819eba316ba336f5e7b7222357291f91269a6"],
    "files.elf":[356616,24424,"4c3a4594c7e637a4eae80872de71852cb2c92e74eb29804ce29c1b8e89606c93"],
    "agenda.elf":[267116,66364,"545301177878640b555e47c34e3b0941fb0e4f22299ccf5a365841afaa47331a"],
};
function asset(name) {
    const archived = releaseInputs.files[name];
    const [start, size, hash] = archived ? [archived.releaseOffset, archived.bytes, archived.sha256] : extra[name];
    const data = release.subarray(start, start + size);
    assert.equal(sha(data), hash, name);
    return data;
}
const historical = json(join(wave, "various/director/composed-release-worlds.json"));
report.worlds = {};
for (const [app, wasmEntry, wasmReactor] of [
    ["editor", "compileTypedWorld", "typed-world"], ["chess", "compileTypedWorld", "typed-world"],
    ["agenda", "compileAgenda", "agenda"], ["files", "compileFiles", "files"],
]) {
    const nativeEntry = wasmEntry + "Rv32", nativeReactor = asset(app + ".elf");
    const text = app === "agenda" ? asset("reminder.typed").toString() + "\n" + asset("entry.typed").toString() :
        asset(app + ".typed").toString();
    const wasm = readFileSync(join(root,"picocalc-os/build",wasmReactor+"-reactor.wasm"));
    const oldWasm = stock.ctx[wasmEntry](text,wasm), newWasm = candidate.ctx[wasmEntry](text,wasm);
    assert.equal(sha(newWasm),sha(oldWasm),app+" linked Wasm");
    assert(WebAssembly.validate(newWasm), app+" valid Wasm");
    const oldElf = stock.ctx[nativeEntry](text,nativeReactor);
    const row = report.worlds[app] = {sourceSHA256:sha(text), reactorSHA256:sha(nativeReactor), stockELF:sha(oldElf),
        wasmReactorSHA256:sha(wasm), wasmBytes:newWasm.length, wasmSHA256:sha(newWasm), modes:{}};
    for (const [mode, opts] of modes) {
        const elf = candidate.ctx[nativeEntry](text,nativeReactor,opts);
        assert.equal(elf.length,nativeReactor.length);
        const isWorld = wasmEntry === "compileTypedWorld";
        const program = candidate.ctx.typedRv32.compile(text, isWorld ? candidate.ctx.typedWorld.imports : [],
            isWorld ? 96*1024 : undefined, opts);
        row.modes[mode] = {elfBytes:elf.length, elfSHA256:sha(elf), imageBytes:program.image.length,
            imageSHA256:sha(program.image), functions:Object.keys(program.entries).length, relocations:program.relocations.length};
        if (historical[app]) {
            const expected = historical[app].arms["late-leaf"];
            assert.equal(row.modes[mode].elfSHA256,expected.linkedELFSHA256,app+" "+mode+" linked ELF");
            assert.equal(row.modes[mode].imageSHA256,expected.imageSHA256,app+" "+mode+" image");
            assert.equal(sha(oldElf),historical[app].arms["early-stock"].linkedELFSHA256);
        }
    }
    assert.deepEqual(row.modes.default,row.modes.buffered,app+" streamed/buffered");
}
writeFileSync(outputName, JSON.stringify(report, null, 2) + "\n");
