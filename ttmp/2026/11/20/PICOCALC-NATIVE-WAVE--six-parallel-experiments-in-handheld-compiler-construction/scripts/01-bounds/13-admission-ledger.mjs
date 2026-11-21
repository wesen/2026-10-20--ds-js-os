// Observe the current streamed function descriptor before its backend callback.
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createContext,runInContext} from "node:vm";
import {root,stage} from "./01-stage.mjs";
const [asset,comparison,output] = process.argv.slice(2);
assert(asset && comparison && output);
const source=readFileSync(asset,"utf8");
const reports=JSON.parse(readFileSync(comparison)).chess.arms;
const ctx=createContext({});
const descriptors=[];
for (const part of ["typed-wasm.js","typed-async.js","typed-rv32.js","typed-world.js"])
    runInContext(part==="typed-rv32.js" ? stage() :
        readFileSync(resolve(root,"picocalc-os/compiler",part),"utf8"),ctx);
const compile=ctx.typedWasm.compileFunctions;
ctx.typedWasm.compileFunctions=(source,base,imports,limit,numeric,consume,...rest)=>{
    assert(numeric && typeof consume==="function");
    return compile(source,base,imports,limit,numeric,fn=>{
        descriptors.push({name:fn.name,cells:fn.code.length,params:[...fn.params]});
        consume(fn);
    },...rest);
};
ctx.typedRv32.linkSlot=program=>program;
ctx.compileTypedWorldRv32(source,null,{});
const results={};
for (const policy of ["order","selected"]) {
    let remaining=640;
    const rows=descriptors.map(row=>{
        const before=remaining;
        let result="accepted";
        if(row.cells>remaining) result="remaining";
        else if(policy==="selected" && (row.cells<24 || row.cells>192 || !row.params.some(t=>t==="buffer"||t==="string")))
            result="eligibility";
        if(result==="accepted") remaining-=row.cells;
        return {...row,before,result};
    });
    const recorded=reports["bounds-"+policy].options.boundsStats.bounds;
    assert.equal(640-remaining,recorded.charged);
    assert.equal(rows.filter(row=>row.result==="accepted").length,recorded.accepted);
    const proofSite=rows.find(row=>row.name==="chessMake");
    assert(proofSite && proofSite.result!=="accepted");
    results[policy]={replayedDebit:640-remaining,observedFunctions:rows.length,proofSite};
}
writeFileSync(output,JSON.stringify(results,null,2)+"\n");
