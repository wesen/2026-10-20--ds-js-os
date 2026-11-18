// Observe unchanged writes and retained merge results without changing the returned objects.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, world, reference] = process.argv.slice(2);
const source = path => pathToFileURL(resolve(root, path)).href;
const counts = globalThis.observed = {writes:0, unchangedWrites:0, sliceCopies:0, newWriteNodes:0, materializedMerges:0,
  mergeEqualsLeft:0, mergeEqualsRight:0, mergeEqualsEither:0, mergedSlots:0, changedFromLeft:0};
function replaceOnce(text, a, b) {
  if (text.split(a).length !== 2) throw Error('ambiguous instrumentation anchor: ' + a);
  return text.replace(a, b);
}
registerHooks({load(url, context, next) {
  const loaded = next(url,context);
  if (url !== source('src/ranges.js')) return loaded;
  let text = String(loaded.source);
  for (const [a,b] of [
    ['s.root = trieSet(s.root', 'observed.writes++; if (trieGet(s.root, k, s.table.depth) === v) observed.unchangedWrites++;\n    s.root = trieSet(s.root'],
    ['const copy = node === undefined', 'if (node === undefined) observed.newWriteNodes++; else observed.sliceCopies++;\n    const copy = node === undefined'],
    [': merge(xi, yi, both, onlyX, level - 1);\n    }\n    return r;', `: merge(xi, yi, both, onlyX, level - 1);
    }
    let left = true, right = true;
    for (let i = 0; i < 32; i++) {
      if (r[i] !== x[i]) { left = false; observed.changedFromLeft++; }
      if (r[i] !== y[i]) right = false;
    }
    observed.mergedSlots += 32;
    observed.materializedMerges++;
    if (left) observed.mergeEqualsLeft++;
    if (right) observed.mergeEqualsRight++;
    if (left || right) observed.mergeEqualsEither++;
    return r;`]
  ]) text = replaceOnce(text,a,b);
  return {...loaded, source:text};
}});
const {compileSource} = await import(source('src/build.js'));
const output = compileSource(readFileSync('picocalc-os/js/apps/' + world + '.js','utf8'),false,{mode:'unit',store:null});
if (!Buffer.from(output).equals(readFileSync(reference))) throw Error('output differs');
console.log(JSON.stringify({world,counts},null,2));
