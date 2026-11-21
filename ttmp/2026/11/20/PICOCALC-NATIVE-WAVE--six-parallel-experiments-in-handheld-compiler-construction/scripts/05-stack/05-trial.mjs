import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import {makeCompiler} from './03-emit.mjs';
import {check,checkedSlot} from './04-check.mjs';
const [stage,out]=process.argv.slice(2);
const stock=makeCompiler(false),cert=makeCompiler(true),rows={applications:{},negative:[],development:[]};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const median=arr=>[...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)];
function measure(fn){const then=performance.now(),result=fn();return [result,performance.now()-then];}
for(const app of ['editor','chess']){
    const src=fs.readFileSync(path.join(stage,app+'.typed'),'utf8'),elf=fs.readFileSync(path.join(stage,app+'.elf'));
    const comp={stock,cert}, samples={stock:[],cert:[],checker:[]};
    let summary;
    for(let i=0;i<8;i++)for(const arm of i%2?['cert','stock']:['stock','cert']){
        const c=comp[arm];
        const [{p,bytes},ms]=measure(()=>{
            const p=c.typedRv32.compile(src,c.typedWorld.imports,96*1024);
            return {p,bytes:c.typedRv32.linkSlot(p,elf,c.typedWorld.entries)};
        });
        if(i)samples[arm].push(ms);
        const reference=stock.compileTypedWorldRv32(src,elf);
        assert.deepEqual(Buffer.from(bytes),Buffer.from(reference));
        if(arm==='cert'){
            const [bounds,checkMs]=measure(()=>{
                const slot=checkedSlot(bytes,p.image.length,c.typedWorld.entries,c.typedWorld.imports.map(x=>x.name),p.entries);
                return check(slot.bytes,p.entries,p.certificate,slot.external);
            });
            if(i)samples.checker.push(checkMs);
            const frames=Object.values(bounds),entries=Object.fromEntries(c.typedWorld.entries.map(n=>[n,bounds[n]]));
            summary={functions:frames.length,codeBytes:p.image.length,imageBytes:bytes.length,imageSHA256:hash(bytes),
                certificateBytes:Buffer.byteLength(JSON.stringify(p.certificate)),calls:frames.reduce((a,b)=>a+b.calls.length,0),
                maxFrame:Math.max(...frames.map(f=>f.frame)),entries,all:frames.map(b=>({name:b.name,frame:b.frame,typed:b.typed,external:Object.keys(b.sdk).length}))};
        }
    }
    rows.applications[app]={...summary,samples,medians:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,median(v)]))};
}
const functions='function leaf(x: i32): i32 {return x+1;} function mid(x: i32): i32 {return leaf(x)+leaf(x);} function top(x: i32): i32 {if (x>8) {return mid(x);} return leaf(x);}';
function plain(source){const p=cert.typedRv32.compile(source);const facts=check(p.image,p.entries,p.certificate);return {p,facts};}
let {p,facts}=plain(functions);
assert.equal(facts.leaf.typed,16);assert.equal(facts.mid.typed,32);assert.equal(facts.top.typed,48);
rows.development.push({name:'sequential siblings, nested calls, alternate returns',facts});
for(let i=0;i<12;i++){
    let s='function f0(x: i32): i32 {return x+1;}';
    for(let j=1;j<=i;j++)s+=' function f'+j+'(x: i32): i32 {return f'+(j-1)+'(x);}';
    const q=plain(s);assert.equal(q.facts['f'+i].typed,(i+1)*16);
    rows.development.push({name:'closed chain '+(i+1),expected:(i+1)*16,typed:q.facts['f'+i].typed});
}
const tests={
    'wrong frame':(c)=>c[0].frame+=16,
    'wrong RA slot':(c)=>c[0].raSlot=4,
    'wrong function extent':(c)=>c[0].size-=4,
    'wrong function name':(c)=>c[0].name='other',
    'omitted direct call':(c)=>c[1].calls.pop(),
    'phantom direct call':(c)=>c[0].calls.push({at:8,name:'leaf',external:false}),
    'mistyped callee':(c)=>c[1].calls[0].name='top',
    'wrong call site':(c)=>c[1].calls[0].at+=4,
    'unsupported custom word':(c,v)=>v.setUint32(8,0x0b,true),
    'unsupported compressed instruction':(c,v)=>v.setUint16(8,1,true),
    'dynamic stack assignment':(c,v)=>v.setUint32(8,0x00050113,true),
    'incorrect epilogue':(c,v)=>v.setUint32(c[0].size-8,0x00010113,true),
    'jump into save slot':(c,v)=>v.setUint32(8,0xffdff06f,true),
    'stack store outside frame':(c,v)=>v.setUint32(8,0x00a12823,true),
};
for(const [name,mutate] of Object.entries(tests)){
    const c=structuredClone(p.certificate),image=Uint8Array.from(p.image);mutate(c,new DataView(image.buffer));
    assert.throws(()=>check(image,p.entries,c),e=>{rows.negative.push({name,error:String(e)});return true;});
}
fs.writeFileSync(out,JSON.stringify(rows,null,2)+'\n');
