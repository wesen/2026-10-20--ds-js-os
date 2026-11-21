import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createContext,runInContext} from "node:vm";
import {stage as bounds, root} from "./01-stage.mjs";
import {stage as semantics} from "../02-semantics/01-stage.mjs";

const [assets,painter,receipt,images] = process.argv.slice(2);
assert(assets && painter && receipt && images, "provide staged assets, painter source, receipt and export directory");
const here = dirname(fileURLToPath(import.meta.url));
const inputPaths = {control:resolve(here,"control.typed"),editor:resolve(assets,"editor.typed"),
    chess:resolve(assets,"chess.typed"),painter:resolve(painter)};
const reviewDir = resolve(root,"ttmp/2026/11/20");
const pie = readdirSync(reviewDir).find(name => name.startsWith("PICOCALC-TYPED-PIE--"));
const {runRv32} = await import(pathToFileURL(resolve(reviewDir,pie,"scripts/review/run-rv32.mjs")));
const parts = ["typed-wasm.js","typed-async.js","typed-rv32.js","typed-world.js"];
const stock = Object.fromEntries(parts.map(name =>
    [name,readFileSync(resolve(root,"picocalc-os/compiler",name),"utf8")]));
const digest = value => createHash("sha256").update(value).digest("hex");
const candidates = {"bounds":{...stock,"typed-rv32.js":bounds()},"semantics":{...stock,...semantics()}};
const arms = [["stock",stock,()=>({})],
    ...["never","always","order","selected"].map(policy => ["bounds-"+policy,candidates.bounds,
        ()=>({boundsPolicy:policy,boundsStats:{changedFunctions:[]}})]),
    ...["early","late","selected"].map(policy => ["semantics-"+policy,candidates.semantics,
        ()=>({semanticPolicy:policy,semanticStats:{addresses:0,literals:0}})])];
function load(parts) {
    const ctx = createContext({});
    for (const [name,source] of Object.entries(parts)) runInContext(source,ctx,{filename:name});
    return ctx;
}
function checkControl(program, wasm) {
    const alloc = () => {
        const bytes = new Uint8Array(128).fill(0xaa);
        const v = new DataView(bytes.buffer);
        for (const at of [16,64]) {
            v.setInt32(at,8,true);
            for(const [i,value] of [1,0xabcd,0xd83d,0xde00,34,513,81,5].entries())
                v.setUint16(at+4+2*i,value,true);
        }
        return bytes;
    };
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm));
    const endpoints = new Map();
    function check(name,args,expected,patch) {
        const input = alloc(), final = input.slice();
        if (patch) patch(new DataView(final.buffer));
        const guest = instance.exports;
        const memory = new Uint8Array(guest.memory.buffer,0,input.length);
        memory.set(input);
        if (expected === undefined) assert.throws(() => guest[name](...args),WebAssembly.RuntimeError);
        else assert.equal(guest[name](...args),expected,name);
        assert.deepEqual(memory,final,name+" Wasm memory");
        const rv = runRv32(program,name,args,[],{},input);
        assert.equal(rv.result,expected,name+" result");
        assert.equal(rv.trap,expected === undefined,name+" trap");
        assert.deepEqual(rv.bytes,final,name+" RV32 memory");
        const counts = endpoints.get(name) ?? {cases:0,steps:0,traps:0};
        counts.cases++;
        counts.steps += rv.steps;
        counts.traps += Number(rv.trap);
        endpoints.set(name,counts);
    }
    const contents = [1,0xabcd,0xd83d,0xde00,34,513,81,5];
    const indices = [-2147483648,-1,0,1,3,6,7,8,2147483647];
    for (const p of indices) {
        const at = contents[p];
        check("repeated",[16,p],at === undefined ? undefined : 3*at);
        for (const take of [0,1]) check("branch",[16,p,take],at === undefined ? undefined : at*(take+1));
        for (const q of indices) {
            const other = contents[q];
            check("reassigned",[16,p,q],at === undefined || other === undefined ? undefined : at+other);
            check("rhsOrder",[64,16,p,q],at === undefined || other === undefined ? undefined : 7,v=>{
                v.setUint16(68,513,true);
                if (at !== undefined && other !== undefined) v.setUint16(68+2*p,other,true);
            });
        }
        for (const name of ["called","stored"]) for (const dst of [16,64])
            check(name,[16,dst,p],at === undefined || (dst===16 && p!==0) ? undefined : 2*at,
                at === undefined ? null : v=>v.setInt32(dst,1,true));
        for (const useLong of [0,1]) {
            const text = useLong ? "ab☺€🐈cd" : "ab☺€🐈c";
            const valid = p >= 0 && p + text.length <= 8;
            check("literals",[64,p,useLong],valid ? text.length : undefined,valid ? v=>{
                for(let i=0;i<text.length;i++) v.setUint16(68+2*(i+p),text.charCodeAt(i),true);
            } : null);
        }
    }
    return Object.fromEntries(endpoints);
}
const results = {};
mkdirSync(images,{recursive:true});
for (const [test,path] of Object.entries(inputPaths)) {
    const source = readFileSync(path,"utf8");
    const isWorld = test==="chess" || test==="editor";
    const result = results[test] = {sourceBytes:Buffer.byteLength(source),sourceSHA256:digest(source),arms:{}};
    for (const [arm,parts,reset] of arms) {
        const samples = [];
        let program, options;
        for(let i=0;i<7;i++) {
            const ctx=load(parts);
            options=reset();
            const before=performance.now();
            if (isWorld) {
                ctx.typedRv32.linkSlot=program=>program;
                program=ctx.compileTypedWorldRv32(source,null,options);
            } else program=ctx.typedRv32.compile(source,[],undefined,options);
            samples.push(performance.now()-before);
        }
        samples.sort((a,b)=>a-b);
        const row = result.arms[arm] = {bytes:program.image.length,functions:Object.keys(program.entries).length,
            sha256:digest(program.image),hostCompileMillis:samples,options};
        if(test==="control") {
            row.correctness=checkControl(program,load(parts).typedWasm.compile(source).bytes);
            assert.equal(program.importCount,0);
            assert.equal(program.relocations.length,0);
            writeFileSync(resolve(images,"positive-"+arm+".bin"),program.image);
            writeFileSync(resolve(images,"positive-"+arm+".json"),JSON.stringify({
                entries:program.entries,imageSHA256:row.sha256,sourceSHA256:result.sourceSHA256,options
            },null,2)+"\n");
        }
        if (arm.endsWith("-early") || arm.endsWith("-never"))
            assert.equal(row.sha256,result.arms.stock.sha256,test);
    }
    console.log(test,Object.fromEntries(Object.entries(result.arms).map(([name,a])=>[name,[a.bytes,a.options]])));
}
assert(results.control.arms["bounds-always"].options.boundsStats.bounds.removed > 0);
writeFileSync(receipt,JSON.stringify(results,null,2)+"\n");
