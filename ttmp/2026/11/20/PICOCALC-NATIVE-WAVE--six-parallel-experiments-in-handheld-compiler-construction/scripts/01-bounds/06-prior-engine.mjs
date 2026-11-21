import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {createContext,runInContext} from "node:vm";

const [work,receipt] = process.argv.slice(2);
assert(work && receipt,"provide the original bounded-index staging output and receipt");
const source = readFileSync(join(work,"sources/editor/app.typed"),"utf8");
const hash = value => createHash("sha256").update(value).digest("hex");
function replace(code,before,after) {
    assert.equal(code.split(before).length,2,before);
    return code.replace(before,after);
}
function run(mode,policy) {
    const ctx = createContext({});
    const counts = {functions:0,accepted:0,charged:0,candidates:0,attempted:0,examined:0,proven:0,exhausted:0,rows:{}};
    Object.assign(ctx,{counts,policy,remaining:640});
    for (const part of ["wasm","rv32","world"]) {
        let code = readFileSync(join(work,"clean",mode,"typed",part+".js"),"utf8");
        if (part==="wasm" && policy) {
            code = replace(code,`        const proven = this.bounds?.proves(term, this.bounds.length(binding));
        this.code.push(TYPED_READ, binding.index * 4 + Number(binding.type === "buffer") + 2 * Number(!!proven));`,
                `        this.readFacts ??= [];
        if (this.bounds) this.readFacts.push({at:this.code.length+1,
            facts:this.bounds.facts,index:term,length:this.bounds.length(binding)});
        this.code.push(TYPED_READ, binding.index * 4 + Number(binding.type === "buffer"));`);
            code = replace(code,"        if (this.bounds) fn.bounds =",
                `        const size=this.code.length;
        const reads=this.readFacts ?? [];
        const accepted= policy==="always" || (policy!=="never" && size<=remaining &&
            (policy!=="selected" || (size>=24 && size<=192 &&
                fn.params.some(t=>t==="buffer" || t==="string"))));
        counts.functions++;
        counts.candidates+=reads.length;
        if (accepted) {
            counts.accepted++;
            counts.charged += size;
            remaining -= size;
            // BoundsFacts only reads the persistent facts array in proves.
            // The snapshot identifiers already encode the current local versions.
            for (const read of reads) {
                this.bounds.facts=read.facts;
                counts.attempted++;
                if (this.bounds.proves(read.index,read.length)) this.code[read.at] |= 2;
            }
        }
        const b=this.bounds;
        counts.examined+=b.examined;
        counts.proven+=b.proven;
        counts.exhausted+=b.exhausted;
        if (reads.length || fn.name==="editorPreviewAppend")
            counts.rows[fn.name]={size,reads:reads.length,accepted,
                proven:b.proven,examined:b.examined,exhausted:b.exhausted};
        if (this.bounds) fn.bounds =`);
        }
        runInContext(code,ctx,{filename:mode+"-"+part});
    }
    ctx.typedRv32.linkSlot=p=>p;
    const program=ctx.compileTypedWorldRv32(source,null,{});
    return {bytes:program.image.length,sha256:hash(program.image),...policy && counts};
}
const result = {
    sourceSHA256:hash(source),sourceBytes:Buffer.byteLength(source),
    originalCurrent:run("current"),originalAlways:run("bounded"),
    arms:Object.fromEntries(["never","always","order","selected"].map(arm=>[arm,run("bounded",arm)])),
};
assert.equal(result.originalCurrent.sha256,result.arms.never.sha256);
assert.equal(result.originalAlways.sha256,result.arms.always.sha256);
assert(result.arms.always.rows.editorPreviewAppend.proven>=1);
console.log(JSON.stringify({...result,arms:Object.fromEntries(Object.entries(result.arms).map(([k,v]) =>
    [k,{...v,rows:{editorPreviewAppend:v.rows.editorPreviewAppend}}]))},null,2));
writeFileSync(receipt,JSON.stringify(result,null,2)+"\n");
