import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createContext, runInContext} from 'node:vm';

const [study, board, wasmReactor] = process.argv.slice(2);
assert(study && board && wasmReactor, 'Usage: 05-verify.mjs <study> <board> <Editor Wasm reactor>');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const text = path => readFileSync(path, 'utf8');
const root = new URL('../../', import.meta.url);
const [branch] = readdirSync(root).filter(name=>name.startsWith('PICOCALC-RV32-BRANCH--'));
const emulator = text(new URL(branch + '/scripts/07-rv32.mjs', root));
const marker = 'else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));';
assert.equal(emulator.split(marker).length,2);
const extended = emulator.replace(marker, `else if (f3 === 1 && f7 === 0) x[rd] = a << (imm & 31);
            else if (f3 === 2) x[rd] = Number(a < imm);
            else if (f3 === 5 && f7 === 0x20) x[rd] = a >> (imm & 31);
            ${marker}`);
const {runRv32} = await import('data:text/javascript;base64,' + Buffer.from(extended).toString('base64'));

const oracle = {};
const contexts = {};
let lower;
for (const lane of ['manual','await']) {
    const dir = join(study, 'lanes', lane);
    const ctx = createContext();
    for (const part of ['wasm','rv32','async','world']) {
        const script = join(dir,'typed',part+'.js');
        runInContext(text(script),ctx,{filename:script});
    }
    contexts[lane] = ctx;
    const source = text(join(dir,'world.typed'));
    const {source: rewritten, layout} = ctx.typedAsync.lower(source);
    writeFileSync(join(dir,'lowered.typed'),rewritten);
    const firmware = readFileSync(join(board,lane,'picocalc-os-p4.bin'));
    for (const part of ['wasm','rv32','async','world'])
        assert(firmware.includes(readFileSync(join(dir,'typed',part+'.js'))), 'physical lane compiler bytes present');
    assert(firmware.includes(Buffer.from(source)), 'physical lane contains original, unlowered typed source');
    const compile = ctx.typedRv32.compile;
    let program;
    ctx.typedRv32.compile = (...args) => (program=compile(...args));
    const nativeReactor = readFileSync(join(board,lane,'typed-world-reactor.elf'));
    const native = ctx.compileTypedWorldRv32(source,nativeReactor);
    const saved = program;
    assert.deepEqual(ctx.compileTypedWorldRv32(source,nativeReactor,{streamFunctions:false}),native);
    assert.deepEqual(saved,program);
    const wasm = ctx.compileTypedWorld(source,readFileSync(wasmReactor));
    oracle[lane] = {sourceSha256: sha(source), loweredSourceSha256:sha(rewritten),
        stateFields:Object.keys(program.records.WorldState).length, layout,
        instructions: program.image.length/4, imageSha256:sha(program.image),
        nativeBytes:native.length, nativeSha256:sha(native), wasmBytes:wasm.length, wasmSha256:sha(wasm),
        firmwareSha256:sha(firmware), reactorSha256:sha(nativeReactor)};
    if (lane === 'await') lower = ctx.typedAsync.lower;
}
assert.equal(oracle.manual.stateFields,71);
assert.equal(oracle.await.stateFields,74);
assert.equal(oracle.await.layout.frameBytes,12);
assert.equal(oracle.await.layout.saved.map(x=>x.name).join(','),'handle,size');
assert.equal(oracle.await.reactorSha256,oracle.manual.reactorSha256);

const fixture = `
record WorldEvent { kind: i32; ask: bool; token: i32; ok: bool; }
record WorldState { counter: i32; }
function typedSdkFileRead(handle: i32): i32 { return handle - 9; }
function writeUnit(target: buffer, unit: i32): i32 { target.setCharCodeAt(0, unit); return 0; }
async function readTask(event: WorldEvent, state: WorldState, output: buffer, hints: buffer, handle: i32): i32 {
    const borrowed: buffer = output;
    const size: i32 = handle + 1;
    let overwritten: i32 = 777;
    borrowed.setCharCodeAt(0, 7);
    const ok = await typedSdkFileRead(handle);
    overwritten = 13;
    if (!ok && event.kind === 0) return writeUnit(output, 99);
    if (!ok) return writeUnit(hints, handle);
    output.setCharCodeAt(0, size);
    hints.setCharCodeAt(0, event.token);
    state.counter = state.counter + overwritten;
    return 0;
}
`;
const {source: emitted, layout} = lower(fixture);
assert.equal(layout.saved.map(x=>x.name).join(','),'handle,size');
const errors = {};
for (const [kind, bad, match] of [
    ['borrowed buffer', fixture.replace('output.setCharCodeAt(0, size)', 'borrowed.setCharCodeAt(0, size)'), /reference borrowed is live across await/],
    ['borrowed string', fixture.replace('const borrowed: buffer = output;','const borrowed: string = input(output);')
        .replace('borrowed.setCharCodeAt(0, 7);','output.setCharCodeAt(0, 7);')
        .replace('output.setCharCodeAt(0, size);','output.setCharCodeAt(0, borrowed.length);'), /reference borrowed is live across await/],
    ['nested await', fixture.replace('const ok = await typedSdkFileRead(handle);',
        'if (true) { const ok = await typedSdkFileRead(handle); }'), /expected one top-level/],
    ['two awaits', fixture.replace('overwritten = 13;', 'const again = await typedSdkFileRead(handle); overwritten = 13;'),
        /expected one top-level/],
    ['unsupported operation', fixture.replace('await typedSdkFileRead(handle)', 'await typedSdkYield()'), /expected const result = await/],
]) {
    let error;
    assert.throws(()=>lower(bad), e => {error=e.message; return match.test(e.message);});
    errors[kind]=error;
}

const context = contexts.await;
const encoded = context.typedWasm.compile(emitted).bytes;
const wasm = (await WebAssembly.instantiate(encoded)).instance.exports;
const rv = context.typedRv32.compile(emitted);
function witness(invoke) {
    const mem = new Uint8Array(320);
    const view = new DataView(mem.buffer);
    const state=64, firstEvent=32, nextEvent=48;
    const firstOut=128, firstHints=160, nextOut=192, nextHints=224;
    for (const buffer of [firstOut,firstHints,nextOut,nextHints]) view.setInt32(buffer,4,true);
    const set = (pos,v) => view.setInt32(pos,v,true);
    const get = pos => view.getInt32(pos,true);
    const unit = buffer => view.getUint16(buffer+4,true);
    const event = (pos,kind,token,ok) => {set(pos,kind);set(pos+8,token);set(pos+12,ok);};
    const call = (suffix, ...args) => invoke('readTask'+suffix, args, mem);
    const trace = [];
    event(firstEvent,0,0,0);
    assert.equal(call('Start',firstEvent,state,firstOut,firstHints,4),0);
    assert.equal(unit(firstOut),99);
    assert.equal(get(state+4),0);
    trace.push({path:'startup failure',output:unit(firstOut),counter:get(state)});
    assert.equal(call('Start',firstEvent,state,firstOut,firstHints,110),1);
    assert.equal(get(state+4),101);
    assert.equal(unit(firstOut),7);
    assert.equal(call('Start',firstEvent,state,firstOut,firstHints,120),1);
    assert.equal(get(state+4),101);
    event(nextEvent,4,222,1);
    const snapshot = Buffer.from(mem);
    assert.equal(call('Resume',nextEvent,state,nextOut,nextHints),0);
    assert.deepEqual(Buffer.from(mem),snapshot);
    event(nextEvent,4,101,1);
    assert.equal(call('Resume',nextEvent,state,nextOut,nextHints),0);
    assert.equal(get(state),13);
    assert.equal(get(state+4),0);
    assert.equal(get(state+8),0);
    assert.equal(get(state+12),0);
    assert.equal(unit(nextOut),111);
    assert.equal(unit(nextHints),101);
    assert.equal(unit(firstOut),7);
    assert.equal(unit(firstHints),0);
    trace.push({path:'success with rebound event and buffers',oldOut:unit(firstOut),newOut:unit(nextOut),
        oldHints:unit(firstHints),newHints:unit(nextHints),counter:get(state)});
    const done = Buffer.from(mem);
    assert.equal(call('Resume',nextEvent,state,nextOut,nextHints),0);
    assert.deepEqual(Buffer.from(mem),done);
    assert.equal(call('Start',firstEvent,state,firstOut,firstHints,120),1);
    event(nextEvent,4,111,0);
    assert.equal(call('Resume',nextEvent,state,nextOut,nextHints),0);
    assert.equal(get(state),13);
    assert.equal(unit(nextHints),120);
    trace.push({path:'failed read',releasedHandle:unit(nextHints),counter:get(state)});
    assert.equal(call('Start',firstEvent,state,firstOut,firstHints,130),1);
    assert.equal(call('Cancel',state),130);
    assert.equal(call('Cancel',state),0);
    event(nextEvent,4,121,1);
    const canceled = Buffer.from(mem);
    assert.equal(call('Resume',nextEvent,state,nextOut,nextHints),0);
    assert.deepEqual(Buffer.from(mem),canceled);
    assert.equal(call('Start',firstEvent,state,firstOut,firstHints,140),1);
    const reopened = Buffer.from(mem);
    assert.equal(call('Resume',nextEvent,state,nextOut,nextHints),0);
    assert.deepEqual(Buffer.from(mem),reopened);
    event(nextEvent,4,131,1);
    assert.equal(call('Resume',nextEvent,state,nextOut,nextHints),0);
    assert.equal(get(state),26);
    assert.equal(unit(nextOut),141);
    trace.push({path:'cancel, stale and reopen',oldToken:121,newToken:131,output:unit(nextOut),counter:get(state)});
    return trace;
}
const expected = witness((name,args,mem) => {
    const memory = new Uint8Array(wasm.memory.buffer,0,mem.length);
    memory.set(mem);
    const result = wasm[name](...args);
    mem.set(memory);
    return result;
});
const actual = witness((name,args,mem) => {
    const result = runRv32(rv,name,args,[],{},mem);
    assert.equal(result.trap,false);
    mem.set(result.bytes);
    return result.result;
});
assert.deepEqual(actual,expected);
console.log(JSON.stringify({oracle, focused:{layout,errors,trace:actual}},null,2));
