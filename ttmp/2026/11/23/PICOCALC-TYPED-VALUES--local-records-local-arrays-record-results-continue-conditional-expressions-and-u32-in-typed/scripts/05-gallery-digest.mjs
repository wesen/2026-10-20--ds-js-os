// The Typed Candela gallery (apps/typed/candela-gallery, PICOCALC-CANDELA-TYPED), the largest Typed program and not one
// of the 84 digests' units: the image digest of each policy, for a base compiler and the working tree's.
//
//   node 05-gallery-digest.mjs BASE_DIR    BASE_DIR/compiler/typed holds the base compiler (git archive)
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {realm, root} from "./units.mjs";

const app = JSON.parse(readFileSync(new URL("apps/typed/candela-gallery/app.json", root), "utf8"));
const source = app.sources.map(path => readFileSync(new URL("apps/typed/candela-gallery/" + path, root), "utf8")).join("\n");
const files = dir => ["tape", "typed-wasm", "typed-async", "typed-rv32", "typed-rv32-inline", "typed-rv32-loops"]
    .map(name => dir + "/compiler/typed/" + name + ".js");
const base = process.argv[2];
const tree = new URL(".", root).pathname.replace(/\/$/, "");
let differ = 0;
for (const policy of ["interactive", "default", "kernel"]) {
    const digests = [base, tree].map(dir => {
        const ctx = realm(files(dir));
        const options = {policy, ...(app.options ?? {})};
        const program = ctx.typedRv32.compile(source, [], 1 << 20, options);
        return createHash("sha256").update(program.image).digest("hex").slice(0, 16) + " " + program.image.length + " B";
    });
    if (digests[0] !== digests[1]) differ++;
    console.log(policy, digests[0], digests[0] === digests[1] ? "IDENTICAL" : "DIFFERS " + digests[1]);
}
process.exit(differ ? 1 : 0);
