// Run each row in its own new Node process. Filesystem reads and Node startup precede the start clock.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {wasm,source,transfer,installer,admit,newRunner} from './06-runner.mjs';
const [dir,arm]=process.argv.slice(2);
assert(['R','M','S'].includes(arm));
const state=JSON.parse(readFileSync(join(dir,'states.ndjson'),'utf8').split('\n')[0]);
const ref=JSON.parse(readFileSync(join(dir,'control.ndjson'),'utf8').split('\n')[0]);
const install=installer(),packet=arm==='S'?transfer(2,source):transfer(1,wasm);
const start=performance.now();
const module=arm==='R'?admit(wasm):install(packet).module;
const installDone=performance.now();
const draw=newRunner(module), instanceDone=performance.now(),first=draw(state), end=performance.now();
assert.equal(first.raw,JSON.stringify(ref.tree));assert.equal(first.hints,ref.hints);
console.log(JSON.stringify({arm,installUs:(installDone-start)*1000,instantiateUs:(instanceDone-installDone)*1000,
    firstUs:(end-start)*1000}));
