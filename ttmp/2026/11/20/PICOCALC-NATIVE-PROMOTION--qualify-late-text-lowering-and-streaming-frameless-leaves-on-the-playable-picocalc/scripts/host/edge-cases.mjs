import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const sha = data => createHash("sha256").update(data).digest("hex");

export function checkEdgeCases(stock, current, runRv32) {
    const lengths = [0,1,7,8,511,1022];
    const literals = lengths.map(n => n < 3 ? "x".repeat(n) : "☺🐈" + "Z".repeat(n-3));
    const source = `
record Header { length: i32; }
function rhs(mark: buffer, src: string, q: i32): i32 { mark.setCharCodeAt(0,515); return src.charCodeAt(q); }
function write(out: buffer, mark: buffer, src: string, p: i32, q: i32): i32 {
    out.setCharCodeAt(0,513); out.setCharCodeAt(p,rhs(mark,src,q)); return 7;
}
function shrink(h: Header): i32 { h.length=1; return 0; }
function alias(src: string, h: Header, p: i32): i32 {
    let first=src.charCodeAt(p); shrink(h); return first+src.charCodeAt(p);
}
function nested(src: string, p: i32): i32 { return 1+(2+(3+(4+(5+(6+src.charCodeAt(p)))))); }
function div(a:i32,b:i32):i32 { return a/b+a; }
function rem(a:i32,b:i32):i32 { return a%b+a; }
function abs(a:i32):i32 { if(a<0){return 0-a;} return a; }
function chain(a:i32,b:i32):i32 {return a*4+abs(a)+div(a,b);}
function spill(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32):i32 {return a+(b+(c+(d+(e+(f+(g+h))))));}
function local(a:i32):i32 {let x=a;x=x+1;return x;}
function loop(a:i32):i32 {let x=0;while(x<a){x=x+1;}return x;}
` + literals.map((lit,i) => "function literal"+i+"(out:buffer,p:i32):i32{return out.writeLiteral(p,"+
        JSON.stringify(lit)+");}").join("\n");
    const wasm = current.typedWasm.compile(source).bytes;
    assert.equal(sha(wasm),sha(stock.typedWasm.compile(source).bytes));
    const guest = new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
    const vms = [
        stock.typedRv32.compile(source),
        current.typedRv32.compile(source),
        current.typedRv32.compile(source,[],undefined,{streamFunctions:false}),
    ];
    assert.equal(sha(vms[1].image),sha(vms[2].image));
    const bytes = new Uint8Array(4096).fill(0xaa), out=16, mark=2112, data=2208, capacity=1024;
    const d=new DataView(bytes.buffer), memory=new Uint8Array(guest.memory.buffer,0,bytes.length);
    d.setUint32(out,capacity,true);d.setUint32(mark,1,true);d.setUint32(data,2,true);
    d.setUint16(data+4,0x1234,true);d.setUint16(data+6,0xfedc,true);
    const stats = {};
    function check(name,args,expected,change) {
        const after = bytes.slice();
        if(change) change(new DataView(after.buffer));
        const family=stats[name]??={calls:0,traps:0};
        family.calls++;
        memory.set(bytes);
        if(expected===undefined) {
            family.traps++;
            assert.throws(()=>guest[name](...args),WebAssembly.RuntimeError,name);
        } else assert.equal(guest[name](...args),expected,name);
        assert.deepEqual(memory,after,name+" Wasm effects");
        for(const program of vms) {
            const result=runRv32(program,name,args,[],{},bytes);
            assert.equal(result.trap,expected===undefined,name+" trap");
            assert.equal(result.result,expected,name+" result");
            assert.deepEqual(result.bytes,after,name+" effects");
        }
    }
    for(const p of [-1,0,1,capacity-1,capacity]) for(const q of [-1,0,1,2]) {
        const validDest=p>=0 && p<capacity, validSrc=q>=0 && q<2;
        check("write",[out,mark,data,p,q],validDest && validSrc ? 7 : undefined, v=>{
            v.setUint16(out+4,513,true);
            if(validDest) {
                v.setUint16(mark+4,515,true);
                if(validSrc) v.setUint16(out+4+2*p,d.getUint16(data+4+2*q,true),true);
            }
        });
    }
    for(const p of [-1,0,1,2]) {
        check("nested",[data,p],p>=0 && p<2?21+d.getUint16(data+4+2*p,true):undefined);
        check("alias",[data,data,p],p===0?2*d.getUint16(data+4,true):undefined,v=>{
            if(p===0||p===1) v.setUint32(data,1,true);
        });
    }
    for(const [index,lit] of literals.entries()) {
        const last=capacity-lit.length;
        for(const p of [-2147483648,-1,0,1,last,last+1,2147483647]) {
            const valid=!lit.length || (p>=0 && p<=last);
            check("literal"+index,[out,p],valid?lit.length:undefined,v=>{
                if(valid) for(let j=0;j<lit.length;j++)v.setUint16(out+4+2*(p+j),lit.charCodeAt(j),true);
            });
        }
    }
    for(const [a,b] of [[-2147483648,-1],[-2147483648,1],[-37,3],[19,-4],[18,0],[0,3],[2147483647,1]]) {
        const quotient=(b===0 || (a===-2147483648 && b===-1)) ? undefined : ((Math.trunc(a/b)+a)|0);
        check("div",[a,b],quotient);
        check("rem",[a,b],b===0?undefined:((a%b+a)|0));
        check("chain",[a,b],quotient===undefined?undefined:((4*a+Math.abs(a)+quotient)|0));
    }
    check("spill",[9,8,7,6,5,4,3,2],44);
    check("local",[2147483647],-2147483648);
    check("loop",[5],5);
    for(const x of [-2147483648,-71,0,82]) check("abs",[x],Math.abs(x)|0);
    const startsWithFrame = name => {
        const program=vms[1], word=new DataView(program.image.buffer,program.image.byteOffset).getUint32(program.entries[name],true);
        return (word & 0xfffff)===0x10113 && (word>>20)<0; // addi sp,sp,-frame
    };
    for(const name of ["abs","div","rem"]) assert.equal(startsWithFrame(name),false,"eligible "+name);
    for(const name of ["spill","local","loop","chain","write"]) assert.equal(startsWithFrame(name),true,"frame needed "+name);
    const diagnostics = {};
    const invalidPrograms = {
        literalLimit: 'function write(out:buffer):i32{return out.writeLiteral(0,"' + "x".repeat(1023) + '");}',
        nativeArity: 'function nine(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32,i:i32):i32{return a+i;}',
    };
    function rejected(backend, text, options) {
        let diagnostic;
        try { backend.compile(text, [], undefined, options); }
        catch (error) { diagnostic = error.name + ": " + error.message; }
        assert(diagnostic, "expected rejection");
        return diagnostic;
    }
    for (const [name, text] of Object.entries(invalidPrograms)) {
        const expected = rejected(stock.typedRv32, text);
        assert.equal(rejected(current.typedRv32, text), expected);
        assert.equal(rejected(current.typedRv32, text, {streamFunctions:false}), expected);
        diagnostics[name] = expected;
    }
    return {sourceSHA256:sha(source),wasmSHA256:sha(wasm),rv32SHA256:sha(vms[1].image),lengths,stats,diagnostics};
}
