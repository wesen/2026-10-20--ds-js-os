import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createCompiler} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/03-compile.mjs';
import {decode} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/decode.mjs';
import {runRv32} from '../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs';

const [sourceFile,linkedFile,fixtures,binutils]=process.argv.slice(2);
const prefix=binutils??'/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf';
const source=fs.readFileSync(sourceFile,'utf8'),elf=fs.readFileSync(linkedFile);
const {rv32}=createCompiler();
const raw=rv32.compile(source,[],undefined,{pie:true});
const guarded=rv32.compile(source,[],undefined,{piePortable:true});
const magic=Buffer.from('4e454741565241444c533233','hex');
const slot=elf.indexOf(magic);
assert(slot>=0 && elf.indexOf(magic,slot+1)===-1);
const size=elf.readUInt32LE(slot+12);
assert.equal(size,49152);
assert.equal(elf.readUInt32LE(slot+16),3);
function jump(at) {
    const w=elf.readUInt32LE(slot+at);
    assert.equal(w&4095,0x6f,'entry should be a non-linking JAL');
    const delta=((w>>31)<<20)|(w&0xff000)|(((w>>>20)&1)<<11)|(((w>>>21)&0x3ff)<<1);
    return at+delta;
}
const destinations=[20,24,28].map(jump);
const rawStart=destinations[1]-raw.entries.paintChess;
const guardedStart=destinations[2]-guarded.entries.paintChess;
assert.equal(guardedStart,rawStart+raw.image.length);
assert.deepEqual(elf.subarray(slot+rawStart,slot+guardedStart),Buffer.from(raw.image));
assert.deepEqual(elf.subarray(slot+guardedStart,slot+guardedStart+guarded.image.length),Buffer.from(guarded.image));
const program={image:elf.subarray(slot+20,slot+guardedStart+guarded.image.length),entries:{witness:0,raw:4,guarded:8},relocations:[]};
const decoded=decode(program.image,prefix);
const row=fs.readFileSync(fixtures);
assert.equal(row.readUInt32LE(0),90);
const n=row.readUInt32LE(184);
const expected=row.subarray(188,188+2*n), results=[];
for(const misalign of [false,true]){
    const ptrs=Array.from({length:6},(_,i)=>11004+192*i+(i===0 && misalign?4:0));
    const before=new Uint8Array(14000).fill(0x9b), data=new DataView(before.buffer);
    before.set(row.subarray(0,184),12);
    data.setUint32(508,4096,true);
    for(const p of ptrs) data.setUint32(p,82,true);
    data.setUint16(ptrs[1]+166,5,true);  // cell 81 of y, after the header
    data.setUint16(ptrs[5]+166,0,true);
    for(const entry of Object.keys(program.entries)) {
        const result=runRv32(program,entry,[12,508,...ptrs],[],{},before,decoded,1000000);
        assert.equal(result.result,n);
        assert.deepEqual(Buffer.from(result.bytes.subarray(512,512+2*n)),expected);
        const stamp=new DataView(result.bytes.buffer).getUint16(ptrs[5]+166,true);
        assert.equal(stamp,entry==='witness' && !misalign?0xabcd:0);
        assert.equal(result.packed.stores,!misalign && entry!=='guarded'?30:0);
        results.push({entry,misalign,stamp,stores:result.packed.stores});
    }
}
const digest=x=>createHash('sha256').update(x).digest('hex');
console.log(JSON.stringify({elfBytes:elf.length,sha256:digest(elf),slotCapacity:size,entryDestinationsRelativeToSlot:destinations,
    modeBytes:{witness:rawStart-32,raw:raw.image.length,guarded:guarded.image.length},results},null,2));
