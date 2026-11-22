// patch_instructions: fix instructions the machine cannot execute as written.
//
// On x86, `addq -8(%rbp), -16(%rbp)` is illegal (two memory operands), and the book's
// patch pass rewrites it through %rax. SLJIT accepts any combination of registers, memory
// and immediates in every instruction and inserts its own temporary registers where the
// target needs them, so in this chapter there is nothing to fix. What remains is a clean-up:
// a move whose source and destination are the same location does nothing and is dropped.
//
// Chapter 6 brings the first real case. A memory operand's base must be a register, but
// the variable that holds an array may have been spilled to the frame or the root stack:
//
//   mov x, [[s0-8]+16]   =>   mov r6, [s0-8]
//                             mov x, [r6+16]
//
// r6 is never given to a variable, so it is free for this. select_instructions makes at
// most one such operand per instruction, so one register is enough.

import { Reg, Mem, Ins, SFunc, SBlock, SProgram, PATCH, withInfo } from './slir.js';
import { showOperand } from './slir.js';

const same = (a, b) => (a.kind === 'Reg' || a.kind === 'Mem') && showOperand(a) === showOperand(b);

function patch(i, out) {
  if (i.op === 'mov' && same(i.args[0], i.args[1])) return;
  const args = i.args.map((o) => {
    if (o.kind !== 'Mem' || o.base.kind !== 'Mem') return o;
    out.push(Ins('mov', [Reg(PATCH), o.base]));
    return Mem(Reg(PATCH), o.offset);
  });
  out.push({ ...i, args });
}

export function patchInstructions(p) {
  return SProgram(p.funcs.map((f) => {
    const blocks = f.blocks.map((b) => {
      const out = [];
      for (const i of b.instrs) patch(i, out);
      return SBlock(b.label, out);
    });
    return withInfo(SFunc(f.name, f.nparams, blocks), f);
  }));
}
