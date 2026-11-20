// The compiler's passes in order, as functions only (CJI-3, step 5). src/compiler.js adds each
// stage's interpreter and grammar check for the test harness; src/build.js runs this list alone,
// without the interpreters, which is what a compiler compiled by cji carries.

import { uniquify } from './uniquify.js';
import { typeCheck } from './typecheck.js';
import { instantiateLibrary, instantiateLibraryTaking } from './library.js';
import { lowerAsync } from './async.js';
import { lowerRest } from './spread.js';
import { pruneFunctions } from './prune.js';
import { canonicalNames } from './canon.js';
import { inferTypes } from './infer.js';
import { shrink } from './shrink.js';
import { convertAssignments } from './convert-assignments.js';
import { convertToClosures } from './convert-closures.js';
import { uncoverGet } from './uncover-get.js';
import { checkBounds } from './check-bounds.js';
import { exposeAllocation } from './expose-allocation.js';
import { removeComplexOperands } from './rco.js';
import { explicateControl } from './explicate.js';
import { removeJumps } from './remove-jumps.js';
import { selectInstructions } from './select.js';
import { uncoverLive, buildInterference } from './liveness.js';
import { allocateRegisters } from './allocate.js';
import { patchInstructions } from './patch.js';
import { layoutBlocks } from './layout.js';
import { preludeAndConclusion } from './prelude.js';
import { castInsert } from './cast-insert.js';
import { SProgram, printSlir } from './slir.js';
import { ProgramDefs } from './ast.js';
import { serialize, deserialize, memoryStore } from './spill.js';
import { selectContext, selectDef } from './select.js';
import { gensymCounter, setGensymCounter } from './utils.js';
import { usesRootStack, needsRootsAnswer, preludeOne } from './prelude.js';
import { canonParts, canonNamesOf, sharedBodies, stubOf, HOLE, HOLES } from './canon.js';

export const PIPELINE = [
  ['uniquify', uniquify],
  ['lower_rest', lowerRest],
  ['lower_async', lowerAsync],
  ['infer_types', inferTypes],
  ['instantiate_library', instantiateLibrary],
  ['type_check', typeCheck],
  ['cast_insert', castInsert],
  ['shrink', shrink],
  ['convert_assignments', convertAssignments],
  ['convert_to_closures', convertToClosures],
  ['uncover_get', uncoverGet],
  ['check_bounds', checkBounds],
  ['expose_allocation', exposeAllocation],
  ['remove_complex_operands', removeComplexOperands],
  ['explicate_control', explicateControl],
  ['remove_jumps', removeJumps],
  ['select_instructions', selectInstructions],
  ['prune_functions', pruneFunctions],
  ['uncover_live', uncoverLive],
  ['build_interference', buildInterference],
  ['allocate_registers', allocateRegisters],
  ['patch_instructions', patchInstructions],
  ['layout_blocks', layoutBlocks],
  ['prelude_and_conclusion', preludeAndConclusion],
  ['canonical_names', canonicalNames],
];

// CJI-3 step 2: the compiler for building, not testing. The test harness runs the passes one after
// another over the whole program, so that each stage's interpreter can run the program after it.
// A build needs only the result, and the back half (uncover_live to layout_blocks) works on one
// function at a time: so each function goes through those passes alone, and its IR before them is
// dropped as soon as it has. The program-wide steps stay program-wide: prune_functions before (which
// functions main reaches), prelude_and_conclusion's one question about the whole program (does any
// function use the root stack) and canonical_names (names from callees' names) after. The result is
// the same program the passes make one after another, which run-tests.js checks for every test.
export const BACK_HALF = ['uncover_live', 'build_interference', 'allocate_registers', 'patch_instructions', 'layout_blocks'];
const RUN = Object.fromEntries(PIPELINE);
export function compileForBuild(ir, { onPass, onFunction } = {}) {
  let k = 0;
  for (; PIPELINE[k][0] !== BACK_HALF[0]; k++) {   // the front end, and select_instructions and prune
    const t = Date.now();
    ir = PIPELINE[k][1](ir);
    if (onPass) onPass(PIPELINE[k][0], Date.now() - t);
  }
  const funcs = ir.funcs, done = new Array(funcs.length), ms = Object.fromEntries(BACK_HALF.map((n) => [n, 0]));
  ir = null;
  for (let i = 0; i < funcs.length; i++) {
    let one = SProgram([funcs[i]]);
    funcs[i] = null;   // (the function's IR before the back half is not needed again)
    for (const name of BACK_HALF) {
      const t = Date.now();
      one = RUN[name](one);
      ms[name] += Date.now() - t;
    }
    done[i] = one.funcs[0];
    if (onFunction) onFunction(i, done[i]);
  }
  if (onPass) for (const name of BACK_HALF) onPass(name, ms[name]);
  let out = SProgram(done);
  for (const name of ['prelude_and_conclusion', 'canonical_names']) {
    const t = Date.now();
    out = RUN[name](out);
    if (onPass) onPass(name, Date.now() - t);
  }
  return out;
}

// CJI-3: the same build, finished to SLIR text one function at a time. Each function, once through the
// back half, gets its prelude and conclusion and is printed at once, with the functions it names left as
// holes, and its IR is dropped; what canonical_names needs of it (canonParts) is kept as text too. Only
// main and the entries wait for the one program-wide answer, whether any function uses the root stack.
// At the end the names are computed and the holes filled. The text is the one compileForBuild's program
// prints, which run-tests.js checks for every test.
//
// Instruction selection streams too. The functions main reaches (prune_functions) are found by selecting
// every function once and keeping only what it names; then each function main reaches is selected again,
// from the name counter it started at the first time, so that it is the same code, and goes straight on
// through the back half. The C-level program is then the largest thing alive, and shrinks as it goes.
export function compileToText(ir, options) {
  return compileBoxToText({ ir }, options);
}
// (CJI-3, lane 5: the program comes in a box, which is emptied, so that the caller does not hold the
// source program through the whole compile. A pass in TAKES is given the box too, and empties it, so
// that this function does not hold the pass's input while it runs: the input is dropped as soon as
// the pass no longer needs it. An argument would stay alive in the caller's frame until the call
// returns.)
const TAKES = new Map([['instantiate_library', instantiateLibraryTaking]]);
// (lane 5: memo false: instantiate_library keeps no memo of the ranges' work, which lives in the store; see
// library.js)
export function compileBoxToText(box, { onPass, onFunction, store = memoryStore(), write = null, memo = true } = {}) {
  let k = 0;
  const holder = { ir: box.ir };
  box.ir = null;
  for (; PIPELINE[k][0] !== MIDDLE[0]; k++) {
    const t = Date.now();
    const take = TAKES.get(PIPELINE[k][0]);
    if (take) holder.ir = take(holder, store, memo);
    else holder.ir = PIPELINE[k][1](holder.ir);
    if (onPass) onPass(PIPELINE[k][0], Date.now() - t);
  }
  let ir = holder.ir;
  holder.ir = null;
  // (CJI-3: from check_bounds on, every pass works on one function at a time. The whole build numbers the
  // fresh names a pass makes function after function, so that a function's names start where the previous
  // function's ended in the same pass. A first round takes each function alone through the middle passes
  // and selection, counting the names each pass makes for it and keeping only what the rest needs: the
  // functions it names, whether it allocates. The second round takes each function main reaches through
  // them again, from the counter the whole build would have had, and on through the back half. Between
  // turns a function is text in the store (spill.js): the program after uncover_get, each function's
  // printed SLIR with holes for names, and what canonical_names hashes. Each turn runs in its own call,
  // so that nothing of a function outlives it.)
  let t = Date.now();
  const nd = ir.defs.length, names0 = ir.defs.map((d) => d.name);
  const funTypes = new Map(ir.defs.map((d) => [d.name, d.name === 'main' ? '()=>Int' : d.params.map((q) => q.type)[0]]));
  const spilled = ir.defs.map((d) => store.put(serialize(d)));
  ir = null;
  const counts = [...MIDDLE, 'select_instructions'].map(() => new Array(nd).fill(0)), named = new Map();
  let usesHeap = false;
  const throughMiddle = (i, starts) => {
    let one = ProgramDefs([deserialize(store.get(spilled[i]))]);
    MIDDLE.forEach((name, m) => {
      if (starts) setGensymCounter(starts[m][i]);
      const c0 = gensymCounter();
      one = RUN[name](one);
      if (!starts) counts[m][i] = gensymCounter() - c0;
    });
    return one.defs[0];
  };
  const firstTurn = (i) => {
    const c = throughMiddle(i, null);
    usesHeap = usesHeap || c.blocks.some((b) => b.stmts.some((s) => s.kind === 'Assign' && s.exp.kind === 'Allocate'));
    const c0 = gensymCounter();
    const f = selectDef(c, { funTypes, usesHeap: true }), rs = [];   // (counts and names only: no flag is read)
    counts[MIDDLE.length][i] = gensymCounter() - c0;
    for (const b of f.blocks) for (const ins of b.instrs) if (REFS_PRINTED.has(ins.op) && ins.fn) rs.push(ins.fn);
    named.set(names0[i], rs);
  };
  const base = gensymCounter();
  for (let i = 0; i < nd; i++) firstTurn(i);
  // where each pass's names start for each function in the whole build: pass after pass, function after function
  const starts = counts.map(() => new Array(nd));
  let at = base;
  counts.forEach((cs, m) => cs.forEach((c, i) => { starts[m][i] = at; at += c; }));
  const after = at, ctx = { funTypes, usesHeap };
  if (onPass) for (const name of [...MIDDLE, 'select_instructions']) onPass(name, name === 'select_instructions' ? Date.now() - t : 0);
  t = Date.now();
  const keep = new Set(), work = ['main'];   // (prune_functions' walk, chapter 25)
  while (work.length) {
    const name = work.pop();
    if (keep.has(name) || !named.has(name)) continue;
    keep.add(name);
    work.push(...named.get(name));
  }
  if (onPass) onPass('prune_functions', Date.now() - t);
  const kept = [];
  for (let i = 0; i < nd; i++) if (keep.has(names0[i])) kept.push(i); else store.drop(spilled[i]);
  const n = kept.length, ms = Object.fromEntries(BACK_HALF.map((x) => [x, 0]));
  const order = kept.map((i) => names0[i]), printed = new Array(n), hashed = new Map(), refs = new Map(), waiting = [];
  const closures = new Map(), arity = new Map();
  let roots = false;
  // (lane 5: what the end needs of a finished function, its hashed text and printed text in the store,
  // its references and which of them are `closure`s, and its arity; finish records them for function i)
  const parts = (f) => {
    const p = canonParts(f);
    let r = 0;
    const holed = { ...f, name: '\u0001F\u0001', blocks: f.blocks.map((b) => ({ ...b, instrs: b.instrs.map((ins) => (REFS_PRINTED.has(ins.op) ? { ...ins, fn: HOLE(r++) } : ins)) })) };
    return { hashed: store.put(p.text), refs: p.refs, closures: p.closures, nparams: f.nparams, printed: store.put(printSlir(SProgram([holed]))) };
  };
  const finish = (i, name, x) => {
    hashed.set(name, x.hashed);
    refs.set(name, x.refs);
    if (x.closures.length) closures.set(name, x.closures);
    arity.set(name, x.nparams);
    printed[i] = x.printed;
  };
  const secondTurn = (i) => {
    const j = kept[i];
    let c = throughMiddle(j, starts);
    store.drop(spilled[j]);
    setGensymCounter(starts[MIDDLE.length][j]);
    let one = SProgram([selectDef(c, ctx)]);
    c = null;   // (lane 5: a local stays alive in its frame until it is overwritten, used or not)
    for (const name of BACK_HALF) {
      const t = Date.now();
      one = RUN[name](one);
      ms[name] += Date.now() - t;
    }
    const f = one.funcs[0];
    roots = roots || usesRootStack(f);
    // (lane 5: main and the entries are finished both ways now, with and without starting the root stack,
    // and the answer picks one at the end: a function waiting as IR held main's whole back half until then)
    if (needsRootsAnswer(f)) waiting.push([i, f.name, parts(preludeOne(f, false)), parts(preludeOne(f, true))]);
    else finish(i, f.name, parts(preludeOne(f, false)));
  };
  for (let i = 0; i < n; i++) {
    secondTurn(i);
    if (onFunction) onFunction(i);
  }
  setGensymCounter(after);
  if (onPass) for (const name of BACK_HALF) onPass(name, ms[name]);
  t = Date.now();
  for (const [i, name, without, withRoots] of waiting) {
    finish(i, name, roots ? withRoots : without);
    const other = roots ? without : withRoots;
    store.drop(other.hashed);
    store.drop(other.printed);
  }
  waiting.length = 0;
  if (onPass) onPass('prelude_and_conclusion', Date.now() - t);
  t = Date.now();
  const names = canonNamesOf(order, (name) => refs.get(name), (name) => store.get(hashed.get(name)));
  // (lane 5: one body per canonical name, canon.js's sharedBodies: a copy is not emitted, or is a stub when its
  // static closure is taken, and a reference names the representative, or for a `closure` the function itself)
  const { rep, closed } = sharedBodies(order, (name) => refs.get(name), (name) => closures.get(name) ?? NO_CLOSURES, names);
  // the text, function by function, its holes filled; to `write` as it goes when given, else joined
  const out = write ? null : [];
  for (let i = 0; i < n; i++) {
    const name = order[i];
    let text = '';
    if (rep.get(name) !== name) {
      if (closed.has(name)) text = printSlir(SProgram([stubOf(names.get(name), names.get(rep.get(name)), arity.get(name))]));
    } else {
      const rs = refs.get(name), cs = closures.get(name) ?? NO_CLOSURES, own = names.get(name);   // (CJI-3: the arrow below may not capture i)
      const named = (k) => (names.has(rs[k]) ? names.get(cs.includes(k) ? rs[k] : rep.get(rs[k])) : rs[k]);
      // (functions as replacements: a name may hold `$$`, which a replacement string would read as `$`)
      text = store.get(printed[i]).replace('\u0001F\u0001', () => own).replace(HOLES, (_, k) => named(+k));
    }
    if (text && write) write(text); else if (text) out.push(text);
  }
  if (onPass) onPass('canonical_names', Date.now() - t);
  return write ? '' : out.join('');
}
const REFS_PRINTED = new Set(['call', 'tailcall', 'closure', 'funref']);
const NO_CLOSURES = [];
export const MIDDLE = ['check_bounds', 'expose_allocation', 'remove_complex_operands', 'explicate_control', 'remove_jumps'];
