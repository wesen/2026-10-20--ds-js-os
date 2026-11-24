// Build compiler/typed/typed-wasm.js from the front end's modules (frontend/) and the WebAssembly backend's (wasm/),
// with the shared bundler (compiler/typed/bundle.mjs).
//   node compiler/typed/frontend/build.mjs          write the bundle
//   node compiler/typed/frontend/build.mjs --check  exit 1 if the committed bundle is stale (make test-generated)
// Every loader reads the bundle, one script per compiler file: the tests, the bench, the trace REPL's module table,
// the tools and the firmware's compiler bundle (typed/wasm.js), whose QuickJS bytecode the P4 caches. The modules
// share one scope, the bundle's IIFE, so they are not ES modules; MODULES gives their order. A module's top-level
// code runs in that order: expressions.js destructures the tape's constants that every later module uses, and
// statements.js extends expressions.js's class.
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {concatenated, main, script} from "../bundle.mjs";

const typed = join(dirname(fileURLToPath(import.meta.url)), "..");
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
    return script({
        header: ["Generated from compiler/typed/frontend/ and compiler/typed/wasm/ by compiler/typed/frontend/build.mjs.",
            "Edit those files, not this one.",
            "The Typed front end (lexer, signature pass, parser and type checker writing the tape) and the WebAssembly",
            "backend (tape serializer, module writer, world linker). Runs in a bare QuickJS realm; publishes typedWasm."],
        modules: concatenated(typed, MODULES)});
}

main(import.meta, {[join(typed, "typed-wasm.js")]: bundle()}, "compiler/typed/frontend/ and compiler/typed/wasm/");
