import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompiler} from './03-emit.mjs';
import {check} from './04-check.mjs';
const [fixture,out]=process.argv.slice(2),c=makeCompiler();
const source=fs.readFileSync(path.join(fixture,'burst.typed'),'utf8'),gold=JSON.parse(fs.readFileSync(path.join(fixture,'control.json')));
const prog=c.typedRv32.compile(source),bounds=check(prog.image,prog.entries,prog.certificate);
const oracleLoc=path.join(fixture,'01-burst-oracle.mjs'),text=fs.readFileSync(oracleLoc,'utf8');
const day=path.resolve('ttmp/2026/11/19'),old=path.join(day,fs.readdirSync(day).find(n=>n.startsWith('PICOCALC-RV32-BRANCH--')),'scripts/07-rv32.mjs');
const watch=fs.readFileSync(old,'utf8').replace('while (at !== returnToHost) {','while (at !== returnToHost) { globalThis.observeDepth(name,stackTop-x[2]);');
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const max={};
globalThis.observeDepth=(name,depth)=>{assert(depth<=bounds[name].typed);max[name]=Math.max(max[name]||0,depth);};
globalThis.checkedNative=prog;
const executable=text.replace('dirname(fileURLToPath(import.meta.url))',JSON.stringify(path.resolve(fixture)))
    .replace('typedRv32.compile(source);','globalThis.checkedNative;')
    .replace('pathToFileURL(resolve(day,branch,"scripts/07-rv32.mjs"))',JSON.stringify(uri(watch)))
    .replace('writeFileSync(output, JSON.stringify(summary,null,2)+"\\n");','globalThis.checkedSummary=summary;');
process.argv=['node',oracleLoc,out];await import(uri(executable));assert.deepEqual(globalThis.checkedSummary,gold);
const entries=Object.fromEntries(Object.entries(bounds).map(([n,f])=>[n,{frame:f.frame,certified:f.typed,observedEntry:max[n]??null,externals:Object.keys(f.sdk)}]));
fs.writeFileSync(out,JSON.stringify({summary:gold,entries},null,2)+'\n');
