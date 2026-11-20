import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createContext,runInContext} from "node:vm";
import {root, stage} from "./01-stage.mjs";

const [source, out] = process.argv.slice(2);
assert(source && out);
const files = stage(), ctx = createContext({});
for (const [name, text] of Object.entries(files)) runInContext(text,ctx,{filename:name});
const text = readFileSync(source,"utf8");
const config = {stock:{},half:{literalPool:true},word:{literalPool:true,literalWordCopy:true}};
const receipt = {};
for (const [arm, options] of Object.entries(config)) {
    const stats = {};
    const result = ctx.typedRv32.compile(text,[],undefined,{...options,literalMetrics:stats});
    assert.equal(result.entries.chessPainterSource,0);
    assert.equal(result.relocations.length,0);
    writeFileSync(resolve(out,"literal-"+arm+".bin"),result.image);
    receipt[arm]={...stats, sha256:createHash("sha256").update(result.image).digest("hex")};
}
writeFileSync(resolve(out,"literal-writer.json"), JSON.stringify(receipt,null,2)+"\n");
