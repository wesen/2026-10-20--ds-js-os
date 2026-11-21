// Exercise both actual Typed compilation targets. The C driver provides the
// winning material handles from real ray geometry and consumes the colors.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import "../../../../../../../picocalc-os/compiler/typed-wasm.js";
import "../../../../../../../picocalc-os/compiler/typed-rv32.js";

const {runRv32}=await import(new URL("../../../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/scripts/review/run-rv32.mjs",import.meta.url));
const [phase,dir]=process.argv.slice(2);
assert(["build","shade","verify"].includes(phase) && dir);
mkdirSync(dir,{recursive:true});
const source=["builders","materials","hand"].map(name=>readFileSync("picocalc-os/worlds/candela/"+name+".typed","utf8")).join("\n");
const scalarRow=`
function hostScalarRow(graph: buffer, work: buffer, materials: buffer, y: i32, out: buffer): i32 {
    for (let x = 0; x < 160; x = x + 1) {
        const rgb = candelaColorAt(graph, work, materials.charCodeAt(x), x, y);
        if (rgb < 0) return 0;
        out.setCharCodeAt(2 * x, rgb / 256);
        out.setCharCodeAt(2 * x + 1, rgb % 256);
    }
    return 160;
}
`;
const wasm=typedWasm.compile(source+scalarRow);
const native=typedRv32.compile(source+scalarRow);
const exports=new WebAssembly.Instance(new WebAssembly.Module(wasm.bytes)).exports;
const memory=new Uint8Array(exports.memory.buffer,0,4096);
const view=new DataView(memory.buffer);
const graph=16, work=768, materials=1200, out=1600, graphBytes=4+303*2;
const fixtures=[
    ["shared-0","candelaHandShared",0],["shared-128","candelaHandShared",128],["shared-256","candelaHandShared",256],
    ["tiles-64","candelaHandTile",64],["tiles-73","candelaHandTile",73],["tiles-128","candelaHandTile",128],
    ["tiles-fallback","candelaHandTile",73]
];
const path=(name,ext)=>resolve(dir,name+"."+ext);
const sha=value=>createHash("sha256").update(value).digest("hex");
const models=(name,args,input)=>runRv32(native,name,args,[],{},input,undefined,500000);
function assertModel(name,args,expected) {
    const input=memory.slice();
    assert.equal(exports[name](...args),expected,name);
    const modeled=models(name,args,input);
    assert(!modeled.trap);
    assert.equal(modeled.result,expected);
    assert.deepEqual(modeled.bytes,memory,name+" full memory parity");
    return modeled.steps;
}
const graphs={};
if (phase==="build") {
    for (const [name,build,weight] of fixtures) {
        memory.fill(0xa5);
        view.setUint32(graph,303,true);
        assertModel(build,[graph],1);
        if (name === "tiles-fallback") {
            // A weight-dependent mix with identical inputs preserves the
            // appearance, but its root defeats the fast tile recognizer.
            assertModel("candelaMix",[graph,8,8,3],9);
            assertModel("candelaMaterial",[graph,9],2);
            assertModel("candelaFloor",[graph,2],1);
        }
        const cell=index=>view.getUint16(graph+4+2*index,true);
        if (name.startsWith("shared")) {
            assert.equal(cell(284),0); // left sphere has original material
            assert.equal(cell(289),1); // right sphere has its own material
            assert.equal(cell(264),0); // material 0 points at original blue
            assert.equal(cell(265),3); // material 1 points at the derived mix
            assert.equal(cell(21),0);  // mix shares the original blue node
            assert.deepEqual([cell(9),cell(10),cell(11)],[30,70,150]);
        }
        const before=memory.slice();
        assertModel("candelaSetParam",[graph,0,weight],1);
        for(let i=0;i<memory.length;i++) {
            if(i!==graph+4+2*295 && i!==graph+5+2*295) assert.equal(memory[i],before[i],name+" topology");
        }
        const edited=memory.slice();
        assertModel("candelaSetParam",[graph,1,87],0);
        assertModel("candelaSetParam",[graph,0,257],0);
        assert.deepEqual(memory,edited);
        writeFileSync(path(name,"graph"),memory.slice(graph,graph+graphBytes));
        graphs[name]={weight,graphSHA256:sha(memory.slice(graph,graph+graphBytes))};
    }
    for (const builder of ["candelaHandShared","candelaHandTile"]) {
        memory.fill(0xa5);
        view.setUint32(graph,302,true);
        const initial=memory.slice();
        assertModel(builder,[graph],0);
        assert.deepEqual(memory,initial);
    }
    memory.fill(0xa5);
    view.setUint32(graph,303,true);
    assertModel("candelaInit",[graph],1);
    for(let i=0;i<64;i++) assertModel("candelaColor",[graph,1,2,3],i);
    for(let i=0;i<16;i++) assertModel("candelaMaterial",[graph,0],i);
    for(let i=0;i<8;i++) assertModel("candelaParameter",[graph,0],i);
    for(let i=0;i<3;i++) assertModel("candelaAddSphere",[graph,68,61,56,26,0],i);
    const full=memory.slice();
    assertModel("candelaColor",[graph,1,2,3],-1);
    assertModel("candelaMaterial",[graph,0],-1);
    assertModel("candelaParameter",[graph,0],-1);
    assertModel("candelaAddSphere",[graph,68,61,56,26,0],-1);
    assert.deepEqual(memory,full);
    writeFileSync(path("graphs","json"),JSON.stringify(graphs,null,2)+"\n");
} else if (phase==="shade") {
    const summaries={};
    for(const [name] of fixtures) {
        let scalarSteps=0, rowSteps=0;
        const descriptor=readFileSync(path(name,"graph"));
        const rows=readFileSync(path(name,"materials"));
        assert.equal(rows.length,160*160*2);
        const colors=new Uint8Array(160*160*4);
        for(let y=0;y<160;y++){
            memory.fill(0x5a);
            memory.set(descriptor,graph);
            view.setUint32(work,192,true);
            view.setUint32(materials,160,true);
            memory.set(rows.subarray(y*320,(y+1)*320),materials+4);
            view.setUint32(out,320,true);
            const initial=memory.slice();
            scalarSteps+=assertModel("hostScalarRow",[graph,work,materials,y,out],160);
            const scalar=memory.slice(out+4,out+644);
            assert.deepEqual(memory.slice(graph,graph+graphBytes),new Uint8Array(descriptor));
            memory.set(initial);
            rowSteps+=assertModel("candelaShadeRow",[graph,work,materials,y,out],160);
            const bulk=memory.slice(out+4,out+644);
            assert.deepEqual(scalar,bulk,name+" row "+y);
            assert.deepEqual(memory.slice(graph,graph+graphBytes),new Uint8Array(descriptor));
            colors.set(bulk,640*y);
        }
        writeFileSync(path(name,"colors"),colors);
        summaries[name]={scalarSteps,rowSteps,materialsSHA256:sha(rows),colorsSHA256:sha(colors)};
    }
    writeFileSync(path("shader","json"),JSON.stringify(summaries,null,2)+"\n");
} else {
    const frames=Object.fromEntries(fixtures.map(([name])=>[name,readFileSync(path(name,"rgb565"))]));
    const pixel=(frame,x,y)=>frame.readUInt16LE(2*(160*y+x));
    const sample={sharedLeft:[],sharedRight:[],tiles:[]};
    for(const weight of [0,128,256]) {
        const frame=frames["shared-"+weight];
        assert.equal(frame.length,51200);
        sample.sharedLeft.push(pixel(frame,60,61));
        sample.sharedRight.push(pixel(frame,110,65));
    }
    assert.equal(new Set(sample.sharedLeft).size,1);
    assert.equal(new Set(sample.sharedRight).size,3);
    for(const weight of [64,73,128]) sample.tiles.push(pixel(frames["tiles-"+weight],12,13));
    assert(new Set(sample.tiles).size>1);
    assert.deepEqual(frames["tiles-fallback"],frames["tiles-73"]);
    assert.equal(new Set(Object.values(frames).map(frame=>sha(frame))).size,6);
    const report={sourceSHA256:sha(source),wasmSHA256:sha(typedWasm.compile(source).bytes),
        nativeSHA256:sha(typedRv32.compile(source).image),
        graphs:JSON.parse(readFileSync(path("graphs","json"))),shader:JSON.parse(readFileSync(path("shader","json"))),
        frames:Object.fromEntries(Object.entries(frames).map(([name,pixels])=>[
            name,{sha256:sha(pixels),...JSON.parse(readFileSync(path(name,"stats.json")))}])),
        samples:{coordinates:{sharedLeft:[60,61],sharedRight:[110,65],tiles:[12,13]},...sample}};
    writeFileSync(path("receipt","json"),JSON.stringify(report,null,2)+"\n");
}
