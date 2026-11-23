// Digest every compile unit under every policy, for a before/after refactor comparison.
//
//   node 03-digests.mjs OUT.json FILE...          FILEs: the compiler's scripts in load order
//   node 03-digests.mjs --compare A.json B.json   exit 1 unless both hold the same digests
//
// For each unit of units.mjs and each arm (the five named policies, kernel with PIE loops, default with
// buffered functions) it records the SHA-256 of the image and of the sequence of (function, phase, tape)
// triples that observeTape sees, and the entry offsets.
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {realm, units} from "./units.mjs";

const args = process.argv.slice(2);
if (args[0] === "--compare") {
    const [a, b] = args.slice(1).map(path => JSON.parse(readFileSync(path, "utf8")));
    let differ = 0, count = 0;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        count++;
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
            differ++;
            console.log("DIFFERS", key, JSON.stringify(a[key]), JSON.stringify(b[key]));
        }
    }
    console.log(differ ? differ + " of " + count + " differ" : "IDENTICAL " + count + " of " + count);
    process.exit(differ ? 1 : 0);
}
const [out, ...files] = args;
const ctx = realm(files);
const arms = {
    stock: {policy: "stock"}, interactive: {policy: "interactive"}, balanced: {policy: "balanced"},
    default: {policy: "default"}, kernel: {policy: "kernel"}, kernelPie: {policy: "kernel", pieLoops: "pie"},
    defaultBuffered: {policy: "default", streamFunctions: false},
};
const result = {};
for (const [unit, [source, imports]] of Object.entries(units(ctx.typedWorld.imports))) {
    for (const [arm, options] of Object.entries(arms)) {
        const tapes = createHash("sha256");
        let observed = 0;
        const program = ctx.typedRv32.compile(source, imports, 1 << 20, {...options,
            observeTape(name, phase, code, nlocals) {
                observed++;
                tapes.update(name + "\0" + phase + "\0" + nlocals + "\0" + Array.from(code).join(",") + "\n");
            }});
        result[unit + "/" + arm] = {
            image: createHash("sha256").update(program.image).digest("hex"),
            bytes: program.image.length, tapes: tapes.digest("hex"), observed,
            entries: createHash("sha256").update(JSON.stringify(program.entries)).digest("hex").slice(0, 16),
        };
    }
    process.stderr.write(unit + " ");
}
writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
console.error("\n" + Object.keys(result).length + " digests -> " + out);
