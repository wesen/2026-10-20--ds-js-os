import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {makeCompiler} from './03-emit.mjs';
import {check} from './04-check.mjs';
const day=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const old=path.join(day,fs.readdirSync(day).find(n=>n.startsWith('PICOCALC-TYPED-PIE--')),'scripts/review');
const original=fs.readFileSync(path.join(old,'run-rv32.mjs'),'utf8');
const instrumented=original.replace("'./packed.mjs'",JSON.stringify(pathToFileURL(path.join(old,'packed.mjs')).href))
    .replace('while (at !== returnToHost) {','while (at !== returnToHost) { globalThis.__stackMin = Math.min(globalThis.__stackMin,x[2]);');
assert.notEqual(instrumented,original);
const {runRv32}=await import('data:text/javascript;base64,'+Buffer.from(instrumented).toString('base64'));
const c=makeCompiler(),samples=[];
for(let i=1;i<=12;i++){
    let s='function f0(x: i32): i32 {return x+1;}';
    for(let j=1;j<i;j++)s+=' function f'+j+'(x: i32): i32 {if (x>0) {return f'+(j-1)+'(x);} return x;}';
    const p=c.typedRv32.compile(s),entry='f'+(i-1),bounds=check(p.image,p.entries,p.certificate);
    for(const x of [0,9]) {
        globalThis.__stackMin=65536;
        const r=runRv32(p,entry,[x],[],{},new Uint8Array(),null);
        const observed=65536-globalThis.__stackMin;
        assert(!r.trap && observed<=bounds[entry].typed);assert.equal(observed,x?16*i:16);
        samples.push({entry,x,observed,certified:bounds[entry].typed});
    }
}
fs.writeFileSync(process.argv[2],JSON.stringify(samples,null,2)+'\n');
