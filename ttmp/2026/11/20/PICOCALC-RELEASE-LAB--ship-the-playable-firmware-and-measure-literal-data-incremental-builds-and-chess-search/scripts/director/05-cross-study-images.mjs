// Does literal pooling change the executable used by the running search benchmark?
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createContext, runInContext} from "node:vm";
import {stage} from "../literal/01-stage.mjs";
const [gamePath, enginePath, output] = process.argv.slice(2);
assert(process.argv.length === 5 && output.endsWith(".json"), "usage: node 05-cross-study-images.mjs QUALIFIED_CHESS_SOURCE BENCH_ENGINE_BIN RECEIPT");
const read = path => readFileSync(path, "utf8");
const hash = data => createHash("sha256").update(data).digest("hex");
function compiler(candidate) {
    const realm = createContext({});
    const changed = candidate ? stage() : {};
    for (const file of ["typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-world.js"]) {
        runInContext(changed[file] ?? read(join("picocalc-os/compiler", file)), realm, {filename:file});
    }
    return realm;
}
const stock = compiler(false), trial = compiler(true);
const dir = "picocalc-os/worlds/chess";
const units = ["state", "position", "moves", "search"].map(name => read(join(dir, name + ".typed")));
const cases = [["engine", units.join("\n")], ["painter", read(join(dir, "painter-3d.typed"))], ["game", read(gamePath)]];
const result = {};
for (const [name, text] of cases) {
    const build = (realm, options) => realm.typedRv32.compile(text, name === "game" ? realm.typedWorld.imports : [], 96 * 1024, options);
    const baseline = build(stock);
    const baselineSHA256 = hash(baseline.image);
    const off = build(trial, {literalPool:false});
    assert.equal(hash(off.image), baselineSHA256);
    const record = {sourceSHA256:hash(text), before:baseline.image.length, baselineSHA256, arms:{}};
    for (const [arm, options] of [
        ["separate", {literalDedupe:false}],
        ["deduplicated", {}],
        ["guardedWord", {literalWordCopy:true}],
    ]) {
        const metrics = {};
        const pooled = build(trial, {literalPool:true, ...options, literalMetrics:metrics});
        const pooledSHA256 = hash(pooled.image);
        record.arms[arm] = {pooledSHA256, ...metrics};
        if (name === "game" && arm === "deduplicated") {
            const entries = Object.entries(pooled.entries).sort((a, b) => a[1] - b[1]);
            const unitNames = read(join(dir, "source.list")).trim().split("\n").concat("mobile-view.typed");
            const owners = new Map([["chessPainterSource", "generated writer"]]);
            for (const file of unitNames) {
                const unit = read(join(dir, file));
                for (const [,fn] of unit.matchAll(/^function (\w+)\s*\(/gm)) {
                    const name = file === "view.typed" && fn === "chessRender" ? "chessRenderTree" : fn;
                    assert(!owners.has(name));
                    owners.set(name, file);
                }
            }
            const bytes = {};
            for (const [i, [fn, at]] of entries.entries()) {
                const end = entries[i+1]?.[1] ?? metrics.codeBytes;
                const group = owners.get(fn);
                assert(group);
                bytes[group] = (bytes[group] ?? 0) + end - at;
            }
            assert.equal(Object.values(bytes).reduce((a,b) => a+b), metrics.codeBytes);
            record.arms[arm].instructionBytesBySource = bytes;
            const painter = read(join(dir, "painter-3d.typed"));
            assert.equal(Buffer.byteLength(painter), painter.length);
            const marker = "// Generated extrusion tables follow.";
            const at = painter.indexOf(marker);
            assert(at > 0);
            record.arms[arm].embeddedSourceBytesUTF16 = painter.length * 2;
            record.arms[arm].generatedGeometryTableTextBytesUTF16 = (painter.length - at) * 2;
        }
        if (name === "engine") {
            assert.equal(baselineSHA256, hash(readFileSync(enginePath)));
            assert.equal(baselineSHA256, pooledSHA256);
            assert.equal(metrics.dataBytes, 0);
        }
    }
    if (name === "game") assert.equal(baselineSHA256, "156f8cd6d77c4fa5107e20dc975219de3eb966003271e6cf740dc5ba9b7f4822");
    result[name] = record;
}
writeFileSync(output, JSON.stringify(result,null,2) + "\n");
