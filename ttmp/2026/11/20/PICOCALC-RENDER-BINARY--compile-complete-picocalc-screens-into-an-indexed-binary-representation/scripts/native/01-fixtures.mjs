// Use the frozen primary group's capsule, its actual encoder and its JS witness functions.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const [capsule,header,fixtureDir]=process.argv.slice(2);
if(!fixtureDir) throw Error('Expected capsule.js, generated header path, and frozen fixture directory');
const fixtures=new Function(readFileSync(capsule,'utf8')+`
return Object.values(binaryFixtures).map(f=>({app:f.payload.app,id:f.id,text:JSON.stringify(f.payload),
wire:binaryScreen.encode(f.payload),path:f.path,first:f.firstPath,
lastHash:scalarWeight(atPath(f.payload,f.path))>>>0,firstHash:scalarWeight(atPath(f.payload,f.firstPath))>>>0,
fullHash:fullWeight(f.payload)>>>0}));`)();
const parts=['/* Generated from the principal researcher’s frozen corpus. */'];
const bytes=(name,buf)=>{
  parts.push('static const unsigned char '+name+'[] = {');
  for(let i=0;i<buf.length;i+=32)parts.push('  '+Array.from(buf.slice(i,i+32)).join(',')+',');
  parts.push('};');
};
const records=[];
for(const [i,f] of fixtures.entries()) {
  const pre='bxdata'+i;
  const actualJSON=readFileSync(join(fixtureDir,f.app+'.json'));
  const actualBinary=readFileSync(join(fixtureDir,f.app+'.psix'));
  assert(actualJSON.equals(Buffer.from(f.text)) && actualBinary.equals(Buffer.from(f.wire)));
  bytes(pre+'j',Buffer.concat([actualJSON,Buffer.of(0)]));
  bytes(pre+'b',actualBinary);
  for(const [key,path] of [['late',f.path],['first',f.first]]) {
    parts.push('static const bx_step '+pre+key+'[] = {'+path.map(x=>typeof x==='number'?`{NULL,${x}}`:`{${JSON.stringify(x)},0}`).join(',')+', {NULL,-1}};');
  }
  records.push(`{${JSON.stringify(f.app)},${pre}j,sizeof(${pre}j)-1,${pre}b,sizeof(${pre}b),${pre}first,${pre}late,${f.firstHash}u,${f.lastHash}u,${f.fullHash}u}`);
}
parts.push('static const bx_spec bx_fixtures[]={'+records.join(',\n')+'};');
writeFileSync(header,parts.join('\n')+'\n');
