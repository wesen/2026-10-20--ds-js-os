// layout_blocks: put the blocks in an order and let them fall through.
//
// Until now the order of a function's blocks did not matter: every block ended in return or
// jump. Machine code is one sequence of instructions, though, and a jump to the very next
// instruction is wasted work. This pass orders the blocks so that, as far as possible, each
// block's jump target comes right after it (reverse postorder: a block before the blocks it
// jumps to, which for chapter 4's acyclic control flow is a topological order), and then:
//
//   jump L                where L is next      =>   (nothing: fall through)
//   bcc a, b, L1          where L1 is next     =>   bncc a, b, L2
//   jump L2                                         (and fall through to L1)
//
// where ncc is the opposite condition. After this pass, a block that does not end in return
// or jump continues with the next block, which slas and the machine model both understand.

import { SFunc, SBlock, SProgram, NEGATE, withInfo } from './slir.js';
import { postorder } from './liveness.js';

function layoutFunction(f) {
  const order = postorder(f).reverse();
  const blocks = order.map((b, k) => {
    const next = order[k + 1]?.label;
    const instrs = [...b.instrs];
    const last = instrs.at(-1), prev = instrs.at(-2);
    if (last?.op === 'jump' && last.target === next) {
      instrs.pop();
    } else if (last?.op === 'jump' && prev && prev.op.startsWith('b') && prev.target === next) {
      instrs.splice(-2, 2, { ...prev, op: `b${NEGATE[prev.op.slice(1)]}`, target: last.target });
    }
    return SBlock(b.label, instrs);
  });
  return withInfo(SFunc(f.name, f.nparams, blocks), f);
}

export function layoutBlocks(p) {
  return SProgram(p.funcs.map(layoutFunction));
}
