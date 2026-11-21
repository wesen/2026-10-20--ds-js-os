import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import "../../../../../../../picocalc-os/compiler/typed-wasm.js";
import "../../../../../../../picocalc-os/compiler/typed-rv32.js";

const [directory, sourcePath="picocalc-os/worlds/raytrace/raytrace.typed", receiptPath]=process.argv.slice(2);
assert(directory,"usage: node 02-wasm.mjs REFERENCE_DIRECTORY [TYPED_SOURCE [RESULT_JSON]]");
const path=name=>resolve(directory,name);
const source=readFileSync(sourcePath,"utf8");
const wasm=typedWasm.compile(source).bytes;
const native=typedRv32.compile(source);
// The standalone compiler uses one fixed Wasm page. Keep every section and
// instruction unchanged except the test-only linear memory min/max limits.
const testWasm=wasm.slice();
let memorySections=0;
for(let at=8;at<testWasm.length;){
    const tag=testWasm[at++];
    let length=0, part, shift=0;
    do {
        part=testWasm[at++];
        length+=(part&127)*2**shift;
        shift+=7;
    } while(part&128);
    if(tag===5) {
        assert.deepEqual([...testWasm.subarray(at,at+length)],[1,1,1,1]);
        testWasm[at+2]=8;
        testWasm[at+3]=8;
        memorySections++;
    }
    at+=length;
}
assert.equal(memorySections,1);
const guest=new WebAssembly.Instance(new WebAssembly.Module(testWasm)).exports;
const memory=new Uint8Array(guest.memory.buffer);
const view=new DataView(memory.buffer);
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const pixels=16, depths=104016, ids=208016, work=312016;
const workCapacity=2048;
const cases=JSON.parse(readFileSync(path("cases.json")));
const rows=[];
function prepare(c,strideEncoding=c.stride) {
    memory.fill(0xa5);
    const cells=c.stride*160;
    for(const at of [pixels,depths,ids]) view.setUint32(at,cells,true);
    view.setUint32(work,workCapacity,true);
    view.setUint16(work+4,strideEncoding,true);
}
function verifyPlane(c,base,plane,reference,capacity=160*c.stride) {
    const bytes=2*(160*c.stride+1); // pixels, row padding, one trailing canary
    const span=memory.subarray(base+4,base+4+bytes);
    assert.deepEqual(span,new Uint8Array(reference.subarray(2)),c.name+" "+plane+" including row padding");
    assert.equal(view.getUint32(base,true),capacity);
    assert.equal(view.getUint16(base-2,true),0xa5a5,"leading buffer canary");
}

for(const c of cases) {
    const expectColor=readFileSync(path(c.name+".color"));
    const expectDepth=readFileSync(path(c.name+".depth"));
    const expectID=readFileSync(path(c.name+".id"));
    prepare(c,c.name==="default" ? 0 : c.stride);
    assert.equal(guest.typedRayFrame(pixels,work,...c.scene),1);
    verifyPlane(c,pixels,"frame",expectColor);
    assert(memory.subarray(depths+4,depths+4+2*c.stride*160).every(v=>v===0xa5));
    assert(memory.subarray(ids+4,ids+4+2*c.stride*160).every(v=>v===0xa5));
    assert.equal(view.getUint16(work+4,true),c.name==="default" ? 0 : c.stride);

    prepare(c);
    assert.equal(guest.typedRayRender(pixels,depths,ids,work,...c.scene),1);
    verifyPlane(c,pixels,"audit color",expectColor);
    verifyPlane(c,depths,"audit depth",expectDepth);
    verifyPlane(c,ids,"audit IDs",expectID);

    prepare(c);
    assert.equal(guest.typedRayTrace(depths,ids,work,...c.scene.slice(0,2)),1);
    verifyPlane(c,depths,"trace depth",expectDepth);
    verifyPlane(c,ids,"trace IDs",expectID);
    assert(memory.subarray(pixels+4,pixels+4+2*c.stride*160).every(v=>v===0xa5));
    assert.equal(guest.typedRayShade(pixels,depths,ids,work,...c.scene),1);
    verifyPlane(c,pixels,"standalone shade",expectColor);
    verifyPlane(c,depths,"shade preserves depth",expectDepth);
    verifyPlane(c,ids,"shade preserves IDs",expectID);
    if(c.name==="left-bottom"){
        prepare(c);
        const exact=159*c.stride+160;
        for(const at of [pixels,depths,ids]) view.setUint32(at,exact,true);
        assert.equal(guest.typedRayRender(pixels,depths,ids,work,...c.scene),1);
        verifyPlane(c,pixels,"exact padded capacity",expectColor,exact);
        verifyPlane(c,depths,"exact padded depth capacity",expectDepth,exact);
        verifyPlane(c,ids,"exact padded ID capacity",expectID,exact);
    }
    rows.push({...c,colorSHA256:sha(expectColor),depthSHA256:sha(expectDepth),idSHA256:sha(expectID)});
}

const defaults=cases[0];
const activeCapacity=159*defaults.stride+160;
let invalid=0;
function rejects(edit,call) {
    prepare(defaults,0);
    edit();
    const before=memory.slice();
    assert.equal(call(),0);
    assert.deepEqual(memory,before);
    invalid++;
}
rejects(()=>view.setUint32(work,2047,true),()=>guest.typedRayFrame(pixels,work,...defaults.scene));
rejects(()=>view.setUint16(work+4,159,true),()=>guest.typedRayFrame(pixels,work,...defaults.scene));
rejects(()=>view.setUint16(work+4,321,true),()=>guest.typedRayFrame(pixels,work,...defaults.scene));
rejects(()=>view.setUint32(pixels,activeCapacity-1,true),()=>guest.typedRayFrame(pixels,work,...defaults.scene));
rejects(()=>view.setUint32(depths,activeCapacity-1,true),()=>guest.typedRayRender(pixels,depths,ids,work,...defaults.scene));
rejects(()=>view.setUint32(ids,activeCapacity-1,true),()=>guest.typedRayTrace(depths,ids,work,...defaults.scene.slice(0,2)));
rejects(()=>{},()=>guest.typedRayFrame(pixels,work,31,61,31,25));
rejects(()=>{},()=>guest.typedRayFrame(pixels,work,68,128,31,25));
rejects(()=>{},()=>guest.typedRayRender(pixels,depths,ids,work,68,61,-1,25));
rejects(()=>{},()=>guest.typedRayShade(pixels,depths,ids,work,68,61,31,160));
assert.equal(rows[0].depthSHA256,rows[1].depthSHA256,"lamp-only move preserves nearest depths");
assert.equal(rows[0].idSHA256,rows[1].idSHA256,"lamp-only move preserves nearest IDs");
assert.notEqual(rows[0].colorSHA256,rows[1].colorSHA256);

prepare(defaults,0);
assert.equal(guest.typedRayRender(pixels,depths,ids,work,...defaults.scene),1);
const at=(base,x,y)=>view.getUint16(base+4+2*(160*y+x),true);
const landmarks={
    sphereCenter:{color:at(pixels,68,61),depth:at(depths,68,61),id:at(ids,68,61)},
    leftTangent:{depth:at(depths,42,61),id:at(ids,42,61)},
    firstMiss:{depth:at(depths,41,61),id:at(ids,41,61)},
};
assert.deepEqual(landmarks,{
    sphereCenter:{color:0xca27,depth:30,id:1},leftTangent:{depth:56,id:1},firstMiss:{depth:0,id:0},
});

prepare(defaults,0);
view.setUint16(work+4+2*16,2,true);
assert.equal(guest.typedRaySetObject(work,0,80,80,56,26,0),1);
assert.equal(guest.typedRaySetObject(work,1,80,80,56,26,1),1);
assert.equal(guest.typedRayBuildGeometry(work),1);
assert.equal(guest.typedRayComputeRow(work,80),1);
landmarks.equalDepthTie={depth:view.getUint16(work+4+2*(1545+80),true),
    id:view.getUint16(work+4+2*(1705+80),true)};
assert.deepEqual(landmarks.equalDepthTie,{depth:30,id:1});

const report={sourceBytes:Buffer.byteLength(source),sourceSHA256:sha(source),wasmBytes:wasm.length,
    wasmSHA256:sha(wasm),testWasmSHA256:sha(testWasm),testMemoryPages:8,
    rv32Bytes:native.image.length,rv32SHA256:sha(native.image),invalid,landmarks,rows};
writeFileSync(receiptPath ?? path("receipt.json"),JSON.stringify(report,null,2)+"\n");
