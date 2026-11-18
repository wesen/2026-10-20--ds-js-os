// Chapter 25: prune_functions, the functions a program can reach.
//
// A world is compiled with the whole world runtime and every library function its source
// names: flaky's six lines of service bring 213 functions, and most are never called. Every
// function costs memory three times over in a world on the board: its SLIR text in the binary,
// the assembler's working memory while it is assembled, and its machine code for as long as
// the world runs. This pass keeps the functions reachable from main: a call or tail call
// names its callee (i.fn), and a closure or funref names the function it makes a value of.
// Everything a dynamic call can reach was made into a value somewhere reachable, so nothing
// the program can call is lost.
//
// It runs right after select_instructions, where every call is explicit, so that liveness,
// interference and register allocation skip the dead functions too.

const REFS = new Set(['call', 'tailcall', 'closure', 'funref']);

export function pruneFunctions(p) {
  const byName = new Map(p.funcs.map((f) => [f.name, f]));
  const keep = new Set();
  const work = ['main'];
  while (work.length) {
    const name = work.pop();
    if (keep.has(name) || !byName.has(name)) continue;
    keep.add(name);
    for (const b of byName.get(name).blocks)
      for (const i of b.instrs) if (REFS.has(i.op) && i.fn) work.push(i.fn);
  }
  return { ...p, funcs: p.funcs.filter((f) => keep.has(f.name)) };
}
