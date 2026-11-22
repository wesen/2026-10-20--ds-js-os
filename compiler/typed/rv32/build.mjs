// Build compiler/typed/typed-rv32.js from the modules in this directory, in file-name order.
//   node compiler/typed/rv32/build.mjs          write the bundle
//   node compiler/typed/rv32/build.mjs --check  exit 1 if the committed bundle is stale
// The bundle is what every loader reads: the tests, the replays, the workbench, the tools and the
// firmware's compiler bundle. Edit the modules, then rebuild; tests/typed-rv32.test.mjs fails on a
// stale bundle. The modules share one scope, the bundle's IIFE, so they are not ES modules.
import {readFileSync, readdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "typed-rv32.js");
export function bundle() {
    const parts = readdirSync(here).filter(name => /^\d\d-.*\.js$/.test(name)).sort()
        .map(name => readFileSync(join(here, name), "utf8"));
    return "// Generated from compiler/rv32/ by compiler/rv32/build.mjs. Edit those files, not this one.\n" +
        "// Lower the shared typed frontend's structured i32 operations to RV32IM.\n" +
        "// This code executes in the host tools and can execute in a bare QuickJS realm.\n" +
        "(() => {\n\"use strict\";\n\n" + parts.join("") + "})();\n";
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const built = bundle();
    if (process.argv.includes("--check")) {
        if (readFileSync(target, "utf8") !== built) {
            console.error("compiler/typed/typed-rv32.js differs from the build of compiler/typed/rv32/. Edit the files in " +
                "compiler/typed/rv32/, never the bundle, then run node compiler/typed/rv32/build.mjs.");
            process.exit(1);
        }
    } else writeFileSync(target, built);
}
