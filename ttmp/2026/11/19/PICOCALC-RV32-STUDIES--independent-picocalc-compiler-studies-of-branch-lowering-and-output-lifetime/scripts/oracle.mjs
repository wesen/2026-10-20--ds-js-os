import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const work = process.argv[2], built=join(work, 'build/esp-idf/main');
const source=readFileSync(join(built,'editor.typed')), reactor=readFileSync(join(built,'typed-world-reactor.elf'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lanes={};
for(const lane of ['base','branch','compact','direct','pb','pd']){
    const ctx=vm.createContext({outputPhase(){}});
    for(const name of ['wasm','rv32','world']){
        const file=join(work,'lanes',lane,'typed',name+'.js');
        vm.runInContext(readFileSync(file,'utf8'),ctx,{filename:file});
    }
    const image=ctx.compileTypedWorldRv32(source.toString(),new Uint8Array(reactor));
    lanes[lane]={size:image.length,sha256:sha(image)};
}
if(['compact','direct','pb','pd'].some(x=>lanes[x].sha256!==lanes.base.sha256) ||
    lanes.base.sha256===lanes.branch.sha256) throw Error('unexpected output equivalence');
console.log(JSON.stringify({source:sha(source),reactor:sha(reactor),lanes}));
