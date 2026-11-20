// Hash the exact raw and fully linked outputs produced by the four compiler configurations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
const work = process.argv[2];
const build = join(work,'build/esp-idf/main');
const world = join(work,'tree/picocalc-os/worlds');
const sha = data=>createHash('sha256').update(data).digest('hex');
const apps = {
    files: [readFileSync(join(world,'files/files.typed'),'utf8'),'files-reactor.elf','compileFilesRv32'],
    agenda: [['reminder.typed','entry.typed'].map(f=>readFileSync(join(world,'agenda',f),'utf8')).join('\n'),'agenda-reactor.elf','compileAgendaRv32'],
    editor: [readFileSync(join(build,'editor.typed'),'utf8'),'typed-world-reactor.elf','compileTypedWorldRv32'],
};
const sources = {}, outputs = {};
for(const [app,[source,elf,entry]] of Object.entries(apps)){
    const reactor=readFileSync(join(build,elf));
    sources[app]={sourceSha256:sha(source),reactorSha256:sha(reactor),sourceBytes:Buffer.byteLength(source)};
    const result=outputs[app]={};
    for(const lane of ['base','branch','compact','both']){
        const ctx=vm.createContext({});
        for(const file of ['typed/wasm.js','typed/rv32.js','typed/world.js','agenda/compile.js','files/compile.js']){
            vm.runInContext(readFileSync(join(work,'lanes',lane,file),'utf8'),ctx,{filename:file});
        }
        const compile=ctx.typedRv32.compile;
        let raw;
        ctx.typedRv32.compile=(...args)=>{
            const program=compile(...args);
            const {image,...metadata}=program;
            raw={words:image.length/4,raw:sha(image),metadata:sha(JSON.stringify(metadata))};
            return program;
        };
        const input=new Uint8Array(reactor);
        const image=ctx[entry](source,input);
        assert.deepEqual(Buffer.from(input),reactor);
        const recorded={...raw,sha256:sha(image),bytes:image.length};
        const buffered=ctx[entry](source,input,{streamFunctions:false});
        assert.deepEqual(Buffer.from(image),Buffer.from(buffered));
        assert.deepEqual({...raw,sha256:sha(buffered),bytes:buffered.length},recorded);
        result[lane]=recorded;
    }
    assert.deepEqual(result.base,result.compact);
    assert.deepEqual(result.branch,result.both);
    assert.notEqual(result.base.sha256,result.both.sha256);
}
console.log(JSON.stringify({sources,outputs},null,2));
