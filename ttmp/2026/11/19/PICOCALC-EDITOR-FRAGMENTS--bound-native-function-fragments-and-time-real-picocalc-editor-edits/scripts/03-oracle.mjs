import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
const [work, sourceFile, elfFile] = process.argv.slice(2);
const source = readFileSync(sourceFile, 'utf8'), elf = readFileSync(elfFile);
const sha = x => createHash('sha256').update(x).digest('hex');
function realm(which) {
    const ctx=vm.createContext({});
    for (const name of ['wasm','rv32','world',...(which==='stock'?[]:['incremental','endpoint'])]) {
        vm.runInContext(readFileSync(join(work,which,name+'.js'),'utf8'),ctx,{filename:name+'.js'});
    }
    return ctx;
}
const stock=realm('stock'), candidate=realm('candidate');
const {sequence,bad}=candidate.editorEdits(source);
const rows=[],caps={};
const marker=Buffer.from('4e454741565241444c533233','hex');
for (const text of sequence) {
    let clean;
    const link = stock.typedRv32.linkSlot;
    stock.typedRv32.linkSlot = (p,...rest) => { clean=p; return link(p,...rest); };
    const bytes=Buffer.from(stock.compileTypedWorldRv32(text,elf));
    stock.typedRv32.linkSlot=link;
    assert.equal(Object.keys(clean.entries).length,120);
    const at=bytes.indexOf(marker);
    assert(at>=0 && bytes.indexOf(marker,at+1)===-1);
    const start=at+20+4*(bytes.readUInt16LE(at+16)+bytes.readUInt16LE(at+18));
    const state=clean.records.WorldState;
    rows.push({source:sha(text),elf:sha(bytes),bytes:bytes.length,code:clean.image.length,
        entry:start+clean.entries.editorPreviewFinish,
        rows:state.previewRows.offset/4,units:state.previewUnits.offset/4,columns:state.previewColumns.offset/4});
}
for (const cap of [0,40*1024,256*1024]) {
    const session=candidate.createFunctionRebuild(candidate.rebuildWorld,elf,cap,120);
    const journal=[];
    for (const index of [0,1,2,3,4,0]) {
        const actual=session.build(sequence[index]);
        assert.equal(actual.mode,'fragments');
        assert.equal(sha(actual.bytes),rows[index].elf);
        assert(session.resident.bytes<=cap && session.resident.count<=120);
        journal.push({index,built:actual.built.length,reused:actual.reused.length,...session.resident});
        if (index===1) {
            const previous=session.revision;
            const before=session.resident;
            let expected;
            try {stock.compileTypedWorldRv32(bad,elf);} catch(e){expected=e;}
            assert(expected);
            const rejection=session.build(bad);
            assert.equal(rejection.mode,'rejected');
            assert.equal(rejection.error.message,expected.message);
            assert.equal(session.revision,previous);
            assert.deepEqual(session.resident,before);
        }
    }
    if (cap===40*1024) assert(journal[1].count>0 && journal[1].count<120 && journal[1].reused>0);
    if (!cap) assert(journal.every(r=>r.reused===0));
    caps[cap]=journal;
}
const receipt={reactor:sha(elf),rows,caps};
writeFileSync(join(work,'host.json'),JSON.stringify(receipt,null,2)+'\n');
writeFileSync(join(work,'editor-oracle.h'),'/* Clean ELF file offsets and state word indices for the four edited programs. */\nstatic const struct { unsigned entry, rows, units, columns; } preview_sites[] = {\n'+rows.slice(1).map(r=>'  {'+[r.entry,r.rows,r.units,r.columns].join(', ')+'},').join('\n')+'\n};\n');
console.log(JSON.stringify({rows:rows.length,retention:Object.fromEntries(Object.entries(caps).map(([k,r])=>[k,r[1]]))}));
