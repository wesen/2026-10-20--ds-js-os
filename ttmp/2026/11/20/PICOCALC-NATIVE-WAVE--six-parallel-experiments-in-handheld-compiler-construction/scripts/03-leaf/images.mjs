import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {context} from "./stage.mjs";

const [input, out, prefix] = process.argv.slice(2);
assert(input && out && prefix);
const text = readFileSync(input,"utf8");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
mkdirSync(out,{recursive:true});
const contexts = {stock:context(false), candidate:context(true)};
const arms = ["stock","leaf","inline"];
for (const arm of arms) {
    const compiler = contexts[arm === "stock" ? "stock" : "candidate"].typedRv32;
    const options = {leafExperiment:arm};
    const first = compiler.compile(text,[],undefined,options);
    assert.equal(first.importCount,0);
    assert.equal(first.relocations.length,0);
    if (arm === "leaf") {
        const buffered = compiler.compile(text,[],undefined,{...options,streamFunctions:false});
        assert.deepEqual(Buffer.from(buffered.image),Buffer.from(first.image));
    }
    const info = {arm,sourceSHA256:sha(text),imageSHA256:sha(first.image),sourceSha256:sha(text),rv32Sha256:sha(first.image),bytes:first.image.length,
                  entries:first.entries,imports:first.importCount, stats:first.leafStats ?? null};
    writeFileSync(resolve(out,`${prefix}-${arm}.bin`),first.image);
    writeFileSync(resolve(out,`${prefix}-${arm}.json`),JSON.stringify(info,null,2)+"\n");
    console.log(prefix,arm,info.bytes,info.rv32Sha256);
}
