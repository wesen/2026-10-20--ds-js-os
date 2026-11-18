// Register the tested closures only inside a diagnostic source load. Compile a real world as well.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [root, name, ref] = process.argv.slice(2);
const source = f => pathToFileURL(resolve(root,f)).href;
let checks = 0;
globalThis.checkTree = (get, set) => {
  if (checks) return;
  for (const level of [0,1,2]) {
    const key = [5,37,1031][level];
    const other = key - 1;
    const first = set(undefined,key,19,level);
    const snap = first;
    const equal = set(first,key,19,level);
    const change = set(first,key,21,level);
    const two = set(change,other,23,level);
    assert.equal(get(first,key,level+1),19);
    assert.equal(get(equal,key,level+1),19);
    assert.equal(get(snap,other,level+1),undefined);
    assert.equal(get(change,key,level+1),21);
    assert.equal(get(change,other,level+1),undefined);
    assert.equal(get(two,other,level+1),23);
    assert.equal(get(two,key,level+1),21);
    if (['reuse','both'].includes(name)) assert.equal(first,equal);
    assert.notEqual(change,first);
    checks++;
  }
};
const counts = globalThis.counts = {writes:0,nodeAllocations:0,existingNodeCopies:0,reusedNodes:0};
registerHooks({load(url,context,next) {
  const r=next(url,context);
  if(url!==source('src/ranges.js')) return r;
  let s=String(r.source);
  s=s.replace('  const State =','  globalThis.checkTree(trieGet, trieSet);\n  const State =');
  s=s.replace('s.root = trieSet(s.root','globalThis.counts.writes++; s.root = trieSet(s.root');
  s=s.replace('const copy = node === undefined ?', 'if (node === undefined) globalThis.counts.nodeAllocations++; else globalThis.counts.existingNodeCopies++;\n    const copy = node === undefined ?');
  s=s.replace('if (node !== undefined && previous === child) return node;', 'if (node !== undefined && previous === child) { globalThis.counts.reusedNodes++; return node; }');
  // Exclude the manual cases from the compile counters.
  s=s.replace('globalThis.checkTree(trieGet, trieSet);','if (!globalThis.manualDone) { globalThis.checkTree(trieGet, trieSet); for (const k of Object.keys(globalThis.counts)) globalThis.counts[k]=0; globalThis.manualDone=true; }');
  return {...r,source:s};
}});
const {compileSource} = await import(source('src/build.js'));
const output=compileSource(readFileSync('picocalc-os/js/apps/agenda.js','utf8'),false,{mode:'unit',store:null});
assert.deepEqual(Buffer.from(output),readFileSync(ref));
assert.equal(checks,3);
console.log(JSON.stringify({name,depths:checks,counts},null,2));
