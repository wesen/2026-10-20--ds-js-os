// 07-diag-node.mjs: the diagnostic probes (06-diag-probes.json) in Node, for comparison with the world's.
// usage: node 07-diag-node.mjs --candela DIR --world DIR --probes PROBES.json --out OUT.json
import { register } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? a.concat([[x.slice(2), all[i + 1]]]) : a), []));
const candela = resolvePath(args.candela), world = resolvePath(args.world);
register(pathToFileURL(new URL('./lib/resolve-hooks.mjs', import.meta.url).pathname).href, import.meta.url, { data: { candela, world } });
const C = await import(pathToFileURL(join(candela, 'src/candela.js')).href);
const { subsetCheck } = await import('world:subset.js');
const probes = JSON.parse(readFileSync(args.probes, 'utf8'));
const out = {};
for (const [id, p] of Object.entries(probes)) {
  C.paramStore.reset();
  const r = await C.build(p.files);
  const diags = r.diags.map(d => `${d.code}@${d.loc ? d.loc.file + ':' + d.loc.line : '-'}`);
  const refused = r.ok ? subsetCheck(r.compiled).map(d => `${d.code}@${d.loc ? d.loc.file + ':' + d.loc.line : '-'} ${d.feature}`) : [];
  out[id] = { expect: p.expect, ok: r.ok, diags, refused };
  console.log(id.padEnd(10), p.expect.padEnd(36), 'node:', diags.join(' '), refused.join(' '));
}
writeFileSync(args.out, JSON.stringify(out, null, 1) + '\n');
