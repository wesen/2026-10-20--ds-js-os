import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {crc32} from 'node:zlib';

const [stage]=process.argv.slice(2);
const root=join(stage,'tree/picocalc-os');
const compiler=join(root,'compiler');
const data=readFileSync(join(root,'worlds/raytrace/raytrace.typed'),'utf8');
const sha=a=>createHash('sha256').update(a).digest('hex');
const slot=readFileSync(join(stage,'build/esp-idf/main/candela-slot.elf'));
const arms=[[0,'stock',join(compiler,'typed-rv32.js')],[8,'prior-matched',join(stage,'arms/MATCHED')]];
for (const [i,key] of ['CHECK_STACK','HOIST_STACK','CHECK_REG','HOIST_REG','SKIP_REG'].entries())
    arms.push([9+i,key,join(stage,'factor-backends',key+'.js')]);
const results=[];
for (const [id,name,path] of arms) {
    const ctx=createContext({});
    const backend=readFileSync(path);
    for(const file of [join(compiler,'typed-wasm.js'),path,join(compiler,'raytrace.js')])
        runInContext(readFileSync(file,'utf8'),ctx);
    const rv=ctx.typedRv32.compile(data),elf=ctx.linkTypedRay(data,slot);
    results.push({id,name,sourceSHA:sha(data),sourceBytes:data.length,backendSHA:sha(backend),rvBytes:rv.image.length,
        nativeSHA:sha(rv.image),elfBytes:elf.length,elfSHA:sha(elf),elfCRC:crc32(elf).toString(16).padStart(8,'0')});
}
console.log(JSON.stringify(results,null,2));
