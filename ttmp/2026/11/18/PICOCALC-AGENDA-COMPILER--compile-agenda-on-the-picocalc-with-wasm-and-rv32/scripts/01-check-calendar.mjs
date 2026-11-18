import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import '../../../../../../picocalc-os/compiler/typed-wasm.js';
const read = path => fs.readFileSync(path,'utf8');
const app = read('picocalc-os/js/apps/agenda.js');
const reference = vm.runInNewContext(app.slice(app.indexOf('function agValidDate'),app.indexOf('function agParse')) + '\nagValidDate');
const bytes = compileTyped(read('picocalc-os/worlds/agenda/reminder.typed'));
const {instance} = await WebAssembly.instantiate(bytes);
let cases=0;
for (const year of [...Array(500).keys(), 1600, 1900, 1999, 2000, 2024, 2026, 2100, 2400, 9999]) {
    for (let month=0; month<=13; month++) for (let day=0; day<=32; day++) {
        assert.equal(Boolean(instance.exports.validDate(year,month,day)),reference(year,month,day),[year,month,day].join('-'));
        cases++;
    }
}
console.log(JSON.stringify({cases, wasmBytes:bytes.length}));
