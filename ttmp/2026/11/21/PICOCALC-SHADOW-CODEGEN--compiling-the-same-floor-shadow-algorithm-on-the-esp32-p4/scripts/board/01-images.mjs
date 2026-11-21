import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync as read,writeFileSync as write,mkdirSync,readdirSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createContext,runInContext} from "node:vm";
import {boards,loadSource,independentScore} from "../validation/holdout.mjs";

const here=dirname(fileURLToPath(import.meta.url)), ticket=resolve(here,"../.."), root=resolve(ticket,"../../../../..");
const out=resolve(process.argv[2]), candidate=process.argv.includes("--candidate");
mkdirSync(out,{recursive:true});
const sha=b=>createHash("sha256").update(b).digest("hex");
const cv=b=>Array.from(b).reduce((h,n)=>Math.imul(h^n,16777619)>>>0,2166136261);
const os=join(root,"picocalc-os"), source=read(join(os,"worlds/raytrace/raytrace.typed"),"utf8");
const bundle=["typed-wasm","typed-rv32","typed-pie-loops"].map(n=>read(join(os,"compiler",n+".js"),"utf8")).join("\n");
const realm=createContext({});runInContext(bundle,realm);
const chess=loadSource();
const previous=join(ticket,"..",readdirSync(join(ticket,"..")).find(n=>n.startsWith("PICOCALC-SIMD-LAB--")));
const fixtures=JSON.parse(read(join(previous,"various/director/frame-fixtures.json")));
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
const opts=["({pieLoops:'pie-empty'})"];
if(candidate) opts.push("({pieLoops:'pie-empty',inlineGuardedReturns:fn=>fn==='typedRayInShadow'})","({pieLoops:'pie-empty',inlineGuardedReturns:true})");
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
    records.push({family:family===0?"ray":"chess",mode:opts[mode],sha:sha(bytes),bytes:bytes.length,entries:p.entries});
}
assert.equal(records[0].sha,"9a4a2356a86beee281fb79dcc199bc2369b819ef9b0a5f5c28d444ff4719f26f");
const b=boards(); const cm=new WebAssembly.Instance(new WebAssembly.Module(realm.typedWasm.compile(chess).bytes)).exports;
const cb=new DataView(cm.memory.buffer);for(const values of Object.values(b)){
    cb.setUint32(64,values.length,true);values.forEach((x,i)=>cb.setUint16(68+2*i,x,true));
    for(const adv of [0,1])assert.equal(cm.chessEvaluate(64,adv),independentScore(values,adv));
}
const cStr=(file,name,str)=>{emit(file,str);return '.global '+name+'\n'+name+':\n.incbin "'+join(out,file)+'"\n.byte 0';};
asm.push('.option pop','.section .rodata.shadow_lab,"a",@progbits','.balign 4','.global shadow_masks','shadow_masks:','.incbin "'+join(out,'masks.bin')+'"',cStr("compiler.js","shadow_bundle",bundle),cStr("ray.typed","ray_src",source),cStr("chess.typed","chess_src",chess));
emit("blobs.S",asm.join("\n")+"\n");
emit("inputs.h",["#define NMODE "+opts.length,"static const Case fixtures[]={"+header.join(",\n")+"};",...declarations,
    ...["Clean","Shadow","Primary","Shade","Chess"].map((type,i)=>'static '+type+' const '+type.toLowerCase()+'s[]={'+tables[i].join(",")+'};'),
    'static const unsigned short chess_boards[][133]={'+Object.values(b).map(v=>'{'+v+'}')+'};',
    'static const int chess_expected[][2]={'+Object.values(b).map(v=>'{'+[independentScore(v,0),independentScore(v,1)]+'}')+'};'].join("\n")+"\n");
emit("cold_inputs.h",['#define NMODE '+opts.length,'extern const char shadow_bundle[],ray_src[],chess_src[];','static const char *const options[]={'+opts.map(v=>JSON.stringify(v)).join(",")+'};','static const uint32_t expected[][NMODE]={'+checks.map(row=>'{'+row.map(n=>n+'u')+'}')+'};'].join('\n')+'\n');
emit("manifest.json",JSON.stringify({sourceSHA:sha(source),chessSHA:sha(chess),bundleSHA:sha(bundle),records},null,2)+"\n");
