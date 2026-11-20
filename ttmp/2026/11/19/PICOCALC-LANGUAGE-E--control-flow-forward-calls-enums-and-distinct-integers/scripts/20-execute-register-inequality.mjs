// Pair the production language frontend with the professor's staged register emitter.
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {createContext, runInContext} from "node:vm";
import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const [staged] = process.argv.slice(2);
assert(staged, "pass a fresh directory produced by PICOCALC-STAGED-RV32/scripts/01-stage.py");
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {encoding: "utf8"}).trim();
const day = join(root, "ttmp/2026/11/19");
const branch = readdirSync(day).find(name => name.startsWith("PICOCALC-RV32-BRANCH--"));
const {runRv32} = await import(pathToFileURL(join(day, branch, "scripts/07-rv32.mjs")));
const backend = join(staged, "lanes/staged/typed/rv32.js");
const patched = execFileSync("patch", ["--silent", "--batch", "--fuzz=0", "-o", "-", backend], {
    input: readFileSync(new URL("19-stage-register-inequality.patch", import.meta.url)), encoding: "utf8",
});
const context = createContext();
runInContext(readFileSync(join(root, "picocalc-os/compiler/typed-wasm.js"), "utf8"), context);
runInContext(patched, context);
const rows = [];
for (const type of ["bool", "i32"]) {
    for (const branch of [false, true]) {
        const expressions = ["a !== b", "!(a === b)"];
        const values = type === "bool" ? [0, 1] : [-2147483648, -1, 0, 1, 2147483647];
        const counts = expressions.map(expression => {
            const body = branch ? `if (${expression}) return 7; return 9;` : `return ${expression};`;
            const source = `function f(a:${type},b:${type}):${branch ? "i32" : "bool"} { ${body} }`;
            const program = context.typedRv32.compile(source);
            for (const a of values) for (const b of values) {
                const result = runRv32(program, "f", [a,b], [], {}, new Uint8Array(128));
                assert.equal(result.result, branch ? (a !== b ? 7 : 9) : Number(a !== b));
            }
            return program.image.length / 4;
        });
        assert.equal(counts[0], counts[1]);
        rows.push({type, consumer: branch ? "branch" : "value", directWords: counts[0],
                   negatedWords: counts[1], checkedExecutions: values.length ** 2 * 2});
    }
}
console.log(JSON.stringify({rows}, null, 2));
