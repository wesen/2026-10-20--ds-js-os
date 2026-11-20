// Replay the unchanged Wasm fixtures and capture their actual production SCREEN callback.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
const [fixture,out]=process.argv.slice(2);
let src=readFileSync(fixture,'utf8');
const end=src.indexOf('function runRv32(');if(end<0)throw Error('host fixture changed');
src=src.slice(0,end).replace("const [cc, emu, only] = process.argv.slice(2);","const cc='unused', emu='unused';");
src=src.replaceAll("../../../../../../picocalc-os/compiler/",pathToFileURL(process.cwd()+'/picocalc-os/compiler/').href);
src+=`
const collected=[];
try {
  for(const f of fixtures) {
    let label='',pending=null;
    for(const line of runWasm(f)) {
        if(line.startsWith('event '))label=line.slice(6);
        if(line.startsWith('screen '))pending=JSON.parse(line.slice(7));
        if(line.startsWith('hints ') && pending) {
            collected.push({id:f.name+'/'+label,app:'editor',title:'Editor',tree:pending,hints:line.slice(6)});
            pending=null;
        }
    }
  }
  writeFileSync(`+JSON.stringify(out)+`,collected.map(x=>JSON.stringify(x)).join('\\n')+'\\n');
} finally { rmSync(tmp,{recursive:true,force:true}); }
`;
await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
