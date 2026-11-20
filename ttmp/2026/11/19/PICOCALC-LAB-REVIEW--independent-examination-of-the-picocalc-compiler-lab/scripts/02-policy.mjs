// A transfer stress test. Reorder independent functions while keeping their contents fixed.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.argv[2];
const sha = data=>createHash('sha256').update(data).digest('hex');
const negative = n => 'function decoy' + n + '(x: i32, y: i32): i32 { let a = x; ' +
    'a = a / y; '.repeat(80) + 'return a; }';
const profitable = 'function profitable(x: i32, y: i32): i32 { let a = x; ' +
    'a = a / 3; '.repeat(80) + 'return a; }';
const decoys = Array.from({length:36}, (_,n)=>negative(n));
const fixtures = {early:[profitable,...decoys],late:[...decoys,profitable]};
const checks = [
    ['function f(x: i32): i32 {return x / -1;}',1,0],
    ['function f(x: i32): i32 {return x % -1;}',1,0],
    ['function f(x: i32): i32 {return x / 0;}',0,0],
    ['function f(x: i32, y: i32): i32 {let d = 3; if (x > 0) { d = y; } return x / d;}',0,0],
];
function compile(lane, source) {
    const ctx=vm.createContext({});
    for (const part of ['wasm','rv32']) vm.runInContext(readFileSync(join(root,lane,'typed',part+'.js'),'utf8'),ctx);
    const rows=[];
    const result=ctx.typedRv32.compile(source,[],200000,{observeFacts:r=>rows.push(r)});
    const image=Buffer.from(result.image);
    let traps=0;
    for(let at=0;at<image.length;at+=4) if(image.readUInt32LE(at)===0x00100073) traps++;
    const total=key=>rows.reduce((a,r)=>a+r[key],0);
    return {sha:sha(image),words:image.length/4,traps,charged:total('chargedCells'),
        removedZero:total('removedZero'),removedOverflow:total('removedOverflow'),
        profitableAdmitted:rows.find(r=>r.name==='profitable')?.admitted};
}
const output={};
for(const [order,functions] of Object.entries(fixtures)) {
    const source=functions.join('\n');
    const variants=output[order]={sourceBytes:source.length, sourceSha:sha(source)};
    for(const lane of ['base','always','select']) variants[lane]=compile(lane,source);
    assert.equal(variants.always.removedZero,80);
    assert.equal(variants.always.removedOverflow,80);
    assert.equal(variants.base.words-variants.always.words,80*9);
    assert(variants.select.charged<=32768);
    assert.equal(variants.select.profitableAdmitted,order==='early');
    assert.equal(variants.select.words,order==='early'?variants.always.words:variants.base.words);
}
output.boundaries=[];
for(const [source,zero,overflow] of checks) {
    const base=compile('base',source),candidate=compile('select',source);
    assert.equal(candidate.removedZero,zero); assert.equal(candidate.removedOverflow,overflow);
    assert.equal(base.traps-candidate.traps,zero+overflow);
    assert.equal(base.words-candidate.words,zero*2+overflow*7);
    output.boundaries.push({source,base,candidate});
}
console.log(JSON.stringify(output,null,2));
