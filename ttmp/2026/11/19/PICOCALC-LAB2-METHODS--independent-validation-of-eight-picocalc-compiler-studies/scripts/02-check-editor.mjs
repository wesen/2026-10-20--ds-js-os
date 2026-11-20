/* Exercise the native probe's assumptions on emitted instructions in a host interpreter.
 * argv: independently staged fragment directory, joined Editor source, P4 reactor */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const [staging,sourceFile,reactorFile]=process.argv.slice(2);
const src=readFileSync(sourceFile,'utf8'), reactor=readFileSync(reactorFile);
const sha=b=>createHash('sha256').update(b).digest('hex');
const day=new URL('../../',import.meta.url);
const branch=readdirSync(day).find(n=>n.startsWith('PICOCALC-RV32-BRANCH--'));
let interpreter=readFileSync(new URL(branch+'/scripts/07-rv32.mjs',day),'utf8');
interpreter=interpreter.replace('else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));',
  'else if (f3 === 1 && f7 === 0) x[rd] = a << (imm & 31);\n            else if (f3 === 3) x[rd] = Number((a >>> 0) < (imm >>> 0));');
const {runRv32}=await import('data:text/javascript;base64,'+Buffer.from(interpreter).toString('base64'));
function realm(lane,scripts,inspect) {
  const c=vm.createContext({});
  for(const s of scripts) {
    let code=readFileSync(join(staging,lane,s+'.js'),'utf8');
    if(inspect && s==='incremental') {
      const line='get revision() { return current?.revision; },';
      assert.equal(code.split(line).length,2);
      code=code.replace(line,line+'\n        get textUnits() { return [...current.items.values()].reduce((n,p)=>n+p.text.length,0); },');
    }
    vm.runInContext(code,c,{filename:s+'.js'});
  }
  return c;
}
const clean=realm('stock',['wasm','rv32','world'],false);
const candidate=realm('candidate',['wasm','rv32','world','incremental','endpoint'],true);
const {sequence}=candidate.editorEdits(src);
let program;
const link=clean.typedRv32.linkSlot;
clean.typedRv32.linkSlot=(p,...rest)=>{program=p;return link(p,...rest);};
const images=sequence.map(source=>{
  const bytes=clean.compileTypedWorldRv32(source,reactor);
  return {program,sha:sha(bytes)};
});
const dataAt=32,stateAt=640;
function probe(p,layoutSource,length) {
  const mem=new Uint8Array(1200), view=new DataView(mem.buffer);
  const r=layoutSource.records.WorldState;
  view.setUint32(dataAt,length,true);
  for(const [field,value] of Object.entries({previewRows:2,previewUnits:5,previewColumns:7}))
    view.setInt32(stateAt+r[field].offset,value,true);
  const out=runRv32(p,'editorPreviewFinish',[dataAt,stateAt,4],[],{},mem);
  const result=new DataView(out.bytes.buffer,out.bytes.byteOffset,out.bytes.byteLength);
  return {trap:out.trap, ret:out.result, cells:[198,199,200,201].map(i=>result.getUint16(dataAt+4+2*i,true)),
    fields:['previewRows','previewUnits','previewColumns'].map(f=>result.getInt32(stateAt+r[f].offset,true))};
}
const probes=images.map(({program:p})=>probe(p,p,256));
assert.deepEqual(probes[0],{trap:false,ret:0,cells:[0,0,5,4],fields:[3,0,0]});
for(const row of probes.slice(1)) assert.deepEqual(row,{trap:false,ret:0,cells:[5,4,0,0],fields:[3,0,0]});
const staleLayout=probe(images[3].program,images[4].program,256);
assert(staleLayout.trap);
const tight=probe(images[4].program,images[4].program,199);
assert(tight.trap);
assert.equal(tight.cells[0],5);
const anchor='function editorHighSurrogate(unit: i32): bool {';
assert.equal(src.split(anchor).length,2);
const padding=' '.repeat(8192);
const padded=src.replace(anchor,anchor+padding);
const cache=candidate.createFunctionRebuild(candidate.rebuildWorld,reactor,40960,120);
function retained(source) {
  const row=cache.build(source);
  assert.equal(row.mode,'fragments');
  return {...cache.resident, retainedSourceUnits:cache.textUnits, elf:sha(row.bytes)};
}
const ordinary=retained(src), enlarged=retained(padded);
assert.equal(ordinary.elf,enlarged.elf);
assert.equal(ordinary.bytes,enlarged.bytes);
assert.equal(enlarged.retainedSourceUnits-ordinary.retainedSourceUnits,padding.length);
console.log(JSON.stringify({probes,staleLayout,secondWriteTrap:tight,ordinary,enlarged},null,2));
