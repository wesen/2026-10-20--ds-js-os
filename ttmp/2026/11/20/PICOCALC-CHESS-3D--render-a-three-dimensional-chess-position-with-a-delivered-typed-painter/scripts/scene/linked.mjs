// Compile the exact source with the stock linker for the host image comparison.
import {createContext, runInContext} from "node:vm";
import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import assert from "node:assert/strict";

const [tree, source, slot, out] = process.argv.slice(2);
assert(tree && source && slot && out);
const context = createContext({});
for (const file of ["typed-wasm.js", "typed-rv32.js", "mobile-painter.js"]) {
    runInContext(readFileSync(resolve(tree, "picocalc-os/compiler", file), "utf8"), context, {filename:file});
}
writeFileSync(out, context.linkMobilePainter(readFileSync(source, "utf8"), new Uint8Array(readFileSync(slot))));
