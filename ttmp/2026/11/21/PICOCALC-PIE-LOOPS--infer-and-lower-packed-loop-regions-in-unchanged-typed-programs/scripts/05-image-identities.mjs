import {createContext,runInContext} from 'node:vm';
import {readFileSync as read} from 'node:fs';
import {createHash} from 'node:crypto';
import {crc32} from 'node:zlib';
import {join} from 'node:path';
const [stage,out]=process.argv.slice(2), os=join(stage,'tree/picocalc-os');
const src=read(join(os,'worlds/raytrace/raytrace.typed'),'utf8');
const slot=read(join(stage,'build/esp-idf/main/candela-slot.elf'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const images=[];
for(const [id,file] of [[0,join(os,'compiler/typed-rv32.js')],[8,join(out,'scalar.js')],[5,join(out,'pie.js')]]){
    const ctx=createContext({});
    for(const js of [join(os,'compiler/typed-wasm.js'),file,join(os,'compiler/raytrace.js')])
        runInContext(read(js,'utf8'),ctx);
    const image=ctx.typedRv32.compile(src).image,elf=ctx.linkTypedRay(src,slot);
    images.push({id,bytes:image.length,source:digest(src),image:digest(image),elf:digest(elf),
        crc:crc32(elf).toString(16).padStart(8,'0')});
}
console.log(JSON.stringify(images,null,2));
