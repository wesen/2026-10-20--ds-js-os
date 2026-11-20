import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createCompiler} from '../03-compile.mjs';
import {runRv32} from './run-rv32.mjs';

const file=new URL('../../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/scripts/scene/isometric.typed',import.meta.url);
const src=fs.readFileSync(file,'utf8');
const {rv32,wasm}=createCompiler();
const stock=rv32.compile(src);
const diag=[];
const optimized=rv32.compile(src,[],undefined,{pie:true,pieDiagnostics:diag});
assert.equal(diag.length,0,'this point-at-a-time scene is a scalar control');
assert.deepEqual(Buffer.from(optimized.image),Buffer.from(stock.image));
const oracle=new WebAssembly.Instance(new WebAssembly.Module(wasm.compile(src).bytes)).exports;
const hash=data=>createHash('sha256').update(data).digest('hex');
const board=[];
const back=[4,2,3,5,6,3,2,4];
board.push(...back.map(x=>8+x),...Array(8).fill(9),...Array(32).fill(0),...Array(8).fill(1),...back);
const moved=board.slice();
moved[36]=moved[52]; moved[52]=0;
const sparse=Array(64).fill(0);
sparse[0]=14; sparse[63]=6; sparse[28]=5; sparse[35]=10;
const empty=Array(64).fill(0);
const states=[
    ['opening',board,52,5],['cursor',board,44,5],['e4',moved,36,5],['empty',empty,52,5],
    ['sparse',sparse,28,5],['low',board,52,3],['high',board,52,7],['selected',board,52,5],['promotion',sparse,28,5]
];
for (const kind of [1,2,3,4,5,6]) {
    const single=Array(64).fill(0);
    single[28]=kind;
    states.push(['kind-'+kind,single,28,5]);
}
const results=[], meshes=new Set();
for (const [name,position,cursor,pitch] of states) {
    const bytes=new Uint8Array(8960).fill(0x55);
    const input=12,output=508,cap=4096;
    const view=new DataView(bytes.buffer);
    view.setUint32(input,90,true);
    const cells=new Uint16Array(bytes.buffer,input+4,90);
    cells.fill(0);
    cells.set(position);
    cells[76]=name==='e4'?52:64;
    cells[78]=name==='e4'?36:64;
    if(name==='selected'){
        cells[64+4]=16; // e4
        cells[64+5]=16; // e3
    }
    if(name==='promotion') cells[82]=1;
    cells[72]=cursor;
    cells[74]=name==='selected'?52:64;
    view.setUint32(output,cap,true);
    const arena=new Uint8Array(oracle.memory.buffer,0,bytes.length);
    arena.set(bytes);
    const entry=pitch===5?'paintChess':'paintPose';
    const args=pitch===5?[input,output]:[input,output,pitch];
    const count=oracle[entry](...args);
    const actual=runRv32(optimized,entry,args,[],{},bytes,undefined,1000000);
    assert.equal(actual.trap,false);
    assert.equal(actual.result,count);
    assert.deepEqual(actual.bytes,arena,name+' whole arena');
    assert.equal(actual.packed.stores,0);
    const data=new Uint16Array(actual.bytes.buffer,output+4,count);
    const values=Array.from(data);
    // Check the four cell corners independently at every rank and file.
    const point=(x,z)=>[160+x-z,42+Math.floor((x+z)*pitch/8)];
    for(let sq=0;sq<64;sq++) {
        const x=(sq%8)*16,z=Math.floor(sq/8)*16;
        const a=point(x,z),b=point(x+16,z),c=point(x+16,z+16),d=point(x,z+16);
        const at=6+4*8+sq*16; // Four triangles draw the board lip before the squares.
        assert.deepEqual(values.slice(at,at+7),[5,...a,...b,...c]);
        assert.deepEqual(values.slice(at+8,at+15),[5,...a,...c,...d]);
    }
    const mesh=[];
    for(let at=6+4*8+64*16;data[at]!==4;) {
        if (data[at]===5) {
            mesh.push(values.slice(at+1,at+7)); // geometry only: remove face color
            at+=8;
        } else if (data[at]===3) {
            at+=7+data[at+6]; // exclude glyph from geometric signature
        } else assert.fail('unknown piece command '+data[at]);
    }
    if(name.startsWith('kind-')) meshes.add(JSON.stringify(mesh));
    assert.deepEqual(actual.bytes.slice(output+4+2*count),bytes.slice(output+4+2*count));
    results.push({name,entry,pitch,count,retired:actual.steps,sha256:hash(new Uint8Array(data.buffer,data.byteOffset,data.byteLength))});
}
assert.equal(new Set(results.map(r=>r.sha256)).size,states.length);
assert.equal(meshes.size,6,'six distinct geometry signatures at one square');
let replay;
if(process.argv[2]) {
    const fixtures=fs.readFileSync(process.argv[2]);
    const stride=4+180+4+8192;
    assert.equal(fixtures.length,47*stride,'expected full game replay fixture');
    const hashes=[];
    for(let i=0;i<47;i++){
        const row=fixtures.subarray(i*stride,(i+1)*stride);
        assert.equal(row.readUInt32LE(0),90);
        const n=row.readUInt32LE(184);
        assert(n>0 && n<=4096);
        const bytes=new Uint8Array(8960).fill(0xa7), ptr=508;
        bytes.set(row.subarray(0,184),12);
        new DataView(bytes.buffer).setUint32(ptr,4096,true);
        const expected=bytes.slice();
        expected.set(row.subarray(188,188+2*n),ptr+4);
        const actual=runRv32(optimized,'paintChess',[12,ptr],[],{},bytes,undefined,1000000);
        assert.equal(actual.trap,false);
        assert.equal(actual.result,n);
        assert.deepEqual(actual.bytes,expected,'replay '+i);
        hashes.push(hash(row.subarray(188,188+2*n)));
    }
    replay={fixtureSha256:hash(fixtures),states:hashes.length,uniqueOutputs:new Set(hashes).size};
}
console.log(JSON.stringify({replay,distinctMeshes:meshes.size,sourceSha256:hash(src),nativeSha256:hash(stock.image),nativeBytes:stock.image.length,selected:diag,results},null,2));
