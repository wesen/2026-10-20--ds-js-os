// CJI-3 (lane 4): the front end's facts in a sidecar: verify, don't infer.
//
// infer_types and instantiate_library are the whole-program part of the compiler, and their
// cost is three fixpoints: inference's rounds (chapter 11), the range analysis's rounds (chapter
// 12), and the rounds of "infer, find the inexact Ints, demote them, infer again" around both;
// instantiate_library (chapter 15) runs all of it once per round that adds copies. The facts
// they converge to are small, and checking that a set of facts is a fixpoint takes one round.
// So a compile that is given them (a sidecar, written by an earlier compile of the same source,
// on any machine) checks them and uses them, as Java's bytecode verifier checks a method's
// stack maps instead of inferring them.
//
// A sidecar holds one entry per inferTypes call, in the order of the calls (infer_types, then
// each round of instantiate_library that added copies). An entry holds:
//   d   the demotions (chapter 12's verdicts) inference ended with: variables by name, results,
//       array elements and operations by the number of their node in the call's program (a
//       pre-order walk), record fields by record number and name;
//   r   the range analysis's final summaries, keyed as the analysis keys them;
//   t   (types) the state inference ended with, a type per site; see infer.js.
// infer.js checks an entry against its program (one round of each analysis, which must change
// nothing, and no inexact Int may be left) and falls back to the full inference if it does not
// hold, so that a wrong sidecar costs time, never correctness. The library's copies are not
// recorded: instantiate_library's walk makes them from the annotations of the checked state.
//
// The file is text: a header line `cji-sidecar 1 KEY`, then one line per call. The lines are
// kept as strings until their call comes, and parsed then.

import { CompileError } from './utils.js';

export const FORMAT = 1;

let session = null;
export const sidecarSession = () => session;
export function withSidecar(s, f) {
  const saved = session;
  session = s;
  try { return f(); } finally { session = saved; }
}

// A session that records each call's facts (for --emit-sidecar).
export function recordingSession() {
  return { mode: 'record', calls: [] };
}
// A session that uses a sidecar's text, if its key is the one given. strict: refuse when an
// entry does not hold, instead of inferring.
export function usingSession(text, key, { strict = false } = {}) {
  const lines = text.split('\n');
  const head = lines[0].split(' ');
  if (head[0] !== 'cji-sidecar' || +head[1] !== FORMAT || head[2] !== key) {
    if (strict) throw new CompileError('the sidecar is not for this source');
    return { mode: 'use', lines: [], k: 0, strict, log: [], ignored: true };
  }
  return { mode: 'use', lines: lines.slice(1).filter((l) => l.length), k: 0, strict, log: [] };
}
// The next call's entry, parsed, or null when the sidecar has none; { malformed } when its
// line is not an entry (the call then infers, as for any entry that does not hold).
export function nextEntry(s) {
  const line = s.lines[s.k];
  s.lines[s.k] = null;   // (parsed once; its text is not needed again)
  s.k++;
  if (!line) return null;
  try {
    const e = JSON.parse(line);
    return e === null || (typeof e === 'object' && e.d && typeof e.r === 'string') ? e : { malformed: true };
  } catch { return { malformed: true }; }
}
export function sidecarText(s, key) {
  return [`cji-sidecar ${FORMAT} ${key}`, ...s.calls.map((c) => JSON.stringify(c))].join('\n') + '\n';
}

// The nodes of a program in pre-order (an object met again keeps its first number).
export function numbering(body) {
  const id = new Map(), node = [];
  (function walk(x) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.kind !== undefined) {
      if (id.has(x)) return;
      id.set(x, node.length);
      node.push(x);
    }
    for (const v of Object.values(x)) if (typeof v === 'object') walk(v);
  })(body);
  return { id, node };
}

// An interval (ranges.js's Itv) as text: lo,hi and the flags f (frac), m (-0), n (NaN), or T for
// the whole line with every flag (most summaries are). Bounds are written exactly: i and -i for
// the infinities, -0 for minus zero.
const bound = (x) => (x === Infinity ? 'i' : x === -Infinity ? '-i' : Object.is(x, -0) ? '-0' : String(x));
const unbound = (s) => (s === 'i' ? Infinity : s === '-i' ? -Infinity : s === '-0' ? -0 : Number(s));
const isTop = (v) => v.lo === -Infinity && v.hi === Infinity && v.frac && v.mz && v.nan;
export const itvText = (v) => (isTop(v) ? 'T'
  : `${bound(v.lo)},${bound(v.hi)}${v.frac || v.mz || v.nan ? ',' : ''}${v.frac ? 'f' : ''}${v.mz ? 'm' : ''}${v.nan ? 'n' : ''}`);
export function itvParse(s) {
  if (s === 'T') return { lo: -Infinity, hi: Infinity, frac: true, mz: true, nan: true };
  const [lo, hi, flags = ''] = s.split(',');
  return { lo: unbound(lo), hi: unbound(hi), frac: flags.includes('f'), mz: flags.includes('m'), nan: flags.includes('n') };
}
// Summaries (key -> Itv) as one string of words separated by spaces. The analysis's cell keys,
// c1, c2, ..., are written by position (_ for one with no summary); other keys (var:name, and
// the names of a loop head) as key=itv. Keys hold no spaces.
export function summariesText(m) {
  const cells = [], named = [];
  for (const [k, v] of m) {
    const n = /^c(\d+)$/.exec(k);
    if (n) cells[+n[1] - 1] = itvText(v);
    else named.push(`${k}=${itvText(v)}`);
  }
  return [...Array.from(cells, (x) => x ?? '_'), ...named].join(' ');
}
export function summariesParse(s) {
  const m = new Map();
  let n = 0;
  for (const w of s.split(' ')) {
    if (!w) continue;
    const i = w.lastIndexOf('=');
    if (i < 0) { n++; if (w !== '_') m.set(`c${n}`, itvParse(w)); }
    else m.set(w.slice(0, i), itvParse(w.slice(i + 1)));
  }
  return m;
}
