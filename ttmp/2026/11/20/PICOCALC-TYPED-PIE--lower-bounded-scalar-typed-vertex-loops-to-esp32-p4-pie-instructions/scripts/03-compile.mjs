import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext, runInContext} from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../../..");
const compiler = resolve(root, "picocalc-os/compiler");
const baseline = readFileSync(resolve(compiler, "typed-rv32.js"), "utf8");

function replaceOnce(source, before, after) {
    const first = source.indexOf(before);
    if (first < 0 || source.indexOf(before, first + before.length) >= 0)
        throw new Error("Typed RV32 integration point changed");
    return source.replace(before, after);
}

// Staging uses the real compiler unchanged except for the explicit target
// option and the annotation hook in the existing function emitter.
export function stage() {
    let rv32 = replaceOnce(baseline, "constructor(program, functions, starts) {",
        "constructor(program, functions, starts, options) {\n        this.options = options;");
    rv32 = replaceOnce(rv32, "while (this.at < this.program.code.length && !this.step(this.cell())) {}",
        `while (this.at < this.program.code.length && !this.step(this.cell())) {
            if (this.at === 4 && (this.options?.pie === true || this.options?.piePortable === true))
                typedPieExperiment.prefix(this, instruction, this.options.pieDiagnostics, this.options.piePortable === true);
        }`);
    rv32 = replaceOnce(rv32, "new FunctionCode(fn, callables, targets).lower()",
        "new FunctionCode(fn, callables, targets, options).lower()");
    return readFileSync(resolve(here, "02-pie-lowering.js"), "utf8") + "\n" + rv32;
}

export function createCompiler(withCandidate = true) {
    const context = createContext({});
    for (const name of ["typed-wasm.js", "typed-async.js"]) {
        runInContext(readFileSync(resolve(compiler, name), "utf8"), context, {filename: name});
    }
    runInContext(withCandidate ? stage() : baseline, context, {filename: "typed-rv32.js"});
    return {rv32: context.typedRv32, wasm: context.typedWasm};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [action, path, output, mode = "pie"] = process.argv.slice(2);
    if (action === "stage" && path) writeFileSync(path, stage());
    else if (action === "compile" && path && output && ["pie", "portable", "scalar"].includes(mode)) {
        const {rv32} = createCompiler();
        const pieDiagnostics = [];
        const program = rv32.compile(readFileSync(path, "utf8"), [], undefined,
            {pie: mode === "pie", piePortable: mode === "portable", pieDiagnostics});
        writeFileSync(output, program.image);
        console.log(JSON.stringify({entries: program.entries, bytes: program.image.length, pieDiagnostics}));
    } else {
        throw new Error("usage: 03-compile.mjs stage OUTPUT | compile SOURCE OUTPUT [pie|portable|scalar]");
    }
}
