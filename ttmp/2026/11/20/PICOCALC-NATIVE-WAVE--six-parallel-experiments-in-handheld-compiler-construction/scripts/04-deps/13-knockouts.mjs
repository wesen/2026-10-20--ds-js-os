// Alter research copies of the candidate only, using ordinary source edits to test oracle sensitivity.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {compiler,run} from './05-host.mjs';
const [dir,out]=process.argv.slice(2),base=fs.readFileSync(path.join(dir,'03-session.js'),'utf8'), rows=[];
const stock=compiler(dir,'clean');
const scenarios=[
    {name:'used field offset', anchor:"case 'field':", replace:"case 'field': value=null;break; case '__unusedfield':",
     input:'record Pair { a: i32; b: i32; } function sum(p: Pair): i32 { return p.a; }',from:'a: i32; b: i32;',to:'b: i32; a: i32;'},
    {name:'enum values',anchor:"case 'members':",replace:"case 'members': value=null;break; case '__unusedenum':",
     input:'enum Heat { Cold, Hot } function value(): i32 {return i32(Heat.Hot);}',from:'Cold, Hot',to:'Hot, Cold'},
    {name:'call signature',anchor:"case 'fn':",replace:"case 'fn': value=null;break; case '__unusedfn':",
     input:'function callee(x: i32): i32 {return x;} function caller(x: i32): i32 {return callee(x);}',from:'callee(x: i32)',to:'callee(x: i32, spare: i32)'},
    {name:'symbolic graph edge',anchor:'for(const name of old.edges)edges.push(ordinals.get(name));',replace:'',
     input:'function leaf(x: i32): i32 {return x;} function caller(x: i32): i32 {return leaf(x);}',from:'return x;',to:'return caller(x);'},
    {name:'own parameter bindings',anchor:'fn.params,fn.paramNames,fn.result',replace:'fn.params,fn.result',
     input:'function value(x: i32): i32 {return x;}',from:'value(x:',to:'value(y:'},
    {name:'exact body',anchor:'lex.source.startsWith(old.body,fn.bodyAt)',replace:'true',
     input:'function value(x: i32): i32 {return x+1;}',from:'x+1',to:'x+2'},
];
for(const {name,anchor,replace,input,from,to} of scenarios){
    assert.equal(base.split(anchor).length,2);
    const c=compiler(dir,'precise'),frozen=compiler(dir,'precise');
    vm.runInContext(base.replace(anchor,replace),c);
    const text=input.replace(from,to),expected=run(stock,'clean',text);
    const prior=run(c,'precise',input),fbase=run(frozen,'precise',input);
    assert(prior.artifact);const altered=run(c,'precise',text,prior.root),control=run(frozen,'precise',text,fbase.root);
    assert.deepEqual(control.artifact,expected.artifact);assert.equal(control.error,expected.error);
    const caught=altered.error!==expected.error||JSON.stringify(altered.artifact)!==JSON.stringify(expected.artifact);
    assert(caught);rows.push({name,caught,stock:expected.error||expected.artifact.hash,mutant:altered.error||altered.artifact?.hash});
}
fs.writeFileSync(out,JSON.stringify(rows,null,2)+'\n');
