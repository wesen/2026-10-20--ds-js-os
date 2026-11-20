/* Usage: node 04-host.mjs WORK files-reactor.elf [samples] */
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createContext, runInContext} from "node:vm";
import {performance} from "node:perf_hooks";
import {cpus} from "node:os";

const [work, elf, samplesArg = "40"] = process.argv.slice(2);
const clock = () => Math.round(performance.now() * 1000);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = (variant, file) => readFileSync(join(work, variant, file), "utf8");
const source = read("stock", "files.typed");
const reactor = new Uint8Array(readFileSync(elf));
const stock = ["wasm.js", "rv32.js", "files.js"].map(file => [file, read("stock", file)]);
const candidate = ["wasm.js", "rv32.js", "files.js", "incremental.js", "cases.js"]
    .map(file => [file, read("candidate", file)]);

function realm(scripts) {
    const ctx = createContext();
    for (const [file, text] of scripts) runInContext(text, ctx, {filename: file});
    return ctx;
}

const {compileFilesRv32: frozen} = realm(stock);
const lab = realm(candidate);
const {rebuildCases: tests, rebuildFiles: profile, createFunctionRebuild: sessionWith} = lab;
const candidates = [];

function evaluate(kind, marked, block, details = false) {
    const rows = [];
    tests.series(kind, source, reactor, (session, test, parent) => {
        const start = clock();
        const result = session.build(test.source, {parent, exact: test.exact, clock: marked ? clock : undefined, details});
        const elapsed = clock() - start;
        const cleanAt = clock();
        const clean = tests.cleanBuild(frozen, test.source, reactor);
        const cleanUs = clock() - cleanAt;
        tests.check(test, result, clean);
        const {bytes, revision, ...observed} = result;
        const row = {block, kind, marked, id: test.id, elapsed, cleanUs, ...observed};
        if (bytes) Object.assign(row, {sha256: hash(bytes), size: bytes.length});
        if (test.id === "seed" || test.id === "body") {
            if (details) writeFileSync(join(work, kind + "-" + test.id + ".elf"), bytes);
        }
        rows.push(row);
    }, details);
    return rows;
}

const evidence = ["files", "fixture"].flatMap(kind => evaluate(kind, true, -1, true));
for (const [kind, caller, target] of [
    ["files", "filesName", "filesAlnum"], ["fixture", "caller", "base"],
]) {
    const [seed, body] = ["seed", "body"].map(id => evidence.find(row => row.kind === kind && row.id === id));
    const before = seed.jumps.find(call => call.caller === caller && call.target === target);
    const after = body.jumps.find(call => call.caller === caller && call.target === target);
    if (!before || !after || !body.reused.includes(caller) || before.from === after.from || before.word === after.word)
        throw new Error("reused caller did not get a new relative jump");
}

const first = sessionWith(profile, reactor), second = sessionWith(profile, reactor);
const zero = first.build(source);
zero.bytes.fill(0);
const hit = first.build(source);
if (hit.mode !== "exact" || hash(hit.bytes) !== hash(frozen(source, reactor)))
    throw new Error("mutating caller output corrupted exact-source cache");
const foreign = second.build(source, {parent: zero.revision});
if (foreign.mode !== "fallback" || foreign.reason !== "stale revision" || hash(foreign.bytes) !== hash(hit.bytes))
    throw new Error("foreign token was accepted");

const cold = [];
for (let block = 0; block < Number(samplesArg); block++) {
    for (const marked of block % 2 ? [false, true] : [true, false])
        for (const kind of ["files", "fixture"]) candidates.push(...evaluate(kind, marked, block));
    const start = clock();
    const fresh = realm(stock);
    const result = fresh.compileFilesRv32(source, reactor);
    cold.push({block, us: clock() - start, sha256: hash(result)});
}
const manifest = JSON.parse(readFileSync(join(work, "sources.json"), "utf8"));
writeFileSync(join(work, "host.json"), JSON.stringify({
    configuration: {control: manifest.revision, sources: manifest.sha256, reactor: hash(reactor),
        runtime: process.version, cpu: cpus()[0]?.model, platform: process.platform, unit: "us"},
    evidence, guards: {callerMutation: "rejected", foreignRevision: "clean fallback"}, cold, candidates,
}, null, 2) + "\n");
console.log("host oracle:", evidence.length, "cases;", candidates.length, "measured attempts");
