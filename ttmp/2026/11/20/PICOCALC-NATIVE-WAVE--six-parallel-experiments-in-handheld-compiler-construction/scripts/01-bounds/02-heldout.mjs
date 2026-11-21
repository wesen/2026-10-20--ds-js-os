import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stage as bounds, root } from "./01-stage.mjs";
import { stage as semantics } from "../02-semantics/01-stage.mjs";

const [input, receipt, output] = process.argv.slice(2);
assert(input && receipt && output, "provide locked fixture directory, receipt, and binary directory");
const sourceDir = resolve(input);
const hash = value => createHash("sha256").update(value).digest("hex");
assert.equal(hash(readFileSync(resolve(sourceDir,"burst.typed"))),
    "98321148a3451e5574001fbc15d0e95ea161e66def826f421d67addf857a9d7f");
const reviewRoot = resolve(root,"ttmp/2026/11/20");
const review = readdirSync(reviewRoot).find(name => name.startsWith("PICOCALC-TYPED-PIE--"));
const interpreter = pathToFileURL(resolve(reviewRoot,review,"scripts/review/run-rv32.mjs")).href;
const oracle = readFileSync(resolve(sourceDir,"01-burst-oracle.mjs"),"utf8");
const early = readFileSync(resolve(root,"picocalc-os/compiler/typed-wasm.js"),"utf8");
const stock = readFileSync(resolve(root,"picocalc-os/compiler/typed-rv32.js"),"utf8");
const arms = [
    ["stock", early, stock, {}],
    ...["never","always","order","selected"].map(policy =>
        ["bounds-"+policy,early,bounds(),{boundsPolicy:policy,boundsStats:{}}]),
    ...["early","late","selected"].map(policy => {
        const stage = semantics();
        return ["semantics-"+policy,stage["typed-wasm.js"],stage["typed-rv32.js"],
            {semanticPolicy:policy,semanticStats:{addresses:0,literals:0}}];
    }),
];
const work = mkdtempSync(resolve(tmpdir(),"native-wave-heldout-run-"));
mkdirSync(output,{recursive:true});
const results = {};
try {
    for (const [name, frontend, backend, options] of arms) {
        writeFileSync(resolve(work,"typed-wasm.js"),frontend);
        writeFileSync(resolve(work,"typed-rv32.js"),backend);
        const binary = resolve(output,name);
        const harness = oracle
            .replace('const dir = dirname(fileURLToPath(import.meta.url));',
                'const dir = '+JSON.stringify(sourceDir)+';')
            .replace('"picocalc-os/compiler/" + name + ".js"',
                JSON.stringify(work + "/")+' + name + ".js"')
            .replace('pathToFileURL(resolve(day,branch,"scripts/07-rv32.mjs"))', JSON.stringify(interpreter))
            .replace('const native = typedRv32.compile(source);',
                'const options='+JSON.stringify(options)+';\nconst native = typedRv32.compile(source,[],undefined,options);\n' +
                'assert.equal(native.importCount,0); assert.equal(native.relocations.length,0);\n' +
                'const outputBase='+JSON.stringify(binary)+';\n' +
                'writeFileSync(outputBase+".bin",native.image);\n' +
                'writeFileSync(outputBase+".json",JSON.stringify({entries:native.entries,sourceSHA256:createHash("sha256").update(source).digest("hex"),imageSHA256:createHash("sha256").update(native.image).digest("hex"),options},null,2)+"\\n");')
            .replace('const summary={','const summary={options,wasmSHA256:digest(wasm.bytes),');
        const adapter = resolve(work,"oracle.mjs");
        const armReceipt = resolve(work,"arm.json");
        writeFileSync(adapter,harness);
        const run = spawnSync(process.execPath,[adapter,armReceipt],{cwd:root,encoding:"utf8"});
        assert.equal(run.status,0,name+"\n"+run.stderr);
        results[name]=JSON.parse(readFileSync(armReceipt));
        assert.equal(results[name].wasmSHA256,results.stock.wasmSHA256);
        assert.equal(results[name].total,1603);
        assert.equal(results[name].traps,101);
        console.log(name,results[name].imageBytes,results[name].rv32Steps,results[name].options);
    }
    assert.equal(results["bounds-never"].rv32SHA256,results.stock.rv32SHA256);
    assert.equal(results["semantics-early"].rv32SHA256,results.stock.rv32SHA256);
    writeFileSync(receipt,JSON.stringify({oracleSHA256:hash(oracle),results},null,2)+"\n");
} finally {
    rmSync(work,{recursive:true,force:true});
}
