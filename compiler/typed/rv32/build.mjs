// Bundle the RV32 backend's ES modules (this directory) into plain scripts for QuickJS, goja and node:vm, with the
// shared bundler (compiler/typed/bundle.mjs: scope hoisting, the module forms it understands, the command line).
//   node compiler/typed/rv32/build.mjs          write the bundles
//   node compiler/typed/rv32/build.mjs --check  exit 1 if a committed bundle is stale
//
// BUNDLES lists each bundle's entry module; the first is the core. The core publishes the names a pass-group bundle
// imports from it (globalThis.typedRv32Modules), so a group loads only after typed-rv32.js. The modules are also
// plain ES modules for Node (package.json: "type": "module"), given globalThis.typedTape and typedWasm;
// tests/compiler/typed-rv32.test.mjs runs them unbundled.
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {hoisted, main, script} from "../bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const BUNDLES = [
    {file: "typed-rv32.js", entry: "index.js",
        what: "The RV32 backend's core: encoding, the emitters, the planner, the pass registry, policies, compile, linkSlot."},
    {file: "typed-rv32-inline.js", entry: "passes/inline-group.js",
        what: "The RV32 passes of the \"inline\" group: inline, commute, rotate. Load after typed-rv32.js."},
    {file: "typed-rv32-loops.js", entry: "passes/loops-group.js",
        what: "The RV32 passes of the \"loops\" group: version, hoist, induction, split. Load after typed-rv32.js."},
    {file: "typed-rv32-kernel.js", entry: "passes/kernel-group.js",
        what: "The RV32 passes of the \"kernel\" group: conjunctions, sets, ranges, facts. Load after typed-rv32.js."},
];

export function bundles() {
    const built = hoisted(here, BUNDLES, {label: path => "rv32/" + path, registry: "typedRv32Modules"});
    return Object.fromEntries(BUNDLES.map(({file, what}, i) => [file, script({
        header: ["Generated from compiler/typed/rv32/ by compiler/typed/rv32/build.mjs. Edit those files, not this one.",
            what, "This code executes in the host tools and can execute in a bare QuickJS realm."],
        ...built[i]})]));
}

main(import.meta, Object.fromEntries(Object.entries(bundles()).map(([file, text]) => [join(here, "..", file), text])),
    "compiler/typed/rv32/");
