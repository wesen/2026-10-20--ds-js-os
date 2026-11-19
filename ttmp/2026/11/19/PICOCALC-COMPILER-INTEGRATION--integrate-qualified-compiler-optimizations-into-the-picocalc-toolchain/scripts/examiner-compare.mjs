// From the repository root. Pass a directory containing the two file snapshots produced in the review notes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {runRv32} from '../../PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/scripts/lowering/rv32.mjs';

const [dir] = process.argv.slice(2);
assert(dir, 'pass the extracted compiler snapshots directory');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digests = {};
const pinned = JSON.parse(readFileSync(new URL('../various/examiner-comparison.json', import.meta.url), 'utf8')).digests;
function compiler(rev) {
    const c = vm.createContext();
    const scripts = {};
    for (const name of ['typed-wasm', 'typed-rv32']) {
        const src = readFileSync(join(dir, rev + '-' + name + '.js'));
        scripts[name] = hash(src);
        assert.equal(scripts[name], pinned[rev][name], 'historical compiler digest ' + rev + '/' + name);
        vm.runInContext(src.toString(), c);
    }
    digests[rev] = scripts;
    return c;
}

const declarations = ['record Header { value: i32; }',
    'function touch(c:Header):i32 { c.value=0; return 65; }'];
const expectations = {};
function fn(name, body, removed) {
    declarations.push('function ' + name + '(s:buffer,p:i32,c:Header,flag:bool):i32 {' + body + '}');
    expectations[name] = removed;
}
fn('positive', 'if(!(p<0 || s.length<=p)) return s.charCodeAt(p); return 9;', 1);
fn('earlyMutation', 'if(p<0 || p>=s.length) return touch(c); return s.charCodeAt(p);', 1);
fn('earlyJoin', 'if(p<0 || p>=s.length) return 9; if(flag){touch(c);} return s.charCodeAt(p);', 0);
fn('freshRight', 'if((flag || touch(c)===65) && p>=0 && p<s.length) return s.charCodeAt(p); return 9;', 1);
fn('staleRight', 'if(p>=0 && p<s.length && (flag || touch(c)===65)) return s.charCodeAt(p); return 9;', 0);
fn('rhsOrder', 'if(p<0 || p>=s.length) return 9; s.setCharCodeAt(p,touch(c)); return 7;', 1);
fn('rhsChecked', 's.setCharCodeAt(p,touch(c)); return 7;', 0);
fn('emptyLiteral', 'if(p<0 || p>=s.length) return 9; s.writeLiteral(touch(c),""); return s.charCodeAt(p);', 0);
fn('rebound', 'let b=s;if(p<0 || p>=b.length) return 9; b=s; return b.charCodeAt(p);', 0);
fn('afterLoop', 'let i=0; while(i<s.length){i=i+1;} if(i>=0) return s.charCodeAt(i); return 9;', 0);
fn('inclusive', 'let i=2147483647; while(i<=p){if(i<s.length) return s.charCodeAt(i);i=i+1;} return 9;', 0);
fn('strict', 'let i=0;let sum=0;while(i<s.length){sum=sum+s.charCodeAt(i);i=i+1;}return sum;', 1);
fn('bodyAssign', 'let i=0;let n=0;while(i<s.length){n=n+s.charCodeAt(i);if(flag){i=-1;}if(!flag)return n;}return n;', 0);
fn('nestedAssign', 'let i=0;let n=0;while(i<s.length){n=n+s.charCodeAt(i);let j=0;while(j<1){i=-1;j=j+1;}}return n;', 0);
fn('exclusiveBounds', 'if((flag && p>=0) || (!flag && p<s.length)) return s.charCodeAt(p); return 9;', 0);
fn('nestedAlias', 'let i=0;let sum=0;while(i<s.length){if(flag){touch(c);}sum=sum+s.charCodeAt(i);i=i+1;}return sum;', 0);
const safe = 'while(i<s.length){n=n+s.charCodeAt(i);i=i+1;}';
const invalid = 'while(j<s.length && flag){n=n+s.charCodeAt(j);if(flag){j=-1;}if(!flag)return n;}';
// Force a rejected interval before and after an accepted interval within one code stream.
fn('mixed', 'let i=0;let j=0;let n=0;' + invalid + 'i=0;' + safe + 'j=0;' + invalid + 'return n;', 1);
// The 17th deferred check stays in place once the capped table is full.
fn('saturated', 'let n=0;let i=0;while(i<s.length){' + 'n=n+s.charCodeAt(i);'.repeat(17) + 'i=i+1;}return n;', 16);
const manyLocals = Array.from({length:133},(_,i) => 'const l' + i + '=' + i + ';').join('');
fn('factCap', manyLocals + 'let i=0;let n=0;'+safe+'return n;', 0);
fn('wide', manyLocals.replace(/=\d+;/g,'=p;') + 'let i=0;let n=0;while(i<s.length){n=n+s.charCodeAt(i);i=i+1;}return n+l132;', 1);
const source = declarations.join('\n');
const predecessor = compiler('e202e94'), base = compiler('4452064'), current = compiler('e082ec3');

// Decode only the actual instruction subset of this valid fixture. Wasm operands are encoded LEBs.
// Numeric-emitter cells already hold decoded immediates. Comparing instruction tuples catches width drift.
function decode(body, numeric) {
    const ops = [];
    let at=0;
    const data=body.code;
    function immediate(signed) {
        if (numeric) return data[at++];
        let v=0, n=0;
        while (true) {
            const b=data[at++];
            v |= (b & 127) << n;
            n+=7;
            if (!(b & 128)) return signed && n<32 && (b & 64) ? v | (-1<<n) : v;
        }
    }
    while (at<data.length) {
        const op=data[at++];
        const row=[op];
        if ([2,3,4].includes(op)) row.push(data[at++]);
        else if ([0x0c,0x0d,0x10,0x20,0x21,0x41].includes(op)) row.push(immediate(op===0x41));
        else if ([0x28,0x2f,0x36,0x3b].includes(op)) row.push(immediate(false),immediate(false));
        ops.push(row);
    }
    assert.equal(at,data.length);
    return ops;
}
function compiled(ctx) {
    const wasm=ctx.typedWasm.compile(source).bytes;
    const wasmBodies=ctx.typedWasm.compileFunctions(source,0).functions;
    const nativeBodies=ctx.typedWasm.compileFunctions(source,0,[],undefined,true).functions;
    const sites={};
    for(let i=0;i<wasmBodies.length;i++){
        const ops=decode(wasmBodies[i],false);
        assert.deepEqual(ops,decode(nativeBodies[i],true),wasmBodies[i].name);
        sites[wasmBodies[i].name] = ops.filter(row=>row[0]===0x4f).length;
    }
    return {wasm:new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports,
        native:ctx.typedRv32.compile(source), sites, wasmBytes:Buffer.from(wasm), wasmHash:hash(wasm)};
}
const old = compiled(base), candidate = compiled(current);
const preNative = predecessor.typedRv32.compile(source);
assert.deepEqual(Buffer.from(preNative.image), Buffer.from(old.native.image));
const metadata = ({image, ...fields}) => JSON.parse(JSON.stringify(fields));
assert.deepEqual(metadata(preNative), metadata(old.native));
assert.deepEqual(Buffer.from(predecessor.typedWasm.compile(source).bytes), old.wasmBytes);
const sites={};
for(const [name,expected] of Object.entries(expectations)){
    const removed=old.sites[name]-candidate.sites[name];
    assert.equal(removed,expected,name + ' removed checks');
    sites[name]={baseline:old.sites[name],candidate:candidate.sites[name]};
}
const receipt={calls:0,traps:0,nativeSteps:{baseline:0,candidate:0}};
const makeImage = len => {
    const bytes=new Uint8Array(1024), view=new DataView(bytes.buffer);
    view.setUint32(128,len,true);
    [65,66,67].forEach((n,i)=>view.setUint16(132+2*i,n,true));
    view.setUint32(256,1,true);
    return bytes;
};
function wasmRun(exports,name,args,image) {
    const mem=new Uint8Array(exports.memory.buffer,0,image.length);
    mem.set(image);
    let result,trap=false;
    try { result=exports[name](...args); } catch(e) {
        if (!(e instanceof WebAssembly.RuntimeError)) throw e;
        assert.equal(e.message,'unreachable');trap=true;
    }
    return {result,trap,bytes:Uint8Array.from(mem)};
}
function check(name,args,length) {
    const image=makeImage(length);
    const expected=wasmRun(old.wasm,name,args,image);
    assert.deepEqual(wasmRun(candidate.wasm,name,args,image),expected,name);
    for(const [label,c] of [['baseline',old],['candidate',candidate]]) {
        const {steps,result,trap,bytes}=runRv32(c.native,name,args,[],{},image);
        assert.deepEqual({result,trap,bytes},expected,label+' '+name);
        receipt.nativeSteps[label]+=steps;
    }
    receipt.calls++;receipt.traps+=Number(expected.trap);
}
for(const name of Object.keys(expectations))
    for(const length of [0,1,3]) for(const index of [-1,0,1,3,2147483647])
        for(const ptr of [128,256]) for(const flag of [0,1]) check(name,[128,index,ptr,flag],length);
console.log(JSON.stringify({node:process.version,sourceHash:hash(source),digests,functions:Object.keys(expectations).length,
    numericParity:{revision:'e202e94', fullWasm:true, nativeImageAndMetadata:true, imageSHA256:hash(preNative.image)},
    baselineWasmHash:old.wasmHash,candidateWasmHash:candidate.wasmHash,sites,...receipt},null,2));
