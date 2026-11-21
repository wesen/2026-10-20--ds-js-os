// Differential row execution plus actual access/opcode counters in the independent RV32 interpreter.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const [typed,dir,out]=process.argv.slice(2);
const modelDir=resolve('ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review');
const source=readFileSync(typed,'utf8');
const wasmSource=readFileSync('picocalc-os/compiler/typed-wasm.js','utf8');
const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
const compiler=backend=>{
    const ctx=createContext({});runInContext(wasmSource,ctx);runInContext(readFileSync(backend,'utf8'),ctx);
    return ctx;
};
const stock=compiler('picocalc-os/compiler/typed-rv32.js');
const bins={stock:stock.typedRv32.compile(source)};
for(const name of Object.keys(manifest.variants)){
    const c=compiler(join(dir,name+'.js')).typedRv32;
    bins[name]=c.compile(source);
    const edit=source.replace('520 + discriminant','521 + discriminant');
    assert(Buffer.from(c.compile(edit).image).equals(Buffer.from(stock.typedRv32.compile(edit).image)));
}
let model=readFileSync(join(modelDir,'run-rv32.mjs'),'utf8').replace("'./packed.mjs'",JSON.stringify(pathToFileURL(join(modelDir,'packed.mjs')).href));
const anchor='        let next = at + 4;';
assert.equal(model.split(anchor).length,2);
model=model.replace(anchor,`        const counter=globalThis.scalarRowCounters;
        const pointer=args[0];
        if(op===0x03 || op===0x23){
            const addr=a+(op===0x03?imm:signed12((f7<<5)|rd));
            if(((w>>>15)&31)===2) counter[op===0x03?'stackLoads':'stackStores']++;
            if(op===0x03 && f3===5 && addr>=pointer+84 && addr<pointer+1044)counter.horizontal++;
        }
        if(op===0x63){
            counter.branches++;
            if(at+4<code.byteLength && code.getUint32(at+4,true)===0x00100073)counter.boundsTests++;
        }
        `+anchor);
const {runRv32}=await import('data:text/javascript;base64,'+Buffer.from(model).toString('base64'));
const wasm=new WebAssembly.Instance(new WebAssembly.Module(stock.typedWasm.compile(source).bytes)).exports;
const arena=new Uint8Array(wasm.memory.buffer,0,8192),dv=new DataView(arena.buffer);
function prepare(ptr,pose){
    arena.fill(0xa5);dv.setUint32(ptr,2048,true);dv.setUint16(ptr+4,0,true);
    assert.equal(wasm.typedRayPrepare(ptr,...pose),1);
    return arena.slice();
}
const blank=()=>({retired:0,stackLoads:0,stackStores:0,branches:0,boundsTests:0,horizontal:0});
function check(ptr,y,initial,summary){
    arena.set(initial);let result,trap=false;
    try{result=wasm.typedRayComputeRow(ptr,y);}catch(e){if(!(e instanceof WebAssembly.RuntimeError))throw e;trap=true;}
    const gold=arena.slice();
    for(const [name,bin] of Object.entries(bins)){
        const stats=summary[name]??=blank();globalThis.scalarRowCounters=stats;
        const r=runRv32(bin,'typedRayComputeRow',[ptr,y],[],{},initial,undefined,650000);
        assert.equal(r.trap,trap,name+' trap');
        assert.equal(r.result,result,name+' status');
        assert(Buffer.from(r.bytes).equals(gold),name+' complete arena y='+y);
        stats.retired+=r.steps;
    }
    return trap;
}
const report={sourceSHA256:manifest.sourceSHA256,scenes:[],edgeCases:[]};
for(const pose of [[68,61,31,25],[127,32,0,159],[100,65,80,80]]){
    const initial=prepare(64,pose),counts={};
    for(let y=0;y<160;y++) assert.equal(check(64,y,initial,counts),false);
    for(const name of ['stock','checked-stack','hoisted-stack','checked-register','hoisted-register'])
        assert.equal(counts[name].horizontal,76800);
    assert.equal(counts.skip.horizontal,26400);
    assert.equal(counts['checked-register'].boundsTests,counts.stock.boundsTests);
    assert.equal(counts['hoisted-stack'].boundsTests,0);
    assert.equal(counts['hoisted-register'].boundsTests,0);
    report.scenes.push({pose,counts});
}
for(const [label,ptr,y,size,mods] of [
    ['zero',64,61,2048,[[16,0]]],['short-partial-trap',64,61,1710,[]],
    ['negative-y',64,-1,2048,[]],['min-int-y',64,-2147483648,2048,[]],
    ['count-fallback',64,61,2048,[[16,4]]],['center-fallback',64,61,2048,[[2,65535]]],
    ['radius-fallback',64,61,2048,[[4,65535]]],['wide-payloads',64,61,2048,[[40,65535],[41,32768],[42,32767],[43,0],[1196,65535]]],
    ['min-capacity',76,61,1865,[]],['capacity-before-min',68,61,1864,[]]
]){
    const initial=prepare(ptr,[68,61,31,25]),view=new DataView(initial.buffer);
    view.setUint32(ptr,size,true);for(const [i,v] of mods)view.setUint16(ptr+4+2*i,v,true);
    const counts={},trap=check(ptr,y,initial,counts);
    report.edgeCases.push({label,trap,counts});
}
writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.scenes[0]));
