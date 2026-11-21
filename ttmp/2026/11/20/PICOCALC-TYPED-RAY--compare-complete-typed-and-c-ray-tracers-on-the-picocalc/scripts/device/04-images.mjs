import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {join} from 'node:path';
const [stage]=process.argv.slice(2);
const root=join(stage,'tree/picocalc-os'),arms=join(stage,'arms');
const load=path=>readFileSync(path,'utf8');
const sha=xs=>createHash('sha256').update(xs).digest('hex');
const slot=readFileSync(join(stage,'build/esp-idf/main/candela-slot.elf'));
const rows=[];
for(const [id,source,backend] of [
    [0,'main','stock'],[1,'main','typed-rv32-div.js'],[2,'spans.typed','stock'],[3,'spans.typed','typed-rv32-div.js'],
    [4,'main','PACKED'],[5,'main','INFERRED'],[6,'spans-and-shadow.typed','stock'],[7,'spans-and-shadow.typed','typed-rv32-div.js'],[8,'main','MATCHED'],
]){
    const ctx=createContext({});
    const rv=backend==='stock'?join(root,'compiler/typed-rv32.js'):join(arms,backend);
    for(const file of [join(root,'compiler/typed-wasm.js'),rv,join(root,'compiler/raytrace.js')])runInContext(load(file),ctx);
    const text=load(source==='main'?join(root,'worlds/raytrace/raytrace.typed'):join(arms,source));
    const program=ctx.typedRv32.compile(text), elf=ctx.linkTypedRay(text,slot);
    rows.push({id,sourceBytes:text.length,sourceSHA:sha(text),backendSHA:sha(load(rv)),textBytes:program.image.length,textSHA:sha(program.image),ELFBytes:elf.length,ELFSHA:sha(elf)});
}
console.log(JSON.stringify(rows,null,2));
