import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createCompiler} from '../03-compile.mjs';

const path=process.argv[2];
assert(path,'usage: node audit-board.mjs OPERATOR_PHYSICAL_JSON');
const receipt=JSON.parse(fs.readFileSync(path));
assert.equal(receipt.passed,true);
assert.equal(receipt.cases.length,72);
assert.equal(receipt.cyclesPerCall.length,24);
const source=fs.readFileSync(new URL('../01-vertices.typed',import.meta.url),'utf8');
const {rv32}=createCompiler();
const arms={stock:{},portable:{piePortable:true},pie:{pie:true}};
const images={};
for(const [arm,options] of Object.entries(arms)){
    const data=rv32.compile(source,[],undefined,options).image;
    images[arm]=createHash('sha256').update(data).digest('hex');
    assert.equal(images[arm],receipt.kernelSHA256[arm],arm+' kernel identity');
}
function crc32(chunks) {
    let crc=0xffffffff;
    for(const buffer of chunks) {
        for(const value of buffer) {
            crc ^= value;
            for(let bit=0;bit<8;bit++) crc=(crc>>>1) ^ ((crc&1)?0xedb88320:0);
        }
    }
    return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');
}
const counts=[1,7,8,9,17,64,256,1024];
function expected(n,alias) {
    const chunks=[Buffer.alloc(2048),Buffer.alloc(2048),Buffer.alloc(2048)];
    for(let i=0;i<1024;i++) {
        const original=[0,1,2].map(ch=>(i*(71+6*ch)+314*ch+(i>>2))&65535);
        const [x,y,z]=original.map(raw=>raw%256);
        const triple=i<n?[384+x-z,640+x+z-2*y,x+z+y]:[alias?original[0]:0xfeed,0xfeed,0xfeed];
        triple.forEach((value,ch)=>chunks[ch].writeUInt16LE(value,2*i));
    }
    return crc32(chunks);
}
for(const n of counts) {
    for(const arm of Object.keys(arms)) {
        for(const v of [0,1,2]) {
            const rows=receipt.cases.filter(row=>row.arm===arm && row.vertices===n && row.variant===v);
            assert.equal(rows.length,1);
            assert.equal(rows[0].status,'ok');
            assert.equal(rows[0].crc32,expected(n,v===2),[n,arm,v].join('/'));
        }
    }
}
const costs=counts.map(n=>{
    const medians={vertices:n};
    for(const arm of Object.keys(arms)){
        const [row]=receipt.cyclesPerCall.filter(c=>c.arm===arm && c.vertices===n);
        assert(row.min<=row.median && row.median<=row.max);
        medians[arm]=row.median;
    }
    return medians;
});
console.log(JSON.stringify({operatorImage:receipt.benchmark,images,crcMatches:72,costs},null,2));
