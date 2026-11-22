// Promoted from PICOCALC-AGENDA-COMPILER scripts/02-check-leads.mjs (PICOCALC-REPO-LAYOUT Phase A); run from the repository root.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import '../../lib/compiler.mjs';
const original=fs.readFileSync('apps/js/picocalc/apps/agenda.js','utf8');
const parse=vm.runInNewContext(original.slice(0,original.indexOf('function agToggled'))+'\nagParse');
const source=fs.readFileSync('apps/typed/agenda/reminder.typed','utf8');
const {instance}=await WebAssembly.instantiate(compileTyped(source));
const memory=new DataView(instance.exports.memory.buffer);
function run(token) {
    memory.setUint32(0,token.length,true);
    for(let i=0;i<token.length;i++) memory.setUint16(4+i*2,token.charCodeAt(i),true);
    assert.equal(instance.exports.leadMinutes(0),parse('- item '+token).lead ?? -1,token);
}
let count=0;
for(let value=0;value<=9999;value++) for(const unit of ['m','h','d']) { run('!'+value+unit); count++; }
for(const bad of ['', '!','!0015m','!10000m','!15','!15🚀','!١h','!12M','!2.5h','!3s']) {run(bad);count++;}
console.log(JSON.stringify({cases:count}));
