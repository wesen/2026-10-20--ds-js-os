import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {compiler,run} from './05-host.mjs';
const [stage,out]=process.argv.slice(2),stock=compiler(stage,'clean'),precise=compiler(stage,'precise'),rows=[];
function check(name,before,after,oldImports=[],newImports=oldImports,elf=null) {
    const seed=run(precise,'precise',before,null,elf,oldImports);assert(seed.artifact,seed.error);
    const next=run(precise,'precise',after,seed.root,elf,newImports),expected=run(stock,'clean',after,null,elf,newImports);
    assert.deepEqual(next.artifact,expected.artifact);assert.equal(next.error,expected.error);
    rows.push({name,artifact:next.artifact,error:next.error,stats:next.stats,events:next.events});
}
const i=(name,awaitable=false)=>({name,params:['i32'],result:'i32',awaitable});
const handles='function use(x: i32): i32 {return external(x);} function spare(x: i32): i32 {return x+1;}';
check('SDK import permutation',handles,handles,[i('other'),i('external')],[i('external'),i('other')]);
check('import changes awaitable flag',handles,handles,[i('external')],[i('external',true)]);
check('former import becomes an internal leaf',handles,'function external(x: i32): i32 {return x;} '+handles,[i('external')],[]);
const value='function f(n: i32): i32 {return n;}';check('a new global shares the local spelling',value,'function n(): i32 {return 1;} '+value);
check('distinct nominal type becomes an enum', 'type Miles = distinct i32; function f(x: Miles): i32 {return i32(x);}', 'enum Miles {Zero} function f(x: Miles): i32 {return i32(x);}');
check('enum exhaustiveness', 'enum T { A, B } function f(x: T): i32 {match(x){A:{return 1;} B:{return 2;}}return 0;}',
'enum T { A, B, C } function f(x: T): i32 {match(x){A:{return 1;} B:{return 2;}}return 0;}');
const src=fs.readFileSync(path.join(stage,'editor.typed'),'utf8'),elf=fs.readFileSync(path.join(stage,'editor.elf'));
const wait='const paused = await typedSdkYield();';
assert(src.includes(wait));check('existing async task adds a suspension',src,src.replace(wait,'const ignored = await typedSdkYield(); '+wait),[],[],elf);
assert(rows.at(-1).artifact,'additional suspension must produce a valid executable');
fs.writeFileSync(out,JSON.stringify(rows,null,2)+'\n');
