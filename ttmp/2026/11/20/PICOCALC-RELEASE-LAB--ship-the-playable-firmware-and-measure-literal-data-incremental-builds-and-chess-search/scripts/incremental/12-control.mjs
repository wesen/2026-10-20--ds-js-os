import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [dir,out]=process.argv.slice(2),here=dirname(fileURLToPath(import.meta.url));
function env(prefix) {
    const r=vm.createContext({});
    for(const x of ['typed-wasm','typed-async','typed-rv32','typed-world'])vm.runInContext(readFileSync(join(dir,prefix+x+'.js'),'utf8'),r);
    vm.runInContext(readFileSync(join(here,'02-fragments.js'),'utf8'),r);return r;
}
const stock=env(''),exp=env('candidate-'), rows=[];
const hash=x=>createHash('sha256').update(x).digest('hex');
for(const app of ['editor','chess']){
    const source=readFileSync(join(dir,app+'.typed'),'utf8'),elf=readFileSync(join(dir,app+'.elf'));
    function run(ctx,input,old) {
        const session=ctx===exp?ctx.fragmentSession(old):null;ctx.activeFragments=session;
        let result;
        try { const b=ctx.compileTypedWorldRv32(input,elf,{asyncSource:true});
              result={image:hash(b),metadata:hash(JSON.stringify([b.asyncLayout,b.asyncSource]))};}
        catch(e){result={error:e.name+': '+e.message};}
        return {result,...session?.stats(),state:session?.commit()};
    }
    const base=run(exp,source,null);assert(base.result.image);
    const anchor=app==='editor'?'return (row % 36) * 100;':'return chessSquare((move / 64) % 64);';
    const candidates=[['body type error',source.replace(anchor,'return undefinedIncrementalName;')],
                      ['invalid syntax',source.replace(anchor,'return /* never closed ')]];
    if(app==='editor') {
        candidates.push(['async result used by synchronous caller',source.replace('function editorPreviewSlot(row:', 'async function editorPreviewSlot(row:').replace(anchor,'const paused = await typedSdkYield(); '+anchor)]);
        candidates.push(['additional suspension in existing async function',source.replace('const paused = await typedSdkYield();','const extraPause = await typedSdkYield(); const paused = await typedSdkYield();')]);
    }
    for(const [label,text] of candidates){
        assert.notEqual(text,source);
        const actual=run(exp,text,base.state),clean=run(stock,text,null);assert.deepEqual(actual.result,clean.result);
        if(label==='body type error'){assert(actual.result.error);assert(actual.reused>0);}
        if(label==='additional suspension in existing async function')assert(actual.result.image);
        rows.push({app,label,...actual.result,reused:actual.reused,rebuilt:actual.rebuilt});
    }
    const rollback=run(exp,source,base.state);assert.deepEqual(rollback.result,base.result);assert.equal(rollback.rebuilt,0);
    const poison=JSON.parse(JSON.stringify(base.state));
    Object.values(poison.items)[1].words[0]^=4;
    const altered=run(exp,source,poison);assert(altered.result.image);assert.notEqual(altered.result.image,base.result.image);
    rows.push({app,label:'discarded edits, all fragments reusable',reused:rollback.reused,verified:true},
              {app,label:'deliberately damaged in-memory word detected by clean ELF oracle',reused:altered.reused,verified:true});
}
writeFileSync(out,JSON.stringify(rows,null,2)+'\n');console.log(rows);
