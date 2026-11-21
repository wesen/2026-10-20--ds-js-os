// Execute one complete unchanged opening frame. Bind every count to its image.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {runInThisContext} from 'node:vm';
const repo=process.cwd(),[mode,out,prefix]=process.argv.slice(2);
assert(['baseline','general','shadow'].includes(mode)&&out&&prefix);
for(const js of ['typed-wasm','typed-rv32','typed-pie-loops'])runInThisContext(readFileSync('picocalc-os/compiler/'+js+'.js','utf8'));
const source=readFileSync('picocalc-os/worlds/raytrace/raytrace.typed','utf8');
const events=[],shadow='typedRayInShadow';
const options={pieLoops:'pie-empty',inspect:{function:shadow,emit:e=>events.push(e)}};
if(mode!=='baseline')options.inlineGuardedReturns=mode==='general'?true:name=>name===shadow;
const img=typedRv32.compile(source,[],undefined,options);
const raw=Buffer.from(img.image),sha=b=>createHash('sha256').update(b).digest('hex');
const ev=events.find(e=>e.target==='rv32'&&e.kind==='emission');
const path=resolve('ttmp/2026/11/20/PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review');
const {decode}=await import(pathToFileURL(join(path,'decode.mjs')));
let emulator=readFileSync(join(path,'run-rv32.mjs'),'utf8').replace("'./packed.mjs'",JSON.stringify(pathToFileURL(join(path,'packed.mjs')).href)).replace('const stackTop = 65536;','const stackTop = 131072;');
const {runRv32}=await import('data:text/javascript;base64,'+Buffer.from(emulator).toString('base64'));
const dis=decode(raw,prefix);
// Some Espressif objdump versions print scalar ABI names inside PIE mnemonics even under -M numeric.
const abi='zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6'.split(' ');
for(const ins of dis.values()) if(ins.op.startsWith('esp.')) ins.args=ins.args.map(arg=>abi.includes(arg)?'x'+abi.indexOf(arg):arg);
const pix=64,work=64+4+2*25600+8,mem=new Uint8Array(work+4+2*2048+8).fill(0xa5);
const dv=new DataView(mem.buffer);dv.setUint32(pix,25600,true);dv.setUint32(work,2048,true);dv.setUint16(work+4,160,true);
const pcCounts=new Uint32Array(raw.length/4);
const r=runRv32(img,'typedRayFrame',[pix,work,68,61,31,25],[],{},mem,dis,22000000,pc=>pcCounts[pc/4]++);
assert(!r.trap && r.result===1);
const slots={},shadowCounts={steps:0,directStackLoads:0,directStackStores:0,absCalls:0,boundsTests:0};
for(let pc=ev.start;pc<ev.end;pc+=4){
    const w=raw.readUInt32LE(pc),n=pcCounts[pc/4],op=w&127;
    shadowCounts.steps+=n;
    if(((w>>>15)&31)===2 && (op===3 || op===35)){
        const immediate=op===3?w>>>20:((w>>>25)<<5)|((w>>>7)&31);
        const home=slots[immediate]??={loads:0,stores:0};
        if(op===3){home.loads+=n;shadowCounts.directStackLoads+=n;}else{home.stores+=n;shadowCounts.directStackStores+=n;}
    }
    if(op===0x6f&&((w>>>7)&31)===1) {
        const delta=((w>>31)<<20)|(w&0xff000)|(((w>>>20)&1)<<11)|(((w>>>21)&1023)<<1);
        if(pc+delta===img.entries.typedRayAbs)shadowCounts.absCalls+=n;
    }
    if(op===0x63 && raw.readUInt32LE(pc+4)===0x00100073)shadowCounts.boundsTests+=n;
}
const callSites=ev.ranges.filter(r=>r.decisions?.some(d=>d.includes('across call')||d.includes('guarded return'))).map(r=>{
    const words=[];
    for(let pc=r.start;pc<r.end;pc+=4)words.push({pc,executions:pcCounts[pc/4],op:dis.get(pc).op});
    return {tapeOffset:r.inputStart,words};
});
const frameEnd=img.entries.typedRaySetObject,absStart=img.entries.typedRayAbs;
const summary={mode,sourceSHA:sha(source),imageSHA:sha(raw),imageBytes:raw.length,shadowBytes:ev.end-ev.start,
 shadow:shadowCounts,callSites,shadowCalls:pcCounts[ev.start/4],shadowSlotByteOffsets:slots,localCount:ev.localCount,inlineSites:ev.ranges.filter(r=>r.decisions?.some(d=>d.includes("guarded return"))).length,
 absTotalSteps:pcCounts.slice(absStart/4,frameEnd/4).reduce((a,b)=>a+b,0),
 fullFrameSteps:r.steps,outputSHA:sha(r.bytes),ret: r.result};
writeFileSync(out,JSON.stringify(summary,null,2)+'\n');
console.log(summary.mode,summary.imageSHA,summary.fullFrameSteps,summary.shadow,summary.absTotalSteps);
