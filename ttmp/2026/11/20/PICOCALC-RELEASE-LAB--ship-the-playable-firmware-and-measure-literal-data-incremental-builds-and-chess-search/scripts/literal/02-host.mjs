import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {globSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createContext, runInContext} from "node:vm";
import {pathToFileURL} from "node:url";
import {root, stage} from "./01-stage.mjs";

const [component, painterFile, work, output] = process.argv.slice(2);
assert(component && painterFile && work && output,
    "usage: node 02-host.mjs BUILD_MAIN PAINTER.typed SCRATCH HOST.json");
mkdirSync(work, {recursive:true});
const compiler = resolve(root, "picocalc-os/compiler");
const names = ["typed-wasm.js","typed-async.js","typed-rv32.js","typed-world.js"];
const original = Object.fromEntries(names.map(name => [name, readFileSync(resolve(compiler,name),"utf8")]));
const staged = {...original,...stage()};
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function context(files) {
    const vm = createContext({});
    for (const name of names) runInContext(files[name],vm,{filename:name});
    return vm;
}

const base = context(original);
const candidate = context(staged);
const modes = ["stock", "pool", "dedupe", "word"];
function options(mode, literalMetrics, streamFunctions = true) {
    return {literalPool:mode !== "stock", literalDedupe:mode !== "pool", literalWordCopy:mode === "word", literalMetrics, streamFunctions};
}

const date = resolve(root, "ttmp/2026/11/20");
const [review] = globSync("PICOCALC-TYPED-PIE--*/scripts/review", {cwd:date});
assert(review);
const emulator = readFileSync(resolve(date,review,"run-rv32.mjs"),"utf8");
const withCodeData = emulator
    .replace("./packed.mjs",pathToFileURL(resolve(date,review,"packed.mjs")).href)
    .replace("const stackTop = 65536;", "const stackTop = 65536, codeBase = 0x100000;")
    .replace("x[rd] = f3 === 2 ? memory.getInt32(a + imm, true) : memory.getUint16(a + imm, true);",
        `const address = a + imm;
            const source = address >= codeBase ? code : memory;
            const offset = address >= codeBase ? address - codeBase : address;
            assert.equal(address % (f3 === 2 ? 4 : 2), 0, "load alignment");
            x[rd] = f3 === 2 ? source.getInt32(offset, true) : source.getUint16(offset, true);`)
    .replace("            if (f3 === 2) memory.setInt32(address, b, true);",
        "            assert.equal(address % (f3 === 2 ? 4 : 2), 0, 'store alignment');\n" +
        "            if (f3 === 2) memory.setInt32(address, b, true);")
    .replace("} else if (op === 0x37) {",
        "} else if (op === 0x17) {\n            x[rd] = codeBase + at + (w & 0xfffff000);\n        } else if (op === 0x37) {");
assert(withCodeData.includes("op === 0x17") && withCodeData.includes("const source = address >= codeBase"));
writeFileSync(resolve(work,"run-with-data.mjs"),withCodeData);
const {runRv32} = await import(pathToFileURL(resolve(work,"run-with-data.mjs")));
const compareMemory = (result, other, name) => {
    assert.equal(result.trap,other.trap,name);
    assert.equal(result.result,other.result,name);
    assert.deepEqual(result.bytes,other.bytes,name);
};
const noReloc = {chess:"typed-chess-3d-reactor.elf",editor:"typed-world-reactor.elf"};
const record = {};
for (const label of ["chess","editor"]) {
    const source = readFileSync(resolve(component,label+".typed"), "utf8");
    const reactor = new Uint8Array(readFileSync(resolve(component,noReloc[label])));
    const inputs = {...base.typedWorld, source};
    const originalProgram = base.typedRv32.compile(source,inputs.imports,96*1024);
    const entries = {};
    const compiled = {};
    for (const mode of modes) {
        const stats = {};
        compiled[mode] = candidate.typedRv32.compile(source,inputs.imports,96*1024,options(mode,stats));
        const linked = candidate.compileTypedWorldRv32(source,reactor,options(mode));
        const buffered = candidate.typedRv32.compile(source,inputs.imports,96*1024,options(mode,{},false));
        assert.deepEqual(Buffer.from(compiled[mode].image),Buffer.from(buffered.image));
        entries[mode] = {...stats, linkedBytes:linked.length, sha256:digest(compiled[mode].image)};
    }
    assert.deepEqual(Buffer.from(originalProgram.image),Buffer.from(compiled.stock.image));
    record[label] = {sourceBytes:Buffer.byteLength(source), sourceSHA256:digest(source), entries,
                     contextPlusCompileMs:Object.fromEntries(modes.map(mode => [mode,[]]))};
    for (let i=0;i<9;i++) {
        for (let j=0;j<modes.length;j++) {
            const mode = modes[(i+j) % modes.length], t = performance.now();
            const vm = context(staged);
            vm.typedRv32.compile(source,vm.typedWorld.imports,96*1024,options(mode));
            record[label].contextPlusCompileMs[mode].push(performance.now()-t);
        }
    }
    if (label === "chess") {
        const sourceBytes = readFileSync(painterFile);
        const memory = Buffer.alloc(36000,0xa5);
        const pointer = 12, capacity = 16384;
        memory.writeUInt32LE(capacity,pointer);
        const expected = Buffer.from(memory);
        for (const [i,ch] of sourceBytes.entries()) expected.writeUInt16LE(ch,pointer+4+2*i);
        for (const mode of modes) {
            const result = runRv32(compiled[mode],"chessPainterSource",[pointer],[],{},memory,undefined,250000);
            compareMemory(result,{trap:false,result:sourceBytes.length,bytes:new Uint8Array(expected)},mode);
            record.chess.entries[mode].sourceWriterModeledInstructions = result.steps;
        }
        record.chess.reconstructedSourceSHA256 = digest(sourceBytes);
    }
}

const literals = [
    "", "a", "123456789012345", "1234567890123456", "é☃\u0000\ud800🧮".repeat(17), "x".repeat(1022),
];
const helper = `function getStart(other: buffer, start: i32): i32 {
    other.setCharCodeAt(0,other.charCodeAt(0)+1);
    return start;
}`;
let executions = 0;
for (const text of literals) {
    const source = helper + `function write(out: buffer, other: buffer, start: i32): i32 {
        return out.writeLiteral(getStart(other,start),${JSON.stringify(text)});
    }`;
    const wasmBytes = base.typedWasm.compile(source).bytes;
    assert.deepEqual(Buffer.from(wasmBytes), Buffer.from(candidate.typedWasm.compile(source,{literalPool:true}).bytes));
    const wasm = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes)).exports;
    const stock = base.typedRv32.compile(source);
    const optimized = ["dedupe","word"].map(arm => candidate.typedRv32.compile(source,[],undefined,options(arm)));
    for (const capacity of [1,Math.max(1,text.length),text.length+5]) {
        for (const start of [-1,0,1,capacity,2147483647]) {
            for (const alias of [true,false]) {
                const bytes = Buffer.alloc(5000,0xa5), out = 16, other = alias ? out : 2600;
                bytes.writeUInt32LE(capacity,out);
                if (!alias) bytes.writeUInt32LE(8,other);
                const memory = new Uint8Array(wasm.memory.buffer,0,bytes.length);
                memory.set(bytes);
                let result,trap = false;
                try { result = wasm.write(out,other,start); }
                catch (error) { assert(error instanceof WebAssembly.RuntimeError); trap = true; }
                const expected = {result,trap,bytes:memory};
                const args = [out,other,start];
                compareMemory(runRv32(stock,"write",args,[],{},bytes),expected,"stock");
                for (const program of optimized) compareMemory(runRv32(program,"write",args,[],{},bytes),expected,"pool");
                executions++;
            }
        }
    }
}

const repeated = JSON.stringify("literal αβ😀 " .repeat(4));
const reuses = `function first(buf:buffer):i32 {return buf.writeLiteral(0,${repeated});}
function second(buf:buffer):i32 {first(buf);return buf.writeLiteral(80,${repeated});}`;
const heldOut = {};
for (const mode of modes) {
    const stats = {};
    candidate.typedRv32.compile(reuses,[],undefined,options(mode,stats));
    heldOut[mode] = stats;
}
assert.equal(heldOut.pool.uniqueLiterals,2);
assert.equal(heldOut.dedupe.uniqueLiterals,1);
// Exercise pooled writes with live operands on either side of the five-register
// stack boundary, including valid odd starts, source residues, and odd tails.
let depthCases = 0;
for (const length of [16,17,18,19,1021,1022]) {
    for (const depth of [0,4,5,8]) {
        for (const pos of [0,1]) {
            const text = "\u0000".repeat(length);
            const first = JSON.stringify("a".repeat(17));
            const value = JSON.stringify(text);
            let expression = `out.writeLiteral(pos,${value})`;
            for (let i=0; i<depth; i++) expression = `1+(${expression})`;
            const source = `function main(out:buffer,pos:i32):i32 {
                out.writeLiteral(1200,${first});
                return ${expression};
            }`;
            const stock = base.typedRv32.compile(source);
            const word = candidate.typedRv32.compile(source,[],undefined,options("word"));
            assert(word.image.length <= stock.image.length);
            const memory = Buffer.alloc(2500,0xa5);
            memory.writeUInt32LE(1220,0);
            const args = [0,pos];
            compareMemory(runRv32(word,"main",args,[],{},memory),runRv32(stock,"main",args,[],{},memory),"live operands");
            depthCases++;
        }
    }
}
for (const length of [1023,1024,2048]) {
    const source = `function reject(out:buffer):i32 {return out.writeLiteral(0,"${"x".repeat(length)}");}`;
    assert.throws(() => base.typedRv32.compile(source),/exceeds 1022/);
    assert.throws(() => candidate.typedRv32.compile(source,[],undefined,options("word")),/exceeds 1022/);
}

writeFileSync(output,JSON.stringify({node:process.version,workloads:record,heldOut,successAndTrapCases:executions,depthCases,rejectedLengths:[1023,1024,2048]},null,2)+"\n");
console.log(JSON.stringify({chess:record.chess.entries, editor:record.editor.entries,heldOut,executions}));
