// Review-only controls on nonexecuted arithmetic/branch instructions. The frozen checker is unchanged.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {makeCompiler} from './03-emit.mjs';import {check} from './04-check.mjs';
const p=makeCompiler().typedRv32.compile('function demo(x: i32): i32 {if(x>0){return x+x;}return x;}');
const output=[];
for(const [name,match,convert] of [
    ['logical right shift outside design list',w=>(w&0xfe00707f)===0x33,w=>w|(5<<12)],
    ['signed less-than branch outside design list',w=>(w&127)===0x63,w=>(w&~(7<<12))|(4<<12)]
]){
    const image=Uint8Array.from(p.image),v=new DataView(image.buffer);let at;
    for(let i=0;i<image.length;i+=4){const w=v.getUint32(i,true);if(match(w)){v.setUint32(i,convert(w),true);at=i;break;}}
    assert.notEqual(at,undefined);
    const result=check(image,p.entries,p.certificate);
    output.push({name,at,designExpects:'unsupported',actual:'accepted',frame:result.demo.frame,typed:result.demo.typed});
}
fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2)+'\n');
