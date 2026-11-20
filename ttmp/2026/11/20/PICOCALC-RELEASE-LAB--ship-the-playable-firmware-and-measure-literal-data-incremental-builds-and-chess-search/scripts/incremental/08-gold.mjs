import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {crc32} from 'node:zlib';
const dir=process.argv[2],r=vm.createContext({});
for(const name of ['typed-wasm','typed-async','typed-rv32','typed-world'])
    vm.runInContext(readFileSync(path.join(dir,name+'.js'),'utf8'),r);
vm.runInContext(readFileSync(new URL('04-edits.js',import.meta.url),'utf8'),r);
const gold={};
for(const app of ['editor','chess']) {
    const edits=r.incrementalEdits(app,readFileSync(path.join(dir,app+'.typed'),'utf8')),elf=readFileSync(path.join(dir,app+'.elf'));
    gold[app]={};
    for(const [k,text] of Object.entries(edits))if(k!=='bad')gold[app][k]=crc32(r.compileTypedWorldRv32(text,elf));
}
writeFileSync(path.join(dir,'gold.json'),JSON.stringify(gold));
