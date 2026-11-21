import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
const [sourceFile,compilerDir,out]=process.argv.slice(2);
const front=readFileSync('picocalc-os/compiler/typed-wasm.js','utf8');
const source=readFileSync(sourceFile,'utf8');
const manifest=JSON.parse(readFileSync(join(compilerDir,'manifest.json')));
const files={stock:'picocalc-os/compiler/typed-rv32.js',...Object.fromEntries(Object.keys(manifest.variants).map(n=>[n,join(compilerDir,n+'.js')]))};
const all={};
for(const [name,path] of Object.entries(files)){
    const vm=createContext({});runInContext(front,vm);runInContext(readFileSync(path,'utf8'),vm);
    const p=vm.typedRv32.compile(source);assert.equal(p.relocations.length,0);
    writeFileSync(join(out,name+'.bin'),p.image);
    const entries=Object.entries(p.entries),listing={};
    for(const [i,[fn,offset]] of entries.entries()) listing[fn]={offset,bytes:(entries[i+1]?.[1]??p.image.length)-offset};
    all[name]=listing;
}
writeFileSync(join(out,'listing.json'),JSON.stringify(all));
