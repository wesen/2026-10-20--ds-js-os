// Controlled source edits for nested record handles, function ordering and a literal in a non-final definition.
import fs from 'node:fs';import assert from 'node:assert/strict';import {compiler,run} from './05-host.mjs';
const [dir,out]=process.argv.slice(2),p=compiler(dir,'precise'),s=compiler(dir,'clean'),rows=[];
const cases=[
    ['nested record remains one word in outer record',
        'record Inner { x: i32; } record Outer { h: Inner; tag: i32; } function get(o: Outer): i32 {return o.tag;} function read(i: Inner): i32 {return i.x;}',
        'x: i32; }','x: i32; y: i32; }'],
    ['field kind changes without changing following offset',
        'record Row { enabled: bool; tag: i32; } function get(r: Row): i32 {return r.tag;} function flag(r: Row): bool {return r.enabled;}',
        'enabled: bool','enabled: i32'],
    ['longer literal ahead of still-used helpers and caller',
        'function label(b: buffer): i32 {return b.writeLiteral(0,"cat");} function digit(x: i32): i32 {return x+1;} function display(b: buffer): i32 {return label(b)+digit(1);}',
        '"cat"','"cat is resting on a wide surface"'],
    ['renaming a function that a retained caller needs',
        'function add(x: i32): i32 {return x+1;} function call(x: i32): i32 {return add(x);}',
        'function add','function renamed'],
    ['removed declaration with unaffected caller order',
        'function a(x: i32): i32 {return x+1;} function spare(x: i32): i32 {return x+2;} function main(x: i32): i32 {return a(x);}',
        'function spare(x: i32): i32 {return x+2;} ',''],
];
for(const [name,before,from,to] of cases){
    assert.equal(before.split(from).length,2);
    const parent=run(p,'precise',before);assert(parent.artifact,parent.error);
    const edit=before.replace(from,to),exp=run(s,'clean',edit),actual=run(p,'precise',edit,parent.root);
    assert.deepEqual(actual.artifact,exp.artifact);assert.equal(actual.error,exp.error);
    rows.push({name,error:actual.error,artifact:actual.artifact,stats:actual.stats,events:actual.events});
}
fs.writeFileSync(out,JSON.stringify(rows,null,2)+'\n');
