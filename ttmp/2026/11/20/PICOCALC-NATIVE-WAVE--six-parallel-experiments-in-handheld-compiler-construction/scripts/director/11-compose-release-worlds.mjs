// Inspect the six combined code-generation arms through the real reactor-slot linker.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {stage as semantics} from "../02-semantics/01-stage.mjs";
import {context} from "../03-leaf/stage.mjs";

const [imagePath, output] = process.argv.slice(2);
assert(imagePath && output, "provide the ordinary release application binary and an output JSON file");
const ticket = resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const prior = JSON.parse(readFileSync(resolve(ticket,"various/01-bounds/host.json"),"utf8"));
const digest = data => createHash("sha256").update(data).digest("hex");
const reference = JSON.parse(readFileSync(resolve(ticket,"various/04-deps/release-inputs.json"),"utf8"));
const release = readFileSync(imagePath);
assert.equal(digest(release), reference.applicationSHA256);
function asset(name) {
    const entry = reference.files[name];
    const bytes = release.subarray(entry.releaseOffset,entry.releaseOffset+entry.bytes);
    assert.equal(digest(bytes),entry.sha256,name);
    return bytes;
}
const results = {};
for (const app of ["editor","chess"]) {
    const source = asset(app+".typed").toString("utf8");
    const reactor = asset(app+".elf");
    assert.equal(digest(source),prior[app].sourceSHA256);
    const row = {sourceSHA256:digest(source),reactorSHA256:digest(reactor),arms:{}};
    for (const lowering of ["early","late"]) {
        for (const leaf of ["stock","leaf","inline"]) {
            const c = context(leaf !== "stock", semantics());
            let generated;
            const link = c.typedRv32.linkSlot;
            c.typedRv32.linkSlot = (program, ...rest) => {
                generated = program;
                return link(program,...rest);
            };
            const options = {semanticPolicy:lowering,leafExperiment:leaf,semanticStats:{addresses:0,literals:0}};
            const bytes = c.compileTypedWorldRv32(source,reactor,options);
            assert.equal(bytes.length, reactor.length);
            const arm = row.arms[lowering+"-"+leaf] = {
                instructionsBytes:generated.image.length, imageSHA256:digest(generated.image),
                linkedELFBytes:bytes.length, linkedELFSHA256:digest(bytes),
                functions:Object.keys(generated.entries).length, relocations:generated.relocations.length,
                frameless:generated.leafStats?.leaves.length??0, inlinedSites:generated.leafStats?.sites.length??0,
                checkedOperations:options.semanticStats
            };
            if (leaf === "stock") assert.equal(arm.imageSHA256,prior[app].arms[lowering === "early" ? "stock":"semantics-late"].sha256);
        }
    }
    results[app] = row;
}
writeFileSync(output, JSON.stringify(results,null,2)+"\n");
