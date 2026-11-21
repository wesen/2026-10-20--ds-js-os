import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,copyFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {context,root} from "./stage.mjs";

const here=dirname(fileURLToPath(import.meta.url));
const day=resolve(here,"../../.."), pie=readdirSync(day).find(n=>n.startsWith("PICOCALC-TYPED-PIE--"));
const {runRv32}=await import(resolve(day,pie,"scripts/review/run-rv32.mjs"));
const [work,heldout,artifacts]=process.argv.slice(2);
assert(work && heldout && artifacts);
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const arms=["stock","leaf","inline"];
const oracleRows={};
const stage=mkdtempSync(resolve(tmpdir(),"native-wave-burst-"));
try {
    for(const name of ["burst.typed","manifest-input.json"])
        copyFileSync(resolve(heldout,name),resolve(stage,name));
    const oracle=readFileSync(resolve(heldout,"01-burst-oracle.mjs"),"utf8");
    assert.equal(oracle.split("const native = typedRv32.compile(source);").length,2);
    for(const arm of arms) {
        const image=resolve(artifacts,`burst-${arm}.bin`);
        const manifest=resolve(artifacts,`burst-${arm}.json`);
        const patched=oracle.replace("const native = typedRv32.compile(source);",
            `const native={image:readFileSync(${JSON.stringify(image)}), entries:JSON.parse(readFileSync(${JSON.stringify(manifest)},"utf8")).entries, relocations:[]};`);
        const script=resolve(stage,"verify.mjs"), result=resolve(stage,"result.json");
        writeFileSync(script,patched);
        assert.equal(process.cwd(),root);
        const argv=process.argv;
        try {
            process.argv=[argv[0],script,result];
            await import(pathToFileURL(script).href+"?arm="+arm);
        } finally {
            process.argv=argv;
        }
        oracleRows[arm]=JSON.parse(readFileSync(result,"utf8"));
    }
} finally { rmSync(stage,{recursive:true,force:true}); }
for(const arm of arms) {
    assert.equal(oracleRows[arm].total,1603);
    assert.equal(oracleRows[arm].traps,101);
}

const vms=[context(false),context(true),context(true),context(true)];
const names=["stock","leaf","leaf-buffered","inline"];
const options=[{}, {leafExperiment:"leaf"}, {leafExperiment:"leaf",streamFunctions:false}, {leafExperiment:"inline"}];
function compile(source) {
    return vms.map((vm,index)=>vm.typedRv32.compile(source,[],undefined,options[index]));
}
function measurements(source) {
    const first=compile(source);
    const samples=Object.fromEntries(names.map(n=>[n,[]]));
    for(let rep=0;rep<13;rep++) for(let j=0;j<4;j++){
        const k=(j+rep)%4;
        const at=performance.now();
        const next=vms[k].typedRv32.compile(source,[],undefined,options[k]);
        samples[names[k]].push(performance.now()-at);
        assert.equal(sha(next.image),sha(first[k].image));
    }
    assert.equal(sha(first[1].image),sha(first[2].image));
    return Object.fromEntries(names.map((name,k)=>[name,{imageSha256:sha(first[k].image),bytes:first[k].image.length,
        stats:first[k].leafStats??null,compileMs:samples[name]}]));
}

const adverse=`
function div(a:i32,b:i32):i32 { return a/b+a; }
function rem(a:i32,b:i32):i32 { return a%b+a; }
function branch(a:i32):i32 { if(a<0) {return 0-a;} return a; }
function chain(x:i32,y:i32):i32 { return x*4 + branch(x) + div(x,y); }
function wide(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32):i32 { return (a+b)*(c+d)+e*f+g+h; }
function spill(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32):i32 { return a+(b+(c+(d+(e+(f+(g+h)))))); }
function local(a:i32):i32 {let x=a; x=x+1; return x;}
function loop(a:i32):i32 {let x=0;while(x<a){x=x+1;}return x;}
`;
const adverseArms=compile(adverse);
const empty=new Uint8Array(48).fill(0xa5);
let adversarialChecks=0;
for(const row of [["div",[-2147483648,-1]],["div",[18,0]],["rem",[18,0]],["div",[-37,2]],
    ["rem",[-2147483648,-1]],["rem",[-37,3]],["branch",[-128]],["branch",[26]],["local",[9]],["loop",[5]],
    ["chain",[-91,7]],["wide",[1,2,3,4,5,6,7,8]],["spill",[9,8,7,6,5,4,3,2]]]) {
    const runs=adverseArms.map(p=>runRv32(p,row[0],row[1],[],{},empty));
    for(const run of runs.slice(1)) {
        assert.equal(run.trap,runs[0].trap);
        assert.equal(run.result,runs[0].result);
        assert.deepEqual(run.bytes,runs[0].bytes);
        adversarialChecks++;
    }
}
for(const fn of ["spill","local","loop"]) assert(!adverseArms[1].leafStats.leaves.includes(fn));

const painter=readFileSync(resolve(root,"picocalc-os/worlds/chess/painter-3d.typed"),"utf8");
const poseArms=compile(painter);
const render=[];
for (const phase of [0,5,8,23]) {
    const memory=new Uint8Array(24836).fill(0xa5);
    const view=new DataView(memory.buffer);
    view.setUint32(0,91,true);
    view.setUint32(256,12288,true);
    const opening="c a b d e b a c".replaceAll(" ","")+"9".repeat(8)+"0".repeat(32)+"1".repeat(8)+"42356324";
    for(let n=0;n<64;n++) view.setUint16(4+2*n,parseInt(opening[n],16),true);
    for(let n=64;n<91;n++) view.setUint16(4+2*n,0,true);
    for(const [n,v] of [[72,52],[74,64],[76,64],[78,64],[90,phase]]) view.setUint16(4+2*n,v,true);
    const results=poseArms.map(p=>runRv32(p,"paintChess",[0,256],[],{},memory,undefined,2e6));
    for(const r of results) {
        assert.equal(r.trap,false);
        assert.equal(r.result,results[0].result);
        assert.deepEqual(r.bytes,results[0].bytes);
    }
    render.push({phase,words:results[0].result,modelInstructions:Object.fromEntries(names.map((n,k)=>[n,results[k].steps]))});
}
const chess=readFileSync(resolve(work,"engine.typed"),"utf8");
const out={heldOut:oracleRows,adversarialChecks,adverseArm:{leaves:adverseArms[1].leafStats.leaves,inline:adverseArms[3].leafStats},
    painter:{render,compiles:measurements(painter)},chess:{compiles:measurements(chess)}};
writeFileSync(resolve(work,"host-check.json"),JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({adversarialChecks, heldOut:oracleRows,painter:render}));
