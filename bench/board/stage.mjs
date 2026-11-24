// Stage a paired ESP32-P4 board study: compile every mode's ray tracer and Chess evaluator to RV32, check the pins,
// and emit the generated sources the diagnostic app (bench/board/app) is built from.
//
//   node bench/board/stage.mjs STUDY.json OUT        writes OUT/generated/{blobs.S,inputs.h,cold_inputs.h,manifest.json,...}
//
// STUDY.json: {"modes": [{"name": "control", "options": {...}}, ...], "pins": {"control": "<ray image sha256>", ...},
//              "blocks": 6, "internalWorkLast": false}
// Mode 0 is the control. Every mode named in "pins" must compile the ray tracer to exactly that image (an image whose
// rows are already known), so a study cannot silently time a different compiler. Chess is timed for mode 0 and the
// last mode. "internalWorkLast" puts the last mode's Typed frame work buffer in internal RAM (with the last mode's
// options equal to mode 0's, the pair then measures only where the buffer lives).
// Promoted from PICOCALC-SHADOW-CODEGEN scripts/board/01-images.mjs, with RAY-PARITY 10-stage-board.py's
// substitutions (modes, pin) as data (PICOCALC-REPO-LAYOUT Phase A).
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync as read,writeFileSync as write,mkdirSync,readdirSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext,runInContext} from "node:vm";
import {boards,loadSource,independentScore} from "./chess-holdout.mjs";
import {root} from "../lib/repo.mjs";

if(process.argv.length!==4){console.error("usage: node bench/board/stage.mjs STUDY.json OUT");process.exit(2);}
const study=JSON.parse(read(process.argv[2],"utf8")), out=resolve(process.argv[3],"generated");
assert(Array.isArray(study.modes)&&study.modes.length>=2,"a study compares at least two modes");
assert((study.blocks??6)===6,"bench.c times six blocks");
const names=study.modes.map(m=>m.name); assert.equal(new Set(names).size,names.length,"mode names must differ");
for(const name of Object.keys(study.pins??{})) assert(names.includes(name),"pin for unknown mode "+name);
mkdirSync(out,{recursive:true});
const sha=b=>createHash("sha256").update(b).digest("hex");
const cv=b=>Array.from(b).reduce((h,n)=>Math.imul(h^n,16777619)>>>0,2166136261);
const os=join(root,"firmware"), source=read(join(root,"apps/typed/raytrace/raytrace.typed"),"utf8");
const bundle=["tape","typed-wasm","typed-rv32","typed-rv32-inline","typed-rv32-loops","typed-rv32-kernel","typed-pie-loops"].map(n=>read(join(root,"compiler/typed",n+".js"),"utf8")).join("\n");
const realm=createContext({});runInContext(bundle,realm);
const chess=loadSource();
const fixtures=JSON.parse(read(join(root,"bench/reference/ray-frame-fixtures.json")));
const emit=(f,s)=>write(join(out,f),s);
const wasm=new WebAssembly.Instance(new WebAssembly.Module(realm.typedWasm.compile(source).bytes)).exports;
const view=new DataView(wasm.memory.buffer), ptr=64;
const u=i=>view.getUint16(ptr+4+2*i,true);
function classify(x,y){
    let outcomes=[];
    for(let s=0;s<u(16);s++){
        const box=21+4*s, obj=1+5*s;
        if(Math.abs(4096+32*x-u(box))>u(box+2)){outcomes.push("X"); continue;}
        if(Math.abs(4096+32*y-u(box+1))>u(box+3)){outcomes.push("Y");continue;}
        const dx=u(obj)-x,dy=u(obj+1)-y,dz=156-u(obj+2),rad=u(obj+3);
        const dot=dx*(u(17)-32)+dy*(u(18)-32)+32*dz;
        if(dot>0 && (dx*dx+dy*dy+dz*dz-rad*rad)*u(19)<=dot*dot){outcomes.push("H");break;}
        outcomes.push("M");
    }
    return outcomes.join("");
}
const mix=[],planes=[],header=[],single=[];
for(const [f,cell] of fixtures.entries()){
    view.setUint32(ptr,2048,true);new Uint8Array(view.buffer,ptr+4,4096).fill(0);
    view.setUint16(ptr+4,cell.stride,true);
    assert.equal(wasm.typedRayPrepare(ptr,...cell.pose),1);
    const meta=Array.from({length:33},(_,i)=>u(i));
    const plane=new Uint8Array(160*160), patterns={};
    for(let y=0;y<160;y++){
        wasm.typedRayComputeRow(ptr,y);
        for(let x=0;x<160;x++){
            if(u(1705+x)!==0) continue;
            const seq=classify(x,y),v=wasm.typedRayInShadow(ptr,x,y);
            assert.equal(+seq.endsWith("H"),v);
            patterns[seq]=(patterns[seq]??0)+1;
            plane[y*160+x]=1+v;
        }
    }
    mix.push({fixture:cell.fixture,pose:cell.pose,patterns,maskSHA:sha(plane)});
    planes.push(plane);
    header.push("{"+[JSON.stringify(cell.fixture),...cell.pose,cell.stride,...cell.hashes.map(n=>n+"u"),"{"+meta+"}"].join(",")+"}");
    if(f===0){
        view.setUint16(ptr+4+32,1,true);
        const p=new Uint8Array(25600);
        for(let i=0;i<p.length;i++){const x=i%160,y=i/160|0,seq=classify(x,y);assert.equal(+seq.endsWith("H"),wasm.typedRayInShadow(ptr,x,y));p[i]="XYMH".indexOf(seq);assert(p[i]<4);}
        single.push(p);
    }
}
emit("paths.json",JSON.stringify(mix,null,2)+"\n"); emit("masks.bin",Buffer.concat([...planes,...single]));
const programs=[source,chess], records=[],symbols=["clean","shadow","primary","shade"],entries=["typedRayFrame","typedRayInShadow","typedRayTrace","typedRayShade"];
const opts=study.modes.map(m=>"("+JSON.stringify(m.options)+")");
const asm=['.section .text.shadow_lab,"ax",@progbits','.option push','.option norvc'], declarations=[],tables=[[],[],[],[],[]], checks=[[],[]];
for(let mode=0;mode<opts.length;mode++)for(const [family,src] of programs.entries()){
    const options=runInContext(opts[mode],realm);
    const p=realm.typedRv32.compile(src,[],undefined,options);
    const bytes=Buffer.from(p.image); assert.equal(p.relocations.length,0);
    const file='image_'+family+'_'+mode+'.bin', label='shadow_image_'+family+'_'+mode;
    emit(file,bytes); asm.push('.balign 16',label+':','.incbin "'+join(out,file)+'"');
    const used=family===0?entries:["chessEvaluate"];
    used.forEach((name,i)=>{
        if(name==="typedRayShade" && p.entries[name]===undefined) name=Object.keys(p.entries).find(n=>n.startsWith("typedRayShade")&&n.includes("Plane"));
        const at=p.entries[name];assert(Number.isInteger(at),"missing "+name+" "+Object.keys(p.entries));
        const sym=(family===0?symbols[i]:"chess")+mode, table=family===0?i:4;
        asm.push('.global '+sym,'.set '+sym+', '+label+'+'+at);tables[table].push(sym);
        declarations.push("extern int "+sym+"("+["Surf*,Surf*,int,int,int,int","void*,int,int","Surf*,Surf*,Surf*,int,int","Surf*,Surf*,Surf*,Surf*,int,int,int,int","Surf*,int"][table]+");");
    });
    checks[family].push(cv(bytes));
    records.push({family:family===0?"ray":"chess",name:study.modes[mode].name,mode:opts[mode],sha:sha(bytes),bytes:bytes.length,entries:p.entries});
}
for(const [name,pin] of Object.entries(study.pins??{})){
    const r=records[2*names.indexOf(name)]; assert.equal(r.sha,pin,"mode "+name+": the ray image is not its pin");
}
const b=boards(); const cm=new WebAssembly.Instance(new WebAssembly.Module(realm.typedWasm.compile(chess).bytes)).exports;
const cb=new DataView(cm.memory.buffer);for(const values of Object.values(b)){
    cb.setUint32(64,values.length,true);values.forEach((x,i)=>cb.setUint16(68+2*i,x,true));
    for(const adv of [0,1])assert.equal(cm.chessEvaluate(64,adv),independentScore(values,adv));
}
const cStr=(file,name,str)=>{emit(file,str);return '.global '+name+'\n'+name+':\n.incbin "'+join(out,file)+'"\n.byte 0';};
asm.push('.option pop','.section .rodata.shadow_lab,"a",@progbits','.balign 4','.global shadow_masks','shadow_masks:','.incbin "'+join(out,'masks.bin')+'"',cStr("compiler.js","shadow_bundle",bundle),cStr("ray.typed","ray_src",source),cStr("chess.typed","chess_src",chess));
emit("blobs.S",asm.join("\n")+"\n");
emit("inputs.h",["#define NMODE "+opts.length,"#define INTERNAL_WORK_LAST "+(study.internalWorkLast?1:0),"static const Case fixtures[]={"+header.join(",\n")+"};",...declarations,
    ...["Clean","Shadow","Primary","Shade","Chess"].map((type,i)=>'static '+type+' const '+type.toLowerCase()+'s[]={'+tables[i].join(",")+'};'),
    'static const unsigned short chess_boards[][133]={'+Object.values(b).map(v=>'{'+v+'}')+'};',
    'static const int chess_expected[][2]={'+Object.values(b).map(v=>'{'+[independentScore(v,0),independentScore(v,1)]+'}')+'};'].join("\n")+"\n");
emit("cold_inputs.h",['#define NMODE '+opts.length,'extern const char shadow_bundle[],ray_src[],chess_src[];','static const char *const cells[]={'+opts.map(v=>JSON.stringify("typedRv32.compile(input,[],undefined,"+v+").image")).join(",")+'};','static const uint32_t expected[][NMODE]={'+checks.map(row=>'{'+row.map(n=>n+'u')+'}')+'};'].join('\n')+'\n');
emit("manifest.json",JSON.stringify({study,sourceSHA:sha(source),chessSHA:sha(chess),bundleSHA:sha(bundle),records},null,2)+"\n");
console.log(JSON.stringify(records.map(r=>({family:r.family,name:r.name,sha:r.sha.slice(0,12),bytes:r.bytes}))));
