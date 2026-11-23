// Loads the Typed compiler into globalThis (typedTape, typedWasm, typedAsync, typedRv32, typedWorld, typedPieLoops), as the
// firmware bundles it, for the bench scripts.
//
// TYPED_RV32_OPTIONS, a JSON object such as {"policy": "kernel"}, becomes the default options of every
// typedRv32.compile call, including the calls typed-world.js makes while linking a world; keys a caller passes
// override it. This one parameter replaces the patched typed-rv32.js copies that earlier ticket scripts loaded
// to change the compiler's default.
import {pathToFileURL} from "node:url";
import {repoPath} from "./repo.mjs";

const defaults = process.env.TYPED_RV32_OPTIONS ? JSON.parse(process.env.TYPED_RV32_OPTIONS) : null;
if (defaults) {
    if (typeof defaults !== "object" || Array.isArray(defaults)) throw new Error("TYPED_RV32_OPTIONS must be a JSON object");
    let current;
    // typed-rv32.js publishes globalThis.typedRv32 = {compile, ...}; wrap compile at that moment, so that every
    // later reader, including code that captured typedRv32 while loading, sees the defaults.
    Object.defineProperty(globalThis, "typedRv32", {
        configurable: true, enumerable: true,
        get: () => current,
        set(value) {
            const compile = value.compile;
            current = {...value, compile: (source, imports, memoryBytes, options) =>
                compile(source, imports, memoryBytes, options === undefined ? defaults : {...defaults, ...options})};
        },
    });
}
for (const file of ["tape.js", "typed-wasm.js", "typed-async.js", "typed-rv32.js", "typed-rv32-inline.js", "typed-rv32-loops.js", "typed-world.js", "typed-pie-loops.js"])
    await import(pathToFileURL(repoPath("compiler/typed", file)).href);
