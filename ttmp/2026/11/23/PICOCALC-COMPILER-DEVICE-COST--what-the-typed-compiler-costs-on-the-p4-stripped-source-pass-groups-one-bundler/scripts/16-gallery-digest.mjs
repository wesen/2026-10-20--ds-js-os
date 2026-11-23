// The Candela gallery (apps/typed/candela-gallery, the generated f32 kernel) under every named policy: the SHA-256 of
// the image, of the observed tapes and of the entries, for a base compiler and this tree's (the 84-digest harness
// predates the gallery and the kernel passes rows and coalesce).
//   node 16-gallery-digest.mjs FILE...    FILEs: the compiler's classic scripts in load order; prints one JSON line
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {createContext, runInContext} from "node:vm";

const root = new URL("../../../../../../", import.meta.url);
const dir = new URL("apps/typed/candela-gallery/", root);
const ctx = createContext({performance});
for (const file of process.argv.slice(2)) runInContext(readFileSync(file, "utf8"), ctx, {filename: file});
const source = JSON.parse(readFileSync(new URL("app.json", dir), "utf8")).sources
    .map(name => readFileSync(new URL(name, dir), "utf8")).join("\n");
const result = {};
for (const policy of ["interactive", "balanced", "default", "kernel"]) {
    const tapes = createHash("sha256");
    let observed = 0;
    const program = ctx.typedRv32.compile(source, [], 1 << 22, {policy, observeTape(name, phase, code, nlocals) {
        observed++;
        tapes.update(name + "\0" + phase + "\0" + nlocals + "\0" + Array.from(code).join(",") + "\n");
    }});
    result[policy] = {image: createHash("sha256").update(program.image).digest("hex").slice(0, 16),
        bytes: program.image.length, tapes: tapes.digest("hex").slice(0, 16), observed,
        entries: createHash("sha256").update(JSON.stringify(program.entries)).digest("hex").slice(0, 16)};
}
console.log(JSON.stringify(result));
