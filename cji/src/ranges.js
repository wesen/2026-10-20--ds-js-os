// Chapter 12: which numbers are exact integers, by abstract interpretation over intervals.
//
// Chapter 11 gives every integer literal the type Int, and every +, - and * of two Ints the
// type Int. That is a promise the compiler cannot keep by itself: 94906267 * 94906267 is
// past 2^53, where JavaScript rounds and a 64-bit integer does not; 0 * -5 is -0, which no
// integer is; n % 0 is NaN. Part I declared such programs outside the subset. This module
// finds, for each number the program computes, an interval that contains every value it
// can take, and from it which Ints are sure to be exact. The others become doubles
// (infer.js applies the verdicts and infers again).
//
// The abstract value of a number is an Itv: an interval [lo, hi] of doubles and three flags,
// frac (may not be an integer), mz (may be -0) and nan (may be NaN), the design of SPJ's
// range.c. A value is an exact integer when it is integral, never -0 or NaN, and strictly
// inside +-2^53.
//
// Within a function the analysis is flow sensitive over the structured program: a state
// maps each local variable to its Itv, branches split the state and refine it by their
// condition (in `while (i < n)`, i < n holds in the body), merges join, and loops iterate
// to a fixpoint, widening a bound that keeps moving to the next threshold. Across
// functions it is flow insensitive: one summary per parameter (the join of every argument),
// per function result, per variable that another function reads or writes, and per array
// element type (the element cells of chapter 11). The whole program is analysed in rounds
// until no summary changes.

const Var = (name) => ({ kind: 'Var', name });

export const LIM = 2 ** 53;

// (CJI-3, lane 6: inside the analysis an Itv is a number. Its bounds and flags are kept once, in three
// arrays, and an interval met again, with the same bounds (by Object.is: -0 is not 0) and the same flags,
// is the same number. In stage 1 an Itv as a record was read through the runtime's dynamic field lookup at
// every bound, and made anew by every join: seven million on agenda, of which 1659 differ. join gives back
// a side that already is the join, so most joins make nothing. The analysis's results leave as Itv objects
// again (itvObject), in their Maps' order; a sidecar's and a loop head's come in as numbers (itvNumber).
// Nothing outside this module sees a number, and the episode texts write the same fields. The numbers
// last one call of analyzeRanges: the tables are emptied when it returns, so that they hold no memory
// between calls; nothing kept from one call to the next holds a number, the episodes being text.)
let ILO = [NaN], IHI = [NaN], IFL = [0];   // per number: lo, hi, and the flags frac 1, mz 2, nan 4 (0 is no Itv: every Itv is truthy, as an object was)
const FRAC = 1, MZ = 2, NAN = 4;
let boundNumbers = new Map(), itvNumbers = new Map();   // bound -> its number (-0: 1); key -> Itv
function boundNumber(x) {
  if (Object.is(x, -0)) return 1;   // (a Map's keys take -0 as 0)
  let k = boundNumbers.get(x);
  if (k === undefined) {
    k = boundNumbers.size + 2;
    if (k >= 16777216) throw new Error('ranges: too many bounds');
    boundNumbers.set(x, k);
  }
  return k;
}
// the Itv with these bounds and flags
function mk(lo, hi, f) {
  const key = (boundNumber(lo) * 16777216 + boundNumber(hi)) * 8 + f;
  let a = itvNumbers.get(key);
  if (a === undefined) {
    a = ILO.length;
    ILO.push(lo);
    IHI.push(hi);
    IFL.push(f);
    itvNumbers.set(key, a);
  }
  return a;
}
const flags = (frac, mz, nan) => (frac ? FRAC : 0) | (mz ? MZ : 0) | (nan ? NAN : 0);
const itvNumber = (v) => mk(v.lo, v.hi, flags(v.frac, v.mz, v.nan));
const itvObject = (a) => ({ lo: ILO[a], hi: IHI[a], frac: (IFL[a] & FRAC) !== 0, mz: (IFL[a] & MZ) !== 0, nan: (IFL[a] & NAN) !== 0 });
const isFrac = (a) => (IFL[a] & FRAC) !== 0;
const isMz = (a) => (IFL[a] & MZ) !== 0;
const isNan = (a) => (IFL[a] & NAN) !== 0;
const range = (lo, hi, frac = false, mz = false, nan = false) => mk(lo, hi, flags(frac, mz, nan));

// (the constants are made first, and again after every emptying, so that they are always the numbers 1 to 6)
const constants = () => [range(-(2 ** 31), 2 ** 31 - 1), range(Infinity, -Infinity), range(-Infinity, Infinity, true, true, true),
  range(0, 1), range(0, 2 ** 32 - 1), range(Infinity, -Infinity, false, false, true)];
const [I32, EMPTY, TOP, BOOLEAN, LENGTH, EMPTY_NAN] = constants();
function emptyTables() {
  ILO = [NaN]; IHI = [NaN]; IFL = [0];
  boundNumbers = new Map(); itvNumbers = new Map();
  const c = constants();
  if (c[0] !== I32 || c[5] !== EMPTY_NAN) throw new Error('ranges: the constants moved');
}

const hasRange = (a) => ILO[a] <= IHI[a];
const empty = (a) => !(ILO[a] <= IHI[a]) && (IFL[a] & NAN) === 0;
// (an Itv object, as infer.js reads the analysis's results)
export const isEmpty = (v) => !(v.lo <= v.hi) && !v.nan;
export const exact = (v) => !isEmpty(v) && !v.frac && !v.mz && !v.nan && v.lo > -LIM && v.hi < LIM;

function point(x) {
  if (Number.isNaN(x)) return EMPTY_NAN;
  return mk(x, x, flags(!(Number.isFinite(x) && Math.floor(x) === x), Object.is(x, -0), false));
}

function join(a, b) {
  if (empty(a)) return b;
  if (empty(b)) return a;
  const lo = Math.min(ILO[a], ILO[b]), hi = Math.max(IHI[a], IHI[b]), f = IFL[a] | IFL[b];
  if (f === IFL[a] && Object.is(lo, ILO[a]) && Object.is(hi, IHI[a])) return a;   // (a side that is the join)
  if (f === IFL[b] && Object.is(lo, ILO[b]) && Object.is(hi, IHI[b])) return b;
  return mk(lo, hi, f);
}
const same = (a, b) => a === b || (empty(a) && empty(b)) || (ILO[a] === ILO[b] && IHI[a] === IHI[b] && IFL[a] === IFL[b]);

// The bounds of the result of op on two intervals, by applying op to the corners: +, -
// and * are monotone in each operand on each sign, so the extremes are at corners.
// (lane 6: into cornerLo and cornerHi, the least and the greatest corner that is not NaN, as Math.min and
// Math.max of them; -Infinity and Infinity when all are NaN)
let cornerLo = 0, cornerHi = 0;
function corners(a, b, f) {
  const xs = [f(ILO[a], ILO[b]), f(ILO[a], IHI[b]), f(IHI[a], ILO[b]), f(IHI[a], IHI[b])];
  let lo = Infinity, hi = -Infinity, any = false;
  for (const x of xs) if (!Number.isNaN(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); any = true; }
  cornerLo = any ? lo : -Infinity;
  cornerHi = any ? hi : Infinity;
}
const has = (a, x) => hasRange(a) && ILO[a] <= x && x <= IHI[a];
const mayBeNegative = (a) => hasRange(a) && ILO[a] < 0;
const mayBeZero = (a) => has(a, 0) || isMz(a);

// The transfer functions: what each operator does to intervals.
function arith(op, a, b) {
  if (empty(a) || (b !== undefined && empty(b))) return EMPTY;   // not reached yet
  switch (op) {
    case 'neg':
      return range(-IHI[a], -ILO[a], isFrac(a), has(a, 0), isNan(a));    // -0 from 0, and 0 from -0
    case '+': case '-': {
      corners(a, b, op === '+' ? (x, y) => x + y : (x, y) => x - y);
      const infs = (op === '+' && ((ILO[a] === -Infinity && IHI[b] === Infinity) || (IHI[a] === Infinity && ILO[b] === -Infinity)))
        || (op === '-' && ((ILO[a] === -Infinity && ILO[b] === -Infinity) || (IHI[a] === Infinity && IHI[b] === Infinity)));
      // -0 + -0 is -0, and -0 - 0 is -0; every other sum of zeros is +0
      const mz = op === '+' ? isMz(a) && isMz(b) : isMz(a) && mayBeZero(b);
      return range(cornerLo, cornerHi, isFrac(a) || isFrac(b), mz, isNan(a) || isNan(b) || infs);
    }
    case '*': {
      corners(a, b, (x, y) => x * y);
      const infZero = (has(a, 0) && (ILO[b] === -Infinity || IHI[b] === Infinity)) || (has(b, 0) && (ILO[a] === -Infinity || IHI[a] === Infinity));
      // 0 times a negative number, or -0 times a positive one, is -0
      const mz = (mayBeZero(a) && (mayBeNegative(b) || isMz(b))) || (mayBeZero(b) && (mayBeNegative(a) || isMz(a))) || (isMz(a) || isMz(b));
      return range(cornerLo, cornerHi, isFrac(a) || isFrac(b), mz, isNan(a) || isNan(b) || infZero);
    }
    case '%': {
      // |a % b| < |b| and the sign is a's; NaN when b may be 0 or a may be infinite; -0
      // when a may be negative (or -0) and the remainder may be 0
      const m = Math.max(Math.abs(ILO[b]), Math.abs(IHI[b]));
      const bound = isFrac(a) || isFrac(b) ? m : Math.max(m - 1, 0);
      const lo = ILO[a] >= 0 ? 0 : Math.max(ILO[a], -bound), hi = IHI[a] <= 0 ? 0 : Math.min(IHI[a], bound);
      const nan = isNan(a) || isNan(b) || mayBeZero(b) || ILO[a] === -Infinity || IHI[a] === Infinity;
      return range(lo, hi, isFrac(a) || isFrac(b), mayBeNegative(a) || isMz(a), nan);
    }
    case '/': case '**':
      return TOP;   // a double; chapter 12 does not need its range
    default:
      return TOP;
  }
}

// Bitwise operators give 32-bit integers; a few keep a tighter range.
function bitwise(op, a, b) {
  if (empty(a) || (b !== undefined && empty(b))) return EMPTY;
  const int32 = (v) => !isFrac(v) && !isMz(v) && !isNan(v) && ILO[v] >= ILO[I32] && IHI[v] <= IHI[I32];
  switch (op) {
    case '&':
      if (int32(b) && ILO[b] >= 0) return range(0, IHI[b]);
      if (int32(a) && ILO[a] >= 0) return range(0, IHI[a]);
      return I32;
    case '|': case '^':
      if (op === '|' && ILO[b] === 0 && IHI[b] === 0 && int32(a)) return range(ILO[a], IHI[a]);   // x | 0 of an int32
      if (int32(a) && int32(b) && ILO[a] >= 0 && ILO[b] >= 0) {
        const m = Math.max(IHI[a], IHI[b]);
        return range(0, 2 ** Math.ceil(Math.log2(m + 1)) - 1);
      }
      return I32;
    case '>>':
      if (int32(a) && ILO[b] === IHI[b] && int32(b)) return range(ILO[a] >> (ILO[b] & 31), IHI[a] >> (ILO[b] & 31));
      return I32;
    case '>>>':
      if (int32(a) && ILO[a] >= 0 && ILO[b] === IHI[b] && int32(b)) return range(ILO[a] >>> (ILO[b] & 31), IHI[a] >>> (ILO[b] & 31));
      return range(0, 2 ** 32 - 1);
    default:
      return I32;
  }
}

// Widening: a bound that moved jumps to the next threshold (the program's own integer
// literals among them), so that loops reach a fixpoint in a few rounds.
function widen(old, nw, thresholds) {
  const r = join(old, nw);
  if (empty(old) || !hasRange(old)) return r;
  let lo = ILO[r], hi = IHI[r];
  if (lo < ILO[old]) lo = thresholds.filter((t) => t <= lo).at(-1) ?? -Infinity;
  if (hi > IHI[old]) hi = thresholds.find((t) => t >= hi) ?? Infinity;
  return Object.is(lo, ILO[r]) && Object.is(hi, IHI[r]) ? r : mk(lo, hi, IFL[r]);   // (a threshold 0 for a bound -0 is a change)
}

// ---- the analysis ----------------------------------------------------------------------

// (CJI-3) Two intervals alike in every bound and flag (same() takes every empty one as alike).
// (lane 6: an Itv's number says it all: equal numbers are the same bounds by Object.is and the same flags)
const identical = (a, b) => a === b;
let unlike = 0;   // a function's text that holds anything else is unlike every other
const episodeId = (ids, s) => { if (!ids.has(s)) ids.set(s, ids.size + 1); return ids.get(s); };
// (CJI-3, lane 5: a text's digest, FNV-1a over its characters, with its length)
function digest(text) {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193);
  return `${h >>> 0}:${text.length}`;
}
// An episode's contents as text and back: JSON, with each interval as [lo, hi, flags], a bound JSON
// cannot write (an infinity, -0) as a string, and the flags frac, mz, nan as bits 1, 2, 4.
const bound = (x) => (Number.isFinite(x) && !Object.is(x, -0) ? x : Object.is(x, -0) ? '-0' : String(x));
// (lane 6: an Itv's number in and out of the text: the same text as from an Itv object, whose flag bits
// are the number's flags)
const itvOut = (a) => [bound(ILO[a]), bound(IHI[a]), IFL[a]];
const itvIn = (x) => mk(Number(x[0]), Number(x[1]), x[2] & 7);
const pairsOut = (xs) => xs.map((x, k) => (k % 2 === 1 ? itvOut(x) : x));
const pairsIn = (xs) => xs.map((x, k) => (k % 2 === 1 ? itvIn(x) : x));
function pack(ep) {
  return JSON.stringify([ep.questions.map((x, k) => (k % 4 === 2 && x === undefined ? null : x)), pairsOut(ep.touched), pairsOut(ep.fed),
    ep.records.map((x, k) => (k % 3 === 0 ? x : k % 3 === 1 ? x.map(itvOut) : itvOut(x))), pairsOut(ep.hulls)]);
}
function unpack(text) {
  const [questions, touched, fed, records, hulls] = JSON.parse(text);
  return { questions: questions.map((x, k) => (k % 4 === 2 && x === null ? undefined : x)), touched: pairsIn(touched), fed: pairsIn(fed),
    records: records.map((x, k) => (k % 3 === 0 ? x : k % 3 === 1 ? x.map(itvIn) : itvIn(x))), hulls: pairsIn(hulls) };
}

const ARITH = new Set(['neg', '+', '-', '*', '%', '/', '**']);
const BITWISE = new Set(['&', '|', '^', '~', '<<', '>>', '>>>']);
const COMPARISONS = new Set(['<', '<=', '>', '>=', '===', '!==', '==', '!=']);
const EQUALITIES = new Set(['===', '!==', '==', '!=']);
const BOOL_METHODS = new Set(['includes', 'startsWith', 'endsWith']);
//
// ctx gives what the type inference knows:
//   arrayKey(e)   a key for the element cell of the array e evaluates to, or null
//   calleeSig(e)  { params: [key], ret: key } for a call's callee, or null
//   isNumberType(name)  whether a variable holds numbers (Int or Number)
// (CJI-3: episodes, when given, is a memo kept from one call to the next; see the rounds.)
// (CJI-3 lane 4: seed, when given, is a sidecar's summaries (sidecar.js): the analysis checks
// them instead of finding them; see the end. heads: the sidecar's loop invariants, While node ->
// [[name, Itv]], see While; headsOut: a Map to which the loops' heads are written, for a sidecar.)
// (CJI-3, lane 5: the memo's texts and episodes still in its store, dropped when instantiate_library is done
// with the memo: with a store in memory, which is the build's own, they would stay to the end of the compile)
export function dropEpisodes(episodes) {
  for (const which of [episodes.last, episodes.now]) {
    if (!which) continue;
    for (const [rec, { list }] of which) {
      episodes.store.drop(rec.id);
      for (const ep of list) episodes.store.drop(ep.id);
    }
  }
  episodes.last = null;
  episodes.now = null;
}

export function analyzeRanges(p, ctx0, episodes = null, seed = null, { heads: givenHeads = null, headsOut = null } = {}) {
  // (CJI-3: what inference answers does not change while the ranges are analysed, and the
  // rounds ask the same questions again and again: each answer is kept for its node.)
  const memo = (f) => { const m = new Map(); return (e) => { if (!m.has(e)) m.set(e, f(e)); return m.get(e); }; };
  const fieldMemo = new Map();   // (CJI-3: Maps: the subset has no WeakMap)
  const answers = {
    arrayKey: memo((e) => ctx0.arrayKey(e)),
    calleeSig: memo((e) => ctx0.calleeSig(e)),
    calleeOfMethod: memo((e) => ctx0.calleeOfMethod(e)),
    sigKeys: memo((f) => ctx0.sigKeys(f)),
    fieldKey: (o, name) => {
      let m = fieldMemo.get(o);
      if (!m) fieldMemo.set(o, (m = new Map()));
      if (!m.has(name)) m.set(name, ctx0.fieldKey(o, name));
      return m.get(name);
    },
  };
  // (CJI-3: with a memo, the questions a function's analysis asks are kept with its episode;
  // see the rounds at the end.)
  let asked = null;   // while a function is analysed: { seen: node -> Set, list: [question, node, argument, answer, ...] }
  const ctx = !episodes ? answers : Object.fromEntries(Object.entries(answers).map(([q, f]) => [q, (e, x) => {
    const v = f(e, x);
    if (asked) {
      let qs = asked.seen.get(e);
      if (!qs) asked.seen.set(e, (qs = new Set()));
      const k = x === undefined ? q : `${q} ${x}`;
      if (!qs.has(k)) { qs.add(k); asked.list.push(q, e, x, v); }
    }
    return v;
  }]));
  const summaries = new Map();   // key -> Itv: parameters, results, shared variables, elements
  const records = new Map();     // Prim node -> { args: [Itv], res: Itv }, joined over every evaluation
  const hulls = new Map();       // variable name -> every value it is given
  let changed = false, widening = false;

  // The program's integer literals, and their neighbours, are widening thresholds.
  const standard = [-Infinity, -(LIM - 1), -(2 ** 32), -(2 ** 31), -1, 0, 1, 2 ** 31 - 1, 2 ** 32 - 1, LIM - 1, Infinity];
  const lits = new Set(standard);
  (function collect(x) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(collect); return; }
    if (x.kind === 'Int') { lits.add(x.value); lits.add(x.value - 1); lits.add(x.value + 1); }
    Object.values(x).forEach(collect);
  })(p.body);
  const thresholds = [...lits].sort((a, b) => a - b);

  // Which variables are local to their function (analysed flow sensitively), and which
  // another function reads or writes (one summary for the whole program).
  const home = new Map(), shared = new Set();
  (function scan(x, fn) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach((y) => scan(y, fn)); return; }
    if (x.kind === 'Let' || x.kind === 'Const') home.set(x.name, fn);
    if (x.kind === 'FunDef' || x.kind === 'Lambda') {
      x.params.forEach((q) => home.set(q.name, x));
      x.body.forEach((s) => scan(s, x));
      return;
    }
    if ((x.kind === 'Var' || x.kind === 'Set') && home.has(x.name) && home.get(x.name) !== fn) shared.add(x.name);
    for (const v of Object.values(x)) if (typeof v === 'object') scan(v, fn);
  })(p.body, null);
  // a second scan: a use before the declaration was scanned (a function declared above
  // the variable it captures)
  (function scan2(x, fn) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach((y) => scan2(y, fn)); return; }
    if (x.kind === 'FunDef' || x.kind === 'Lambda') { x.body.forEach((s) => scan2(s, x)); return; }
    if ((x.kind === 'Var' || x.kind === 'Set') && home.has(x.name) && home.get(x.name) !== fn) shared.add(x.name);
    for (const v of Object.values(x)) if (typeof v === 'object') scan2(v, fn);
  })(p.body, null);

  // (CJI-3: while a top-level statement is analysed, `log` records every summary it touches,
  // with the value it had at the first touch, and what the statement adds to records and
  // hulls, joined per node and per name; see the rounds at the end.)
  let log = null;
  const summary = (key) => {
    const v = summaries.get(key) ?? EMPTY;
    if (log && !log.touched.has(key)) log.touched.set(key, v);
    return v;
  };
  function feed(key, v) {
    if (key === null || key === undefined) return;
    const old = summary(key);
    if (asked) log.fed.add(key);
    // (chapter 20: as for loops, a summary still moving after a dozen rounds is widened with the
    // standard thresholds only: the inspect library's literals made the regex tests step through
    // hundreds of them)
    const n = widening ? widen(old, v, rounds > 12 ? standard : thresholds) : join(old, v);
    if (!same(old, n)) { summaries.set(key, n); changed = true; }
  }
  function hull(name, v) {
    const h = log ? log.hulls : hulls;   // (a log's are added after the rounds)
    h.set(name, join(h.get(name) ?? EMPTY, v));
  }

  // States: name -> Itv for the current function's local variables; null when the point is
  // unreachable. (CJI-3: a state was a Map, copied whole at every condition: two to five
  // copies per `if`, each as long as the function's list of locals, which made this analysis
  // most of agent's front end. A state is now a handle on a persistent trie: a copy is a new
  // handle on the same trie, a write copies only the path to its key, and joining or comparing
  // two states that share subtrees skips what they share. Each handle is still a mutable
  // object: a state pushed onto a catcher's list and written to afterwards is seen written to,
  // as a Map was.)
  //
  // A state only ever holds names of one function (or of the top level), so each function has
  // its own numbering: the names its body mentions outside nested functions, and its
  // parameters. Most functions have fewer than 32, and their tries are a single node.
  const tables = new Map();   // FunDef or Lambda node (null: the top level) -> { index, depth }
  function tableOf(fn) {
    let t = tables.get(fn);
    if (t) return t;
    const index = new Map();
    const add = (name) => { if (!index.has(name)) index.set(name, index.size); };
    if (fn) fn.params.forEach((q) => add(q.name));
    (function names(x) {
      if (x === null || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(names); return; }
      if (x.kind === 'FunDef' || x.kind === 'Lambda') return;   // (their own tables)
      if (x.kind === 'Let' || x.kind === 'Const' || x.kind === 'Var' || x.kind === 'Set') add(x.name);
      for (const v of Object.values(x)) if (typeof v === 'object') names(v);
    })(fn ? fn.body : p.body.filter((x) => x.kind !== 'FunDef'));
    let depth = 1;
    while (32 ** depth < index.size) depth++;
    t = { index, depth };
    tables.set(fn, t);
    return t;
  }
  // A trie node is an array of 32 children (undefined: nothing below); at the last level its
  // children are the Itvs. A key's number picks a child at each level, 5 bits at a time.
  const trieGet = (node, k, depth) => {
    for (let level = depth - 1; node !== undefined && level >= 0; level--) node = node[(k >>> (5 * level)) & 31];
    return node;
  };
  const trieSet = (node, k, v, level) => {
    const copy = node === undefined ? new Array(32) : node.slice();
    const i = (k >>> (5 * level)) & 31;
    copy[i] = level === 0 ? v : trieSet(node?.[i], k, v, level - 1);
    return copy;
  };
  // (lane 6: a state is a plain record { root, table } and these functions: in stage 1 a class instance
  // carried its three methods as closures made for every state, 1.9 million on agenda)
  const State = (root, table) => ({ root, table });
  const stGet = (s, name) => {
    const k = s.table.index.get(name);
    return k === undefined ? undefined : trieGet(s.root, k, s.table.depth);
  };
  const stHas = (s, name) => stGet(s, name) !== undefined;
  const stSet = (s, name, v) => {
    const k = s.table.index.get(name);
    if (k === undefined) throw new Error(`ranges: ${name} has no slot in its function's state`);
    s.root = trieSet(s.root, k, v, s.table.depth - 1);
  };
  const copyState = (s) => State(s.root, s.table);
  // Two tries, child by child: both(x, y) at the leaves present in both, onlyX(x) where only
  // the first has one (the leaf itself when onlyX is null), the second's where only it has one.
  // A subtree the two share is the result's as it stands: both(x, x) is x again for join and
  // for widen (the same bounds, or x itself when it is empty).
  const mapTrie = (x, f, level) => {
    if (x === undefined) return x;
    const r = new Array(32);
    for (let i = 0; i < 32; i++) {   // (CJI-3, lane 6: each child read once: in stage 1 a read is a dynamic index)
      const xi = x[i];
      r[i] = level === 0 ? (xi === undefined ? undefined : f(xi)) : mapTrie(xi, f, level - 1);
    }
    return r;
  };
  const merge = (x, y, both, onlyX, level) => {
    if (x === y) return x;
    if (y === undefined) return onlyX ? mapTrie(x, onlyX, level) : x;
    if (x === undefined) return y;
    const r = new Array(32);
    for (let i = 0; i < 32; i++) {   // (lane 6: each child read once)
      const xi = x[i], yi = y[i];
      r[i] = level === 0
        ? (xi === undefined ? yi : yi === undefined ? (onlyX ? onlyX(xi) : xi) : both(xi, yi))
        : merge(xi, yi, both, onlyX, level - 1);
    }
    return r;
  };
  const sameTrie = (x, y, level) => {
    if (x === y) return true;
    if (x === undefined || y === undefined) return false;
    for (let i = 0; i < 32; i++) {   // (lane 6: each child read once)
      const xi = x[i], yi = y[i];
      if (level === 0 ? (xi === undefined) !== (yi === undefined) || (xi !== undefined && !same(xi, yi)) : !sameTrie(xi, yi, level - 1))
        return false;
    }
    return true;
  };
  const tableCheck = (a, b) => {
    if (a.table !== b.table) throw new Error('ranges: states of two functions met');
    return a.table.depth - 1;
  };
  const joinStates = (a, b) => {
    if (a === null) return b;
    if (b === null) return a;
    return State(merge(a.root, b.root, join, null, tableCheck(a, b)), a.table);
  };
  const sameStates = (a, b) => {
    if (a === null || b === null) return a === b;
    return sameTrie(a.root, b.root, tableCheck(a, b));
  };
  // A loop that still moves after a few widenings (one that steps through many of the
  // program's literals) is widened with the standard thresholds only.
  const widenStates = (a, b, round) => {
    if (a === null) return b;
    if (b === null) return a;
    const ts = round > 8 ? standard : thresholds;
    return State(merge(a.root, b.root, (x, y) => widen(x, y, ts), (x) => widen(x, EMPTY, ts), tableCheck(a, b)), a.table);
  };

  let st = null;         // the current state
  let ret = null;        // the current function's result key
  // Chapter 14: for each enclosing try of the current function, the states from which an
  // exception may leave for its handler (or finalizer). An exception can happen inside any
  // statement, so the state after every statement counts, and the state on entry.
  let catchers = [];
  let loops = new Map(); // loop label -> { brk: [state], cont: [state] }

  // A local variable's value is in the state; a shared one's in its summary. A name with
  // no declaration (a function's) is not a number.
  function read(name) {
    if (shared.has(name)) return summary(`var:${name}`);
    if (!home.has(name)) return TOP;
    return (st ? stGet(st, name) : undefined) ?? EMPTY;   // (lane 6: ??, not ||: the number 0 is an Itv)
  }
  function write(name, v) {
    hull(name, v);
    if (shared.has(name)) { feed(`var:${name}`, v); return; }
    if (st) stSet(st, name, v);
  }

  // (lane 6: the results as infer.js and the sidecar read them: Maps in the same order, of Itv objects)
  // (one object per number, shared, as infer.js and the sidecar only read them; then the tables are emptied)
  function results() {
    const objects = new Map();
    const obj = (a) => {
      let o = objects.get(a);
      if (o === undefined) { o = itvObject(a); objects.set(a, o); }
      return o;
    };
    const rs = new Map(), hs = new Map(), ss = new Map();
    for (const [e, r] of records) rs.set(e, { args: r.args.map(obj), res: obj(r.res) });
    for (const [name, v] of hulls) hs.set(name, obj(v));
    for (const [key, v] of summaries) ss.set(key, obj(v));
    emptyTables();
    return { records: rs, hulls: hs, summaries: ss };
  }

  function record(e, args, res) {
    const rs = log ? log.records : records;   // (a log's are added after the rounds)
    const r = rs.get(e);
    rs.set(e, r ? { args: r.args.map((a, k) => join(a, args[k])), res: join(r.res, res) } : { args, res });
  }

  function ev(e) {
    switch (e.kind) {
      case 'Int': case 'Num': return point(e.value);
      case 'Str': return TOP;   // chapter 13: not a number
      case 'Caught': return TOP;   // chapter 14
      case 'LibCall': e.args.forEach(ev); return TOP;   // chapter 15
      case 'Hoisted': return EMPTY;                     // chapter 16
      case 'Record':
        for (const f of e.fields) feed(ctx.fieldKey(e, f.name), ev(f.exp));
        return TOP;
      case 'Get': {
        const key = ctx.fieldKey(e.obj, e.name);
        ev(e.obj);
        return key ? summary(key) : TOP;
      }
      case 'SetProp': {
        const key = ctx.fieldKey(e.obj, e.name);
        ev(e.obj);
        const v = ev(e.exp);
        feed(key, v);
        return v;
      }
      case 'MethodCall': {
        ev(e.obj);
        const args = e.args.map(ev);
        const sig = ctx.calleeOfMethod(e);
        if (sig) {
          sig.params.forEach((key, k) => feed(key, k < args.length ? args[k] : TOP));
          return summary(sig.ret);
        }
        if (e.name === 'indexOf' || e.name === 'lastIndexOf') return range(-1, 2 ** 32 - 2);
        if (e.name === 'charCodeAt') return range(0, 65535, false, false, true);
        if (BOOL_METHODS.has(e.name)) return BOOLEAN;
        return TOP;
      }
      case 'Bool': return BOOLEAN;
      case 'AnyLit': return TOP;
      case 'Var': return read(e.name);
      case 'Set': {
        const v = ev(e.exp);
        write(e.name, v);
        return v;
      }
      case 'Prim': return prim(e);
      case 'If': {
        const [t, f] = split(e.cond, st);
        const saved = st;
        st = t;
        const a = ev(e.thn);
        const st1 = st;
        st = f;
        const b = ev(e.els);
        st = joinStates(st1, st);
        if (saved === null) st = null;
        return join(a, b);
      }
      case 'Index': {
        ev(e.idx);
        const key = ctx.arrayKey(e.arr);
        ev(e.arr);
        return key ? summary(key) : TOP;
      }
      case 'SetIndex': {
        ev(e.arr);
        ev(e.idx);
        const v = ev(e.exp);
        feed(ctx.arrayKey(e.arr), v);
        return v;
      }
      case 'ArrayLit': {
        const key = ctx.arrayKey(e);
        for (const x of e.elems) feed(key, ev(x));
        return TOP;
      }
      case 'Call': {
        const sig = ctx.calleeSig(e.fn);
        ev(e.fn);
        const args = e.args.map(ev);
        if (!sig) return TOP;
        sig.params.forEach((key, k) => feed(key, k < args.length ? args[k] : TOP));
        return summary(sig.ret);
      }
      case 'Lambda':
        func(e);
        return TOP;
      default:
        throw new Error(`ranges: unexpected ${e.kind}`);
    }
  }

  function prim(e) {
    const op = e.op;
    if (op === '&&' || op === '||' || op === '??') {
      // the value is an operand; the right one is evaluated only sometimes
      const a = ev(e.args[0]);
      const [t, f] = op === '??' ? [st, st] : split(e.args[0], st);
      const saved = st;
      st = op === '&&' ? t : f;
      const b = ev(e.args[1]);
      st = joinStates(saved === null ? null : (op === '&&' ? f : t), st);
      return join(a, b);
    }
    const args = e.args.map(ev);
    if (ARITH.has(op)) {
      const r = arith(op, args[0], args[1]);
      record(e, args, r);
      return r;
    }
    if (BITWISE.has(op)) return bitwise(op, args[0], args[1]);
    if (op === 'length') return LENGTH;
    if (op.startsWith('Math.')) return math(op.slice(5), args);
    return BOOLEAN;   // comparisons, !, typeof tests
  }

  function math(f, [a, b]) {
    if (f.startsWith('$')) return TOP;   // chapter 21: the host's clock and time zone
    if (empty(a)) return EMPTY;
    switch (f) {
      case 'floor': case 'ceil': case 'round': case 'trunc':
        // (lane 6: the -0 flag was computed, then set to a's when a is not fractional, where the
        // computed one already is a's)
        return range(Math.floor(ILO[a]), Math.ceil(IHI[a]), false, isMz(a) || (isFrac(a) && ILO[a] < 1), isNan(a));
      case 'abs': return range(hasRange(a) && ILO[a] >= 0 ? ILO[a] : 0, Math.max(Math.abs(ILO[a]), Math.abs(IHI[a])), isFrac(a), false, isNan(a));
      case 'min': case 'max': {
        if (empty(b)) return EMPTY;
        const g = (x, y) => (f === 'min' ? Math.min(x, y) : Math.max(x, y));
        return range(g(ILO[a], ILO[b]), g(IHI[a], IHI[b]), isFrac(a) || isFrac(b), isMz(a) || isMz(b), isNan(a) || isNan(b));
      }
      case 'sign': return range(-1, 1, false, true, isNan(a));
      case 'clz32': return range(0, 32);
      case 'imul': return I32;
      default: return TOP;
    }
  }

  // The states on which a condition is true and false. Comparisons of a local variable
  // with anything narrow the variable; ! swaps; && and || combine.
  function split(c, state) {
    if (state === null) return [null, null];
    const saved = st;
    st = copyState(state);   // the condition may assign (while ((i = i + 1) < 6)): not in place
    let result;
    if (c.kind === 'Prim' && c.op === '!') {
      const [t, f] = split(c.args[0], state);
      result = [f, t];
    } else if (c.kind === 'Prim' && (c.op === '&&' || c.op === '||')) {
      const [t1, f1] = split(c.args[0], state);
      if (c.op === '&&') {
        const [t2, f2] = split(c.args[1], t1);
        result = [t2, joinStates(f1, f2)];
      } else {
        const [t2, f2] = split(c.args[1], f1);
        result = [joinStates(t1, t2), f2];
      }
    } else if (c.kind === 'Prim' && COMPARISONS.has(c.op)) {
      const [x, y] = c.args;
      const a = ev(x), b = ev(y);
      const t = copyState(st), f = copyState(st);
      refine(t, x, c.op, b, a);
      refine(f, x, negate(c.op), b, a);
      refine(t, y, swap(c.op), a, b);
      refine(f, y, swap(negate(c.op)), a, b);
      result = [t, f];
    } else if (c.kind === 'Var' && !shared.has(c.name) && stHas(st, c.name)) {
      // a number as a condition: true unless 0 (or NaN)
      const v = stGet(st, c.name);
      const t = copyState(st), f = copyState(st);
      stSet(t, c.name, without(v, 0));
      stSet(f, c.name, join(has(v, 0) || isMz(v) ? point(0) : EMPTY, isNan(v) ? EMPTY_NAN : EMPTY));
      result = [t, f];
    } else {
      ev(c);
      result = [st, st];
    }
    st = saved;
    return [result[0] && copyState(result[0]), result[1] && copyState(result[1])];
  }
  // (CJI-3, lane 6: switches, where an object literal was made at every call to be indexed once)
  const negate = (op) => {
    switch (op) {
      case '<': return '>='; case '<=': return '>'; case '>': return '<='; case '>=': return '<';
      case '===': return '!=='; case '!==': return '==='; case '==': return '!='; case '!=': return '==';
      default: return undefined;
    }
  };
  const swap = (op) => {
    switch (op) {
      case '<': return '>'; case '<=': return '>='; case '>': return '<'; case '>=': return '<=';
      case '===': case '!==': case '==': case '!=': return op;
      default: return undefined;
    }
  };
  function without(v, x) {
    if (isFrac(v) || !hasRange(v)) return v;
    if (ILO[v] === x && IHI[v] === x) return EMPTY;
    if (ILO[v] === x) return mk(x + 1, IHI[v], IFL[v] & ~MZ);
    if (IHI[v] === x) return mk(ILO[v], x - 1, x === 0 ? IFL[v] & ~MZ : IFL[v]);
    return v;
  }

  // In state s, the expression e is known to satisfy e op b. A local variable narrows; so
  // does one inside an assignment, whose value is the variable's new value, and one plus or
  // minus a constant: (n = n - 1) + 1 > 0, which is what n-- > 0 became in the parser,
  // narrows n to n >= 0.
  function refine(s, e, op, b, a) {
    if (!hasRange(b)) return;
    if (e.kind === 'Set') { refine(s, Var(e.name), op, b, a); return; }
    if (e.kind === 'Prim' && (e.op === '+' || e.op === '-') && e.args[1].kind === 'Int' && !EQUALITIES.has(op)) {
      const c = e.op === '+' ? e.args[1].value : -e.args[1].value;
      refine(s, e.args[0], op, mk(ILO[b] - c, IHI[b] - c, IFL[b]), a);
      return;
    }
    if (e.kind !== 'Var' || shared.has(e.name) || !stHas(s, e.name)) return;
    let v = stGet(s, e.name);
    if (empty(v)) return;
    const step = isFrac(v) || isFrac(b) ? 0 : 1;
    const kept = IFL[v] & (FRAC | MZ);   // (v's frac and mz, without nan)
    switch (op) {
      case '<': v = mk(ILO[v], Math.min(IHI[v], IHI[b] - step), kept); break;
      case '<=': v = mk(ILO[v], Math.min(IHI[v], IHI[b]), kept); break;
      case '>': v = mk(Math.max(ILO[v], ILO[b] + step), IHI[v], kept); break;
      case '>=': v = mk(Math.max(ILO[v], ILO[b]), IHI[v], kept); break;
      case '===': case '==':
        v = range(Math.max(ILO[v], ILO[b]), Math.min(IHI[v], IHI[b]), isFrac(v) && isFrac(b), isMz(v) && (isMz(b) || has(b, 0)), false);
        break;
      case '!==': case '!=':
        if (ILO[b] === IHI[b] && !isFrac(b)) v = without(v, ILO[b]);
        break;
      default: return;
    }
    if (ILO[v] > IHI[v] && !isNan(v)) v = EMPTY;   // (a copy of EMPTY was made here: as a number, EMPTY)
    stSet(s, e.name, v);
  }

  function exec(s) {
    execOne(s);
    if (catchers.length && st !== null) catchers.at(-1).push(st);
  }

  // A finalizer runs on every way out of its try: the states it leaves from.
  function through(state, finalizer) {
    st = state;
    exec(finalizer);
    return st;
  }

  function execOne(s) {
    if (st === null) return;
    switch (s.kind) {
      case 'Print': ev(s.arg); return;
      case 'Const': case 'Let': write(s.name, ev(s.init)); return;
      case 'ExprStmt': ev(s.exp); return;
      case 'Return': feed(ret, ev(s.arg)); st = null; return;
      case 'FunDef': { const saved = st; func(s); st = saved; return; }
      case 'Block': for (const x of s.body) exec(x); return;
      case 'IfStmt': {
        const [t, f] = split(s.cond, st);
        st = t;
        exec(s.thn);
        const after = st;
        st = f;
        if (s.els) exec(s.els);
        st = joinStates(after, st);
        return;
      }
      case 'While': {
        const entry = st;
        // (CJI-3 lane 4: a loop whose head a sidecar gives is checked, not iterated: its body is
        // analysed once, from the given head, and the states that come back to the head (the
        // entry, the end of the body, the continues) must be inside it. Then the head holds at
        // every turn, and what the body records from it holds too.)
        const given = givenHeads?.get(s);
        if (given !== undefined) {
          const head = copyState(entry);
          for (const [name, v] of given) {
            if (!head.table.index.has(name)) { changed = true; continue; }
            stSet(head, name, itvNumber(v));   // (lane 6: a sidecar's Itv, as a number)
          }
          const target = { brk: [], cont: [] };
          loops.set(s.label, target);
          const [inBody, out] = split(s.cond, head);
          st = inBody;
          exec(s.body);
          st = target.cont.reduce(joinStates, st);
          if (s.update) exec(s.update);
          const next = joinStates(entry, st);
          if (!sameStates(joinStates(head, next), head)) changed = true;   // (not an invariant)
          st = target.brk.reduce(joinStates, out);
          return;
        }
        let head = entry, exit = null;
        for (let round = 0; ; round++) {
          const target = { brk: [], cont: [] };
          loops.set(s.label, target);
          const [inBody, out] = split(s.cond, head);
          st = inBody;
          exec(s.body);
          st = target.cont.reduce(joinStates, st);
          if (s.update) exec(s.update);
          exit = target.brk.reduce(joinStates, out);
          const next = joinStates(entry, st);
          const widened = round >= 2 ? widenStates(head, next, round) : joinStates(head, next);
          if (sameStates(widened, head)) break;
          head = widened;
          if (round > 50) throw new Error('ranges: a loop did not stabilise');
        }
        // (lane 4: for a sidecar, the head the loop settled on, as the names where it differs
        // from the entry; the last analysis of the loop in the round is the one kept)
        if (headsOut) {
          const diff = [];
          for (const name of head.table.index.keys()) {
            const h = stGet(head, name), e = stGet(entry, name);
            if (h !== undefined && (e === undefined || !identical(h, e))) diff.push([name, itvObject(h)]);   // (lane 6: as an Itv)
          }
          headsOut.set(s, diff);
        }
        st = exit;
        return;
      }
      case 'Throw': ev(s.arg); if (catchers.length) catchers.at(-1).push(st); st = null; return;   // chapter 14
      case 'Try': {
        const marks = s.finalizer ? [...loops.values()].map((t) => [t, t.brk.length, t.cont.length]) : [];
        if (s.finalizer) catchers.push([st]);   // what reaches the finalizer by an exception
        catchers.push([st]);
        exec(s.body);
        const thrown = catchers.pop();
        if (s.handler) {
          const normal = st;
          st = thrown.reduce(joinStates);
          exec(s.handler);
          st = joinStates(normal, st);
        } else if (s.finalizer) catchers.at(-1).push(...thrown);
        if (s.finalizer) {
          const abrupt = catchers.pop().reduce(joinStates), normal = st;
          const after = through(abrupt, s.finalizer);         // then the exception goes on
          if (after !== null && catchers.length) catchers.at(-1).push(after);
          for (const [t, b, c] of marks) {                     // break and continue leave through it too
            t.brk.splice(b, Infinity, ...t.brk.slice(b).map((x) => through(x, s.finalizer)));
            t.cont.splice(c, Infinity, ...t.cont.slice(c).map((x) => through(x, s.finalizer)));
          }
          st = normal === null ? null : through(normal, s.finalizer);
        }
        return;
      }
      case 'Break': loops.get(s.label)?.brk.push(st); st = null; return;
      case 'Continue': loops.get(s.label)?.cont.push(st); st = null; return;
      default: throw new Error(`ranges: unexpected ${s.kind}`);
    }
  }

  // A function's body, from its parameters' summaries.
  function func(f) {
    const sig = ctx.sigKeys(f);
    const savedSt = st, savedRet = ret, savedLoops = loops, savedCatchers = catchers;
    st = State(undefined, tableOf(f));
    catchers = [];
    for (let k = 0; k < f.params.length; k++) {   // (CJI-3: not f.params.entries(), which the subset lacks)
      const q = f.params[k], v = summary(sig.params[k]);
      hull(q.name, v);
      if (shared.has(q.name)) feed(`var:${q.name}`, v);
      else stSet(st, q.name, v);
    }
    ret = sig.ret;
    loops = new Map();
    for (const s of f.body) exec(s);
    if (st !== null) feed(ret, TOP);   // the end of the body: undefined
    st = savedSt; ret = savedRet; loops = savedLoops; catchers = savedCatchers;
  }

  // Rounds over the whole program until no summary changes; widened after a few.
  //
  // (CJI-3: a round analyses every function again, and agent took 18 rounds, eight times over
  // in infer_types and instantiate_library. A top-level function whose analysis touches only
  // summaries that still hold the values they had when it was last analysed would do exactly
  // what it did then: it reads the same values, so it feeds the same ones, and those are
  // already in the summaries, which only grow. Such a function is not analysed again. Records
  // and hulls count only from the last round, where every function's last analysis is the one
  // a full round would have made: they are taken from the logs once, at the end, in program
  // order, as a last round adds them. The other top-level statements run every round, and are
  // logged only for that order.)
  // (CJI-3, lane 5: once its statement is done, a log is kept as flat arrays, [key, value, ...], in the
  // Maps' order: it is only read in that order after that, and Maps cost twice the memory; the logs were
  // a sixth of agent's peak.)
  const logs = new Map();   // top-level statement -> { touched: [key, Itv, ...], records: [node, record, ...], hulls: [name, Itv, ...] }
  const unchanged = (l) => {
    const t = l.touched;
    for (let k = 0; k < t.length; k += 2) if (!same(summaries.get(t[k]) ?? EMPTY, t[k + 1])) return false;
    return true;
  };
  function topLevel(s) {
    if (s.kind === 'FunDef') {
      const old = logs.get(s);
      if (old && unchanged(old)) return;
    }
    log = { touched: new Map(), records: new Map(), hulls: new Map(), fed: new Set() };
    try {
      if (episodes && s.kind === 'FunDef') analyse(s);
      else exec(s);
    } finally {
      logs.set(s, { touched: [...log.touched].flat(), records: [...log.records].flat(), hulls: [...log.hulls].flat() });
      log = null;
      asked = null;
    }
  }

  // (CJI-3: instantiate_library runs inference, and so this analysis, on the whole program
  // once per round, and a round changes little: most functions are analysed again from the
  // same values as in the round before. A memo kept across the calls (`episodes`) holds each
  // analysis of a top-level function as an episode: the questions it asked and their answers,
  // the summaries it touched and their values, the values it left in the summaries it fed,
  // and what it added to records and hulls. A function whose text is the same (with the same
  // shared and declared names), analysed at the same stage of widening, with the same
  // thresholds, which gets the same answers up to the cells' numbering (which follows the
  // order of questions, and differs from call to call) and finds the same values in the
  // summaries the episode touched, would do the same again: the episode is replayed instead.
  // Only the last call's episodes are kept.)
  //
  // (CJI-3, lane 5: the memo waits in a store (spill.js), episodes.store, as text: a function's text,
  // and each episode's contents. In memory, a text is a record { d, id }: its digest and the store's
  // number for it; an episode is its stage of widening and the store's number for its contents, read
  // back only when its stage matches. A text found by its digest is compared with the stored one, so
  // that a digest that two texts share changes nothing. With a store on storage, as the board's is,
  // the memo takes almost no memory; it was 40 % of agent's peak.)
  if (episodes) {
    episodes.last = episodes.now ?? new Map();   // text record -> { rec, list: [{ widening, late, thresholds, id }] }
    episodes.now = new Map();
    episodes.thresholds ??= new Map();
  }
  const lastByDigest = new Map(), nowByDigest = new Map();   // digest -> [text record]
  if (episodes) for (const rec of episodes.last.keys()) {
    if (!lastByDigest.has(rec.d)) lastByDigest.set(rec.d, []);
    lastByDigest.get(rec.d).push(rec);
  }
  // A text's record: one this call already has, or the last call's, for the same text; else a new one.
  function textRecord(text) {
    const d = digest(text), store = episodes.store;
    for (const rec of nowByDigest.get(d) ?? []) if (store.get(rec.id) === text) return rec;
    let found = null;
    for (const rec of lastByDigest.get(d) ?? []) if (found === null && store.get(rec.id) === text) found = rec;
    const rec = found ?? { d, id: store.put(text) };
    if (!nowByDigest.has(d)) nowByDigest.set(d, []);
    nowByDigest.get(d).push(rec);
    return rec;
  }
  const thresholdsId = episodes ? episodeId(episodes.thresholds, thresholds.join(' ')) : 0;
  // A top-level function's text, with the shared and declared names it mentions, and its
  // objects in the order of the text, so that an episode can name a node by its number. An
  // object met again is written as a reference to its number: a text says what is shared.
  const shapes = new Map();   // (CJI-3: a Map, as above) top-level FunDef -> { text, nodes }, for this call
  function shapeOf(f) {
    let sh = shapes.get(f);
    if (sh) return sh;
    const out = [], names = new Set(), nodes = [], number = new Map();
    (function walk(x) {
      if (x === null) { out.push('n'); return; }
      switch (typeof x) {
        case 'object':
          if (number.has(x)) { out.push(`@${number.get(x)}`); return; }
          // (CJI-3: an object is taken as plain: the subset has no prototypes to ask. The IR is
          // made of object literals and arrays; on every test and world, no other object reached
          // this walk, which used to write one as never alike.)
          number.set(x, nodes.length);
          nodes.push(x);
          if (Array.isArray(x)) { out.push('['); x.forEach(walk); out.push(']'); return; }
          out.push('{');
          for (const [k, v] of Object.entries(x)) { out.push(k); walk(v); if (k === 'name' && typeof v === 'string') names.add(v); }
          out.push('}');
          return;
        case 'number': out.push(Object.is(x, -0) ? '#-0' : `#${x}`); return;
        case 'string': out.push(JSON.stringify(x)); return;
        case 'boolean': case 'undefined': out.push(String(x)); return;
        default: out.push(`!${++unlike}`);
      }
    })(f);
    for (const n of names) out.push(`${n}:${shared.has(n) ? 's' : ''}${home.has(n) ? 'h' : ''}`);
    sh = { rec: textRecord(out.join(' ')), nodes };
    shapes.set(f, sh);
    return sh;
  }
  function analyse(f) {
    const { rec, nodes } = shapeOf(f);
    const late = rounds > 12;
    for (const ep of episodes.last.get(rec)?.list ?? []) {
      if (ep.widening === widening && ep.late === late && ep.thresholds === thresholdsId && replayed(f, unpack(episodes.store.get(ep.id)))) {
        keep(rec, ep);
        return;
      }
    }
    asked = { seen: new Map(), list: [] };
    exec(f);
    // (what it fed is kept as the values it left: from the same values, the same feeds leave
    // the same values, and a summary changed if and only if it differs from where it began)
    const number = new Map(nodes.map((x, k) => [x, k]));
    const questions = asked.list;
    for (let k = 0; k < questions.length; k += 4) if ((questions[k + 1] = number.get(questions[k + 1])) === undefined) return;
    const records = [];
    for (const [e, r] of log.records) {
      if (!number.has(e)) return;
      records.push(number.get(e), r.args, r.res);
    }
    const id = episodes.store.put(pack({ questions, touched: [...log.touched].flat(),
      fed: [...log.fed].flatMap((k) => [k, summaries.get(k) ?? EMPTY]), records, hulls: [...log.hulls].flat() }));
    keep(rec, { widening, late, thresholds: thresholdsId, id });
  }
  function keep(rec, ep) {
    const known = episodes.now.get(rec);
    if (known) known.list.push(ep);
    else episodes.now.set(rec, { rec, list: [ep] });
  }
  // An episode's questions asked again of f, and its summaries read again; when all agree (up
  // to a renaming of cells), what the episode left and added is left and added again.
  function replayed(f, ep) {
    const { nodes } = shapeOf(f);
    const to = new Map(), from = new Map();   // the episode's cells -> this call's, and back
    const cell = (a, b) => {
      const x = to.get(a), y = from.get(b);
      if (x === undefined && y === undefined) { to.set(a, b); from.set(b, a); return true; }
      return x === b && y === a;
    };
    const agree = (a, b) => {
      if (a === null || b === null) return a === b;
      if (typeof a === 'string') return typeof b === 'string' && cell(a, b);
      if (typeof b !== 'object' || a.params.length !== b.params.length || !cell(a.ret, b.ret)) return false;
      return a.params.every((k, i) => cell(k, b.params[i]));
    };
    const q = ep.questions;
    for (let k = 0; k < q.length; k += 4) if (!agree(q[k + 3], answers[q[k]](nodes[q[k + 1]], q[k + 2]))) return false;
    const key = (k) => (k.startsWith('var:') ? k : to.get(k));
    const t = ep.touched;
    for (let k = 0; k < t.length; k += 2) {
      const now = key(t[k]);
      if (now === undefined || !identical(summaries.get(now) ?? EMPTY, t[k + 1])) return false;
    }
    for (let k = 0; k < t.length; k += 2) summary(key(t[k]));
    for (let k = 0; k < ep.fed.length; k += 2) {
      const now = key(ep.fed[k]);
      if (!same(summaries.get(now) ?? EMPTY, ep.fed[k + 1])) { summaries.set(now, ep.fed[k + 1]); changed = true; }
    }
    for (let k = 0; k < ep.records.length; k += 3) record(nodes[ep.records[k]], ep.records[k + 1], ep.records[k + 2]);
    for (let k = 0; k < ep.hulls.length; k += 2) hull(ep.hulls[k], ep.hulls[k + 1]);
    return true;
  }
  // (CJI-3 lane 4: summaries given by a sidecar are checked in one round: every function is
  // analysed once, from them, and every value fed must already be inside its summary. If none
  // grows, they are a fixpoint of the rounds below, though perhaps not the one the rounds would
  // reach, and so above every value the program computes: what this round records, from them,
  // is sound. The round is the last round the rounds below make when the summaries are theirs:
  // records and hulls are those the rounds give. If one grows, `changed` says so, and the
  // caller does not use the result.)
  if (seed) {
    for (const [key, v] of seed) summaries.set(key, itvNumber(v));
    st = State(undefined, tableOf(null));
    ret = null;
    loops = new Map();
    for (const s of p.body) exec(s);
    const r = results();
    return { records: r.records, hulls: r.hulls, summaries: r.summaries, rounds: 1, shared, changed };
  }
  let rounds = 0;
  do {
    changed = false;
    widening = rounds >= 3;
    st = State(undefined, tableOf(null));
    ret = null;
    loops = new Map();
    for (const s of p.body) topLevel(s);
    if (++rounds > 100) throw new Error('ranges: no fixpoint after 100 rounds');
  } while (changed);
  for (const s of p.body) {
    const { records: rs, hulls: hs } = logs.get(s);
    for (let k = 0; k < rs.length; k += 2) record(rs[k], rs[k + 1].args, rs[k + 1].res);
    for (let k = 0; k < hs.length; k += 2) hull(hs[k], hs[k + 1]);
  }
  // (CJI-3, lane 5: the last call's episodes are not needed after this call, which made its own; kept,
  // they would stay alive until the next call starts, through instantiate_library's walk. What this call
  // did not keep of them is dropped from the store too.)
  if (episodes) {
    const kept = new Set();
    for (const { list } of episodes.now.values()) for (const ep of list) kept.add(ep);
    for (const [rec, { list }] of episodes.last) {
      if (!episodes.now.has(rec)) episodes.store.drop(rec.id);
      for (const ep of list) if (!kept.has(ep)) episodes.store.drop(ep.id);
    }
    episodes.last = null;
  }
  const r = results();
  return { records: r.records, hulls: r.hulls, summaries: r.summaries, rounds, shared };
}
