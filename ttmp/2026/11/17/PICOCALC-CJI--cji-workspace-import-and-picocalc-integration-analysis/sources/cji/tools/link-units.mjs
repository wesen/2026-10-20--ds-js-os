#!/usr/bin/env node
// CJI-3 step 1: join a unit compiled on its own (the world runtime) and a world compiled against it
// into one SLIR program.
//
//   node tools/link-units.mjs prelude.slir world.slir > linked.slir
//
// The unit's main becomes the function $main$prelude, which the world's main calls first: the
// runtime's start builds its closures and boxes, hands its export record over (rt_export), and
// registers the world's two entries; then the world's start imports from that record. A function
// both texts define is defined once: canonical_names (chapter 28) names functions by their content,
// so the same name is the same code.
import { readFileSync } from 'node:fs';

export function linkUnits(preludeText, worldText) {
  const functions = (text) => text.split(/^(?=function )/m).filter((f) => f.startsWith('function '));
  const nameOf = (f) => f.slice('function '.length, f.indexOf('/'));
  const out = [], have = new Set();
  for (let f of functions(preludeText)) {
    if (nameOf(f) === 'main') f = f.replace(/^function main\//, 'function $main$prelude/');
    have.add(nameOf(f));
    out.push(f);
  }
  let calls = 0;
  for (let f of functions(worldText)) {
    if (have.has(nameOf(f))) continue;
    if (nameOf(f) === 'main') {   // the runtime's start, before anything of the world's
      f = f.replace(/^(function main\/0[^\n]*\nstart:\n)/, (m) => { calls++; return `${m}    call    $main$prelude/0\n`; });
    }
    out.push(f);
  }
  if (calls !== 1) throw new Error('link-units: the world has no main to start the runtime from');
  return out.join('');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [prelude, world] = process.argv.slice(2);
  if (!prelude || !world) { console.error('usage: node tools/link-units.mjs prelude.slir world.slir'); process.exit(2); }
  process.stdout.write(linkUnits(readFileSync(prelude, 'utf8'), readFileSync(world, 'utf8')));
}
