// Run from the repository root. Check the reconstructed source against the physical release receipt.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runInThisContext} from "node:vm";

const [receiptPath, outputPath] = process.argv.slice(2);
assert(outputPath, "usage: node 03-shipped-code-census.mjs RELEASE_SLOT_RECEIPT OUTPUT_JSON");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
const base = "picocalc-os";
const chess = join(base, "worlds/chess");
const read = (dir, path) => readFileSync(join(dir, path), "utf8");
for (const name of ["typed-wasm", "typed-async", "typed-rv32", "typed-world"]) {
    runInThisContext(read(base, "compiler/" + name + ".js"), {filename: name});
}
const sources = new Map();
for (const name of read(chess, "source.list").trim().split("\n")) {
    let source = read(chess, name);
    if (name === "view.typed") source = source.replace("function chessRender(", "function chessRenderTree(");
    sources.set(name, source);
}
const temp = mkdtempSync(join(tmpdir(), "chess-census-"));
try {
    const embedded = join(temp, "embedded.typed");
    execFileSync("python3", [join(base, "tools/embed-chess-painter.py"), join(chess, "painter-3d.typed"), embedded]);
    sources.set("generated writer", "\n" + readFileSync(embedded, "utf8"));
} finally {
    rmSync(temp, {recursive: true});
}
sources.set("mobile-view.typed", read(chess, "mobile-view.typed"));
const source = [...sources.values()].map(part => part + "\n").join("");
const sha256 = data => createHash("sha256").update(data).digest("hex");
const sourceDigest = sha256(source);
assert.equal(sourceDigest, receipt.chessSource.sha256);
const options = [true, false].map(streamFunctions =>
    typedRv32.compile(source, typedWorld.imports, 96 * 1024, {streamFunctions}));
const [streaming, buffered] = options;
assert.deepEqual(streaming, buffered);
assert.equal(streaming.image.length, receipt.chess.codeBytes);
const owner = new Map();
const groups = [];
for (const [name, unit] of sources) {
    const group = {source: name, functions: 0, codeBytes: 0};
    groups.push(group);
    for (const match of unit.matchAll(/^function (\w+)\s*\(/gm)) {
        assert(!owner.has(match[1]));
        owner.set(match[1], group);
    }
}
const entries = Object.entries(streaming.entries).sort((a,b) => a[1] - b[1]);
assert.equal(entries.length, owner.size);
for (const [i, [name, start]] of entries.entries()) {
    const end = i+1 < entries.length ? entries[i+1][1] : streaming.image.length;
    owner.get(name).codeBytes += end - start;
    owner.get(name).functions++;
}
assert.equal(groups.reduce((total,group) => total + group.codeBytes, 0), streaming.image.length);
const result = {sourceDigest, codeDigest: sha256(streaming.image), streamingEqualsBuffered: true,
                totalCodeBytes: streaming.image.length, groups};
writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
