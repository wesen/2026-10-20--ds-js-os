// Run from the repository root. PREFIX is the ESP toolchain prefix, without a trailing dash.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync, mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {join} from 'node:path';
import {decode} from '../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';
import {runRv32} from '../../../20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';
const [prefix,out,which='rows']=process.argv.slice(2);
assert(prefix && out); mkdirSync(out,{recursive:true});
const realm=createContext({});
for(const name of ['typed-wasm','typed-rv32','typed-pie-loops'])
    runInContext(read('picocalc-os/compiler/'+name+'.js','utf8'),realm);
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=read('picocalc-os/worlds/raytrace/raytrace.typed','utf8');
const modes=['stock','scalar','pie'];
function compile(src) {
    const bytes=realm.typedWasm.compile(src).bytes;
    if (which==='frames') {
        // The production standalone fixture declares one page maximum. Change
        // just that limit in the oracle to accommodate three 320-stride planes.
        let at=8;
        while(at<bytes.length){
            const id=bytes[at++];let size=0,shift=0,b;
            do {b=bytes[at++];size+=(b&127)*2**shift;shift+=7;} while(b&128);
            if(id===5){assert.deepEqual([...bytes.slice(at,at+size)],[1,1,1,1]);bytes[at+3]=7;break;}
            at+=size;
        }
    }
    const wasm=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
    const images=modes.map(mode=>realm.typedRv32.compile(src,[],undefined,{pieLoops:mode==='stock'?undefined:mode}));
    const dis=decode(images[2].image,prefix);
    return {wasm,images,dis};
}
const ray=compile(source);
const render=ray.wasm;
const cases=[];
function compare(progs,name,args,initial,counts={}) {
    const mem=new Uint8Array(progs.wasm.memory.buffer,0,initial.length);
    mem.set(initial);
    let trapped=false,expected;
    try {expected=progs.wasm[name](...args);} catch(e){if(!(e instanceof WebAssembly.RuntimeError))throw e; trapped=true;}
    for(const [idx,mode] of modes.entries()) {
        const r=runRv32(progs.images[idx],name,args,[],{},initial,mode==='pie'?progs.dis:undefined,80_000_000);
        assert.equal(r.trap,trapped,name+' '+mode); assert.equal(r.result,expected,name+' return '+mode);
        assert(Buffer.from(r.bytes).equals(mem),name+' memory '+mode);
        counts[mode]=(counts[mode]??0)+r.steps;
        if(mode==='pie') counts.packets=(counts.packets??0)+r.packed.stores;
    }
    return trapped;
}
const prepared=(addr,pose)=>{
    const mem=new Uint8Array(render.memory.buffer,0,8192); mem.fill(0xa5);
    const d=new DataView(mem.buffer);d.setUint32(addr,2048,true);d.setUint16(addr+4,0,true);
    assert.equal(render.typedRayPrepare(addr,...pose),1);return mem.slice();
};
const pose=[68,61,31,25];
if(which==='rows'){
    const input=prepared(64,pose), total={};
    for(let y=0;y<160;y++) assert(!compare(ray,'typedRayComputeRow',[64,y],input,total));
    assert(total.packets>0);cases.push({name:'ordinary pose, all rows',...total});
    for(const [label,p,y,capacity,fields] of [
        ['partially written short output',64,61,1710,[]],['misaligned peel',68,61,2048,[]],
        ['already aligned',76,61,2048,[]],['wrapped signed calculation',64,-2147483648,2048,[]],
        ['source overlaps depth for extra sphere',64,61,2048,[[16,12]]],
        ['full unsigned input',64,61,2048,[[40,65535],[41,32768],[42,32767],[43,0]]]
    ]){
        const initial=prepared(p,pose),d=new DataView(initial.buffer);
        d.setUint32(p,capacity,true);for(const [i,v] of fields)d.setUint16(p+4+2*i,v,true);
        const counts={};const trap=compare(ray,'typedRayComputeRow',[p,y],initial,counts);cases.push({name:label,trap,...counts});
    }
    const src=read(new URL('./02-transfer.typed',import.meta.url),'utf8');
    const sample=compile(src);const counts={};
    const init=new Uint8Array(1024), dv=new DataView(init.buffer);
    for(const p of [64,68,76]) for(const n of [0,1,7,8,9,16,21,80]) for(const cap of [0,5,32766,32767,-1,0x7fffffff]){
        dv.setUint32(p,128,true);
        for(let k=0;k<128;k++)dv.setUint16(p+4+2*k,[0,1,4,32766,32767,32768,65535][k%7],true);
        compare(sample,'headroom',[p,1,n,cap],init,counts);
    }
    assert(counts.packets>0);cases.push({name:'transfer on 144 combinations',...counts});
    // Output buffer aliases the input, including a one-cell shift and a short late trap.
    const stores=src.replace('first: i32','out: buffer, first: i32').replace('total = total + remaining;', 'out.setCharCodeAt(bin + 1, remaining);');
    const stored=compile(stores);
    for(const [dst,capacity] of [[64,80],[320,80],[320,5],[44,80]]){
        const arr=new Uint8Array(1024),view=new DataView(arr.buffer);
        view.setUint32(64,80,true);view.setUint32(dst,capacity,true);
        const counts={};const trap=compare(stored,'headroom',[64,dst,0,32,100],arr,counts);
        cases.push({name:'aliased or short destination',dst,capacity,trap,...counts});
    }
    for(const changed of [
        src.replace('bin = bin + 1','bin = bin + 2'),
        src.replace('if (remaining >= 0)', 'if (remaining >= 1)'),
        src.replace('let total = 0;', 'let base = first; let total = 0;').replace('first + bin', 'base + bin').replace('total = total + remaining;', 'base = base + remaining;'),
        stores.replace('bin + 1, remaining','remaining, remaining'),
        src.replace('bin < limit','bin < 5')
    ]) {
        const rejected=compile(changed);assert.equal(sha(rejected.images[0].image),sha(rejected.images[2].image));
    }
    const disasm=[...ray.dis].filter(([pc])=>pc>=ray.images[2].entries.typedRayComputeRow && pc<ray.images[2].entries.typedRayInShadow);
    writeFileSync(join(out,'vendor-row.txt'),disasm.map(([pc,r])=>
        pc.toString(16).padStart(6,'0')+'  '+r.word.toString(16).padStart(8,'0')+'  '+(r.op+' '+r.args.join(',')).trimEnd()).join('\n')+'\n');
} else if(which==='frames') {
    const prior='ttmp/2026/11/20/PICOCALC-TYPED-RAY--compare-complete-typed-and-c-ray-tracers-on-the-picocalc';
    execFileSync('cc',['-O2','-std=c11','-Ipicocalc-os/nucleus',prior+'/scripts/renderer/01-reference.c','picocalc-os/nucleus/raytrace_demo.c','-o',join(out,'reference')]);
    const scenes=JSON.parse(execFileSync(join(out,'reference'),[out],{encoding:'utf8'}));
    render.memory.grow(6);
    for(const {name,scene,stride} of scenes) {
        const cap=stride*160;
        for(const audit of [false,true]) {
            let end=64;const capacities=audit?[cap,cap,cap,2048]:[cap,2048];
            const addr=capacities.map(c=>{const ptr=end;end+=4+2*c+8;return ptr;});
            const initial=new Uint8Array(end).fill(0xa5), d=new DataView(initial.buffer);
            addr.forEach((p,i)=>d.setUint32(p,capacities[i],true));d.setUint16(addr.at(-1)+4,stride,true);
            const counts={};
            assert(!compare(ray,audit?'typedRayRender':'typedRayFrame',[...addr,...scene],initial,counts));
            for(const [i,suffix] of (audit?['color','depth','id']:['color']).entries()) {
                const gold=read(join(out,name+'.'+suffix)).subarray(2,-2);
                assert(gold.equals(new Uint8Array(render.memory.buffer,addr[i]+4,2*cap)),name+' '+suffix);
            }
            cases.push({name,audit,...counts});console.error(name,audit,counts.packets);
        }
    }
} else throw Error('expected rows or frames');
writeFileSync(join(out,which+'.json'),JSON.stringify({sourceSHA:sha(source),
    images:modes.map((mode,i)=>({mode,bytes:ray.images[i].image.length,sha256:sha(ray.images[i].image)})),cases},null,2)+'\n');
