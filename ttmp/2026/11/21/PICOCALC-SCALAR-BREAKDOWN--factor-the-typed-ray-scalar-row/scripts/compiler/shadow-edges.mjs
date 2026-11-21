import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {runRv32} from '../../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
const [file,backend,out]=process.argv.slice(2),source=readFileSync(file,'utf8');
function compiler(p){
    const c=createContext({});
    for(const f of ['picocalc-os/compiler/typed-wasm.js',p])runInContext(readFileSync(f,'utf8'),c);
    return c;
}
const baseline=compiler('picocalc-os/compiler/typed-rv32.js'),backendCtx=compiler(backend);
const w=new WebAssembly.Instance(new WebAssembly.Module(baseline.typedWasm.compile(source).bytes)).exports;
const images=[baseline,backendCtx].map(v=>v.typedRv32.compile(source));
assert(!Buffer.from(images[0].image).equals(Buffer.from(images[1].image)));
const edit=source.replace('if (value < 0) return -value;','if (value < 0) return 42;');
assert.notEqual(edit,source);
assert(Buffer.from(baseline.typedRv32.compile(edit).image).equals(Buffer.from(backendCtx.typedRv32.compile(edit).image)));
const arena=new Uint8Array(w.memory.buffer,0,8192),dv=new DataView(arena.buffer);
arena.fill(0xa5);const ptr=64;
dv.setUint32(ptr,2048,true);dv.setUint16(ptr+4,0,true);assert.equal(w.typedRayPrepare(ptr,68,61,31,25),1);
const clean=arena.slice(),summary=[];
for(const [capacity,count,x,y] of [
    [2048,3,80,80],[33,3,80,80],[32,3,80,80],[32,3,0,0],[32,0,-2147483648,2147483647],
    [20,0,80,80],[19,0,80,80],[18,3,80,80],[17,3,80,80],[0,0,80,80],
    [33,4,80,80],[50,4,80,80],[33,65535,0,0],[2048,0,80,80],[33,3,2147483647,-2147483648]
]){
    arena.set(clean);dv.setUint32(ptr,capacity,true);dv.setUint16(ptr+4+2*16,count,true);
    const initial=arena.slice();let result,trap=false;
    try{result=w.typedRayInShadow(ptr,x,y);}catch(e){if(!(e instanceof WebAssembly.RuntimeError))throw e;trap=true;}
    const counts=[];
    for(const image of images){
        const r=runRv32(image,'typedRayInShadow',[ptr,x,y],[],{},initial,undefined,500000);
        assert.equal(r.trap,trap);assert.equal(r.result,result);
        assert(Buffer.from(r.bytes).equals(arena));
        counts.push(r.steps);
    }
    summary.push({capacity,count,x,y,trap,result,retired:counts});
}
const receipt={images:images.map(p=>({bytes:p.image.length,sha256:createHash('sha256').update(p.image).digest('hex')})),pureCalleeEditRejected:true,summary};
writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');console.log(receipt.images,summary.length);
