// infer_types (chapter 11): the types the programmer did not write.
//
// Part I asked for a type comment wherever a variable's initializer did not say it all:
// `let s /*: Number */ = 0` for a sum of halves, `function f(x /*: Int */)` for a parameter
// that is not dynamic. This pass finds those types itself and writes them where the
// comments would have gone, so type_check, cast_insert and everything after them run
// unchanged on the result.
//
// The method is abstract interpretation over a small lattice of types,
//
//         Any
//       /  |  \
//   Number Bool  T[]  (A,..)=>R
//     |
//    Int
//     |
//    Bot     (no value has reached here yet)
//
// run over the whole program until nothing changes. Every variable, parameter, function
// result and array literal's elements has a cell, and a cell's type only ever goes up the
// lattice: each value that reaches it is joined in. Calls join their arguments into the
// callee's parameter cells, so a parameter's type is the join of every argument passed to
// it, and a function's result the join of everything it returns.
//
// Arrays and functions are where a plain join is not enough. An array is mutable and may
// have many names: after `const b = a; b[0] = 1.5`, a's elements are Numbers too. So two
// array types that meet are unified: their element cells become one (union-find), and every
// alias sees every store. Two functions that meet (in the branches of a ?:, in one
// variable) are unified the same way, parameter by parameter and result with result, since
// a call through either may reach both.
//
// A value that reaches a cell of type Any "escapes": dynamic code may store anything into
// an array it holds, and call a function with anything. So an escaping array's elements
// become Any, and an escaping function's parameters and result. That is exactly chapter 9's
// rule that only Any[] and (Any,..)=>Any may become dynamic values.
//
// Types written in comments are pinned: their cells keep the written type, and type_check
// reports a value that does not fit, as before.

import { functionType, arrayOf, isArrayType, isFunctionType, elementType, functionParts, isRecordType, isErrorType, recordFields, recordType, keyOrder, literalOrder } from './types.js';
import { LIBRARY_NAMES } from './library.js';
import { STRING_METHODS } from './strings.js';
import { alwaysReturns } from './typecheck.js';
import { MATH } from './math.js';
import { analyzeRanges, exact, isEmpty } from './ranges.js';
import { sidecarSession, nextEntry, numbering, summariesText, summariesParse } from './sidecar.js';
import { CompileError } from './utils.js';

const BOT = { k: 'Bot' }, INT = { k: 'Int' }, NUM = { k: 'Number' }, BOOL = { k: 'Bool' }, ANY = { k: 'Any' };
const STR = { k: 'String' };   // chapter 13
const SCALAR = { Bot: BOT, Int: INT, Number: NUM, Bool: BOOL, Any: ANY, String: STR };
// Chapter 13: a record type is a class of records that met: a union-find node holding a
// cell per field. A field the class learns about later (o.f = v on a record whose literal
// had no f) was undefined before, so it starts as Any.
const Rec = (cls) => ({ k: 'Rec', cls });
class RecClass {
  // (chapter 14: error, for the class of Error objects)
  // (chapter 19: table, for a class of objects used as tables, which are dynamic values)
  // (chapter 22: lib, the name of the library class whose constructor made it, or null)
  constructor(fields = new Map(), error = false) { this.fields = fields; this.parent = null; this.escaped = false; this.pinned = false; this.error = error; this.table = false; this.lib = null; }
}
function findClass(c) {
  while (c.parent) c = c.parent;
  return c;
}
const Arr = (elem) => ({ k: 'Array', elem });
const Fn = (sig) => ({ k: 'Fn', sig });   // sig: { params: [Cell], ret: Cell }
const numeric = (t) => t.k === 'Int' || t.k === 'Number';

class Cell {
  constructor(t = BOT, pinned = false) { this.t = t; this.parent = null; this.pinned = pinned; }
}
function find(c) {
  while (c.parent) {
    if (c.parent.parent) c.parent = c.parent.parent;   // path halving
    c = c.parent;
  }
  return c;
}

// Chapter 12: inference and range analysis take turns. The ranges say which Ints may not be
// exact (a variable, parameter, result, array element, or one operation); those become
// Numbers, and inference runs again with them, until the ranges find nothing new.
//
// (CJI-3: episodes, when given, is instantiate_library's memo of the ranges' work, kept across
// its calls; see ranges.js.)
//
// (CJI-3 lane 4: with a sidecar (sidecar.js), the call's facts are given: the demotions the
// rounds below end with, the range analysis's summaries and loop heads, and the types. They are
// checked, in one round of each analysis, and used; if they do not hold, the call infers as
// usual.)
//
// (CJI-3, lane 5: consume, from instantiate_library, which gives a program built for this call alone and as a
// tree: the returned round writes the program statement by statement and lets each statement of the input
// go once it is written, so that the input and its written copy are not alive whole together. Not while a
// sidecar is recorded, which reads the input after the call.)
export function inferTypes(p, episodes = null, consume = false) {
  const sc = sidecarSession();
  if (sc?.mode === 'use') {
    const entry = nextEntry(sc);
    if (entry) {
      let r;
      // (a well-formed line can still name what is not there: any error in checking it is a
      // malformed entry, and inferring again gives the program's own error, if it has one)
      try { r = entry.malformed ? { why: 'a malformed entry' } : checkedInfer(p, entry); } catch (e) { r = { why: `a malformed entry (${e.message})` }; }
      sc.log.push(r.why ?? 'ok');
      if (r.program) return r.program;
      if (sc.strict) throw new CompileError(`the sidecar does not hold for this program (call ${sc.k - 1}: ${r.why})`);
    } else sc.log.push('none');
  }
  const demote = { vars: new Set(), rets: new Set(), elems: new Set(), ops: new Set(), fields: new Set() };
  // (CJI-3: a round's program is dropped before the next round makes its own; held in a block's
  // variable, it would stay alive through the next round, a whole copy of the program)
  let r = null;
  for (let round = 1; ; round++) {
    r = null;
    r = inferOnce(p, demote, episodes, null, consume && sc?.mode !== 'record');
    if (r.fresh === 0) {
      if (sc?.mode === 'record') sc.calls.push(entryOf(p, demote, sc));
      return { ...r.program, rangeVerdicts: round };
    }
    if (round > 50) throw new Error('infer_types: the ranges keep finding inexact integers');
  }
}

// (CJI-3 lane 4) A call's facts as a sidecar entry: the demotions, by name or node number, the
// summaries of the last analysis (the one that found nothing new), the heads its loops settled
// on, by the loop's node number, and the types. The heads and types come from a check round of
// the demotions and summaries, and the whole entry is then checked as a compile with the sidecar
// will check it: an entry is written only if it holds (else null, or without its types: that
// call will infer, or infer its types).
function entryOf(p, demote, sc) {
  const { id } = numbering(p.body);
  const nums = (set) => [...set].map((x) => id.get(x));
  const entry = {
    d: { vars: [...demote.vars], rets: nums(demote.rets), elems: nums(demote.elems), ops: nums(demote.ops), fields: [...demote.fields] },
    r: summariesText(demote.ranges.result.summaries),
  };
  const out = { headsOut: new Map(), typesOut: {} };
  let r;
  try { r = checkedInfer(p, entry, out); } catch (e) { r = { why: e.message }; }
  if (!r.program) { (sc.notes ??= []).push(`call ${sc.calls.length}: ${r.why}`); return null; }
  entry.h = Object.fromEntries([...out.headsOut].map(([loop, diff]) => [id.get(loop), summariesText(diff)]));
  if (out.typesOut.t) {
    entry.t = out.typesOut.t;
    const again = checkedInfer(p, entry);
    if (!again.program) { (sc.notes ??= []).push(`call ${sc.calls.length}: types: ${again.why}`); delete entry.t; }
  }
  return entry;
}
// A call with its facts given: inference once with the given demotions and types, then the range
// analysis's check round from the given summaries and loop heads. Gives { program } or { why }
// it failed. (out: record the loops' heads and the types instead of taking them from the entry.)
function checkedInfer(p, entry, out = null) {
  const { node, id } = numbering(p.body);
  const nodes = (ns) => {
    const out = new Set();
    for (const n of ns) {
      if (!Number.isInteger(n) || n < 0 || n >= node.length) return null;
      out.add(node[n]);
    }
    return out;
  };
  const d = entry.d;
  const rets = nodes(d.rets), elems = nodes(d.elems), ops = nodes(d.ops);
  if (!rets || !elems || !ops) return { why: 'a node number outside the program' };
  const demote = { vars: new Set(d.vars), rets, elems, ops, fields: new Set(d.fields) };
  let heads = null;
  if (!out && entry.h) {
    heads = new Map();
    for (const [n, text] of Object.entries(entry.h)) {
      const loop = node[+n];
      if (loop?.kind !== 'While') return { why: 'a loop head on a node that is not a loop' };
      heads.set(loop, [...summariesParse(text)]);
    }
  }
  let r;
  try {
    r = inferOnce(p, demote, null, { summaries: summariesParse(entry.r), heads, headsOut: out?.headsOut, ids: id, node,
      types: out ? null : entry.t, typesOut: out?.typesOut });
  } catch (e) {
    if (out) throw e;
    return { why: `a malformed entry (${e.message})` };   // (inferring again, the program's own error comes back)
  }
  if (r.why) return r;
  if (r.fresh !== 0) return { why: `${r.fresh} inexact Ints the sidecar leaves Ints` };
  return { program: { ...r.program, rangeVerdicts: 1 } };
}

// (CJI-3) The questions an analysis asks, in order: [name, argument, argument, answer, ...].
function recording(ask, questions) {
  const r = {};
  for (const [name, f] of Object.entries(ask)) r[name] = (x, y) => { const v = f(x, y); questions.push(name, x, y, v); return v; };
  return r;
}
function replay(ask, questions) {
  for (let k = 0; k < questions.length; k += 4) if (!sameAnswer(ask[questions[k]](questions[k + 1], questions[k + 2]), questions[k + 3])) return false;
  return true;
}
const sameAnswer = (a, b) => a === b || (a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
  && a.ret === b.ret && a.params.length === b.params.length && a.params.every((k, i) => k === b.params[i]));

function inferOnce(p, demote, episodes, check = null, consume = false) {
  let changed = false;
  // (CJI-3 lane 4: while a sidecar's types are checked, strict is set, and anything but merging
  // two cells of one type, or two classes alike, is a violation: the types were not a fixpoint)
  let strict = false, violated = null, deferred = null;
  const violate = (why) => { if (strict && !violated) violated = why; };
  const vars = new Map();        // unique name -> Cell
  const literals = new Map();    // ArrayLit node -> Cell of its elements
  const calls = new Map();       // chapter 15: MethodCall or LibCall node -> { recv, args } types
  const prints = new Map();      // chapter 20: Print node -> the type of what it prints
  const records = new Map();     // Record node -> its class (chapter 13)
  // Record literals, numbered for the ranges' verdicts on their fields (stable across rounds)
  const recordIds = demote.recordIds ??= new Map();
  (function number(x) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(number); return; }
    if (x.kind === 'Record' && !recordIds.has(x)) recordIds.set(x, (demote.nextRecord = (demote.nextRecord ?? 0) + 1));
    for (const v of Object.values(x)) if (typeof v === 'object') number(v);
  })(p.body);
  const sigs = new Map();        // FunDef or Lambda node -> its signature
  let ret = null;                // the result cell of the function being analysed

  // ---- the lattice ----

  // Whether join(a, b) stays below Any.
  const compatible = (a, b) => a.k === 'Bot' || b.k === 'Bot' || (a.k === b.k && a.k !== 'Fn')
    || (numeric(a) && numeric(b)) || (a.k === 'Fn' && b.k === 'Fn' && a.sig.params.length === b.sig.params.length);

  function join(a, b) {
    if (a.k === 'Bot') return b;
    if (b.k === 'Bot') return a;
    if (a.k === b.k && a.k !== 'Array' && a.k !== 'Fn' && a.k !== 'Rec') return a;
    if (a.k === 'Rec' && b.k === 'Rec') { unifyRec(a.cls, b.cls); return a; }   // chapter 13
    if (numeric(a) && numeric(b)) return NUM;
    if (a.k === 'Array' && b.k === 'Array') { unify(a.elem, b.elem); return a; }
    if (a.k === 'Fn' && b.k === 'Fn' && a.sig.params.length === b.sig.params.length) {
      a.sig.params.forEach((c, k) => unify(c, b.sig.params[k]));
      unify(a.sig.ret, b.sig.ret);
      return a;
    }
    escape(a);
    escape(b);
    return ANY;
  }

  // A value that becomes dynamic: its array's elements, its function's parameters and
  // result, become Any too.
  function escape(t) {
    if (t.k === 'Rec') {   // chapter 13: a record that becomes dynamic has dynamic fields
      const c = findClass(t.cls);
      if (c.escaped) return;
      c.escaped = true;
      changed = true;
      violate('a record class escapes');
      for (const cell of c.fields.values()) raise(cell, ANY);
    }
    if (t.k === 'Array') raise(t.elem, ANY);
    if (t.k === 'Fn') { t.sig.params.forEach((c) => raise(c, ANY)); raise(t.sig.ret, ANY); }
  }

  // Join t into a cell. A pinned cell keeps its written type; what does not fit it is
  // type_check's to report, except that a value reaching a pinned Any still escapes.
  function raise(cell, t) {
    const r = find(cell);
    // (CJI-3 lane 4: in the strict round, a value that would raise a cell's type waits for the end
    // of the round: the program may make the cell meet a written type later in the round, and a
    // written type keeps its type (type_check makes the value a checked cast). The cell can only
    // meet one where the program makes them meet: a site's cells are its own, see seedCell.)
    if (deferred && !r.pinned && rises(r.t, t)) { deferred.push(cell, t); return; }
    if (r.pinned) {
      if (r.t.k === 'Any') escape(t);
      else if (r.t.k === 'Array' && t.k === 'Array') unify(r.t.elem, t.elem);
      else if (r.t.k === 'Fn' && t.k === 'Fn' && r.t.sig.params.length === t.sig.params.length) join(r.t, t);
      return;
    }
    if (!compatible(r.t, t)) {
      // to Any: the cell becomes Any before what it held escapes, since that may lead
      // back here (a function that returns itself)
      if (r.t.k === 'Any') { escape(t); return; }
      const old = r.t;
      r.t = ANY;
      changed = true;
      violate('a type becomes Any');
      escape(old);
      escape(t);
      return;
    }
    const n = join(r.t, t);
    if (n.k !== r.t.k) { r.t = n; changed = true; violate('a type rises'); }
  }

  const rises = (a, b) => b.k !== 'Bot' && (a.k === 'Bot' || (compatible(a, b) ? a.k === 'Int' && b.k === 'Number' : a.k !== 'Any'));

  function unify(c1, c2) {
    const a = find(c1), b = find(c2);
    if (a === b) return;
    changed = true;
    b.parent = a;
    // (CJI-3 lane 4: the class's claims, for the range analysis's keys)
    if (b.claim !== undefined) {
      if (a.claim === undefined) a.claim = b.claim;
      else { const x = claimFind(a.claim), y = claimFind(b.claim); if (x !== y) claimParent[y] = x; }
    }
    if (b.pinned && !a.pinned) { if (a.t.k !== b.t.k) violate('a type meets a written one'); a.t = b.t; a.pinned = true; raise(a, BOT); return; }
    if (a.pinned) return;
    const t = b.t;
    b.t = BOT;
    raise(a, t);
  }

  // (chapter 19: an object of a table class is a dynamic value, Any)
  const isTable = (t) => t.k === 'Rec' && findClass(t.cls).table;
  const typeOf = (cell) => { const t = find(cell).t; return isTable(t) ? ANY : t; };
  // Chapter 19: an object indexed by a key, or whose keys are listed, added or deleted, is a
  // table: a dynamic object whose literal makes only the fields it writes, the rest being
  // added at run time in the order JavaScript adds them.
  function markTable(t) {
    if (t.k !== 'Rec') return;
    const c = findClass(t.cls);
    if (c.table) return;
    c.table = true;
    changed = true;
    violate('a record class becomes a table');
    escape(t);
  }

  // Chapter 13: two record classes that meet become one; a field only one of them has was
  // undefined in the other's records, so it becomes Any.
  function unifyRec(c1, c2) {
    const a = findClass(c1), b = findClass(c2);
    if (a === b) return;
    // chapter 14: an Error and a plain record are objects of different classes, which only
    // dynamic code can hold together
    // chapter 22: and so are instances of two library classes, or of one and a plain record
    if (a.error !== b.error || a.lib !== b.lib) {
      if (a.escaped && b.escaped) return;
      escape(Rec(a));
      escape(Rec(b));
      return;
    }
    // chapter 23: JavaScript keeps each literal's key order. If b's fields do not come in the
    // order they will have in the joined class (a's, then b's others), the two orders
    // disagree, and the class becomes a table, whose literals each keep their own order.
    const joined = [...a.fields.keys(), ...[...b.fields.keys()].filter((n) => !a.fields.has(n))];
    const at = new Map(joined.map((n, k) => [n, k]));
    const ordered = [...b.fields.keys()].every((n, k, ns) => k === 0 || at.get(ns[k - 1]) < at.get(n));
    changed = true;
    b.parent = a;
    if (b.table && !a.table) violate('a record class becomes a table');
    a.table ||= b.table;   // chapter 19
    for (const [name, cell] of b.fields) {
      if (a.fields.has(name)) unify(a.fields.get(name), cell);
      else { a.fields.set(name, cell); raise(cell, ANY); }
    }
    for (const [name, cell] of a.fields) if (!b.fields.has(name)) raise(cell, ANY);
    if (b.escaped && !a.escaped) escape(Rec(a));
    if (!ordered) markTable(Rec(a));   // (chapter 23)
    tooWide(a);
  }
  // CJI-3: a class of more fields than an object's header can describe (28) is a table: its
  // objects are dynamic. Records of many kinds that meet (the compiler's own IR nodes) get there.
  function tooWide(c) {
    if (c.fields.size > 28 && !c.table && !c.error && !c.lib) markTable(Rec(c));
  }
  // The cell of a field, made (as Any, undefined until written) if the class lacks it.
  // (CJI-3: while the ranges ask their questions, such a cell is kept aside instead, by class: the
  // types are written after the questions, as they were before them; see the end of inferOnce.)
  let aside = null;
  function field(cls, name) {
    const c = findClass(cls);
    if (!c.fields.has(name) && aside) {
      let m = aside.get(c);
      if (!m) aside.set(c, (m = new Map()));
      if (!m.has(name)) m.set(name, new Cell(ANY, c.pinned));
      return m.get(name);
    }
    if (!c.fields.has(name)) {
      const cell = new Cell(ANY, c.pinned);
      c.fields.set(name, cell);
      changed = true;
      violate('a record class gains a field');
      tooWide(c);
    }
    return c.fields.get(name);
  }

  // A written type, as a pinned cell's contents.
  function fromString(s) {
    if (SCALAR[s]) return SCALAR[s];
    if (isArrayType(s)) return Arr(new Cell(fromString(elementType(s)), true));
    if (isRecordType(s)) {
      const cls = new RecClass(new Map(recordFields(s).map(([n, t]) => [n, new Cell(fromString(t), true)])), isErrorType(s));
      cls.pinned = true;
      return Rec(cls);
    }
    if (isFunctionType(s)) {
      const { params, ret } = functionParts(s);
      return Fn({ params: params.map((q) => new Cell(fromString(q), true)), ret: new Cell(fromString(ret), true) });
    }
    return ANY;
  }

  // A cell; a Number one, pinned, where the ranges found an Int that may not be exact.
  // (CJI-3 lane 4: free, when a sidecar is written, holds the cells sites are made with that the
  // program does not pin: those the sidecar seeds. A cell's own pinned flag does not say it: a
  // cell that is the root of a written one's class is pinned too.)
  const free = check?.typesOut ? new Set() : null;
  const track = (c) => { free?.add(c); return c; };
  const fresh = (doubled) => (doubled ? new Cell(NUM, true) : track(new Cell()));
  // (CJI-3 lane 4: with a sidecar's types, a site's cell is the cell the sidecar gives it; see
  // seedOf below)
  const seeded = (doubled, id) => (doubled ? new Cell(NUM, true) : id !== undefined ? seedCell(id) : track(new Cell()));
  function cellOf(name) {
    if (!vars.has(name)) vars.set(name, seeded(demote.vars.has(name), seed?.v.get(name)));
    return vars.get(name);
  }

  function sigOf(f) {
    if (!sigs.has(f)) {
      const params = f.params.map((q) => {
        const c = q.inferred ? seeded(demote.vars.has(q.name), seed?.v.get(q.name)) : new Cell(fromString(q.type), true);
        vars.set(q.name, c);
        return c;
      });
      const r = f.inferRet || !f.retType ? seeded(demote.rets.has(f), seed?.r.get(check.ids.get(f))) : new Cell(fromString(f.retType), true);
      sigs.set(f, { params, ret: r });
    }
    return sigs.get(f);
  }

  // ---- the abstract interpreter: each expression's type under the current cells ----

  function exp(e) {
    switch (e.kind) {
      case 'Int': return INT;
      case 'Num': return NUM;
      case 'Str': return STR;
      case 'Caught': return ANY;   // chapter 14
      case 'Hoisted': return BOT;  // chapter 16: no value yet
      case 'LibCall': {             // chapter 15: as a library method's call
        const ts = e.args.map(exp);
        calls.set(e, { recv: undefined, args: ts });
        return BOT;
      }
      case 'Record': {   // chapter 13: one class per literal, until classes meet
        if (!records.has(e) && seed?.R.has(check.ids.get(e))) seedRecord(e);
        if (!records.has(e)) {
          records.set(e, new RecClass(new Map(e.fields.map((f) => [f.name, fresh(demote.fields.has(`${recordIds.get(e)}.${f.name}`))])), !!e.error));
          records.get(e).lib = e.lib ?? null;   // chapter 22: a library class's instance
          // chapter 23: records with the same keys share one key order (chapter 19), the first
          // literal's; a literal that writes them in another order is a table's, and keeps its own
          const names = e.fields.map((f) => f.name);
          if (!e.error && !e.lib && keyOrder(names).join() !== literalOrder(names).join()) records.get(e).table = true;
          if (!e.error && !e.lib && names.length > 28) records.get(e).table = true;   // (CJI-3: too wide)
        }
        const cls = records.get(e);
        if (findClass(cls).table) { for (const f of e.fields) escape(exp(f.exp)); return ANY; }   // chapter 19
        for (const f of e.fields) raise(field(cls, f.name), exp(f.exp));
        return Rec(cls);
      }
      case 'Get': {
        const o = exp(e.obj);
        if (o.k === 'Rec') return typeOf(field(o.cls, e.name));
        return o.k === 'Bot' ? BOT : ANY;
      }
      case 'SetProp': {
        const o = exp(e.obj), v = exp(e.exp);
        if (e.name === 'length' && (o.k === 'Array' || o.k === 'Any')) return v;   // chapter 15: a.length = n
        if (o.k === 'Rec') raise(field(o.cls, e.name), v);
        else if (o.k === 'Any') escape(v);
        return v;
      }
      case 'MethodCall': return method(e);
      case 'Bool': return BOOL;
      case 'AnyLit': return ANY;
      case 'Var': return typeOf(cellOf(e.name));
      case 'Prim': {
        if (e.op === 'length') {   // chapter 22: a library class's length (a typed array's) is a field
          const t = exp(e.args[0]);
          if (t.k === 'Rec' && findClass(t.cls).lib) { calls.set(e, { recv: t, args: [] }); return INT; }
        }
        if (e.op === 'any_keys') {   // chapter 19: an Any[], the same cell every round
          e.args.map(exp).forEach(markTable);
          if (!literals.has(e)) literals.set(e, new Cell(ANY, true));
          return Arr(literals.get(e));
        }
        const t = prim(e.op, e.args.map(exp));
        return t.k === 'Int' && demote.ops.has(e) ? NUM : t;   // chapter 12: an inexact operation
      }
      case 'If': {
        exp(e.cond);
        return join(exp(e.thn), exp(e.els));
      }
      case 'Set': {
        const t = exp(e.exp);
        raise(cellOf(e.name), t);
        return typeOf(cellOf(e.name));
      }
      case 'Index': {
        const i = exp(e.idx);
        const a = exp(e.arr);
        if (a.k === 'String') return STR;   // chapter 13: s[i]
        if (a.k === 'Rec' && findClass(a.cls).lib) { calls.set(e, { recv: a, args: [i] }); return BOT; }   // chapter 22: a method
        if (a.k === 'Rec') { markTable(a); escape(i); return ANY; }   // chapter 19: an object indexed by a key is a table
        if (a.k === 'Any' && i.k !== 'Bot' && !numeric(i)) escape(i);
        return a.k === 'Array' ? typeOf(a.elem) : a.k === 'Bot' ? BOT : ANY;
      }
      case 'SetIndex': {
        const i = exp(e.idx);
        const a = exp(e.arr), v = exp(e.exp);
        if (a.k === 'Rec' && findClass(a.cls).lib) { calls.set(e, { recv: a, args: [i, v] }); return v; }   // chapter 22: a method
        if (a.k === 'Array') raise(a.elem, e.op ? prim(e.op, [typeOf(a.elem), v]) : v);
        else if (a.k === 'Any' || a.k === 'Rec') { markTable(a); escape(v); if (i.k !== 'Bot' && !numeric(i)) escape(i); }
        return v;
      }
      case 'ArrayLit': {
        if (!literals.has(e)) literals.set(e, seeded(demote.elems.has(e), seed?.l.get(check.ids.get(e))));
        const cell = literals.get(e);
        for (const x of e.elems) raise(cell, exp(x));
        return Arr(cell);
      }
      case 'Call': {
        const ts = e.args.map(exp), f = exp(e.fn);
        if (f.k === 'Fn' && ts.length <= f.sig.params.length) {
          // a parameter without an argument is undefined
          f.sig.params.forEach((c, k) => raise(c, k < ts.length ? ts[k] : ANY));
          return typeOf(f.sig.ret);
        }
        if (f.k === 'Bot') return BOT;
        if (f.k === 'Fn') escape(f);   // chapter 23: more arguments than parameters: called dynamically
        ts.forEach(escape);   // a dynamic call: the arguments become dynamic values
        return ANY;
      }
      case 'Lambda':
        return Fn(func(e));
      default:
        throw new Error(`infer_types: unexpected ${e.kind}`);
    }
  }

  // Chapter 13: s.f(args) for a string s, a record's function field, an array's join, a
  // number's toString.
  function method(e) {
    const o = exp(e.obj), ts = e.args.map(exp);
    calls.set(e, { recv: o, args: ts });   // chapter 15: for instantiate_library
    if (e.own && o.k === 'Any') { ts.forEach(escape); return ANY; }   // CJI-3: an object's own function (library.js)
    if (o.k === 'Rec' && findClass(o.cls).lib) return BOT;   // chapter 22: a library class's method, instantiated later
    if (e.name === '$items') return o.k === 'Array' || o.k === 'String' || o.k === 'Bot' ? o : ANY;   // chapter 22: for...of's items
    if (e.name === 'toString' && ts.length === 0 && o.k === 'Rec') return STR;   // chapter 14: an Error's
    if ((o.k === 'String' || o.k === 'Any') && STRING_METHODS[e.name]) {
      if (STRING_METHODS[e.name].result === 'String[]') {
        // (chapter 22: not pinned: where the array must be dynamic, instantiate_library copies
        // the fresh result into an Any[], as elemType below says)
        if (!literals.has(e)) literals.set(e, seed?.l.has(check.ids.get(e)) ? seedCell(seed.l.get(check.ids.get(e))) : track(new Cell(STR)));
        return Arr(literals.get(e));
      }
      return SCALAR[STRING_METHODS[e.name].result];
    }
    if (o.k === 'Rec') {
      const f = typeOf(field(o.cls, e.name));
      if (f.k === 'Fn' && ts.length <= f.sig.params.length) {
        f.sig.params.forEach((c, k) => raise(c, k < ts.length ? ts[k] : ANY));
        return typeOf(f.sig.ret);
      }
      if (f.k === 'Bot') return BOT;
      ts.forEach(escape);
      return ANY;
    }
    // chapter 15: instantiate_library gives this call its own copy of the library function;
    // until then its result is unknown
    if (o.k === 'Array' && LIBRARY_NAMES.has(e.name) && e.name !== 'join') return BOT;
    if (o.k === 'Array' && e.name === 'join') return STR;
    if (numeric(o) && e.name === 'toString') return STR;
    if ((numeric(o) || o.k === 'Any') && (e.name === 'toFixed' || e.name === 'toPrecision')) return STR;   // chapter 21
    if (o.k === 'Bot') return BOT;
    ts.forEach(escape);
    return ANY;
  }

  // The operators' rules are type_check's (chapter 10), on lattice values. An operand
  // not known yet (Bot) leaves the result unknown.
  function prim(op, ts) {
    if (op === 'Array.isArray') return BOOL;   // chapter 15
    if (op === 'fn_arity') return INT;         // chapter 16
    if (op === 'host_arg') { escape(ts[1]); return INT; }   // chapter 24
    if (op === 'host_entries') { ts.forEach(escape); return INT; }
    if (op === 'host_call' || op === 'host_event') return ANY;
    if (op === 'is_undefined') return BOOL;    // chapter 17
    // chapter 19: an object used as a table is dynamic
    if (op === 'any_delete' || op === 'any_in') { ts.forEach(escape); markTable(ts[op === 'any_in' ? 1 : 0]); return BOOL; }
    if (op === 'String' || op === 'String.fromCharCode' || op === 'typeof') return STR;   // chapter 13
    if (op === '+' && ts.some((t) => t.k === 'String')) return STR;                       // concatenation
    const dynamic = ts.some((t) => t.k === 'Any');
    if (dynamic) ts.forEach(escape);
    if (op === '!' || op.startsWith('typeof=') || ['===', '!==', '==', '!=', '<', '<=', '>', '>='].includes(op)) return BOOL;
    if (op === 'length' || ['&', '|', '^', '~', '<<', '>>', '>>>'].includes(op)) return INT;
    if (ts.some((t) => t.k === 'Bot')) return BOT;
    if (op === '&&' || op === '||') {
      if (ts.every((t) => t.k === 'Bool')) return BOOL;
      ts.forEach(escape);
      return ANY;
    }
    if (op === '??') {
      if (ts[0].k !== 'Any') return ts[0];
      escape(ts[1]);
      return ANY;
    }
    if (op.startsWith('Math.')) {
      const m = MATH[op.slice(5)];
      if (m.result) return SCALAR[m.result];
      return m.int && ts.every((t) => t.k === 'Int') ? INT : NUM;
    }
    if (!ts.every(numeric)) return ANY;          // dynamic, or a Bool in arithmetic
    if (op === '/' || op === '**') return NUM;
    return ts.every((t) => t.k === 'Int') ? INT : NUM;
  }

  // A function's body, with its parameters' cells; its result cell gets every returned
  // value, and Any (undefined) when the end of the body is reachable.
  function func(f) {
    const sig = sigOf(f), outer = ret;
    ret = sig.ret;
    f.body.forEach(stmt);
    if (!alwaysReturns(f.body)) raise(sig.ret, ANY);
    ret = outer;
    return sig;
  }

  function stmt(s) {
    switch (s.kind) {
      case 'Print': prints.set(s, exp(s.arg)); return;
      case 'Const':
      case 'Let': {
        const cell = cellOf(s.name);
        // (CJI-3 lane 4: a written type is the program's; a sidecar that seeds it is not believed)
        if (s.type && !s.inferredType && cell.seeded) violate('a written type in the sidecar');
        if (s.type && !s.inferredType && !find(cell).pinned) { find(cell).t = fromString(s.type); find(cell).pinned = true; free?.delete(cell); }
        raise(cell, exp(s.init));
        return;
      }
      case 'ExprStmt': exp(s.exp); return;
      case 'Return': raise(ret, exp(s.arg)); return;
      case 'FunDef': func(s); return;
      case 'While': exp(s.cond); stmt(s.body); if (s.update) stmt(s.update); return;
      case 'IfStmt': exp(s.cond); stmt(s.thn); if (s.els) stmt(s.els); return;
      case 'Block': s.body.forEach(stmt); return;
      case 'Break': case 'Continue': return;
      // chapter 14: a thrown value is caught as Any, so it escapes
      case 'Throw': escape(exp(s.arg)); return;
      case 'Try': stmt(s.body); if (s.handler) stmt(s.handler); if (s.finalizer) stmt(s.finalizer); return;
      default: throw new Error(`infer_types: unexpected ${s.kind}`);
    }
  }

  // (CJI-3 lane 4) A sidecar's types (sidecar.js): the cells this call ends with, each once, so
  // that what shares a cell in the end shares it again (the range analysis keys its summaries by
  // cell). A cell's term is I, N, B, S, A (Int, Number, Bool, String, Any), _ (Bot), [@j] (an
  // array whose elements are cell j), (@a,..>@r) (a function: its parameters' cells and its
  // result's), or #k (record class k: its flags, its library class, its fields' cells). Sites
  // name their cells: variables and parameters by name (v); results (r), the element cells of
  // array literals and of split (l) and the classes of record literals (R) by node number. And
  // the calls and prints whose operand the first solve left unknown (u, up). Only cells the
  // program does not write (pin) are seeded; a written one meets the seeded ones where the
  // program makes them meet, in the check round.
  // Each site gets cells of its own, made from the sidecar's: a sidecar cannot make two sites share a
  // cell, and so cannot put a site in the class of a written type the program does not connect it to
  // (which would extend the written type's promise, a checked cast, to it). Cells meet in the strict
  // round where the program makes them meet. What the sidecar says is shared is kept as each cell's
  // claim, the sidecar's number of its cell; the range analysis keys its summaries by claim (see
  // `key`), so that what shared a cell when the sidecar was written shares a summary again: a
  // summary that covers more cells is coarser, never wrong.
  let seedTerms = null, seedSpecs = null;
  function parseTerm(text, n, nc) {
    const m = /^(?:([INBSA_])|\[@(\d+)\]|\(((?:@\d+,)*@\d+)?>@(\d+)\)|#(\d+))$/.exec(text);
    const cell = (x) => { if (!(+x < n)) throw new Error('sidecar: no such cell'); return +x; };
    if (!m) throw new Error('sidecar: a bad type');
    if (m[1]) return { t: { I: INT, N: NUM, B: BOOL, S: STR, A: ANY, _: BOT }[m[1]] };
    if (m[2]) return { arr: cell(m[2]) };
    if (m[4]) return { params: m[3] ? m[3].split(',').map((x) => cell(x.slice(1))) : [], ret: cell(m[4]) };
    if (!(+m[5] < nc)) throw new Error('sidecar: no such record class');
    return { rec: +m[5] };
  }
  // Cell id of the sidecar, made for one site: memo holds what this site has made already, so that
  // what is shared within one site's type is shared again.
  function instantiate(id, memo) {
    let c = memo.cells.get(id);
    if (c) return c;
    c = new Cell();
    c.seeded = true;
    c.claim = id;
    memo.cells.set(id, c);
    const x = seedTerms[id];
    c.t = x.t ?? (x.arr !== undefined ? Arr(instantiate(x.arr, memo))
      : x.ret !== undefined ? Fn({ params: x.params.map((j) => instantiate(j, memo)), ret: instantiate(x.ret, memo) })
        : Rec(instantiateClass(x.rec, memo)));
    return c;
  }
  function instantiateClass(k, memo) {
    let c = memo.classes.get(k);
    if (c) return c;
    const [flags, lib, fs] = seedSpecs[k];
    c = new RecClass(new Map(), flags.includes('r'));
    c.escaped = flags.includes('e');
    c.table = flags.includes('t');
    c.lib = lib;
    memo.classes.set(k, c);
    for (let j = 0; j < fs.length; j += 2) c.fields.set(fs[j], instantiate(fs[j + 1], memo));
    // (an escaped class's fields are Any, unless written: as escape makes them, in the strict round)
    if (c.escaped) { if (deferred) escapedFields(c); else escapedLater.push(c); }
    return c;
  }
  const escapedLater = [];
  const escapedFields = (c) => { for (const cell of c.fields.values()) raise(cell, ANY); };
  const newMemo = () => ({ cells: new Map(), classes: new Map() });
  const seedCell = (id) => {
    if (!(+id >= 0 && +id < seedTerms.length)) throw new Error('sidecar: no such cell');
    return instantiate(+id, newMemo());
  };
  // claims meet where cells meet: a union-find over the sidecar's cell numbers, for `key`
  const claimParent = [];
  const claimFind = (x) => { while (claimParent[x] !== undefined) x = claimParent[x]; return x; };
  const claimKeys = [];
  const claimKey = (x) => (claimKeys[x] ??= { claim: x });
  const seed = check?.types ? seedOf(check.types) : null;
  function seedOf(t) {
    const kv = (text, num) => {
      const m = new Map();
      for (const x of (text ?? '').split(' ')) {
        if (!x) continue;
        const i = x.lastIndexOf('=');
        m.set(num ? +x.slice(0, i) : x.slice(0, i), x.slice(i + 1));
      }
      return m;
    };
    const terms = (t.cells ?? '').split(' ').filter(Boolean);
    seedSpecs = t.c ?? [];
    seedTerms = terms.map((x) => parseTerm(x, terms.length, seedSpecs.length));
    for (const [flags, lib, fs] of seedSpecs) {
      if (typeof flags !== 'string' || !Array.isArray(fs) || fs.length % 2) throw new Error('sidecar: a bad record class');
      for (let j = 1; j < fs.length; j += 2) if (!(+fs[j] >= 0 && +fs[j] < terms.length)) throw new Error('sidecar: no such cell');
    }
    const nodes = (ns) => new Set((ns ?? []).map((n) => { if (!check.node[n]) throw new Error('sidecar: no such node'); return check.node[n]; }));
    return { v: kv(t.v), r: kv(t.r, true), l: kv(t.l, true), R: kv(t.R, true), u: nodes(t.u), up: nodes(t.up) };
  }
  function seedRecord(e) {
    const k = +seed.R.get(check.ids.get(e));
    if (!(k >= 0 && k < seedSpecs.length)) throw new Error('sidecar: no such record class');
    const cls = instantiateClass(k, newMemo());
    if (cls.lib !== (e.lib ?? null) || cls.error !== !!e.error) violate('a record literal of another class');
    const names = e.fields.map((f) => f.name);
    if (!e.error && !e.lib && keyOrder(names).join() !== literalOrder(names).join() && !cls.table) violate('a record class becomes a table');
    records.set(e, cls);
    for (const f of e.fields) {
      if (!cls.fields.has(f.name)) { violate('a record class gains a field'); cls.fields.set(f.name, new Cell()); }
      if (demote.fields.has(`${recordIds.get(e)}.${f.name}`)) unify(cls.fields.get(f.name), new Cell(NUM, true));
    }
  }

  // Function declarations are hoisted: each name holds its function from the start.
  (function declare(stmts) {
    for (const s of stmts) {
      if (s.kind === 'FunDef') { vars.set(s.name, new Cell(Fn(sigOf(s)), true)); declare(s.body); }
      if (s.kind === 'Block') declare(s.body);
    }
  })(p.body);

  // ---- the fixpoint, then the types as strings ----

  let rounds = 0;
  const solve = () => {
    do {
      changed = false;
      p.body.forEach(stmt);
      if (++rounds > 200) throw new Error('infer_types: no fixpoint after 200 rounds');
    } while (changed);
  };
  // (CJI-3 lane 4: with a sidecar's types, the first solve is one strict round from them: if no
  // type rises, no class escapes or becomes a table and none gains a field, the types are a
  // fixpoint, and so above every value that reaches each site, the cells merged as the program
  // makes them meet. The rest is as without them: what is unknown (from the sidecar), Bot made
  // Any, solved again to a fixpoint, written out.)
  if (seed) {
    strict = true;
    changed = false;
    deferred = [];
    escapedLater.forEach(escapedFields);   // (classes made before the round: the declarations' signatures)
    p.body.forEach(stmt);
    const waiting = deferred;
    deferred = null;
    for (let k = 0; k < waiting.length; k += 2) raise(waiting[k], waiting[k + 1]);
    rounds++;
    strict = false;
    if (violated) return { why: `the types are not a fixpoint (${violated})` };
  } else solve();
  // chapter 15: the receivers still unknown here wait for instantiate_library's next round
  // (chapter 22: and a library call, new Map(x) or Array.from(x), whose argument is unknown;
  // and a print of an unknown value, which instantiate_library prints by its type)
  const unknown = seed ? seed.u : new Set([...calls].filter(([e, c]) => c.recv?.k === 'Bot' || (e.kind === 'LibCall' && c.args.some((t) => t.k === 'Bot'))).map(([e]) => e));
  const unknownPrints = seed ? seed.up : new Set([...prints].filter(([, t]) => t.k === 'Bot').map(([s]) => s));
  // A cell nothing reached (the parameter of a function never called, the result of one
  // that never returns) holds Bot. It will be written as Any, so it must be Any here too:
  // a dynamic value stored from it into an array makes that an Any[] (escape).
  const cells = [...vars.values(), ...literals.values(), ...[...sigs.values()].flatMap((s) => [...s.params, s.ret]),
    ...[...records.values()].flatMap((c) => [...findClass(c).fields.values()])];
  for (const c of cells) if (find(c).t.k === 'Bot' && !find(c).pinned) raise(c, ANY);
  solve();

  // A type as a string. A cell met again inside its own type (an array that holds itself,
  // a function that returns itself) has no finite type: it becomes Any, and the solving
  // starts again from there.
  let cyclic = null, cyclicClass = null;
  function show(t, seen) {
    switch (t.k) {
      case 'Bot': return 'Any';   // nothing ever reaches it; Any is as good as anything
      case 'Array': return arrayOf(showCell(t.elem, seen));
      case 'Fn': return functionType(t.sig.params.map((c) => showCell(c, seen)), showCell(t.sig.ret, seen));
      case 'Rec': {   // chapter 13: a record type names its fields; a class met inside itself is cyclic
        const c = findClass(t.cls);
        if (c.table) return 'Any';   // chapter 19
        if (seen.has(c)) { cyclicClass ??= c; return 'Any'; }
        seen.add(c);
        const s = recordType([...c.fields].map(([n, cell]) => [n, showCell(cell, seen)]), c.error);
        seen.delete(c);
        return s;
      }
      default: return t.k;
    }
  }
  function showCell(c, seen) {
    const r = find(c);
    if (seen.has(r)) { cyclic ??= r; return 'Any'; }
    seen.add(r);
    const s = show(r.t, seen);
    seen.delete(r);
    return s;
  }
  const typeString = (c) => showCell(c, new Set());

  // Write each inferred type where its comment would have been.
  // (CJI-3, lane 5: write(false) makes the same calls in the same order, so that it finds the same cyclic
  // types, but builds nothing: the check for cycles no longer makes a copy of the program beside it.
  // Whatever write() reads or computes, it reads and computes in both modes.)
  function write(build = true) {
    const withType = (q, type) => (build ? { ...q, type } : q);
    const fn = (f) => {
      const sig = sigs.get(f);
      if (!sig) return f;                       // unreachable code: never analysed
      const params = f.params.map((q, k) => (q.inferred ? withType(q, typeString(sig.params[k])) : q));
      const retType = f.inferRet || !f.retType ? typeString(sig.ret) : f.retType;
      const body = f.body.map(st);
      return build ? { ...f, params, retType, body } : f;
    };
    const ex = (e) => {
      if (e === null || typeof e !== 'object') return e;
      if (Array.isArray(e)) {
        if (build) return e.map(ex);
        e.forEach(ex);
        return e;
      }
      if (e.kind === 'Lambda') return fn(e);
      const out = build ? {} : null;
      for (const [k, v] of Object.entries(e)) {
        const w = typeof v === 'object' ? ex(v) : v;
        if (build) out[k] = w;
      }
      if (build && e.kind === 'Prim' && demote.ops.has(e)) out.double = true;   // chapter 12
      if (e.kind === 'Record' && records.has(e)) {   // chapter 13
        // chapter 19: a table's literal makes the fields it writes, all dynamic
        const type = findClass(records.get(e)).table ? recordType(e.fields.map((f) => [f.name, 'Any']), !!e.error)
          : show(Rec(records.get(e)), new Set());
        if (build) {
          out.type = type;
          // chapter 23: and keeps its own key order (every access to a table's record searches
          // its shape, so no code depends on where a field is)
          if (findClass(records.get(e)).table) out.ownOrder = true;
        }
      }
      if (e.kind === 'MethodCall' && literals.has(e)) {   // chapter 22: split's elements
        const elemType = typeString(literals.get(e));
        if (build) out.elemType = elemType;
      }
      if (calls.has(e)) {   // chapter 15: the types instantiate_library chooses by
        const r = calls.get(e).recv;
        const recvType = r ? show(r, new Set()) : undefined;
        const recvAnyElems = r?.k === 'Array' && find(r.elem).t.k === 'Any';   // known dynamic, not just unknown
        const recvUnknown = r?.k === 'Bot' || unknown.has(e);
        const argTypes = calls.get(e).args.map((t) => show(t, new Set()));
        if (build) {
          out.recvType = recvType;
          out.recvAnyElems = recvAnyElems;
          out.recvUnknown = recvUnknown;
          out.argTypes = argTypes;
        }
      }
      return build ? out : e;
    };
    function st(s) {
      switch (s.kind) {
        case 'Const':
        case 'Let': {
          const init = ex(s.init);
          if (s.type && !s.inferredType) return build ? { ...s, init } : s;
          const type = typeString(cellOf(s.name));
          return build ? { ...s, init, type, inferredType: true } : s;
        }
        case 'FunDef': return fn(s);
        case 'Block': {
          const body = s.body.map(st);
          return build ? { ...s, body } : s;
        }
        case 'While': {
          const cond = ex(s.cond), body = st(s.body), update = s.update && st(s.update);
          return build ? { ...s, cond, body, update } : s;
        }
        case 'IfStmt': {
          const cond = ex(s.cond), thn = st(s.thn), els = s.els && st(s.els);
          return build ? { ...s, cond, thn, els } : s;
        }
        case 'Try': {
          const body = st(s.body), handler = s.handler && st(s.handler), finalizer = s.finalizer && st(s.finalizer);
          return build ? { ...s, body, handler, finalizer } : s;
        }
        // chapter 20: for instantiate_library, which prints arrays and objects with the library
        case 'Print': {
          const x = ex(s);
          const argType = prints.has(s) ? show(prints.get(s), new Set()) : undefined;
          return build ? { ...x, argType, argUnknown: unknownPrints.has(s) } : s;
        }
        default: return ex(s);
      }
    }
    // (lane 5: when consuming, a statement of the input is forgotten once it is written: taken out of
    // p.body and out of every table keyed by its nodes, so that nothing holds it)
    const body = [];
    for (let i = 0; i < p.body.length; i++) {
      body.push(st(p.body[i]));
      if (build && consume) {
        forget(p.body[i]);
        p.body[i] = null;
      }
    }
    return build ? { ...p, body } : null;
  }
  function forget(x) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(forget); return; }
    // (each table by name: an array of them would make cji join their types)
    sigs.delete(x); records.delete(x); calls.delete(x); literals.delete(x); prints.delete(x); recordIds.delete(x);
    unknown.delete(x); unknownPrints.delete(x); demote.rets.delete(x); demote.elems.delete(x); demote.ops.delete(x);
    for (const v of Object.values(x)) if (typeof v === 'object') forget(v);
  }

  // (CJI-3, lane 5: the program with its types written is a whole copy of the program, and only the
  // last round's is used: so it is made after the ranges, when they have found nothing new, and the
  // copy and the ranges' working state are never alive together. Here the types are only checked for
  // cycles. The ranges see inference through questions that re-evaluate expressions at the fixpoint,
  // which changes nothing, except that a question may ask for a field a class lacks (o.toString() of
  // a record), which is kept aside meanwhile. Anything else a question changes, which a node inference
  // never reached could, would make the types written after the questions differ from those written
  // before them: that stops the compile, rather than change its output.)
  for (;;) {
    cyclic = null;
    cyclicClass = null;
    write(false);
    if (!cyclic && !cyclicClass) break;
    if (cyclic) raise(cyclic, ANY);
    if (cyclicClass) escape(Rec(cyclicClass));
    solve();
  }
  // (the tables' sizes, each by name: an array of the tables would make cji join their types)
  const sizes = [vars.size, literals.size, calls.size, prints.size, records.size, sigs.size];
  const grew = () => vars.size !== sizes[0] || literals.size !== sizes[1] || calls.size !== sizes[2] || prints.size !== sizes[3]
    || records.size !== sizes[4] || sigs.size !== sizes[5];
  changed = false;
  aside = new Map();

  // (CJI-3 lane 4: for a sidecar, the cells this call ends with, as seedOf reads them)
  if (check?.typesOut) {
    const cellIds = new Map(), cellList = [], classIds = new Map(), classList = [];
    const cellId = (c) => {
      c = find(c);
      if (!cellIds.has(c)) { cellIds.set(c, cellList.length); cellList.push(c); }
      return cellIds.get(c);
    };
    const classId = (c) => {
      c = findClass(c);
      if (!classIds.has(c)) { classIds.set(c, classList.length); classList.push(c); }
      return classIds.get(c);
    };
    const ids = check.ids, list = (pairs) => pairs.map(([k, v]) => `${k}=${v}`).join(' ');
    const out = {
      v: list([...vars].filter(([, c]) => free.has(c)).map(([n, c]) => [n, cellId(c)])),
      r: list([...sigs].filter(([, sig]) => free.has(sig.ret)).map(([f, sig]) => [ids.get(f), cellId(sig.ret)])),
      l: list([...literals].filter(([, c]) => free.has(c)).map(([e, c]) => [ids.get(e), cellId(c)])),
      R: list([...records].map(([e, c]) => [ids.get(e), classId(c)])),
      cells: '', c: [],
      u: [...unknown].map((e) => ids.get(e)),
      up: [...unknownPrints].map((e) => ids.get(e)),
    };
    const terms = [];
    // (both lists grow as terms and fields name more cells and classes)
    for (let j = 0, k = 0; j < cellList.length || k < classList.length;) {
      if (j < cellList.length) {
        const t = cellList[j++].t;
        terms.push(t.k === 'Array' ? `[@${cellId(t.elem)}]` : t.k === 'Fn' ? `(${t.sig.params.map((c) => `@${cellId(c)}`).join(',')}>@${cellId(t.sig.ret)})`
          : t.k === 'Rec' ? `#${classId(t.cls)}` : t.k === 'Bot' ? '_' : t.k[0]);
      } else {
        const c = classList[k++];
        out.c.push([`${c.escaped ? 'e' : ''}${c.table ? 't' : ''}${c.error ? 'r' : ''}`, c.lib, [...c.fields].flatMap(([n, cell]) => [n, cellId(cell)])]);
      }
    }
    out.cells = terms.join(' ');
    check.typesOut.t = out;
  }

  // ---- chapter 12: the ranges, and the Ints they cannot prove exact ----
  let ids = new Map();   // (CJI-3: a Map: the subset has no WeakMap)
  let nextId = 0;
  const key = (c) => {
    let r = find(c);
    if (r.claim !== undefined) r = claimKey(claimFind(r.claim));   // (CJI-3 lane 4: see seedCell)
    if (!ids.has(r)) ids.set(r, ++nextId);
    return `c${ids.get(r)}`;
  };
  const ask = {
    arrayKey: (e) => { const t = exp(e); return t.k === 'Array' ? key(t.elem) : null; },
    calleeSig: (e) => { const t = exp(e); return t.k === 'Fn' ? { params: t.sig.params.map(key), ret: key(t.sig.ret) } : null; },
    sigKeys: (f) => { const s = sigOf(f); return { params: s.params.map(key), ret: key(s.ret) }; },
    // chapter 13: a record field's cell, for o.f and for a literal's field
    fieldKey: (o, name) => { const t = exp(o); return t.k === 'Rec' ? key(field(t.cls, name)) : null; },
    calleeOfMethod: (e) => {
      const t = exp(e.obj);
      if (t.k !== 'Rec' || findClass(t.cls).lib) return null;
      const f = typeOf(field(t.cls, e.name));
      return f.k === 'Fn' ? { params: f.sig.params.map(key), ret: key(f.sig.ret) } : null;
    },
  };
  // (CJI-3: a later round sees the same program, and inference has usually only turned some
  // Ints into Numbers, which leaves the cells shared as they were. The analysis sees the
  // program only through the questions in `ask`: when every question the last round's analysis
  // asked has the same answer now, asked in the same order (so the cells are numbered alike),
  // the analysis would do exactly what it did then, and its result is used again.)
  // (CJI-3 lane 4: with a sidecar's summaries, the one round that checks them)
  let ranges = null;
  if (check) {
    ranges = analyzeRanges(p, ask, null, check.summaries, check);
    if (ranges.changed) return { why: 'the range summaries are not a fixpoint' };
  } else if (demote.ranges && replay(ask, demote.ranges.questions)) ranges = demote.ranges.result;
  if (!ranges) {
    ids = new Map();
    nextId = 0;
    const questions = [];
    ranges = analyzeRanges(p, recording(ask, questions), episodes);
    demote.ranges = { questions, result: ranges };
  }
  let found = 0;
  const inexact = (v) => v && !isEmpty(v) && !exact(v);
  const intCell = (c) => find(c).t.k === 'Int' && !find(c).pinned;
  for (const [node, rec] of ranges.records) {
    if (demote.ops.has(node) || !['neg', '+', '-', '*', '%'].includes(node.op)) continue;
    if (node.args.every((a) => exp(a).k === 'Int') && inexact(rec.res)) { demote.ops.add(node); found++; }
  }
  for (const [name, h] of ranges.hulls) {
    const c = vars.get(name);
    if (c && intCell(c) && !demote.vars.has(name) && inexact(h)) { demote.vars.add(name); found++; }
  }
  for (const [f, sig] of sigs) {
    if (intCell(sig.ret) && !demote.rets.has(f) && inexact(ranges.summaries.get(key(sig.ret)))) { demote.rets.add(f); found++; }
  }
  for (const [lit, c] of literals) {
    if (intCell(c) && !demote.elems.has(lit) && inexact(ranges.summaries.get(key(c)))) { demote.elems.add(lit); found++; }
  }
  for (const [lit, cls] of records) {   // chapter 13: a record field
    for (const [name, c] of findClass(cls).fields) {
      const id = `${recordIds.get(lit)}.${name}`;
      if (intCell(c) && !demote.fields.has(id) && inexact(ranges.summaries.get(key(c)))) { demote.fields.add(id); found++; }
    }
  }
  // (a demotion found here changes what later expressions evaluate to: the round is over then)
  if (found > 0) return { program: null, fresh: found };
  if (changed || grew()) throw new Error('infer_types: the ranges\' questions changed what inference found');
  aside = null;
  // (lane 5: this is the round that is returned: the ranges' result, and the record of their questions for
  // the next round, are not needed while the program is written; only the summaries stay, which a sidecar
  // being recorded takes from here, lane 4's entryOf)
  const rangeRounds = ranges.rounds;
  demote.ranges = { questions: null, result: { summaries: ranges.summaries } };
  ranges = null;
  const out = write();
  return { program: { ...out, inferRounds: rounds, rangeRounds }, fresh: found };
}
