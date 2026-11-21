// Decode the linked target words with Espressif objdump and model exactly those operations.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";

const [binary, disassembly, output] = process.argv.slice(2);
assert(binary && disassembly && output);
const {runRv32} = await import(new URL(
    "../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs",
    import.meta.url));
const decoded = new Map();
for (const line of readFileSync(disassembly,"utf8").split("\n")) {
    const match=line.match(/^\s*([0-9a-f]+):\s+([a-f0-9]{8})\s+(\S+)\s*(.*?)\s*$/);
    if (match) decoded.set(parseInt(match[1],16),{word:parseInt(match[2],16),op:match[3],args:match[4].split(",")});
}
const image=readFileSync(binary);
assert.equal(decoded.size*4,image.length);
assert.deepEqual([...decoded.values()].map(row=>row.op),
    ["esp.vldbc.16.ip","esp.vld.128.ip","esp.vsub.s16","esp.vst.128.ip","addi","bne","jalr"]);
const program={image,entries:{row:0},relocations:[]};
const source=64,term=400,destination=432;
let cases=0, packedOps=0, packedStores=0, signedMinimum=0, signedMaximum=0;
function check(cx,cy,y,radius,groups) {
    const input=new Uint8Array(800).fill(0x8e);
    const v=new DataView(input.buffer);
    v.setInt16(term,radius*radius-(y-cy)**2,true);
    for(let x=0;x<160;x++)v.setInt16(source+2*x,(x-cx)**2,true);
    const expected=input.slice(), w=new DataView(expected.buffer);
    for(let x=0;x<groups*8;x++){
        const discriminant=radius*radius-(y-cy)**2-(x-cx)**2;
        assert(discriminant>=-32768 && discriminant<=32767);
        signedMinimum=Math.min(signedMinimum,discriminant);
        signedMaximum=Math.max(signedMaximum,discriminant);
        w.setInt16(destination+2*x,discriminant,true);
    }
    const result=runRv32(program,"row",[source,term,destination,groups],[],{},input,decoded);
    assert(!result.trap);
    assert.deepEqual(result.bytes,expected);
    assert.equal(result.packed.ops,1+3*groups);
    assert.equal(result.packed.stores,groups);
    assert.equal(result.steps,2+5*groups);
    cases++;
    packedOps+=result.packed.ops;
    packedStores+=result.packed.stores;
}
for(const cx of [32,33,58,68,100,126,127]) {
    for(const cy of [32,61,65,109,127]) {
        for(const y of [0,1,cy-23,cy,cy+23,158,159]) {
            for(const radius of [23,26,32]) check(cx,cy,y,radius,20);
        }
    }
}
for(let groups=1;groups<20;groups++)check(127,127,0,23,groups);
writeFileSync(output,JSON.stringify({imageSHA256:createHash("sha256").update(image).digest("hex"),
    instructions:[...decoded.values()],cases,packedOps,packedStores,signedMinimum,signedMaximum},null,2)+"\n");
