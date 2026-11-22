// prelude_and_conclusion: the function's entry and exit.
//
// On x86 the book writes the prelude by hand (push %rbp, move %rsp, subtract the frame size)
// and the conclusion before every return. SLJIT generates both: sljit_emit_enter takes the
// number of scratch and saved registers the body uses and the frame size, and
// sljit_emit_return restores everything. So this pass computes those three numbers and
// records them in the function header, which print_slir writes as
//   function main/0 scratches=1 saveds=0 local=24

//
// Chapter 6: a function with root slots must also make room for them on the root stack,
// and zero them, because the collector reads every slot below the top, written yet or not:
//
//   mov  s0, [@rootstack_begin]     (main only: the root stack starts empty)
//   mov  [s0+0], #0 ...             (one per root slot)
//   add  s0, s0, #8n
//
// s0 is a saved register, so SLJIT's own conclusion restores the caller's s0 on return,
// which pops the slots again.

import { Reg, Mem, Imm, Global, Ins, SBlock, SFunc, SProgram, SCRATCH, SAVED, ROOTS, withInfo } from './slir.js';

// main starts the root stack when any function uses it: one that allocates, or (chapter 9)
// one whose dynamic values have root slots although the program never allocates, or
// (chapter 13) one that calls a runtime function that allocates.
function rootPrelude(f, roots) {
  const out = [];
  // (chapter 24: and an entry of a native world, $nw..., which the embedder calls between events,
  // when no compiled frame is live)
  if ((f.name === 'main' || f.name.startsWith('$nw')) && roots) out.push(Ins('mov', [Reg(ROOTS), Global('rootstack_begin')]));
  if (f.rootSlots) {
    for (let k = 0; k < f.rootSlots; k++) out.push(Ins('mov', [Mem(Reg(ROOTS), 8 * k), Imm(0)]));
    out.push(Ins('add', [Reg(ROOTS), Reg(ROOTS), Imm(8 * f.rootSlots)]));
  }
  return out;
}

const regsOf = (o) => (o.kind === 'Reg' ? [o.name] : o.kind === 'Mem' ? regsOf(o.base) : []);

// (CJI-3: per function, so that a build can finish each function as soon as its back half is done.
// The one program-wide question is whether any function uses the root stack; only main's and the
// entries' preludes depend on the answer.)
export const usesRootStack = (f) =>
  !!(f.usesHeap || f.rootSlots || f.blocks.some((b) => b.instrs.some((i) => i.args.some((a) => a.kind === 'Reg' && a.name === ROOTS))));
export const needsRootsAnswer = (f) => f.name === 'main' || f.name.startsWith('$nw');

export function preludeOne(f, roots) {
  const [first, ...rest] = f.blocks;
  const blocks = [SBlock(first.label, [...rootPrelude(f, roots), ...first.instrs]), ...rest];
  let scratches = Math.max(1, f.nparams), saveds = 0;   // r0 always: SLJIT returns values in it
  for (const b of blocks)
    for (const i of b.instrs) {
      if (i.nargs !== undefined) scratches = Math.max(scratches, i.nargs);
      for (const name of i.args.flatMap(regsOf)) {
        const r = SCRATCH.indexOf(name), s = SAVED.indexOf(name);
        if (r >= 0) scratches = Math.max(scratches, r + 1);
        if (s >= 0) saveds = Math.max(saveds, s + 1);
      }
    }
  return withInfo(SFunc(f.name, f.nparams, blocks, { scratches, saveds, local: f.frameBytes }), f);
}

export function preludeAndConclusion(p) {
  const roots = p.funcs.some(usesRootStack);
  return SProgram(p.funcs.map((f) => preludeOne(f, roots)));
}
