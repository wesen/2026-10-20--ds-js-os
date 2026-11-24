// Build compiler/typed/typed-async.js from the async lowering's modules (async/), with the shared bundler
// (compiler/typed/bundle.mjs).
//   node compiler/typed/async/build.mjs          write the bundle
//   node compiler/typed/async/build.mjs --check  exit 1 if the committed bundle is stale (make test-generated)
// Every loader reads the bundle, one script: the tests, the bench, the trace REPL's module table and the firmware's
// compiler bundle (typed/async.js, which only worlds with async functions load; apps/typed/editor/app.json). The
// modules share one scope, the bundle's IIFE, so they are not ES modules; MODULES gives their order. body.js's
// AsyncBody extends its Cursor and TypeChecker extends the front end's FunctionEmitter (typed-wasm.js, loaded first).
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {concatenated, main, script} from "../bundle.mjs";

const typed = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MODULES = ["scan.js", "body.js", "liveness.js", "allocate.js", "text.js", "lower.js", "tasks.js", "rewrite.js"];

export function bundle() {
    return script({
        header: ["Generated from compiler/typed/async/ by compiler/typed/async/build.mjs. Edit those files, not this one.",
            "Lower typed async functions before emission. The reactor owns each frame in WorldState, so only its scalar",
            "fields survive an event boundary. Runs in a bare QuickJS realm after typed-wasm.js; publishes typedAsync."],
        modules: concatenated(typed, MODULES.map(name => "async/" + name))});
}

main(import.meta, {[join(typed, "typed-async.js")]: bundle()}, "compiler/typed/async/");
