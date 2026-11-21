// Inspect actual compiler callbacks and final bytes. Usage: node typed-inspect.mjs --help
import fs from "node:fs";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {parseArgs} from "node:util";
import {decode,hex} from "./typed-inspect/rv32.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => fs.readFileSync(file,"utf8");
const usage = `node picocalc-os/tools/typed-inspect.mjs SOURCE [--function NAME] [--target both|wasm|rv32]
    [--jsonl] [--profile PC-COUNTS.json] [--backend RV32.js] [--buffered] [--imports SDK.json] [--hot N]
node picocalc-os/tools/typed-inspect.mjs diff BEFORE.jsonl AFTER.jsonl

Offsets are bytes in the final Wasm module or RV32 image. A profile supplies
{imageSha256, counts:[[pc,executions], ...]} for one execution of the native image.
Imports take the native compiler's [{name,params,result}] declarations (--target rv32).`;
const format="typed-inspect/1";

function profileCounts(file, bytes) {
    const p=JSON.parse(read(file));
    if (p.imageSha256!==hash(bytes)) throw Error("profile image digest differs from compiled RV32 image");
    if (!Array.isArray(p.counts)) throw Error("missing PC counts");
    const counts=new Map();
    for (const [pc,n] of p.counts) {
        if (!Number.isSafeInteger(pc) || pc<0 || pc%4 || pc>=bytes.length ||
            !Number.isSafeInteger(n) || n<0 || counts.has(pc)) throw Error("invalid profile entry at "+pc);
        counts.set(pc,n);
    }
    return counts;
}

function describeStack(ins, range, operations, locals, localCount) {
    if (ins.base!=="sp") return;
    if (range.role==="specialized code") return "specialized frame access";
    if (ins.reg==="ra" && ["epilogue","prologue"].includes(range.role)) return "return address";
    if (range.role==="prologue") return "incoming argument";
    const slot=ins.offset/4;
    const local=locals.find(l=>l.index===slot);
    if (local) return (local.parameter?"parameter ":"local ")+(local.name??("#"+slot));
    if (slot>=0 && slot<localCount) return "compiler temporary #"+slot;
    if (operations.some(o=>o.opcode===0x10)) return "live operand across call";
    return "operand stack";
}

function functionDump(front, emission, program, bytes, counts, source) {
    const native=emission.target==="rv32";
    const origin=front.sourceText??source;
    const starts=[0];
    for (let i=0;i<origin.length;i++) if (origin[i]==="\n") starts.push(i+1);
    const operations=front.operations.map(op=>{
        if (!op.source) return op;
        let lo=0,hi=starts.length;
        while (lo+1<hi) {
            const mid=Math.floor((lo+hi)/2);
            if (starts[mid]<=op.source.start) lo=mid; else hi=mid;
        }
        return {...op,source:{...op.source,line:lo+1,column:op.source.start-starts[lo]+1,
            snippet:origin.slice(starts[lo],starts[lo+1]??origin.length).trim()}};
    });
    const offsets=new Map(operations.map(o=>[o.offset,o.ordinal]));
    const reloc=new Map((program.relocations??[]).map(r=>[r.offset,r.index]));
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let observed=0, stackAccesses=0;
    const ranges=emission.ranges.map(r=>{
        if (!native) return {start:r.start,end:r.end,ordinals:r.ordinal==null?[]:[r.ordinal],
            role:r.role??"operation",bytes:Buffer.from(bytes.subarray(r.start,r.end)).toString("hex")};
        const ordinals=[];
        if (r.inputStart!=null) {
            const first=offsets.get(r.inputStart);
            if (first===undefined) throw Error("no frontend operation for native tape offset "+r.inputStart);
            for (let i=first;i<operations.length && operations[i].offset<r.inputEnd;i++) ordinals.push(i);
        }
        const ops=ordinals.map(i=>operations[i]);
        const words=[];
        for(let pc=r.start;pc<r.end;pc+=4) {
            const word=view.getUint32(pc,true);
            const ins=decode(word,pc,reloc.get(pc));
            const stack=describeStack(ins,r,ops,front.locals,emission.localCount);
            const executions=counts ? counts.get(pc)??0 : undefined;
            observed+=executions??0;
            if (stack) stackAccesses+=executions??0;
            words.push({pc,word,text:ins.text,stack,executions});
        }
        const decisions=[...(r.decisions??[])];
        if (ops.some(o=>o.opcode===0x6d || o.opcode===0x6f)) {
            if (words.some(w=>w.word===0x00100073)) decisions.push("checked signed arithmetic: emitted trap path");
            else if (ops[0].opcode===0x41 && ops[0].operands[0]>0)
                decisions.push("positive literal divisor: zero and signed division overflow are impossible");
        }
        if (ops.some(o=>o.opcode===0xf1) && words.some(w=>w.word===0x00100073))
            decisions.push("unsigned index compared with runtime capacity before payload access");
        return {start:r.start,end:r.end,ordinals,role:r.role,segment:r.segment,decisions,words};
    });
    if (!native && emission.start<emission.instructionsStart)
        ranges.unshift({start:emission.start,end:emission.instructionsStart,ordinals:[],role:"local declarations",
            bytes:Buffer.from(bytes.subarray(emission.start,emission.instructionsStart)).toString("hex")});
    return {kind:"function",target:emission.target,name:front.function,start:emission.start,end:emission.end,
        instructionsStart:emission.instructionsStart,frame:emission.frame,leafDecision:emission.leafDecision,
        locals:front.locals,operations,sourceText:front.sourceText,ranges,
        executions:counts?observed:undefined,stackExecutions:counts?stackAccesses:undefined};
}

function inspect(file,v) {
    const target=v.target??"both";
    if (!["wasm","rv32","both"].includes(target)) throw Error("invalid target: "+target);
    if (v.imports && target!=="rv32") throw Error("--imports requires --target rv32");
    if ((v.backend || v.profile) && target==="wasm") throw Error("--backend and --profile require a native target");
    const source=read(file), ctx=vm.createContext({});
    for(const name of ["typed-wasm","typed-async","typed-rv32"]) {
        const path=name==="typed-rv32" && v.backend?v.backend:new URL("../compiler/"+name+".js",import.meta.url);
        vm.runInContext(read(path),ctx,{filename:String(path)});
    }
    const output=[];
    for(const name of target==="both"?["wasm","rv32"]:[target]) {
        const events=[];
        const options={inspect:{function:v.function,emit:e=>events.push(e)},streamFunctions:!v.buffered};
        const program=name==="wasm"?ctx.typedWasm.compile(source,options):
            ctx.typedRv32.compile(source,v.imports?JSON.parse(read(v.imports)):[],undefined,options);
        const bytes=program.image??program.bytes;
        const counts=name==="rv32" && v.profile?profileCounts(v.profile,bytes):null;
        output.push({kind:"module",format,target:name,sourceSha256:hash(source),imageSha256:hash(bytes),bytes:bytes.length});
        const functions=new Map(events.filter(e=>e.kind==="frontend").map(e=>[e.function,e]));
        if (v.function && !functions.has(v.function)) throw Error("no observed function named "+v.function);
        for(const e of events.filter(e=>e.kind==="emission")) output.push(functionDump(functions.get(e.function),e,program,bytes,counts,source));
        if (!events.some(e=>e.kind==="emission")) throw Error("backend did not supply emission ranges");
    }
    return output;
}

function opText(op) {return op.op+(op.operands.length?" "+op.operands.join(" "):"");}
function listing(rows) {
    for(const row of rows) {
        if(row.kind==="module") {console.log(row.target+"  "+row.bytes+" bytes  sha256 "+row.imageSha256); continue;}
        console.log("\n"+row.name+"  ["+hex(row.start)+", "+hex(row.end)+")",row.frame??"",row.leafDecision??"");
        console.log("locals",row.locals.map(l=>l.index+"="+l.name+":"+l.type).join("  "));
        for(const r of row.ranges) {
            const ops=r.ordinals.map(i=>row.operations[i]);
            const span=ops[0]?.source;
            console.log("  "+hex(r.start)+".."+hex(r.end),ops.map(opText).join(" + ")||r.role,
                span?span.unit+":"+span.line+":"+span.column+" "+span.snippet:"",r.segment??"",r.bytes??"");
            for(const why of r.decisions??[]) console.log("    "+why);
            for(const w of r.words??[]) console.log("    "+hex(w.pc),w.word.toString(16).padStart(8,"0"),w.text,
                w.stack?"["+w.stack+"]":"",w.executions===undefined?"":"×"+w.executions);
        }
        if(row.executions!==undefined) console.log("  executed",row.executions,"instructions;",row.stackExecutions,"stack accesses");
    }
}

function hotStacks(rows, limit) {
    const accesses=[];
    for (const row of rows.filter(r=>r.kind==="function" && r.target==="rv32")) {
        for (const range of row.ranges) {
            for (const word of range.words) {
                if (word.stack && word.executions)
                    accesses.push({name:row.name,word,source:row.operations[range.ordinals[0]]?.source});
            }
        }
    }
    accesses.sort((a,b)=>b.word.executions-a.word.executions || a.word.pc-b.word.pc);
    console.log("Executions  Native PC   Stack access and source");
    for (const {name,word,source} of accesses.slice(0,limit)) {
        console.log(String(word.executions).padStart(10),hex(word.pc).padStart(10),
            name,word.text,"["+word.stack+"]",source?source.unit+":"+source.line+":"+source.column:"");
    }
}

function readDump(file) {
    const rows=read(file).trim().split(/\n/).map(line=>JSON.parse(line));
    if(!rows.length || !rows.some(r=>r.kind==="module") || rows.some(r=>r.kind==="module" && r.format!==format))
        throw Error("expected a typed-inspect JSON Lines listing");
    return rows;
}
function diff(before,after) {
    const key=r=>r.target+"/"+r.name;
    const select=rows=>new Map(rows.filter(r=>r.kind==="function").map(r=>[key(r),r]));
    const left=select(before),right=select(after);
    for(const k of new Set([...left.keys(),...right.keys()])) {
        const a=left.get(k),b=right.get(k);
        if(!a || !b) { console.log(k,a?"removed":"added"); continue; }
        console.log(k,"bytes",a.end-a.start,"->",b.end-b.start);
        if(a.executions!==undefined && b.executions!==undefined)
            console.log("  executions",a.executions,"->",b.executions,"delta",b.executions-a.executions);
        const tape=r=>JSON.stringify(r.operations.map(o=>[o.op,o.operands]));
        if(tape(a)!==tape(b)) { console.log("  operation streams differ; inspect each listing for source locations"); continue; }
        const boundaries=r=>new Set(r.ranges.filter(x=>x.ordinals.length).map(x=>x.ordinals[0]));
        const aa=boundaries(a),bb=boundaries(b);
        const dividers=[...aa].filter(n=>bb.has(n)).sort((x,y)=>x-y);
        dividers.push(a.operations.length);
        function summary(row,lo,hi) {
            const rs=row.ranges.filter(r=>r.ordinals.length && lo<=r.ordinals[0] && r.ordinals[0]<hi);
            return {encoding:rs.map(r=>r.words?r.words.map(w=>w.word).join(","):r.bytes).join("|"),
                bytes:rs.reduce((n,r)=>n+r.end-r.start,0),hits:row.executions===undefined?undefined:
                rs.reduce((n,r)=>n+r.words.reduce((s,w)=>s+w.executions,0),0),
                decisions:[...new Set(rs.flatMap(r=>r.decisions??[]))].join(", ")};
        }
        for(let i=0;i+1<dividers.length;i++) {
            const lo=dividers[i],hi=dividers[i+1],x=summary(a,lo,hi),y=summary(b,lo,hi);
            if(JSON.stringify(x)===JSON.stringify(y)) continue;
            console.log("  #"+lo+" "+a.operations.slice(lo,hi).map(opText).join(" + "),
                "bytes",x.bytes,"->",y.bytes,x.hits===undefined?"":"executions "+x.hits+" -> "+y.hits,
                x.decisions===y.decisions?"":x.decisions+" -> "+y.decisions,
                x.bytes===y.bytes && x.encoding!==y.encoding?"different encoding":"");
        }
        for (const role of ["prologue","epilogue","specialized code","local declarations"]) {
            const size=row=>row.ranges.filter(r=>r.role===role).reduce((total,r)=>total+r.end-r.start,0);
            if(size(a)!==size(b)) console.log("  "+role,"bytes",size(a),"->",size(b));
        }
    }
}
try {
    const {values:v,positionals:p}=parseArgs({allowPositionals:true,options:{
        function:{type:"string"},target:{type:"string"},profile:{type:"string"},backend:{type:"string"},
        hot:{type:"string"},imports:{type:"string"},buffered:{type:"boolean"},jsonl:{type:"boolean"},help:{type:"boolean"}}});
    if(v.help) console.log(usage);
    else if(p[0]==="diff" && p.length===3) diff(readDump(p[1]),readDump(p[2]));
    else if(p.length===1) {
        if(v.hot!==undefined && (!/^\d+$/.test(v.hot) || Number(v.hot)<1 || !v.profile || v.jsonl))
            throw Error("--hot N requires a positive limit and --profile, using text output");
        const rows=inspect(p[0],v);
        if(v.jsonl) for(const row of rows) console.log(JSON.stringify(row)); else if(v.hot) hotStacks(rows,Number(v.hot)); else listing(rows);
    } else throw Error(usage);
} catch(e) { console.error(e.message); process.exitCode=1; }
