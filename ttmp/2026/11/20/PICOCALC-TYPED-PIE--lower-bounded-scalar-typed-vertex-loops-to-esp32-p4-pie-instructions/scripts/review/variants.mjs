import assert from 'node:assert/strict';
import {runRv32} from './run-rv32.mjs';
import {decode} from './decode.mjs';

export function variants(rv32,wasmCompiler,prefix) {
    function source(body, options = {}) {
        const init = options.init ?? 'let i=0', update=options.update ?? 'i=i+1';
        return 'function kernel(src:buffer,dst:buffer,n:i32):i32 {'+
            (options.before ?? '')+'for ('+init+';i<n;'+update+'){'+body+'}'+
            (options.suffix ?? 'return n;')+'}';
    }
    const read = 'const x=src.charCodeAt(i)%256;';
    const store = expr => 'dst.setCharCodeAt(i,'+expr+');';
    const normal = read+store('x');
    const list = [];
    for (const k of [1,2,3,4,5,7,8,9,15,16])
        list.push(['mul-'+k,source(read+store('(x-128)*'+k)),true]);
    for (const m of [2,4,128,256,2048,4096,32768])
        list.push(['mask-'+m,source('const x=src.charCodeAt(i)%'+m+';'+store('x')),true]);
    list.push(
        ['renamed',source(normal).replaceAll('src','points').replaceAll('dst','screen'),true],
        ['s16-lower-limit',source(read+store('x-32767-1')),true],
        ['s16-upper-limit',source(read+store('32512+x')),true],
        ['positive-intermediate-overflow',source(read+store('32767+x-x')),false],
        ['negative-intermediate-overflow',source(read+store('x-32767-2+x')),false],
        ['i32-narrow-at-store',source(read+store('2147483647+x')),false],
        ['raw-u16',source('const x=src.charCodeAt(i);'+store('x/2')),false],
        ['nonpower-mod',source('const x=src.charCodeAt(i)%257;'+store('x')),false],
        ['mutable-induction',source('i=src.charCodeAt(i)%256;'+store('i')),false],
        ['shifted-read',source('const x=src.charCodeAt(i+1)%256;'+store('x')),false],
        ['shifted-write',source(read+'dst.setCharCodeAt(i+1,x);'),false],
        ['start-one',source(normal,{init:'let i=1'}),false],
        ['stride-two',source(normal,{update:'i=i+2'}),false],
        ['prior-iteration',source(read+'s=s+x;'+store('s'),{before:'let s=0;'}),false],
        ['early-exit',source(read+'if(x>99){break;}'+store('x')),false],
        ['call-in-body',source(read+store('bias(x)'))+'function bias(a:i32):i32{return a+1;}',false],
        ['count-preserved',source(normal,{suffix:'return n*2+7;'}),true],
        ['live-index-after-loop','function kernel(src:buffer,dst:buffer,n:i32):i32 {let i=0;while(i<n){'+normal+'i=i+1;}return i;}',true]
    );
    const seeds = [9,1,15,7,65535,32768,255,256,32767,0,65280,3,17];
    const outcomes=[];
    for (const [label,src,select] of list) {
        const wasm=new WebAssembly.Instance(new WebAssembly.Module(wasmCompiler.compile(src).bytes)).exports;
        const ordinary=rv32.compile(src);
        const options=[{pie:true},{piePortable:true}];
        for (const opt of options) {
            const candidate=rv32.compile(src,[],undefined,opt);
            const edited = !Buffer.from(ordinary.image).equals(Buffer.from(candidate.image));
            assert.equal(edited,select,label+' specialization');
            const instructions=select && opt.pie ? decode(candidate.image,prefix) : undefined;
            for (const n of [0,7,8,9,17,24]) {
                const bytes=new Uint8Array(256).fill(0xa5), memory=new DataView(bytes.buffer);
                const [a,b]=[12,140];
                for (const p of [a,b]) memory.setUint32(p,32,true);
                for (let i=0;i<32;i++) memory.setUint16(a+4+i*2,seeds[i%seeds.length],true);
                const image=new Uint8Array(wasm.memory.buffer,0,bytes.length);
                image.set(bytes);
                let result, trap=false;
                try { result=wasm.kernel(a,b,n); }
                catch(err) {
                    if (!(err instanceof WebAssembly.RuntimeError)) throw err;
                    trap=true;
                }
                const actual=runRv32(candidate,'kernel',[a,b,n],[],{},bytes,instructions);
                assert.equal(actual.result,result,label+' return');
                assert.equal(actual.trap,trap,label+' trap');
                assert.deepEqual(actual.bytes,image,label+' memory');
                assert.equal(actual.packed.stores>0,Boolean(opt.pie && select && n>=8),label+' packed path');
                if (label==='mutable-induction' && n===8) {
                    assert.equal(memory.getUint16(b+4+2*9,true),0xa5a5);
                    assert.equal(new DataView(actual.bytes.buffer).getUint16(b+4+2*9,true),9);
                }
            }
        }
        outcomes.push([label,select]);
    }
    const frame=[];
    for (const k of [498,499,500,501]) {
        const body=Array.from({length:k},(_,i)=>'const v'+i+'=1;').join('');
        const src=source(normal,{suffix:body+'return n;'});
        const compile=(opt)=>{
            try{return rv32.compile(src,[],undefined,opt).image.length;}
            catch(e){return e.message;}
        };
        const values=[{}, {pie:true}, {piePortable:true}].map(compile);
        for (const value of values.slice(1)) {
            if (typeof values[0]==='number') assert.equal(typeof value,'number','frame '+k);
            else assert.equal(value,values[0],'original frame diagnostic');
        }
        frame.push([k,...values]);
    }
    return {programs:list.length,executions:list.length*12,outcomes,frame};
}
