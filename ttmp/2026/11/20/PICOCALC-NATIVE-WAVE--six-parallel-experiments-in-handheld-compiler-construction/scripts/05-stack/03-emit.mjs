import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
export const compilerDir=path.resolve(here,'../../../../../../../picocalc-os/compiler');
export function makeCompiler(withClaims=true) {
    const ctx=vm.createContext({});
    for (const file of ['typed-wasm.js','typed-async.js','typed-rv32.js','typed-world.js']) {
        let text=fs.readFileSync(path.join(compilerDir,file),'utf8');
        if(withClaims && file==='typed-rv32.js') {
            function patch(a,b) {
                if(text.split(a).length!==2)throw Error('source anchor: '+a);
                text=text.replace(a,()=>b);
            }
            patch('this.words[0] = instruction.i','this.frameClaim = frame;\n        this.words[0] = instruction.i');
            patch('const image = new Uint8Array(words * 4);',`const certificate = code.map((item,i) => ({
        name:functions[i].name, start:4*targets[imported.length+i].at, size:4*item.words.length,
        frame:item.frameClaim, raSlot:item.frameClaim-4,
        calls:item.calls.filter(x => x.rd === RA).map(x => ({
            at:x.from*4, name:callables[targets.indexOf(x.target)].name,
            external:x.target.importIndex !== undefined
        }))
    }));
    const image = new Uint8Array(words * 4);`);
            patch('return {image, entries, records:', 'return {certificate, image, entries, records:');
        }
        vm.runInContext(text,ctx,{filename:file});
    }
    return ctx;
}
