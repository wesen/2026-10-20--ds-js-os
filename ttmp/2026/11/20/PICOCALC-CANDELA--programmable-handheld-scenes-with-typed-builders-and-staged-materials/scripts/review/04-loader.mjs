import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {createContext,runInContext} from "node:vm";

const [dir]=process.argv.slice(2);
const file=name=>readFileSync(dir+'/'+name);
function load(revision) {
    const ctx=createContext({});
    for(const tag of ['typed-wasm','typed-async','typed-rv32','candela']) {
        const path='picocalc-os/compiler/'+tag+'.js';
        const contents=revision && tag!=='candela' ? execFileSync('git',['show',revision+':'+path]) : readFileSync(path);
        runInContext(contents.toString(),ctx);
    }
    return ctx;
}
const current=load(null), stock=load('c065dc2');
const sha=value=>createHash('sha256').update(value).digest('hex');
const rows=[];
for(const stage of ['hand','fluent','callback']) {
    const source=file('candela-'+stage+'.typed').toString();
    const template=file('candela-slot.elf');
    const module=current.linkCandela(source,template);
    const rv=current.typedRv32.compile(source).image, wasm=current.typedWasm.compile(source).bytes;
    if(stage==='hand'){
        assert.equal(sha(stock.typedRv32.compile(source).image),sha(rv));
        assert.equal(sha(stock.typedWasm.compile(source).bytes),sha(wasm));
        assert.equal(sha(stock.linkCandela(source,template)),sha(module));
    }
    rows.push({stage,sourceBytes:source.length,sourceSHA:sha(source),nativeTextBytes:rv.length,rvSHA:sha(rv),wasmSHA:sha(wasm),elfBytes:module.length,elfSHA:sha(module),stockControl:stage==='hand'});
}
console.log(JSON.stringify(rows,null,2));
