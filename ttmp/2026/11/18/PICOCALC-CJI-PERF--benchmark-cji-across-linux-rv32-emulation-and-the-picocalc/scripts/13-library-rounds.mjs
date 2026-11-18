// Diagnostic source-level run under Node. Apply counters in memory only.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [cji, world, reference] = process.argv.slice(2);
const stats = { joins: 0, identical: 0, analyses: 0, fixpointRounds: 0, rounds: [] };
globalThis.__cjiStats = stats;
function inject(text, key, after) {
  if (text.split(key).length !== 2) throw new Error('expected a unique diagnostic site: ' + key);
  return text.replace(key, key + '\n' + after);
}
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (!url.startsWith(pathToFileURL(resolve(cji, 'src') + '/').href)) return result;
  let text = String(result.source);
  if (url.endsWith('/ranges.js')) {
    text = inject(text, 'function join(a, b) {', 'globalThis.__cjiStats.joins++; if (a === b) globalThis.__cjiStats.identical++;');
    text = inject(text, 'let rounds = 0;', 'globalThis.__cjiStats.analyses++;');
    text = inject(text, 'widening = rounds >= 3;', 'globalThis.__cjiStats.fixpointRounds++;');
  } else if (url.endsWith('/library.js')) {
    text = inject(text, 'if (added.length > before) {',
      'globalThis.__cjiStats.rounds.push({round, added:added.length-before, originalTopLevelNodes:body.length});');
  } else return result;
  return {...result, source:text};
}});
const {compileSource} = await import(pathToFileURL(resolve(cji, 'src/build.js')));
const source = readFileSync('picocalc-os/js/apps/' + world + '.js', 'utf8');
const output = compileSource(source, false, { mode:'unit' });
if (!Buffer.from(output).equals(readFileSync(reference))) throw new Error('reference mismatch');
console.log(JSON.stringify({world, ...stats, slir_sha256:createHash('sha256').update(output).digest('hex')}, null, 2));
