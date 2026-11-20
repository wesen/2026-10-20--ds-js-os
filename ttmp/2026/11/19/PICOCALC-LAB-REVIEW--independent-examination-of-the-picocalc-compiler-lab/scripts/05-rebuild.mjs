// Use the regular World ABI, its full Editor program, and a fresh clean oracle per edit.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const [dir, sourcePath, elfPath] = process.argv.slice(2);
const src=readFileSync(sourcePath,'utf8'), elf=readFileSync(elfPath);
const sha = data => createHash('sha256').update(data).digest('hex');
function realm(which) {
    const ctx=vm.createContext({});
    const files=['wasm.js','rv32.js','world.js'];
    if (which==='candidate') files.push('incremental.js');
    for(const f of files) vm.runInContext(readFileSync(join(dir,which,f),'utf8'),ctx);
    return ctx;
}
function replace(s,a,b,expected=1) {
    assert.equal(s.split(a).length-1,expected,a);
    return s.replaceAll(a,b);
}
const body=replace(src,'return (row % 36) * 100;','return (row % 36) * 99;');
const badSig=replace(body,'editorPreviewSlot(row: i32)','editorPreviewSlot(row: i32, stride: i32)');
let sig=replace(badSig,'return (row % 36) * 99;', 'return (row % 36) * stride;');
sig=replace(sig,'editorPreviewSlot(state.previewRows)','editorPreviewSlot(state.previewRows, 99)',2);
sig=replace(sig,'editorPreviewSlot(row)','editorPreviewSlot(row, 99)');
const layout=replace(sig,'    file: i32;\n    offered: i32;', '    offered: i32;\n    file: i32;');
const badABI=replace(layout,'    ask: bool;\n    token: i32;', '    token: i32;\n    ask: bool;');
const more=replace(layout,'function editorHighSurrogate','// offset shift after record declarations\nfunction editorHighSurrogate');
const fixtures=[
    ['seed',src],['body',body],['unrepaired signature',badSig],['signature and callers',sig],
    ['reorder state fields',layout],['invalid event ABI',badABI],['offset-shifting comment',more],
    ['undo to original',src],
];
const lab=realm('candidate'), session=lab.createFunctionRebuild(lab.rebuildWorld,elf);
const history=[];
let previous;
function spans(rebuilt) {
    const bytes=Buffer.from(rebuilt.bytes);
    const magic=Buffer.from('4e454741565241444c533233','hex');
    const at=bytes.indexOf(magic);
    assert(at>=0);
    const start=at+20+4*(bytes.readUInt16LE(at+16)+bytes.readUInt16LE(at+18));
    const entries=Object.entries(rebuilt.entries);
    return new Map(entries.map(([name,offset],i)=>[name,sha(bytes.subarray(start+offset,start+(entries[i+1]?.[1]??rebuilt.instructionBytes)))]));
}
for(const [id,source] of fixtures) {
    const revision=session.revision;
    const result=session.build(source,{exact:false,details:true});
    const clean=realm('stock');
    let oracle,diagnostic;
    try { oracle=clean.compileTypedWorldRv32(source,elf); }
    catch(error) {diagnostic={name:error.name,message:error.message};}
    const row={id,mode:result.mode,source:sha(source)};
    if(diagnostic) {
        assert.equal(result.mode,'rejected'); assert.deepEqual({...result.error},diagnostic);
        assert.equal(session.revision,revision);
        row.diagnostic=diagnostic;
    } else {
        assert.equal(result.mode,'fragments');
        assert.deepEqual(Buffer.from(result.bytes),Buffer.from(oracle));
        Object.assign(row,{image:sha(oracle),bytes:oracle.length,rawBytes:result.instructionBytes,
            built:result.built.length,reused:result.reused.length});
        const current=spans(result);
        if (previous) {
            row.changedLinkedBodies=[...current].filter(([name,hash])=>previous.get(name)!==hash).length;
            row.rebuiltButByteIdentical=result.built.filter(({name})=>previous.get(name)===current.get(name)).length;
        }
        previous=current;
    }
    history.push(row);
}
console.log(JSON.stringify({source:sha(src),reactor:sha(elf),stagedManifest:JSON.parse(readFileSync(join(dir,'sources.json'))),history},null,2));
