// Build compiler/typed/typed-async.js from the async lowering's modules (async/).
//   node compiler/typed/async/build.mjs          write the bundle
//   node compiler/typed/async/build.mjs --check  exit 1 if the committed bundle is stale (make test-generated)
// Every loader reads the bundle, one script: the tests, the bench, the trace REPL's module table and the firmware's
// compiler bundle (typed/async.js, which only worlds with async functions load; apps/typed/editor/app.json). The
// modules share one scope, the bundle's IIFE, so they are not ES modules; MODULES gives their order. body.js's
// AsyncBody extends its Cursor and TypeChecker extends the front end's FunctionEmitter (typed-wasm.js, loaded first).
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const typed = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(typed, "typed-async.js");
export const MODULES = ["scan.js", "body.js", "liveness.js", "allocate.js", "text.js", "lower.js", "tasks.js", "rewrite.js"];

export function bundle() {
    const parts = MODULES.map(name => "// ---- async/" + name + "\n" + readFileSync(join(typed, "async", name), "utf8"));
    return "// Generated from compiler/typed/async/ by compiler/typed/async/build.mjs. Edit those files, not this one.\n" +
        "// Lower typed async functions before emission. The reactor owns each frame in WorldState, so only its scalar\n" +
        "// fields survive an event boundary. Runs in a bare QuickJS realm after typed-wasm.js; publishes typedAsync.\n" +
        "(() => {\n\"use strict\";\n\n" + parts.join("\n") + "})();\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const built = bundle();
    if (process.argv.includes("--check")) {
        if (readFileSync(target, "utf8") !== built) {
            console.error("compiler/typed/typed-async.js differs from the build of compiler/typed/async/. " +
                "Edit those files, never the bundle, then run node compiler/typed/async/build.mjs.");
            process.exit(1);
        }
    } else writeFileSync(target, built);
}
