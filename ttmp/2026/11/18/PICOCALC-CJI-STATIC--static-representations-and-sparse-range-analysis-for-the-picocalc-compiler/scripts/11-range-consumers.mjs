// Attribute joins to source consumers on the guarded JS frontend. Verify the emitted unit.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const [root, world, reference] = process.argv.slice(2);
const source = path => pathToFileURL(resolve(root, path)).href;
const counts = {};
globalThis.observeJoin = (site, a, b, result) => {
  const row = counts[site] ??= { calls: 0, identicalInputs: 0, resultAlreadyLeft: 0 };
  row.calls++;
  if (a === b) row.identicalInputs++;
  if (a === result) row.resultAlreadyLeft++;
  return result;
};
registerHooks({load(url, context, next) {
  const loaded = next(url, context);
  if (url !== source('src/ranges.js')) return loaded;
  let edits = 0;
  const lines = String(loaded.source).split('\n').map((line, i) => {
    if (/^\s*\/\/|^function join\(/.test(line)) return line;
    const tag = label => {
      edits++;
      return `rangeJoinAt(${JSON.stringify((i + 1) + ':' + label)})`;
    };
    return line.replace(/(?<![.\w])join\(/g, (_, offset) => tag(offset) + '(')
      .replace(/b.root, join, null/, () => 'b.root, ' + tag('state merge') + ', null');
  });
  if (edits !== 9) throw Error('unexpected number of source sites: ' + edits);
  lines.push('function rangeJoinAt(site) { return (a, b) => globalThis.observeJoin(site, a, b, join(a, b)); }');
  return {...loaded, source:lines.join('\n')};
}});
const {compileSource} = await import(source('src/build.js'));
const output = compileSource(readFileSync('picocalc-os/js/apps/' + world + '.js','utf8'), false, {mode:'unit',store:null});
if (!Buffer.from(output).equals(readFileSync(reference))) throw Error('output differs');
console.log(JSON.stringify({world, slir_sha256:createHash('sha256').update(output).digest('hex'),counts},null,2));
