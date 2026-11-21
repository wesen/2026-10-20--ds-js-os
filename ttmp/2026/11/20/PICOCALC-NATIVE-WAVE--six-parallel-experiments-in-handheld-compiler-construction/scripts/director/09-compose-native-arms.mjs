// Combine the researchers' unmodified lowering rules and execute the director's frozen cases.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {stage as semanticSources} from "../02-semantics/01-stage.mjs";
import {context} from "../03-leaf/stage.mjs";

const own = dirname(fileURLToPath(import.meta.url));
const corpus = resolve(own, "heldout");
const ticket = resolve(own, "../..");
const output = process.argv[2];
assert(output, "supply a directory to hold the raw cross-study programs");
mkdirSync(output, {recursive:true});
const read = path => readFileSync(path, "utf8");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const lock = JSON.parse(read(resolve(ticket, "various/director/heldout-lock.json")));
const source = read(resolve(corpus, "burst.typed"));
const oracle = read(resolve(corpus, "01-burst-oracle.mjs"));
assert.equal(digest(source), lock.files["burst.typed"]);
assert.equal(digest(oracle), lock.files["01-burst-oracle.mjs"]);
const day = dirname(ticket);
const interpreterStudy = readdirSync(day).find(name => name.startsWith("PICOCALC-TYPED-PIE--"));
const interpreter = resolve(day, interpreterStudy, "scripts/review/run-rv32.mjs");
const semantic = semanticSources();
const results = [];
for (const lowering of ["early","late"]) {
    for (const leaf of ["stock","leaf","inline"]) {
        const compiler = context(leaf !== "stock", semantic);
        const opts = {semanticPolicy:lowering, semanticStats:{addresses:0, literals:0}, leafExperiment:leaf};
        const program = compiler.typedRv32.compile(source, [], undefined, opts);
        const wasm = compiler.typedWasm.compile(source);
        assert.equal(program.relocations.length, 0);
        assert.equal(program.importCount, 0);
        const name = lowering + "-" + leaf;
        const metadata = {entries:program.entries, sourceSHA256:digest(source), imageSHA256:digest(program.image)};
        writeFileSync(resolve(output, name+".bin"), program.image);
        writeFileSync(resolve(output, name+".json"), JSON.stringify(metadata,null,2)+"\n");
        // Use the original input generator and assertions, overriding only the compiler and interpreter entry points.
        globalThis.waveProgram = program;
        globalThis.waveWasm = wasm;
        const adapt = oracle
            .replace('const dir = dirname(fileURLToPath(import.meta.url));', 'const dir = '+JSON.stringify(corpus)+';')
            .replace('const [output] = process.argv.slice(2);', 'const output = '+JSON.stringify(resolve(output,name+"-cases.json"))+';')
            .replace('typedWasm.compile(source);','globalThis.waveWasm;')
            .replace('typedRv32.compile(source);','globalThis.waveProgram;')
            .replace('pathToFileURL(resolve(day,branch,"scripts/07-rv32.mjs"))',JSON.stringify(pathToFileURL(interpreter).href));
        await import("data:text/javascript;base64,"+Buffer.from(adapt).toString("base64"));
        const cases = JSON.parse(read(resolve(output,name+"-cases.json")));
        assert.equal(cases.total,lock.control.total);
        assert.equal(cases.traps,lock.control.traps);
        results.push({name,...cases,semantic:opts.semanticStats,leaves:program.leafStats?.leaves ?? []});
    }
}
const singles = JSON.parse(read(resolve(ticket, "various/director/physical.json"))).inputs.arms;
for (const [i,arm] of [[0,"stock"],[1,"burst-leaf"],[2,"burst-inline"],[3,"semantics-late"]]) {
    assert.equal(results[i].rv32SHA256,singles.find(s=>s.arm===arm).imageSHA256,arm);
}
writeFileSync(resolve(output, "composition.json"), JSON.stringify(results,null,2)+"\n");
