// allocate_registers (chapter 3): colour the interference graph, then give every variable
// the register or stack slot its colour stands for.
//
// Colours are numbered: 0..6 are r0..r6, 7..12 are s0..s5, and colour 13 + k is stack slot
// k at [sp+8k]. Registers are nodes of the graph too, pre-coloured with their own colour,
// so "a variable live across a call interferes with r0..r6" needs no special case here.
//
// The colouring is DSATUR (Brelaz, 1979): repeatedly colour the variable whose neighbours
// already use the most distinct colours (its *saturation*), with the lowest colour they do
// not use. Move biasing prefers a colour already held by a variable or register the
// variable is copied to or from, so the copy becomes a move from a register to itself and
// patch_instructions deletes it.

import { Reg, Mem, SP, SFunc, SBlock, SProgram, SCRATCH, SAVED, ROOTS, PATCH, withInfo } from './slir.js';
import { isPointerType } from './types.js';
import { $nat_bits_new, $nat_bits_words, $nat_bits_has, $nat_bits_add, $nat_bits_grow, $nat_bits_next, $nat_bits_first_free,
  $nat_graph_word } from './bitsets.js';

// Chapter 6 sets two registers aside (s0 for the root stack, r6 for patch_instructions),
// leaving eleven for variables: colours 0..5 are r0..r5, 6..10 are s1..s5.
export const REGISTERS = [...SCRATCH, ...SAVED].filter((r) => r !== ROOTS && r !== PATCH);

// Pairs of locations connected by a move, for biasing.
function moveRelated(f) {
  const rel = new Map();
  const add = (a, b) => {
    if (!rel.has(a)) rel.set(a, []);
    rel.get(a).push(b);
  };
  for (const b of f.blocks)
    for (const i of b.instrs) {
      const [d, s] = i.args;
      if (i.op === 'mov' && (d.kind === 'SVar' || d.kind === 'Reg') && (s.kind === 'SVar' || s.kind === 'Reg')) {
        add(d.name, s.name);
        add(s.name, d.name);
      }
    }
  return rel;
}

export function colorGraph(f) {
  const g = f.graph, { names, index } = g.locs, n = names.length | 0, K = REGISTERS.length;
  // (chapter 31: on the graph's numbering. Registers are locations 0..K-1, coloured with their
  // own colour; every other location is a variable. Each variable's set of its coloured
  // neighbours' colours is a bitset grown as colours are used, and the heap holds numbers,
  // saturation * 2^21 + (2^21 - 1 - k), so the largest is the next variable: the most
  // saturated, then the first. The choices are chapter 22's.)
  // (CJI-3, lane 6: the colour sets are src/bitsets.js's native sets, one a variable, as wide as its
  // largest colour needs, and dropped when the variable is coloured: no set is read after that. One
  // matrix of sets, widened by doubling, took 2.5 MB of stage 1's heap for agent's largest function,
  // and 3.75 MB while it was copied; the sets alive at once take 0.3 MB packed.)
  const color = new Int32Array(n).fill(-1);
  for (let r = 0; r < K; r++) color[r] = r;
  const moves = moveRelated(f);
  const sat = new Int32Array(n);
  const none = $nat_bits_new(0), used = [];
  used.length = n;
  for (let v = 0; v < n; v++) used[v] = none;
  const has = (v, c) => $nat_bits_has(used[v], c) === 1;
  const mark = (v, c) => {
    if ((c >>> 5) >= $nat_bits_words(used[v])) used[v] = $nat_bits_grow(used[v], (c >>> 5) + 1);
    $nat_bits_add(used[v], c);
  };
  const SHIFT = 2 ** 21;
  let heap = new Float64Array(1024), size = 0;
  // (CJI-3: a heap that is full first drops its stale entries, those of a variable coloured or more
  // saturated since: each variable has one live entry, so the heap stays within twice the variables,
  // where it grew to millions of entries (agent: 4877 variables, a heap of 4M numbers, 32 MB). The
  // next variable is the largest live entry either way, and keys are unique, so no choice changes.)
  const down = (k) => {
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < size && heap[l] > heap[m]) m = l;
      if (r < size && heap[r] > heap[m]) m = r;
      if (m === k) return;
      const t = heap[k]; heap[k] = heap[m]; heap[m] = t;
      k = m;
    }
  };
  // (CJI-3, lane 6: s and v as 32-bit integers, | 0: the same values (s is a saturation, at most the number of
  // locations, and v < 2^21), but Ints in stage 1, where a double used as a typed array's index went through a
  // conversion at every color[v], sat[v], used[v])
  const live = (e) => { const s = Math.floor(e / SHIFT) | 0, v = (SHIFT - 1 - (e - s * SHIFT)) | 0; return color[v] < 0 && s === sat[v]; };
  const push = (e) => {
    if (size === heap.length) {
      let m = 0;
      for (let k = 0; k < size; k++) if (live(heap[k])) heap[m++] = heap[k];
      size = m;
      for (let k = (size >> 1) - 1; k >= 0; k--) down(k);
      if (2 * size >= heap.length) { const h2 = new Float64Array(2 * heap.length); h2.set(heap); heap = h2; }
    }
    let k = size++;
    heap[k] = e;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (heap[up] >= heap[k]) break;
      const t = heap[k]; heap[k] = heap[up]; heap[up] = t;
      k = up;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--size];
    down(0);
    return top;
  };
  // (a variable's neighbours: its row of the graph, gathered into one set)
  const row = $nat_bits_new(g.W);
  for (let v0 = K; v0 < n; v0++) {                 // the registers' colours, already known
    const v = v0;   // (CJI-3: a copy of the loop's own variable, as the loop below has)
    const regs = $nat_graph_word(g.g, v, 0);        // (registers are locations 0..K-1, K <= 32)
    for (let u = 0; u < K; u++) if ((regs & (1 << u)) !== 0 && !has(v, u)) { mark(v, u); sat[v]++; }
    push(sat[v] * SHIFT + (SHIFT - 1 - v));
  }
  let left = n - K;
  while (left > 0) {
    const e = pop(), s = Math.floor(e / SHIFT) | 0, v = (SHIFT - 1 - (e - s * SHIFT)) | 0;
    if (color[v] >= 0 || s !== sat[v]) continue;    // coloured, or stale
    let c = -1;
    for (const m of moves.get(names[v]) ?? []) {      // move biasing, registers only
      const mc = color[index.get(m)];
      if (mc >= 0 && mc < K && !has(v, mc)) { c = mc; break; }
    }
    if (c < 0) c = $nat_bits_first_free(used[v]);  // the lowest colour no neighbour has
    color[v] = c;
    used[v] = none;
    left--;
    g.row(v, row);
    for (let u = $nat_bits_next(row, 0); u >= 0; u = $nat_bits_next(row, u + 1)) {
      if (color[u] >= 0 || has(u, c)) continue;
      mark(u, c);
      sat[u]++;
      push(sat[u] * SHIFT + (SHIFT - 1 - u));
    }
  }
  return new Map(names.map((name, k) => [name, color[k]]));
}

// Colour k + 11 is spill slot k. Chapter 6: a spilled variable that holds a pointer goes to
// slot k of the root stack instead of the frame, so that the collector finds and updates it.
// A function's root slots sit just below the root stack's top, s0: [s0-8n] .. [s0-8].
export function allocateRegisters(p) {
  return SProgram(p.funcs.map((f) => {
    const color = colorGraph(f);
    // (CJI-3, lane 6: the graph and the numbering are not read again: dropped from the function now,
    // before its instructions are copied with their homes, the back half's largest moment)
    f.graph = undefined;
    f.locs = undefined;
    const K = REGISTERS.length;
    const isPointer = (v) => isPointerType(f.types?.get(v));
    let slots = 0, roots = 0;
    for (const [v, c] of color) {
      if (REGISTERS.includes(v) || c < K) continue;
      if (isPointer(v)) roots = Math.max(roots, c - K + 1);
      else slots = Math.max(slots, c - K + 1);
    }
    const home = new Map();
    const regs = REGISTERS.map((r) => Reg(r)), rootsReg = Reg(ROOTS);   // (CJI-3, lane 6: one operand a register)
    for (const [v, c] of color) {
      if (REGISTERS.includes(v)) continue;
      if (c < K) home.set(v, regs[c]);
      else if (isPointer(v)) home.set(v, Mem(rootsReg, 8 * (c - K) - 8 * roots));
      else home.set(v, Mem(SP, 8 * (f.outArgs ?? 0) + 8 * (c - K)));   // above the outgoing area
    }
    // Every operand, including a memory operand's base, moves to its variable's home.
    const put = (o) => {
      if (o.kind === 'SVar') return home.get(o.name);
      if (o.kind === 'Mem') return Mem(put(o.base), o.offset);
      return o;
    };
    // (CJI-3, lane 6: each block's old instructions are let go as its new ones are made, so that both
    // copies of the function are never whole at once: 1.2 MB of stage 1's heap for agent's largest)
    const old = f.blocks;
    const blocks = old.map((b, k) => {
      const nb = SBlock(b.label, b.instrs.map((i) => ({ ...i, args: i.args.map(put) })));
      old[k] = undefined;
      return nb;
    });
    const out = withInfo(SFunc(f.name, f.nparams, blocks), f);
    out.homes = home;
    out.frameBytes = 8 * ((f.outArgs ?? 0) + slots);
    out.rootSlots = roots;
    return out;
  }));
}
