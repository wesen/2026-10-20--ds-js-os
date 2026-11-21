import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import vm from "node:vm";

const cli=fileURLToPath(new URL("../tools/typed-inspect.mjs",import.meta.url));
function compiler() {
    const ctx=vm.createContext({});
    for(const f of ["typed-wasm","typed-async","typed-rv32"])
        vm.runInContext(fs.readFileSync(new URL("../compiler/"+f+".js",import.meta.url),"utf8"),ctx);
    return ctx;
}
const source=`
function halve(n: i32): i32 { return n / 2; }
function read(b: buffer, i: i32): i32 {
    let q = b.charCodeAt(i);
    if (q > 44) { q = q + halve(q); }
    return q;
}`;

test("observing both target encodings preserves bytes, fixups, and real diagnostic precedence",()=>{
    const c=compiler();
    for (const streamFunctions of [true,false]) {
        const events=[], inspect={emit:e=>events.push(e)};
        const wasm=c.typedWasm.compile(source,{inspect});
        assert.deepEqual(wasm.bytes,c.typedWasm.compile(source).bytes);
        assert(WebAssembly.validate(wasm.bytes));
        const rv=c.typedRv32.compile(source,[],undefined,{inspect,streamFunctions});
        const ref=c.typedRv32.compile(source,[],undefined,{streamFunctions});
        assert.deepEqual(rv.image,ref.image);
        assert.deepEqual(rv.entries,ref.entries);
        for(const name of ["halve","read"]) {
            const e=events.find(ev=>ev.kind==="emission" && ev.target==="rv32" && ev.function===name);
            assert.equal(e.start,rv.entries[name]);
            let end=e.start;
            for(const r of e.ranges) { assert.equal(r.start,end); assert(r.end>=r.start); end=r.end; }
            assert.equal(end,e.end);
        }
        for(const bad of [source+" function z(): i32 { return missing; }",
            "function a(): i32 { return a(); }"]) {
            for(const compile of [o=>c.typedRv32.compile(bad,[],undefined,o),o=>c.typedWasm.compile(bad,o)]) {
                const error=o=>{try { compile(o); } catch(e) {return [e.name,e.message];} assert.fail("missing error");};
                assert.deepEqual(error({inspect,streamFunctions}),error({streamFunctions}));
            }
        }
    }
    const imports=[{name:"external",params:["i32"],result:"i32"}];
    const text="function call(n:i32):i32 { return external(n); }";
    const a=c.typedRv32.compile(text,imports),b=c.typedRv32.compile(text,imports,undefined,{inspect:{emit(){}}});
    assert.deepEqual(a.image,b.image);assert.deepEqual(a.relocations,b.relocations);
    assert(a.relocations.length);
});

test("CLI reconciles real bytes, source locations, profile identity and diff",t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"typed-inspect-"));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const file=path.join(dir,"example.typed");
    fs.writeFileSync(file,source);
    const run=(...args)=>execFileSync(process.execPath,[cli,...args],{encoding:"utf8"});
    const byLine=s=>s.trim().split("\n").map(row=>JSON.parse(row));
    const rows=byLine(run(file,"--function","read","--jsonl"));
    const c=compiler(),rv=c.typedRv32.compile(source),wasm=c.typedWasm.compile(source);
    assert.equal(rows.length,4);
    for(const row of rows.filter(r=>r.kind==="function")) {
        assert(row.operations.some(o=>o.source && o.source.line===4));
        assert(row.locals.some(l=>l.name==="q"));
        const bytes=row.target==="wasm"?wasm.bytes:rv.image;
        let pc=row.start;
        for(const range of row.ranges) {
            assert.equal(range.start,pc);
            if(row.target==="wasm") assert.equal(range.bytes,Buffer.from(bytes.subarray(pc,range.end)).toString("hex"));
            else for(const w of range.words) assert.equal(w.word,new DataView(bytes.buffer).getUint32(w.pc,true));
            pc=range.end;
        }
        assert.equal(pc,row.end);
    }
    const profile=path.join(dir,"counts.json");
    const sha=createHash("sha256").update(rv.image).digest("hex");
    const fn=rows.find(r=>r.name==="read" && r.target==="rv32");
    const access=fn.ranges.flatMap(r=>r.words).find(w=>w.stack==="local q");
    fs.writeFileSync(profile,JSON.stringify({imageSha256:sha,counts:[[access.pc,19]]}));
    assert.match(run(file,"--target","rv32","--function","read","--profile",profile,"--hot","1"),/19.*local q/);
    const listing=path.join(dir,"dump.jsonl");
    fs.writeFileSync(listing,run(file,"--function","read","--jsonl"));
    assert.match(run("diff",listing,listing),/rv32\/read bytes/);
    fs.writeFileSync(profile,JSON.stringify({imageSha256:"old",counts:[]}));
    const wrong=spawnSync(process.execPath,[cli,file,"--target","rv32","--profile",profile],{encoding:"utf8"});
    assert.equal(wrong.status,1);assert.match(wrong.stderr,/digest differs/);
});
