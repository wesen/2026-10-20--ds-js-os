import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function compiler(dir,arm) {
    const ctx=vm.createContext({});
    const prefix={clean:'',global:'candidate-',precise:'selective-'}[arm];
    for(const file of ['typed-wasm.js','typed-async.js','typed-rv32.js','typed-world.js'].map(x=>prefix+x).concat(['02-fragments.js','03-session.js','04-edits.js']))
        vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),ctx,{filename:file});
    return ctx;
}
export function run(c,arm,source,prior=null,elf=null,imports=[]) {
    const session=arm==='clean'?null:(arm==='global'?c.fragmentSession:c.dependencySession)(prior);
    c.activeFragments=session;
    try {
        const start=performance.now();
        const program=elf?null:c.typedRv32.compile(source,imports);
        const bytes=elf?c.compileTypedWorldRv32(source,elf,{asyncSource:true}):program.image;
        const ms=performance.now()-start;
        const meta=JSON.stringify(program?[program.entries,program.signatures,program.relocations,program.records,program.enums,program.distinct]:[bytes.asyncLayout,bytes.asyncSource]);
        return {artifact:{hash:hash(bytes),meta:hash(meta),bytes:bytes.length},root:session?.commit(),events:session?.events?.(),stats:session?.stats(),ms};
    } catch(e) {return {error:String(e),stats:session?.stats()};} finally{c.activeFragments=null;}
}
function main(dir,out) {
    const arms=['clean','global','precise'],contexts=Object.fromEntries(arms.map(a=>[a,compiler(dir,a)]));
    const evidence={apps:{},development:[]};
    for(const app of ['editor','chess']){
        const source=fs.readFileSync(path.join(dir,app+'.typed'),'utf8'),elf=fs.readFileSync(path.join(dir,app+'.elf'));
        const edit=contexts.clean.incrementalEdits(app,source);
        const cases={};evidence.apps[app]=cases;
        for(const [parent,key] of [['base','body'],['body','signature'],['signature','layout'],['body','bad']]){
            const prior={};for(const arm of arms)prior[arm]=run(contexts[arm],arm,edit[parent],null,elf).root;
            const gold=run(contexts.clean,'clean',edit[key],null,elf);
            assert(key==='bad'?gold.error:gold.artifact,JSON.stringify(gold));
            const rows=[];cases[key]={artifact:gold.artifact,error:gold.error,rows};
            for(let block=0;block<(key==='bad'?1:7);block++){
                for(let i=0;i<3;i++){const arm=arms[(i+block)%3],b=run(contexts[arm],arm,edit[key],prior[arm],elf);
                    assert.deepEqual(b.artifact,gold.artifact);assert.equal(b.error,gold.error);
                    rows.push({block,arm,ms:b.ms,stats:b.stats});
                    if(block===0 && arm==='precise' && b.events)cases[key].rebuilt=b.events.filter(x=>!x[1]).map(x=>x[0]);
                }
            }
        }
    }
    const base='record Pair { a: i32; b: i32; } enum Hue { Green, Blue } function spare(x: i32): i32 {return x+2;} function leaf(p: Pair): i32 {return p.a;} function using(p: Pair): i32 {return leaf(p)+i32(Hue.Blue);}';
    const steps=[
        ['reverse declaration order',base.replace(/(function spare.*?\})( function leaf.*?\})/,'$2 $1')],
        ['insert field after used field',base.replace('b: i32;', 'b: i32; c: i32;')],
        ['move used field',base.replace('a: i32; b: i32;', 'b: i32; a: i32;')],
        ['change enum ordinal',base.replace('Green, Blue','Blue, Green')],
        ['change used signature',base.replace('leaf(p: Pair)','leaf(p: Pair, v: i32)').replace('leaf(p)+','leaf(p,0)+')],
        ['remove used field',base.replace('a: i32;', 'newName: i32;')],
        ['rename parameter only',base.replace('spare(x: i32)', 'spare(y: i32)')],
        ['cycle',base.replace('return p.a;', 'return using(p);')],
        ['longer intervening body',base.replace('return p.a;','return p.a+1+2+3+4;')],
    ];
    const s=run(contexts.precise,'precise',base);assert(s.artifact,s.error);
    for(const [name,src] of steps){const exact=run(contexts.clean,'clean',src),b=run(contexts.precise,'precise',src,s.root);
        assert.equal(b.error,exact.error);assert.deepEqual(b.artifact,exact.artifact);
        evidence.development.push({name,error:b.error,artifact:b.artifact,stats:b.stats,events:b.events});
    }
    const again=run(contexts.precise,'precise',base,s.root);
    assert.equal(again.stats.rebuilt,0);assert.deepEqual(again.artifact,s.artifact);
    fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)main(...process.argv.slice(2));
