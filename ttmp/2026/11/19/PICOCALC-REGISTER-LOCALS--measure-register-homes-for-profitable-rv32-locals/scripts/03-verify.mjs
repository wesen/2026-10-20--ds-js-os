import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const [work] = process.argv.slice(2);
assert(work, 'Usage: 03-verify.mjs <A7-stage-directory>');
const day = new URL('../../', import.meta.url);
const sibling = (prefix, script) => {
    const [ticket] = readdirSync(day).filter(name => name.startsWith(prefix+'--'));
    return new URL(ticket+'/scripts/'+script, day);
};
const {walk} = await import(sibling('PICOCALC-STAGED-RV32', '03-historical-model.mjs'));
const text = path => readFileSync(path, 'utf8');
let emulator = text(sibling('PICOCALC-RV32-BRANCH', '07-rv32.mjs'));
function replace(before, after) {
    assert.equal(emulator.split(before).length, 2);
    emulator = emulator.replace(before, after);
}
replace('else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));', `
            else if (f3 === 1 && f7 === 0) x[rd] = a << (imm & 31);
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 5 && f7 === 0x20) x[rd] = a >> (imm & 31);
            else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));`);
replace('    let steps = 0;', '    let steps = 0, stackLoads = 0, stackStores = 0;');
replace('        if (relocations.has(at)) {', `        if (((w >>> 15) & 31) === 2) {
            if (op === 0x03) stackLoads++;
            if (op === 0x23) stackStores++;
        }
        if (relocations.has(at)) {`);
replace('{trap: true, steps, bytes:', '{trap: true, steps, stackLoads, stackStores, bytes:');
replace('{trap: false, result: x[10], steps, bytes:', '{trap: false, result: x[10], steps, stackLoads, stackStores, bytes:');
const {runRv32} = await import('data:text/javascript;base64,' + Buffer.from(emulator).toString('base64'));
const sha = data => createHash('sha256').update(data).digest('hex');
const lanes = ['a6', 'uses', 'loops', 'frame'];
const library = (lane, part) => text(join(work,'lanes',lane,'typed',part+'.js'));
const contexts = Object.fromEntries(lanes.map(lane => {
    const context = createContext();
    for (const part of ['wasm','rv32']) runInContext(library(lane,part),context);
    return [lane, context];
}));
const source = `
record Trace { order: i32; }
function tick(p:Trace, a:i32):i32 { p.order = p.order * 10 + a; return a; }
function bump(b:i32,c:i32):i32 { let a = b + c; if (a > 0) { a = a + 1; } return a; }
function countUnit(text:string,unit:i32):i32 {
    let at = 0; let n = 0;
    while (at < text.length) {
        if (text.charCodeAt(at) === unit) { n = n + 1; }
        at = at + 1;
    }
    return n;
}
function leafPressure(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32):i32 {
    let i = a + b - c + d;
    return a + 2*b + 3*c + 4*d + 5*e + 6*f + 7*g + 8*h + 9*i;
}
function signedLeaf(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32):i32 {
    let quotient = h / g;
    if (quotient > 0) return quotient + a + b + c;
    return a + b + c + d + e + f + g + h + quotient;
}
function choose(p:Trace,a:i32,b:i32, doCall:bool):i32 {
    let updated = a + b;
    if (doCall && tick(p,2) > 0) return tick(p,3) + updated;
    return updated - 1;
}
function callPressure(p:Trace,a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32):i32 {
    let x = a + b; let y = b + c; let z = c + d; let q = d + e; let r = e + f; let s = f + g;
    if (a < 0) return tick(p,4) + x;
    let out = 0;
    while (x > 0 && z < 15) {
        if (tick(p,7) === 7) { out = out + y + z + q; }
        z = z + 1;
        x = x - 1;
    }
    return a+b+c+d+e+f+g + x+y+z+q+r+s + out;
}
function nested(p:Trace, a:i32, b:i32):i32 { return tick(p,2) + tick(p, tick(p,a) + tick(p,b)); }
`;
const initial = new Uint8Array(128);
const data = new DataView(initial.buffer);
const chars = [65, 66, 65, 0x1234, 65, 66, 67, 66];
data.setInt32(64, chars.length, true);
for (const [i,c] of chars.entries()) data.setUint16(68+2*i,c,true);
const tuples = {
    bump: [[0,0],[5,-7],[8,1],[-2147483648,-1],[2147483647,1]],
    countUnit: [[64,65],[64,66],[64,0x1234],[64,0]],
    leafPressure: [[1,2,3,4,5,6,7,8],[-1,-2,-3,-4,-5,-6,-7,-8]],
    signedLeaf: [[9,11,20,30,40,50,3,15],[9,11,20,30,40,50,3,-15],
        [9,11,20,30,40,50,0,9],[9,11,20,30,40,50,-1,-2147483648],
        [9,11,20,30,40,50,-1,2147483647]],
    choose: [0,1].flatMap(c=>[[32,7,9,c],[32,-4,8,c],[32,0,0,c]]),
    callPressure: [[32,-3,1,2,3,4,5,6],[32,3,-8,2,3,4,5,6],
        [32,4,5,3,4,2,9,1],[32,41,1,3,2,7,1,9]],
    nested: [[32,1,4],[32,-1,1],[32,9,8]],
};
const {instance:{exports: wasm}} = await WebAssembly.instantiate(contexts.a6.typedWasm.compile(source).bytes);
const memory = new Uint8Array(wasm.memory.buffer,0,initial.length);
const runAccount = {};
let trapCases = 0;
for (const [name, cases] of Object.entries(tuples)) {
    runAccount[name] = Object.fromEntries(lanes.map(lane=>[lane,[]]));
    const programs = Object.fromEntries(lanes.map(lane=>[lane,contexts[lane].typedRv32.compile(source)]));
    for (const args of cases) {
        memory.set(initial);
        let want, trap = false;
        try { want = wasm[name](...args); }
        catch (e) { assert(e instanceof WebAssembly.RuntimeError); trap = true; trapCases++; }
        for (const lane of lanes) {
            const out = runRv32(programs[lane],name,args,[],{},initial);
            assert.equal(out.trap,trap,lane+' trap '+name);
            assert.equal(out.result,want,lane+' result '+name);
            assert.deepEqual(out.bytes,memory,lane+' memory '+name);
            const {steps,stackLoads,stackStores} = out;
            runAccount[name][lane].push({args,trap,result:want,steps,stackLoads,stackStores});
        }
    }
}

const imported = [{name: 'host',params: ['i32'],result:'i32'}];
const hostile = `function hostile(a:i32,b:i32,c:bool):i32 {
    let x = a + 5; let y = b * 9;
    if (c) return x + host(y) + y + host(host(x)) + x;
    return 2*x + y;
}`;
const hostileReceipt = {};
for (const lane of lanes) {
    const program = contexts[lane].typedRv32.compile(hostile, imported);
    hostileReceipt[lane] = [0,1].map(c => {
        const seen = [];
        const result = runRv32(program,'hostile',[3,7,c],imported,
            {host: n => {seen.push(n); return n-2;}},initial);
        assert.equal(result.result,c ? 144 : 79);
        assert.deepEqual(seen,c ? [63,8,6] : []);
        return {outerCalls: c, seen, result: result.result, steps: result.steps};
    });
}

const raw = {
    stale: {code: [0x20,0,0x20,0,0x41,99,0x6a,0x21,0,0x0b], expected:41},
    staleSpill: {code: [0x41,1,0x41,2,0x41,3,0x41,4,0x41,5,0x20,0,
        0x20,0,0x41,99,0x6a,0x21,0,0x6a,0x6a,0x6a,0x6a,0x6a,0x0b], expected:56},
};
const rawReceipt = {};
for (const lane of lanes) {
    for (const [name,{code,expected}] of Object.entries(raw)) {
        const context = createContext({typedWasm: {compileFunctions: () =>
            ({functions: [{name,params:['i32'],result:'i32',nlocals:0,code}],records:new Map()})}});
        runInContext(library(lane,'rv32'), context);
        const program = context.typedRv32.compile('',[],undefined,{streamFunctions:false});
        const {result,steps,stackStores} = runRv32(program,name,[41],[],{},initial);
        assert.equal(result,expected,lane+' '+name);
        (rawReceipt[lane] ??= {})[name] = {result,steps,stackStores};
    }
}

const miniSizes = {};
function countFunction(program, name) {
    const next = Object.values(program.entries).find(at => at > program.entries[name]) ?? program.image.length;
    return (next - program.entries[name]) / 4;
}
for (const lane of lanes) {
    const prog = contexts[lane].typedRv32.compile(source);
    const bump = countFunction(prog,'bump'), countUnit = countFunction(prog,'countUnit');
    miniSizes[lane] = {bump, countUnit, gates: {bump: bump <= 6, countUnit: countUnit <= 19}};
}

const sdk = [...library('a6','world').matchAll(/\["(typedSdk\w+)", "([^"]*)", "(\w+)"\]/g)]
    .map(([,name,params,result],index)=>({name,params:params ? params.split(',') : [],result,index}));
assert.equal(sdk.length,28);
const appCeiling = {files: 517, agenda: 2660, editor: 14581};
const apps = {};
for (const [app, ceiling] of Object.entries(appCeiling)) {
    const source = text(join(work,'sources',app,'app.typed'));
    const imports = app === 'editor' ? sdk : [];
    const limit = app === 'editor' ? 96*1024 : 64*1024;
    const control = contexts.a6.typedRv32.compile(source, imports, limit);
    const {functions} = contexts.a6.typedWasm.compileFunctions(source, imports.length, imports, limit);
    const modelB = functions.reduce((total,fn)=>total+walk(fn,[...imports,...functions]).cost.B,0);
    apps[app] = {ceiling, modelB, sourceSha256:sha(source), variants:{}};
    for (const lane of lanes) {
        const stats = [];
        const {typedRv32} = contexts[lane];
        const program = typedRv32.compile(source,imports,limit,{localStats:r=>stats.push(r)});
        assert.deepEqual(program,typedRv32.compile(source,imports,limit,{streamFunctions:false}));
        if (lane === 'frame') {
            assert.deepEqual(Buffer.from(program.image),Buffer.from(control.image));
            assert.equal(JSON.stringify(program.relocations),JSON.stringify(control.relocations));
            assert.equal(JSON.stringify(program.entries),JSON.stringify(control.entries));
        }
        const words = program.image.length/4;
        const view = new DataView(program.image.buffer,program.image.byteOffset);
        const decoded = {stackLoads:0,stackStores:0};
        for (let i=0; i<program.image.length; i+=4) {
            const word = view.getUint32(i,true);
            if (((word >>> 15) & 31) !== 2) continue;
            if ((word & 127) === 0x03) decoded.stackLoads++;
            if ((word & 127) === 0x23) decoded.stackStores++;
        }
        const sum = k => stats.reduce((n,r)=>n+r[k],0);
        const counts = stats.length ? {loads:sum('loads'),stores:sum('stores'),forwarded:sum('forwarded'),
            saveRestore:2*sum('saved'),frameMax:Math.max(...stats.map(r=>r.frame)),
            frameFree:stats.filter(r=>!r.frame).length} : null;
        if (counts) {
            assert(stats.every(r => Number.isInteger(r.frame) && r.frame % 16 === 0));
            assert(decoded.stackLoads >= counts.loads+counts.saveRestore/2);
            assert(decoded.stackStores >= counts.stores+counts.saveRestore/2);
        }
        const gates = {ceiling:words<=ceiling,model:Math.abs(words-modelB)/modelB<=0.1};
        apps[app].variants[lane] = {words,sha256:sha(program.image),decoded,counts,gates,functions:stats};
    }
}
console.log(JSON.stringify({node:process.version,laneCount:lanes.length, cases:Object.values(tuples).flat().length,
    trapCases, miniSizes, apps, executions:runAccount, hostile:hostileReceipt, raw:rawReceipt},null,2));
