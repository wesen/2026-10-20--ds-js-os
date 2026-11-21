import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext, runInContext} from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "../../../../../../..");
const compiler = name => readFileSync(resolve(root, "picocalc-os/compiler", name), "utf8");
function once(text, old, next) {
    assert.equal(text.split(old).length, 2, old);
    return text.replace(old, () => next);
}

export function context(arm, declarations = []) {
    const ctx = createContext({turnExperiment: arm === "stock" ? null : {mode:arm, declarations}});
    runInContext(compiler("typed-wasm.js"), ctx, {filename:"typed-wasm.js"});
    let async = compiler("typed-async.js");
    if (arm !== "stock") {
        async = once(async, "function analyze(program) {",
            readFileSync(resolve(here, "policy.js"), "utf8") + "\nfunction analyze(program) {");
        async = once(async, "if (!scalar(fn.result, types))",
            "if (!fn.ordinaryBody && !scalar(fn.result, types))");
        async = once(async, 'if (!fn.params.some(param => param.type === "WorldState"))',
            'if (!fn.ordinaryBody && !fn.params.some(param => param.type === "WorldState"))');
        async = once(async, "if (!param.ambient && !scalar(param.type, types))",
            "if (!fn.ordinaryBody && !param.ambient && !scalar(param.type, types) && !turnParameter(fn, param))");
        async = once(async, "    analyze(program);",
            "    analyze(program);\n    verifyTurnParameters(program, sourceCallables(program));");
        async = once(async, "param.ambient ? param.name : zero(param.type, types)",
            'param.ambient ? param.name : param.type === "buffer" ? "output" : zero(param.type, types)');
    }
    runInContext(async, ctx, {filename:"typed-async.js"});
    for (const file of ["typed-rv32.js", "typed-world.js"]) runInContext(compiler(file), ctx, {filename:file});
    return ctx;
}
