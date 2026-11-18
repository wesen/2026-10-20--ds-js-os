// Bootstrap a diagnostic stage 1 using the normal CLI. The bundled source is transformed only when read.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [dir, candidate] = process.argv.slice(2);
const cji = resolve(dir);
const bundle = resolve(cji,'build/rv32/stage1/bundle-cji.js');
const original = fs.readFileSync.bind(fs);
const rules = {
  memo:['memo: store !== null','memo: true'],
  join:['function join(a, b) {\n  if (empty(a)) return b;', 'function join(a, b) {\n  if (a === b) return a;\n  if (empty(a)) return b;']
};
const [before, after] = rules[candidate];
fs.readFileSync = function(path, ...args) {
  const result = original(path, ...args);
  if (path !== bundle) return result;
  if (result.split(before).length !== 2) throw Error('expected one candidate edit in bundle');
  return result.replace(before, after);
};
syncBuiltinESMExports();
process.argv = [process.execPath, resolve(cji,'cji.js'), bundle, '--emit'];
await import(pathToFileURL(process.argv[1]));
