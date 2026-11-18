// remove_jumps: merge a block into the block that jumps to it, when that jump is the only
// way in.
//
// explicate_control makes a block for every join point, before it knows whether both
// branches survive. When a constant condition removes one of them (`if (true) ...`), the
// join block is left with a single predecessor that ends in `goto`. The jump and the label
// do nothing, and the merged block gives the register allocator one longer stretch of
// straight-line code.

import { CBlock, CProgram, CDef, CProgramDefs } from './ast.js';

// Chapter 7: per function.
export function removeJumps(p) {
  return CProgramDefs(p.defs.map((d) => Object.assign(CDef(d.name, d.params, removeJumpsInBlocks(d.blocks)),
    { paramTypes: d.paramTypes, type: d.type })));
}

function targets(t) {
  switch (t.kind) {
    case 'Goto': return [t.label];
    case 'IfGoto': return [t.thn, t.els];
    default: return [];
  }
}

function removeJumpsInBlocks(pblocks) {
  const p = { blocks: pblocks };
  const blocks = new Map(p.blocks.map((b) => [b.label, { ...b, stmts: [...b.stmts] }]));
  const preds = new Map(p.blocks.map((b) => [b.label, 0]));
  for (const b of p.blocks) for (const l of targets(b.tail)) preds.set(l, preds.get(l) + 1);

  for (const b of p.blocks) {
    const into = blocks.get(b.label);
    if (!into) continue;                       // already merged into its predecessor
    // Merging can expose another goto at the end, so keep going.
    while (into.tail.kind === 'Goto' && preds.get(into.tail.label) === 1 && into.tail.label !== 'start'
      && into.tail.label !== into.label) {
      const next = blocks.get(into.tail.label);
      into.stmts.push(...next.stmts);
      into.tail = next.tail;
      blocks.delete(next.label);
    }
  }
  return p.blocks.filter((b) => blocks.has(b.label))
    .map((b) => { const x = blocks.get(b.label); return CBlock(x.label, x.stmts, x.tail); });
}
