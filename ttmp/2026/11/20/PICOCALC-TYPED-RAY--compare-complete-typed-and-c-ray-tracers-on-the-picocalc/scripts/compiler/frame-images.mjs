import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {createContext,runInContext} from "node:vm";
import {positiveDivisorCompiler} from "./positive-divisors.mjs";
const [sourceFile,dir] = process.argv.slice(2);
const source=readFileSync(sourceFile,"utf8");
const read=n=>readFileSync("picocalc-os/compiler/"+n+".js","utf8");
const listing={};
for(const arm of ["stock","positive"]) {
    const ctx=createContext({});
    runInContext(read("typed-wasm"),ctx);
    runInContext(arm==="stock"?read("typed-rv32"):positiveDivisorCompiler(read("typed-rv32")),ctx);
    const program=ctx.typedRv32.compile(source);
    const buffered=ctx.typedRv32.compile(source,[],undefined,{streamFunctions:false});
    assert.deepEqual(program.image,buffered.image);
    assert.equal(program.relocations.length,0,"complete renderer has no imported host helpers");
    const image=Buffer.from(program.image);
    writeFileSync(join(dir,arm+".bin"),image);
    const funcs=Object.entries(program.entries);
    const rows={};
    for (const [i,[name,at]] of funcs.entries()) {
        const end=funcs[i+1]?.[1]??image.length;
        const row={offset:at,bytes:end-at,div:0,rem:0,trap:0,branch:0,load:0,store:0};
        for (let p=at;p<end;p+=4) {
            const word=image.readUInt32LE(p),op=word&127,sub=(word>>>12)&7,fun=word>>>25;
            if(op===0x33&&fun===1&&sub===4) row.div++;
            if(op===0x33&&fun===1&&sub===6) row.rem++;
            if(word===0x00100073) row.trap++;
            if(op===0x63) row.branch++;
            if(op===0x03) row.load++;
            if(op===0x23) row.store++;
        }
        rows[name]=row;
    }
    listing[arm]=rows;
    if(arm==="stock"){
        // The standalone Typed writer normally declares one page. Only the host
        // memory limit changes so all three 51,200-byte diagnostic outputs fit.
        const wasm=Buffer.from(ctx.typedWasm.compile(source).bytes);
        let p=8;
        while(p<wasm.length){
            const tag=wasm[p++];let n=0,s=0,b;
            do{b=wasm[p++];n|=(b&127)<<s;s+=7;}while(b&128);
            if(tag===5){assert.deepEqual([...wasm.subarray(p,p+n)],[1,1,1,1]);wasm[p+2]=wasm[p+3]=4;break;}
            p+=n;
        }
        assert(WebAssembly.validate(wasm));
        const guest=new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
        const capacities=[25600,25600,25600,2048];
        for (const [i,pose] of JSON.parse(readFileSync(join(dir,"poses.json"),"utf8")).entries()){
            const bytes=new Uint8Array(guest.memory.buffer);
            bytes.fill(0xa5);
            const view=new DataView(bytes.buffer);
            const pointers=[];let here=64;
            for(const capacity of capacities){
                pointers.push(here);view.setUint32(here,capacity,true);
                here+=4+2*capacity+8;
            }
            view.setUint16(pointers[3]+4,0,true); // zero requests the default output stride
            const status=guest.typedRayRender(...pointers,...pose);
            assert.equal(status,1);
            for(const [j,point] of pointers.entries()){
                assert.equal(view.getUint32(point,true),capacities[j]);
                assert(bytes.subarray(point+4+2*capacities[j],point+12+2*capacities[j]).every(x=>x===0xa5));
            }
            writeFileSync(join(dir,"wasm-"+i+".bin"),Buffer.concat(pointers.slice(0,3).map(p=>bytes.subarray(p+4,p+51204))));
        }
    }
}
writeFileSync(join(dir,"listing.json"),JSON.stringify(listing,null,2));
