// assign_homes: give every variable a home in the stack frame.
//
// Variable number k (in order of first appearance) lives at [sp+8k]. This is the simplest
// possible register allocation: none. Chapter 3 replaces this pass with a real allocator
// that keeps most variables in registers.

import { Mem, SFunc, SBlock, SProgram } from './slir.js';

export function assignHomes(p) {
  return SProgram(p.funcs.map((f) => {
    const homes = new Map();
    const home = (o) => {
      if (o.kind !== 'SVar') return o;
      if (!homes.has(o.name)) homes.set(o.name, Mem('sp', 8 * homes.size));
      return homes.get(o.name);
    };
    const blocks = f.blocks.map((b) =>
      SBlock(b.label, b.instrs.map((i) => ({ ...i, args: i.args.map(home) }))));
    const out = SFunc(f.name, f.nparams, blocks);
    out.homes = homes;            // kept for the dump and for prelude_and_conclusion
    out.frameBytes = 8 * homes.size;
    return out;
  }));
}
