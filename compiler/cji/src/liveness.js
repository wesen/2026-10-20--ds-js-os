// uncover_live and build_interference (chapter 3).
//
// A location is a variable or a register. A location is *live* at a point if its current
// value may still be read later. Two locations *interfere* if one is written while the other
// is live, because then they cannot share a register. These two passes compute that
// information and attach it to each function; they do not change any instruction.

import { SProgram, SCRATCH, ROOTS, PATCH } from './slir.js';
import { REGISTERS } from './allocate.js';
import { isPointerType } from './types.js';
import { STRING_ALLOC } from './strings.js';
import { analyzeDataflow } from './dataflow.js';
import { $nat_bits_new, $nat_bits_add, $nat_bits_remove, $nat_bits_has, $nat_bits_or, $nat_bits_and, $nat_bits_equal,
  $nat_bits_next, $nat_bits_add_all, $nat_bits_remove_all, $nat_ints_new, $nat_ints_get, $nat_ints_set, $nat_graph_new,
  $nat_graph_add_live, $nat_graph_add_cross, $nat_graph_row } from './bitsets.js';

// A location is a variable or a register the allocator may use. sp, and from chapter 6 the
// root stack register s0 and patch_instructions' r6, are never allocated, so they are not
// locations.
const RESERVED = new Set(['sp', ROOTS, PATCH]);
const isLoc = (o) => o.kind === 'SVar' || (o.kind === 'Reg' && !RESERVED.has(o.name));
const locs = (o) => (isLoc(o) ? [o.name] : []);
// A memory operand reads its base, whether the instruction reads or writes the memory.
const baseLocs = (o) => (o.kind === 'Mem' ? [...locs(o.base), ...baseLocs(o.base)] : []);

const DEST_FIRST = /^(mov|add|sub|mul|xor|shl|shr|and|or|sar|lea|f?set(eq|ne|lt|le|gt|ge)|fadd|fsub|fmul|fdiv|fneg|i2f)$/;
const ARGS = (n) => SCRATCH.slice(0, n).filter((r) => !RESERVED.has(r));
const CLOBBERED = () => SCRATCH.filter((r) => !RESERVED.has(r));

// The locations an instruction reads and writes.
export function readsWrites(i) {
  const bases = i.args.flatMap(baseLocs);
  if (DEST_FIRST.test(i.op))
    return { reads: [...i.args.slice(1).flatMap(locs), ...bases], writes: locs(i.args[0]) };
  switch (i.op) {
    case 'jump':
      return { reads: [], writes: [] };
    case 'icall':
    case 'call':
      // arguments in r0..; the callee may overwrite every scratch register
      return { reads: ARGS(i.nargs), writes: CLOBBERED() };
    case 'callr':
      return { reads: [...locs(i.args[0]), ...bases, ...ARGS(i.nargs)], writes: CLOBBERED() };
    case 'tailcall':
      return { reads: ARGS(i.nargs), writes: [] };
    case 'tailcallr':
      return { reads: [...locs(i.args[0]), ...bases, ...ARGS(i.nargs)], writes: [] };
    case 'funref':
    case 'closure':
    case 'strref':     // chapter 13
    case 'shaperef':
      return { reads: bases, writes: locs(i.args[0]) };
    case 'return':
      return { reads: [...locs(i.args[0]), ...bases], writes: [] };
    default:
      if (/^f?b(eq|ne|lt|le|gt|ge)$/.test(i.op))
        return { reads: [...locs(i.args[0]), ...locs(i.args[1]), ...bases], writes: [] };
      throw new Error(`readsWrites: unknown instruction ${i.op}`);
  }
}

// Calls during which the collector may run: collect itself, and (chapter 7) any call to one
// of the program's functions, which may allocate.
// Chapter 13: and every runtime function that allocates (a string, a joined array).
export const mayCollect = (i) => (i.op === 'icall' && (i.fn === 'collect' || STRING_ALLOC.has(i.fn))) || i.op === 'call' || i.op === 'callr';

// Live-before = (live-after minus what the instruction writes) plus what it reads.
// A jump's "after" is the start of its target block, so for `jump L` and `bcc a, b, L` the
// locations live at the start of L (liveIn(L)) are live before the jump too.
export function liveBefore(i, after, liveIn = () => new Set()) {
  const { reads, writes } = readsWrites(i);
  const before = new Set([...after].filter((x) => !writes.includes(x)));
  if (i.target !== undefined) for (const x of liveIn(i.target)) before.add(x);
  for (const r of reads) before.add(r);
  return before;
}

// The blocks a function's blocks jump to.
export const successors = (b) => b.instrs.filter((i) => i.target !== undefined).map((i) => i.target);

// Blocks in the order a depth-first walk from the first block finishes them: a block comes
// after the blocks it jumps to, except where a jump goes back to a block the walk is still
// inside (a loop). Without loops this is a reverse topological order.
export function postorder(f) {
  const byLabel = new Map(f.blocks.map((b) => [b.label, b]));
  const order = [], seen = new Set();
  const visit = (l) => {
    if (seen.has(l)) return;
    seen.add(l);
    for (const s of successors(byLabel.get(l))) visit(s);
    order.push(byLabel.get(l));
  };
  visit(f.blocks[0].label);
  return order;
}

// ---- chapter 31: liveness and interference on numbered locations ----------------------------
// Chapters 3 to 22 kept a Set of location names for every instruction and a Map of Sets for the
// graph. For agent.js's largest function (7,974 instructions, 4,877 variables, 535 live at a
// time on average) that took 311 MB for liveness and 690 MB for the graph. Here every location
// of a function gets a number (the registers first, then the variables in the order instructions
// first mention them), a set of locations is a bitset of W words, the dataflow's values are one
// bitset per block, and the graph is a bit matrix. The sets after each instruction are not kept:
// build_interference scans each block backwards again, as uncover_live did, and liveAfter rebuilds
// a block's sets only when something asks for them (the IR printer).
//
// (CJI-3, lane 6: the sets, the reads and writes and the graph are src/bitsets.js's native values,
// which a compiler compiled by cji keeps packed, 32 bits in 4 bytes, and the graph only where it has
// edges: in cji a Uint32Array is 8 bytes an element, and these took 8.5 MB of stage 1's heap for
// agent's largest function, the larger part of its compile's peak.)

// A function's locations: names[k] is location k's name; index maps a name back; rw holds, for each
// block, its instructions' reads and writes as location numbers, packed (an ints vector, data) from
// the last instruction to the first, each as [number of writes, the writes, target, number of reads,
// the reads], target the jump's target's number in labels, or -1; n is the number of instructions.
function numberLocations(f) {
  const names = [...REGISTERS], index = new Map(names.map((n, k) => [n, k]));
  const id = (n) => {
    let k = index.get(n);
    if (k === undefined) { k = names.length; names.push(n); index.set(n, k); }
    return k;
  };
  const labels = f.blocks.map((b) => b.label), labelIndex = new Map(labels.map((l, k) => [l, k]));
  const rw = new Map();
  for (const b of f.blocks) {
    const entries = b.instrs.map((i) => {   // (numbered in order: the numbering is the first mention's)
      for (const o of i.args) if (o.kind === 'SVar') id(o.name);
      const { reads, writes } = readsWrites(i);
      return { reads: reads.map(id), writes: writes.map(id), target: i.target === undefined ? -1 : labelIndex.get(i.target) };
    });
    let size = 0;
    for (const e of entries) size += 3 + e.reads.length + e.writes.length;
    const data = $nat_ints_new(size);
    let p = 0;
    for (let k = entries.length - 1; k >= 0; k--) {
      const e = entries[k];
      $nat_ints_set(data, p++, e.writes.length);
      for (const x of e.writes) $nat_ints_set(data, p++, x);
      $nat_ints_set(data, p++, e.target);
      $nat_ints_set(data, p++, e.reads.length);
      for (const x of e.reads) $nat_ints_set(data, p++, x);
    }
    rw.set(b.label, { data, n: entries.length });
  }
  return { names, index, rw, labels, W: (names.length + 31) >>> 5 };
}

// calls f(k) for each location k in the set
function eachBit(set, f) {
  for (let x = $nat_bits_next(set, 0); x >= 0; x = $nat_bits_next(set, x + 1)) f(x);
}

// One block, backwards from its end: before each instruction, live holds what is live after it
// (visit(k, live, p): k the instruction, p where its entry starts in rws.data); returns what is live
// at the block's start. Live-before = (live-after minus what the instruction writes) plus what it
// reads, plus, for a jump, what is live at its target.
function scanBits(rws, locs, liveIn, visit) {
  const live = $nat_bits_new(locs.W), { data, n } = rws;
  let p = 0;
  for (let k = n - 1; k >= 0; k--) {
    if (visit) visit(k, live, p);
    p = $nat_bits_remove_all(live, data, p);
    const t = $nat_ints_get(data, p);
    if (t >= 0) $nat_bits_or(live, liveIn(locs.labels[t]));
    p = $nat_bits_add_all(live, data, p + 1);
  }
  return live;
}

// uncover_live: the locations live at each block's start (and, through liveAfter, after each
// instruction). A loop makes the blocks' sets depend on each other, so they start empty and are
// recomputed until none changes.
export function uncoverLive(p) {
  return SProgram(p.funcs.map((f) => {
    const locs = numberLocations(f);
    const { rw, W } = locs;
    const byLabel = new Map(f.blocks.map((b) => [b.label, b]));
    const { value: liveIn, rounds } = analyzeDataflow(postorder(f).map((b) => b.label), {
      dependsOn: (l) => successors(byLabel.get(l)),
      transfer: (l, valueOf) => scanBits(rw.get(l), locs, valueOf),
      bottom: () => $nat_bits_new(W),
      equal: (a, b) => $nat_bits_equal(a, b) === 1,
    });
    // (for the printer: each instruction's set, by name, made when asked for)
    const liveAfter = {
      get: (label) => {
        const after = [];
        scanBits(rw.get(label), locs, (l) => liveIn.get(l), (k, live) => {
          const s = new Set();
          eachBit(live, (x) => s.add(locs.names[x]));
          after[k] = s;
        });
        return after;
      },
    };
    return { ...f, locs, liveIn, liveAfter, livenessRounds: rounds };   // (keeps types, usesHeap)
  }));
}

// An undirected graph over a function's numbered locations (g, a native graph). nodes() and
// neighbors() give names, for the printer; row(u, out) puts u's neighbours in the set out.
export class Graph {
  constructor(locs) {
    this.locs = locs;
    this.n = locs.names.length;
    this.W = locs.W;
    this.g = $nat_graph_new(this.n);
  }
  row(u, out) { $nat_graph_row(this.g, u, out); }
  nodes() { return [...this.locs.names]; }
  neighbors(name) {
    const out = new Set(), u = this.locs.index.get(name);
    if (u !== undefined) {
      const row = $nat_bits_new(this.W);
      this.row(u, row);
      eachBit(row, (x) => out.add(this.locs.names[x]));
    }
    return out;
  }
}

// build_interference: the book's rules.
//  - mov d, s: d interferes with every location live after the move except d and s
//    (after the move they hold the same value, so they may share a register);
//  - any other instruction: each location it writes interferes with every other location
//    live after it. A call writes every scratch register, so a variable live across a call
//    interferes with all of them and must go to a saved register or the stack.
export function buildInterference(p) {
  return SProgram(p.funcs.map((f) => {
    const { locs, liveIn } = f;
    // (CJI-3, lane 6: the graph keeps only the numbering; the reads and writes and liveIn end here)
    const g = new Graph({ names: locs.names, index: locs.index, W: locs.W }), gn = g.g, W = locs.W;
    const regs = $nat_bits_new(W), pointers = $nat_bits_new(W), livePointers = $nat_bits_new(W);
    for (const r of REGISTERS) $nat_bits_add(regs, locs.index.get(r));
    locs.names.forEach((n, k) => { if (isPointerType(f.types?.get(n))) $nat_bits_add(pointers, k); });
    for (const b of f.blocks) {
      const rws = locs.rw.get(b.label), data = rws.data;
      scanBits(rws, locs, (l) => liveIn.get(l), (k, live, at) => {
        const i = b.instrs[k];
        if (i.op === 'mov' && isLoc(i.args[0]) && isLoc(i.args[1])) {
          // (s taken out of live for the call, and put back: the edges d-v for v in live but d and s)
          const d = locs.index.get(i.args[0].name), s = locs.index.get(i.args[1].name);
          const had = $nat_bits_has(live, s);
          if (had === 1) $nat_bits_remove(live, s);
          $nat_graph_add_live(gn, d, live);
          if (had === 1) $nat_bits_add(live, s);
        } else {
          const nw = $nat_ints_get(data, at);
          for (let j = 1; j <= nw; j++) $nat_graph_add_live(gn, $nat_ints_get(data, at + j), live);
        }
        // A collection moves objects, and only the root stack is updated: a pointer that
        // must survive one cannot be in any register, saved ones included.
        if (mayCollect(i)) {
          $nat_bits_and(livePointers, live, pointers);
          $nat_graph_add_cross(gn, livePointers, regs);
        }
      });
    }
    const { liveAfter, liveIn: _, ...rest } = f;   // (liveness is not needed after this: its sets go)
    return { ...rest, locs: g.locs, graph: g };
  }));
}
