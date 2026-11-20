// Supply the incremental researcher's staged compiler directory, then a JSON receipt path.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createContext, runInContext} from "node:vm";

const [stage, output] = process.argv.slice(2);
assert(output, "usage: node 04-fragment-correctness.mjs STAGE RECEIPT");
function compiler(prefix) {
    const realm = createContext({});
    for (const name of ["typed-wasm", "typed-async", "typed-rv32"]) {
        const path = join(stage, prefix + name + ".js");
        runInContext(readFileSync(path, "utf8"), realm, {filename: path});
    }
    return realm;
}
const control = compiler("");
const candidate = compiler("candidate-");
const fragments = new URL("../incremental/02-fragments.js", import.meta.url);
runInContext(readFileSync(fragments, "utf8"), candidate);

const source = [
    "function head(x: i32): i32 { return leaf(x) + 1; }",
    "function spacer(x: i32): i32 { return x; }",
    "function leaf(x: i32): i32 { return x * 2; }",
].join("\n");
const moved = source.replace("return x;", "let t = x * 3; if (t === 0) return x + 1; return t;");
const cases = [
    ["base", source, 0, false],
    ["move unchanged call target", moved, 2, false],
    ["introduce a cycle through an unchanged caller", moved.replace("x * 2", "head(x)"), 2, true],
    ["recover from the rejected cycle", moved, 3, false],
    ["reorder declarations", moved.split("\n").reverse().join("\n"), 0, false],
];
function run(realm, text) {
    try {
        const program = realm.typedRv32.compile(text);
        return {image: createHash("sha256").update(program.image).digest("hex"),
                entries: Object.fromEntries(Object.entries(program.entries)),
                metadata: JSON.stringify({...program, entries: null, image: null})};
    } catch (error) {
        return {diagnostic: error.name + ": " + error.message};
    }
}
let prior, originalTarget;
const results = [];
for (const [name, text, reused, fails] of cases) {
    const session = candidate.fragmentSession(prior);
    candidate.activeFragments = session;
    const actual = run(candidate, text);
    assert.deepEqual(actual, run(control, text));
    assert.equal(Boolean(actual.diagnostic), fails);
    assert.equal(session.stats().reused, reused);
    if (!fails) prior = session.commit();
    if (name === "base") originalTarget = actual.entries.leaf;
    if (name === "move unchanged call target") assert(actual.entries.leaf > originalTarget);
    results.push({name, ...session.stats(), image: actual.image, entries: actual.entries,
                  diagnostic: actual.diagnostic});
}
writeFileSync(output, JSON.stringify(results, null, 2) + "\n");
