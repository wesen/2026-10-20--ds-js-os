import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {packedSource, pieScripts, scene} from "./01-source.mjs";

const {createCompiler} = await import(resolve(pieScripts, "03-compile.mjs"));
const {decode} = await import(resolve(pieScripts, "review/decode.mjs"));
const {runRv32} = await import(resolve(pieScripts, "review/run-rv32.mjs"));
const [fixturesFile, raster, output, toolPrefix] = process.argv.slice(2);
assert(fixturesFile && raster && output && toolPrefix,
    "usage: node 02-host.mjs FIXTURES.bin C_RASTER RECEIPT.json ESPRESSIF_TOOL_PREFIX");
const stockSource = readFileSync(scene,"utf8");
const source = packedSource();
const {rv32, wasm} = createCompiler();
const plain = new WebAssembly.Instance(new WebAssembly.Module(wasm.compile(stockSource).bytes)).exports;
const ground = new WebAssembly.Instance(new WebAssembly.Module(wasm.compile(source).bytes)).exports;
const stock = rv32.compile(stockSource);
const scalar = rv32.compile(source);
const pieDiagnostics = [];
const packed = rv32.compile(source, [], undefined, {pie:true, pieDiagnostics});
const isa = decode(packed.image, toolPrefix);
assert.equal(pieDiagnostics.length, 1);
assert.equal(pieDiagnostics[0].function, "project");
assert.equal(pieDiagnostics[0].lanes, 8);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const data = readFileSync(fixturesFile);
const stride = 4 + 180 + 4 + 8192;
assert.equal(data.length, 47 * stride);

const state = 0, out = 256;
const scratch = Array.from({length:6}, (_,i) => 0x2400 + 12 + i*192);
const args = [state,out,...scratch];
const arena = new Uint8Array(0x3000);
const mem = new DataView(arena.buffer);
const expected = [];

function paintWasm(wasmImage, entry, argv) {
    new Uint8Array(wasmImage.memory.buffer,0,arena.length).set(arena);
    const count = wasmImage[entry](...argv);
    assert(count > 0 && count <= 4096);
    return Buffer.from(new Uint8Array(wasmImage.memory.buffer,out + 4,count*2).slice());
}

function render(commands) {
    const result = spawnSync(raster, {input:commands});
    assert.equal(result.status,0,result.stderr?.toString());
    return result.stdout;
}

function runNative(program, argv, encodings) {
    const value = runRv32(program,"paintChess",argv,[],{},arena,encodings,500_000);
    assert(!value.trap);
    assert(value.result > 0 && value.result <= 4096);
    return {...value, commands: Buffer.from(value.bytes.slice(out+4,out+4+value.result*2))};
}

for (let position=0; position<47; position++) {
    const cases = [3,5,7].map(pitch => ({pitch}));
    if (position===0) cases.push({pitch:5,cursor:44},{pitch:5,cursor:45});
    for (const config of cases) {
        const {pitch} = config;
        arena.fill(0xff);
        mem.setUint32(state,90,true);
        mem.setUint32(out,4096,true);
        for (let i=0; i<90; i++) mem.setUint16(4 + 2*i,data.readUInt16LE(position*stride+4+2*i),true);
        if (config.cursor !== undefined) mem.setUint16(4+2*72,config.cursor,true);
        for (const address of scratch) mem.setUint32(address,82,true);
        mem.setUint16(scratch[1]+4+2*81,pitch,true);
        const commands = paintWasm(plain,"paintPose",[state,out,pitch]);
        const alternate = paintWasm(ground,"paintChess",args);
        assert.deepEqual(alternate, commands);
        const scalarResult = runNative(scalar,args);
        const packedResult = runNative(packed,args,isa);
        assert.deepEqual(scalarResult.commands,commands);
        assert.deepEqual(packedResult.commands,commands);
        assert.equal(packedResult.packed.stores,30);
        assert.deepEqual(packedResult.bytes,scalarResult.bytes);
        const outputs = new DataView(packedResult.bytes.buffer,packedResult.bytes.byteOffset,packedResult.bytes.byteLength);
        for (let i=0; i<81; i++) {
            const x = i % 9 * 16, z = Math.floor(i / 9) * 16;
            const values = [x,0,z,384+x-z,640+x+z,x+z];
            for (const [channel,value] of values.entries())
                assert.equal(outputs.getUint16(scratch[channel]+4+2*i,true),value);
        }
        assert.equal(outputs.getUint16(scratch[1]+4+2*81,true),pitch);
        assert.equal(outputs.getUint16(scratch[5]+4+2*81,true),0xffff);
        const before = render(commands), after = render(packedResult.commands);
        assert.deepEqual(after,before);
        const stockResult = pitch === 5 ? runNative(stock,[state,out]) : null;
        if (stockResult) assert.deepEqual(stockResult.commands,commands);
        expected.push({
            position,pitch,cursor:mem.getUint16(4+2*72,true),
            words:commands.length/2,
            commandSHA256:digest(commands),
            screenSHA256:digest(before),
            modeledSteps:{stock:stockResult?.steps,alternateScalar:scalarResult.steps,pie:packedResult.steps},
            packedStores:packedResult.packed.stores,
        });
    }
}

// Misalign all payloads coherently to exercise the real scalar continuation.
arena.fill(0);
mem.setUint32(state,90,true);
mem.setUint32(out,4096,true);
const misaligned = scratch.map(address => address - 4);
for (const address of misaligned) mem.setUint32(address,82,true);
mem.setUint16(misaligned[1]+4+2*81,5,true);
const fallback = runNative(packed,[state,out,...misaligned],isa);
assert.equal(fallback.packed.stores,0);
assert.deepEqual(fallback.commands,paintWasm(plain,"paintPose",[state,out,5]));

writeFileSync(output,JSON.stringify({
    fixtureSHA256:digest(data),
    sourceSHA256:{stock:digest(stockSource),alternate:digest(source)},
    image:{stock:stock.image.length,alternateScalar:scalar.image.length,pie:packed.image.length},
    pieDiagnostics, cases:expected, misalignedFallback:true,
},null,2)+"\n");
console.log(expected.length,"byte-identical command lists and raster frames");
