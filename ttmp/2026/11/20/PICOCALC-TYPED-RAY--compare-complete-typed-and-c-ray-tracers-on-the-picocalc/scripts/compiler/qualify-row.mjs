// Model the vendor-decoded operator words independently of their emitter. Validate
// entire addressed memory on successful, fallback and partially trapped calls.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {decode} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';
import {runRv32} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
const [prefix,source,explicit,inferred,matched,output]=process.argv.slice(2);
const read=p=>readFileSync(p,'utf8'),sha=b=>createHash('sha256').update(b).digest('hex');
const src=read(source);
const orig='picocalc-os/compiler/typed-rv32.js';
const front=read('picocalc-os/compiler/typed-wasm.js');
const compilers={};
const images={};
const report={sourceSHA256:sha(src),images:{},scenes:[],edges:[]};
for (const [name,back] of Object.entries({stock:orig,explicit,inferred,matched})){
    const ctx=createContext({}); runInContext(front,ctx);runInContext(read(back),ctx);
    const c=ctx.typedRv32;
    compilers[name]=c;
    const image=c.compile(src);
    assert.equal(sha(image.image),sha(c.compile(src,[],undefined,{streamFunctions:false}).image));
    images[name]=image;
    report.images[name]={bytes:image.image.length,sha256:sha(image.image),backendSHA256:sha(read(back))};
}
assert.equal(sha(images.explicit.image),sha(images.inferred.image));
assert.equal(images.explicit.image.length-images.stock.image.length,380);
const altered=src.replace('520 + discriminant','521 + discriminant');
const renamed=src.replaceAll('typedRayComputeRow','otherComputeRow');
for(const mode of ['explicit','inferred','matched']){
    assert.equal(sha(compilers[mode].compile(altered).image),sha(compilers.stock.compile(altered).image));
    const want=mode==='inferred'?images.inferred:images.stock;
    assert.equal(sha(compilers[mode].compile(renamed).image),sha(want.image));
}
const vm=createContext({});runInContext(front,vm);
const wasm=new WebAssembly.Instance(new WebAssembly.Module(vm.typedWasm.compile(src).bytes)).exports;
const arena=new Uint8Array(wasm.memory.buffer,0,8192),mem=new DataView(arena.buffer);
const decoded=decode(images.explicit.image,prefix);
report.pie=Array.from(decoded.values()).filter(v=>v.op.startsWith('esp.')).map(v=>v.op);
assert.deepEqual(report.pie,['esp.vldbc.16.ip','esp.vld.128.ip','esp.vsub.s16','esp.vst.128.ip']);
const modes=['stock','matched','explicit']; // inferred emits identical words, verified above
function check(pointer,y,initial,stats){
    arena.set(initial);
    let trap=false,result;
    try { result=wasm.typedRayComputeRow(pointer,y); }
    catch(e){if(!(e instanceof WebAssembly.RuntimeError)) throw e; trap=true;}
    const bytes=arena.slice();
    for(const mode of modes){
        const run=runRv32(images[mode],'typedRayComputeRow',[pointer,y],[],{},initial,mode==='explicit'?decoded:undefined,600000);
        assert.equal(run.trap,trap,mode+' trap');
        assert.equal(run.result,result,mode+' return');
        if(!Buffer.from(run.bytes).equals(bytes)) throw Error('mismatched work arena '+mode+' at y='+y);
        stats[mode]=(stats[mode]??0)+run.steps;
        if(mode==='explicit') stats.packets=(stats.packets??0)+run.packed.stores;
    }
    return trap;
}
function prepare(pointer,pose){
    arena.fill(0xa5);mem.setUint32(pointer,2048,true);mem.setUint16(pointer+4,0,true);
    assert.equal(wasm.typedRayPrepare(pointer,...pose),1);
    return arena.slice();
}
for (const pose of [[68,61,31,25],[76,61,31,17],[127,32,159,0]]){
    const pointer=64;
    const initial=prepare(pointer,pose);
    const stats={pose};
    for(let y=0;y<160;y++) assert.equal(check(pointer,y,initial,stats),false);
    report.scenes.push(stats);
}
for(const [name,pointer,y,capacity,mod] of [
    ['zero-count',64,61,2048,[[16,0]]],['short-trap-after-writes',64,61,1710,[]],
    ['negative-y',64,-1,2048,[]],['i32-min-y',64,-2147483648,2048,[]],['large-count',64,61,2048,[[16,4]]],
    ['large-center',64,61,2048,[[2,65535]]],['large-radius',64,61,2048,[[4,65535]]],
    ['u16-squares-and-roots',64,61,2048,[[40,65535],[41,32768],[42,32767],[43,0],[1196,65535]]],
    ['payload-already-aligned',76,61,2048,[]],['alternate-alignment',68,61,1865,[]]
]){
    const initial=prepare(pointer,[68,61,31,25]),dv=new DataView(initial.buffer);
    dv.setUint32(pointer,capacity,true);
    for(const [cell,value] of mod) dv.setUint16(pointer+4+2*cell,value,true);
    const stats={name};
    stats.trap=check(pointer,y,initial,stats);report.edges.push(stats);
}
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
