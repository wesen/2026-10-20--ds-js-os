// Build compiler/typed/typed-wasm.js from the front end's modules (frontend/) and the WebAssembly backend's (wasm/).
//   node compiler/typed/frontend/build.mjs          write the bundle
//   node compiler/typed/frontend/build.mjs --check  exit 1 if the committed bundle is stale (make test-generated)
// Every loader reads the bundle, one script per compiler file: the tests, the bench, the trace REPL's module table,
// the tools and the firmware's compiler bundle (typed/wasm.js), whose QuickJS bytecode the P4 caches. The modules
// share one scope, the bundle's IIFE, so they are not ES modules; MODULES gives their order. A module's top-level
// code runs in that order: expressions.js destructures the tape's constants that every later module uses, and
// statements.js extends expressions.js's class.
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const typed = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(typed, "typed-wasm.js");
export const MODULES = [
    "frontend/lexer.js",
    "frontend/declarations.js",
    "frontend/expressions.js",
    "frontend/floats.js",
    "frontend/values.js",
    "frontend/arrays.js",
    "frontend/statements.js",
    "frontend/inspect.js",
    "frontend/compile.js",
    "wasm/encode.js",
    "wasm/module.js",
    "wasm/inspect.js",
    "wasm/link.js",
];

export function bundle() {
    const parts = MODULES.map(name => "// ---- " + name + "\n" + readFileSync(join(typed, name), "utf8"));
    return "// Generated from compiler/typed/frontend/ and compiler/typed/wasm/ by compiler/typed/frontend/build.mjs.\n" +
        "// Edit those files, not this one.\n" +
        "// The Typed front end (lexer, signature pass, parser and type checker writing the tape) and the WebAssembly\n" +
        "// backend (tape serializer, module writer, world linker). Runs in a bare QuickJS realm; publishes typedWasm.\n" +
        "(() => {\n\"use strict\";\n\n" + parts.join("\n") + "})();\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const built = bundle();
    if (process.argv.includes("--check")) {
        if (readFileSync(target, "utf8") !== built) {
            console.error("compiler/typed/typed-wasm.js differs from the build of compiler/typed/frontend/ and wasm/. " +
                "Edit those files, never the bundle, then run node compiler/typed/frontend/build.mjs.");
            process.exit(1);
        }
    } else writeFileSync(target, built);
}
