// Chapter 18: regular expressions.
//
// A regular expression literal is compiled, when the program is compiled, into a small
// program for a backtracking machine: an array of integers. The machine, and the RegExp
// objects and string methods around it, are a library in the subset (REGEX_SOURCE): each
// literal becomes a call $regex([...program], [...classes], ...), which makes an object
// whose test and exec run the machine. ECMAScript specifies its regular expressions as a
// backtracking matcher (22.2.2), so a backtracking machine that tries alternatives in the
// order the specification does finds the same matches, captures included.
//
// The machine's instructions (operands follow the opcode):
//   0 MATCH          the match succeeds here
//   1 CHAR c         the next unit is c                 18 CHARI c    the same, ignoring case
//   2 ANY            any unit but a line terminator     3 ANYALL     any unit (the s flag)
//   4 CLASS k        the next unit is in class k        19 CLASSI k  the same, ignoring case
//   5 SPLIT a b      try a; if that fails, b
//   6 JMP a
//   7 SAVE n         capture slot n := the position
//   8 BOL  9 EOL     ^ and $ (with the m flag, also at line terminators)
//   10 WORDB 11 NWORDB   \b and \B
//   12 LOOK e  13 NLOOK e   (?= and (?!: the instructions that follow, up to LOOKEND, must
//                    (must not) match here; then e
//   14 LOOKEND
//   15 MARK r  16 CHECK r   r := the position; fail if the position is still r (a loop
//                    whose body can match the empty string stops, as 22.2.2.3.1 says)
// A class is [n, negated, lo1, hi1, ..., lon, hin] in one array of all the classes.

import { CompileError } from './utils.js';

const DIGIT = [[48, 57]];
const WORD = [[48, 57], [65, 90], [95, 95], [97, 122]];
const SPACE = [[9, 13], [32, 32], [160, 160], [5760, 5760], [8192, 8202], [8232, 8233], [8239, 8239], [8287, 8287], [12288, 12288], [65279, 65279]];
const complement = (ranges) => {
  const out = [];
  let lo = 0;
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    if (a > lo) out.push([lo, a - 1]);
    lo = Math.max(lo, b + 1);
  }
  if (lo <= 0xffff) out.push([lo, 0xffff]);
  return out;
};

export function compileRegex(source, flags) {
  for (const f of flags) if (!'gimsy'.includes(f)) throw new CompileError(`the regular expression flag ${f} is not in the subset`);
  const icase = flags.includes('i');
  let i = 0, ngroups = 1, nregs = 0;
  const fail = (msg) => { throw new CompileError(`/${source}/: ${msg}`); };
  const peek = () => source[i];
  const eat = (c) => { if (source[i] !== c) fail(`expected ${c}`); i++; };

  // ---- parse: the tree is { k: 'char'|'class'|'any'|'seq'|'alt'|'group'|'nc'|'look'|'bol'|... }
  function disjunction() {
    const alts = [alternative()];
    while (peek() === '|') { i++; alts.push(alternative()); }
    return alts.length === 1 ? alts[0] : { k: 'alt', alts };
  }
  function alternative() {
    const items = [];
    while (i < source.length && peek() !== '|' && peek() !== ')') items.push(term());
    return { k: 'seq', items };
  }
  function term() {
    const c = peek();
    if (c === '^') { i++; return { k: 'bol' }; }
    if (c === '$') { i++; return { k: 'eol' }; }
    if (c === '\\' && (source[i + 1] === 'b' || source[i + 1] === 'B')) { i += 2; return { k: source[i - 1] === 'b' ? 'wordb' : 'nwordb' }; }
    if (c === '(' && source[i + 1] === '?' && (source[i + 2] === '=' || source[i + 2] === '!')) {
      const neg = source[i + 2] === '!';
      i += 3;
      const body = disjunction();
      eat(')');
      return { k: 'look', neg, body };
    }
    const a = atom();
    return quantified(a);
  }
  function quantified(a) {
    let min, max;
    const c = peek();
    if (c === '*') { min = 0; max = Infinity; i++; }
    else if (c === '+') { min = 1; max = Infinity; i++; }
    else if (c === '?') { min = 0; max = 1; i++; }
    else if (c === '{' && /^\{\d+(,\d*)?\}/.test(source.slice(i))) {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(i));
      min = Number(m[1]);
      max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3]);
      if (max < min) fail('numbers out of order in a {} quantifier');
      i += m[0].length;
    } else return a;
    let lazy = false;
    if (peek() === '?') { lazy = true; i++; }
    return { k: 'rep', body: a, min, max, lazy };
  }
  function atom() {
    const c = source[i++];
    if (c === '.') return { k: 'any' };
    if (c === '(') {
      if (source[i] === '?') {
        if (source[i + 1] !== ':') fail('this kind of group is not in the subset');
        i += 2;
        const body = disjunction();
        eat(')');
        return { k: 'nc', body };
      }
      const n = ngroups++;
      const body = disjunction();
      eat(')');
      return { k: 'group', n, body };
    }
    if (c === '[') return charClass();
    if (c === '\\') return atomEscape();
    if (c === '*' || c === '+' || c === '?') fail('nothing to repeat');
    if (c === ')') fail('unmatched )');
    return { k: 'char', c: c.charCodeAt(0) };
  }
  function escapeChar(inClass) {
    const c = source[i++];
    switch (c) {
      case 'n': return 10;
      case 'r': return 13;
      case 't': return 9;
      case 'v': return 11;
      case 'f': return 12;
      case '0': return 0;
      case 'b': if (inClass) return 8; break;
      case 'x': { const h = source.slice(i, i + 2); if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('bad \\x escape'); i += 2; return parseInt(h, 16); }
      case 'u': { const h = source.slice(i, i + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('bad \\u escape'); i += 4; return parseInt(h, 16); }
      case 'c': { const l = source[i++]; return l.charCodeAt(0) % 32; }
      default: break;
    }
    if (c === undefined) fail('\\ at the end');
    return c.charCodeAt(0);   // an identity escape: \. \/ \( ...
  }
  function classEscape() {   // \d \w \s and their complements, as ranges; else null
    const c = source[i];
    const sets = { d: DIGIT, w: WORD, s: SPACE };
    if (sets[c.toLowerCase()] && 'dwsDWS'.includes(c)) { i++; return c === c.toLowerCase() ? sets[c] : complement(sets[c.toLowerCase()]); }
    return null;
  }
  function atomEscape() {
    if (/[1-9]/.test(peek())) fail('a back reference is not in the subset');
    const set = classEscape();
    if (set) return { k: 'class', ranges: set, neg: false };
    return { k: 'char', c: escapeChar(false) };
  }
  function charClass() {
    let neg = false;
    if (peek() === '^') { neg = true; i++; }
    const ranges = [];
    while (peek() !== ']') {
      if (i >= source.length) fail('unterminated [');
      const lo = classAtom();
      if (Array.isArray(lo)) { ranges.push(...lo); continue; }
      if (peek() === '-' && source[i + 1] !== ']' && source[i + 1] !== undefined) {
        i++;
        const hi = classAtom();
        if (Array.isArray(hi)) { ranges.push([lo, lo], [45, 45], ...hi); continue; }
        if (hi < lo) fail('range out of order in a class');
        ranges.push([lo, hi]);
      } else ranges.push([lo, lo]);
    }
    i++;
    return { k: 'class', ranges, neg };
  }
  function classAtom() {
    const c = source[i++];
    if (c !== '\\') return c.charCodeAt(0);
    const set = classEscape();
    return set ?? escapeChar(true);
  }

  const tree = disjunction();
  if (i < source.length) fail('unmatched )');

  // ---- generate
  const prog = [], cls = [];
  const emit = (...xs) => { prog.push(...xs); return prog.length - xs.length; };
  const classOf = (ranges, neg) => {
    const off = cls.length;
    cls.push(ranges.length, neg ? 1 : 0);
    for (const r of ranges) cls.push(...r);   // (CJI-3: ranges.flat(), each range a [lo, hi] pair)
    return off;
  };
  const canEmpty = (t) => {
    switch (t.k) {
      case 'char': case 'class': case 'any': return false;
      case 'seq': return t.items.every(canEmpty);
      case 'alt': return t.alts.some(canEmpty);
      case 'group': case 'nc': return canEmpty(t.body);
      case 'rep': return t.min === 0 || canEmpty(t.body);
      default: return true;   // assertions match empty
    }
  };
  function gen(t) {
    switch (t.k) {
      case 'char': emit(icase ? 18 : 1, t.c); return;
      case 'any': emit(flags.includes('s') ? 3 : 2); return;
      case 'class': emit(icase ? 19 : 4, classOf(t.ranges, t.neg)); return;
      case 'seq': t.items.forEach(gen); return;
      case 'alt': {
        const jumps = [];
        t.alts.forEach((a, k) => {
          if (k < t.alts.length - 1) {
            const split = emit(5, 0, 0);
            prog[split + 1] = prog.length;
            gen(a);
            jumps.push(emit(6, 0));
            prog[split + 2] = prog.length;
          } else gen(a);
        });
        for (const j of jumps) prog[j + 1] = prog.length;
        return;
      }
      case 'group': emit(7, 2 * t.n); gen(t.body); emit(7, 2 * t.n + 1); return;
      case 'nc': gen(t.body); return;
      case 'bol': emit(8); return;
      case 'eol': emit(9); return;
      case 'wordb': emit(10); return;
      case 'nwordb': emit(11); return;
      case 'look': {
        const at = emit(t.neg ? 13 : 12, 0);
        gen(t.body);
        emit(14);
        prog[at + 1] = prog.length;
        return;
      }
      case 'rep': {
        for (let k = 0; k < t.min; k++) gen(t.body);
        if (t.max === Infinity) {
          // L: SPLIT body, end (lazy: end, body); body: [MARK] x [CHECK]; JMP L; end:
          const loop = emit(5, 0, 0);
          const body = prog.length;
          const empty = canEmpty(t.body), r = empty ? nregs++ : -1;
          if (empty) emit(15, r);
          gen(t.body);
          if (empty) emit(16, r);
          emit(6, loop);
          const end = prog.length;
          prog[loop + 1] = t.lazy ? end : body;
          prog[loop + 2] = t.lazy ? body : end;
        } else {
          // up to max - min more, each optional: SPLIT x, end; x; SPLIT x, end; x; ... end:
          const splits = [];
          for (let k = t.min; k < t.max; k++) {
            const s = emit(5, 0, 0);
            splits.push(s);
            prog[s + (t.lazy ? 2 : 1)] = prog.length;
            gen(t.body);
          }
          for (const s of splits) prog[s + (t.lazy ? 1 : 2)] = prog.length;
        }
        return;
      }
      default: throw new Error(`regex: ${t.k}`);
    }
  }
  emit(7, 0);
  gen(tree);
  emit(7, 1, 0);
  // the machine's flags: 1 ignore case, 2 multiline, 4 dotAll
  const fl = (icase ? 1 : 0) + (flags.includes('m') ? 2 : 0) + (flags.includes('s') ? 4 : 0);
  return { prog, cls, ncap: ngroups, nregs, fl };
}

// The machine and the RegExp library, in the subset.
export const REGEX_SOURCE = `
function $reCanon(c /*: Int */) /*: Int */ {
  if (c < 97) return c;
  if (c <= 122) return c - 32;
  if (c < 128) return c;
  const u = String.fromCharCode(c).toUpperCase();
  if (u.length !== 1) return c;
  const d /*: Int */ = u.charCodeAt(0);
  return d < 128 ? c : d;
}
function $reInClass(cls /*: Int[] */, off /*: Int */, c /*: Int */, icase /*: Bool */) /*: Bool */ {
  const n = cls[off];
  let hit = false;
  const lower = c >= 65 && c <= 90 ? c + 32 : c, upper = c >= 97 && c <= 122 ? c - 32 : c;
  for (let k = 0; k < n; k++) {
    const lo = cls[off + 2 + 2 * k], hi = cls[off + 3 + 2 * k];
    if (c >= lo && c <= hi) hit = true;
    else if (icase && ((lower >= lo && lower <= hi) || (upper >= lo && upper <= hi))) hit = true;
  }
  return hit !== (cls[off + 1] === 1);
}
function $reWord(s /*: String */, p /*: Int */) /*: Bool */ {
  if (p < 0 || p >= s.length) return false;
  const c /*: Int */ = s.charCodeAt(p);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || c === 95 || (c >= 97 && c <= 122);
}
function $reLineTerm(c /*: Int */) /*: Bool */ { return c === 10 || c === 13 || c === 8232 || c === 8233; }
// Runs the program from pc0 at pos0; the end of the match, or -1. m holds the capture slots
// and the loop registers; every change to it is undone when the machine backtracks past it.
function $reAt(prog /*: Int[] */, cls /*: Int[] */, s /*: String */, pos0 /*: Int */, pc0 /*: Int */, m /*: Int[] */, fl /*: Int */) /*: Int */ {
  const icase = (fl & 1) !== 0, multi = (fl & 2) !== 0;
  const stack /*: Int[] */ = [];
  const undo /*: Int[] */ = [];
  const n = s.length;
  let pc = pc0, pos = pos0;
  for (;;) {
    const op = prog[pc];
    let ok = true;
    if (op === 0 || op === 14) return pos;
    if (op === 1 || op === 18) {
      if (pos >= n) ok = false;
      else {
        const c /*: Int */ = s.charCodeAt(pos);
        const want = prog[pc + 1];
        ok = c === want || (op === 18 && $reCanon(c) === $reCanon(want));
        if (ok) { pos++; pc += 2; }
      }
    } else if (op === 2 || op === 3) {
      if (pos >= n) ok = false;
      else {
        const c /*: Int */ = s.charCodeAt(pos);
        ok = op === 3 || !$reLineTerm(c);
        if (ok) { pos++; pc++; }
      }
    } else if (op === 4 || op === 19) {
      if (pos >= n) ok = false;
      else {
        const c /*: Int */ = s.charCodeAt(pos);
        ok = $reInClass(cls, prog[pc + 1], c, op === 19);
        if (ok) { pos++; pc += 2; }
      }
    } else if (op === 5) {
      const k = stack.length;
      stack.length = k + 3;
      stack[k] = prog[pc + 2]; stack[k + 1] = pos; stack[k + 2] = undo.length;
      pc = prog[pc + 1];
    } else if (op === 6) {
      pc = prog[pc + 1];
    } else if (op === 7 || op === 15) {
      const slot = prog[pc + 1], k = undo.length;
      undo.length = k + 2;
      undo[k] = slot; undo[k + 1] = m[slot];
      m[slot] = pos;
      pc += 2;
    } else if (op === 16) {
      ok = pos !== m[prog[pc + 1]];
      if (ok) pc += 2;
    } else if (op === 8) {
      ok = pos === 0 || (multi && $reLineTerm(s.charCodeAt(pos - 1)));
      if (ok) pc++;
    } else if (op === 9) {
      ok = pos === n || (multi && $reLineTerm(s.charCodeAt(pos)));
      if (ok) pc++;
    } else if (op === 10 || op === 11) {
      ok = ($reWord(s, pos - 1) !== $reWord(s, pos)) === (op === 10);
      if (ok) pc++;
    } else if (op === 12 || op === 13) {
      const before /*: Int[] */ = [];
      before.length = m.length;
      for (let k = 0; k < m.length; k++) before[k] = m[k];
      const r = $reAt(prog, cls, s, pos, pc + 2, m, fl);
      ok = (r >= 0) === (op === 12);
      for (let k = 0; k < m.length; k++) {
        if (ok && op === 12) {
          if (m[k] !== before[k]) { const u = undo.length; undo.length = u + 2; undo[u] = k; undo[u + 1] = before[k]; }
        } else m[k] = before[k];
      }
      if (ok) pc = prog[pc + 1];
    }
    if (!ok) {
      if (stack.length === 0) return -1;
      const t = stack.length - 3;
      pc = stack[t]; pos = stack[t + 1];
      const u = stack[t + 2];
      stack.length = t;
      while (undo.length > u) { const k = undo.length - 2; m[undo[k]] = undo[k + 1]; undo.length = k; }
    }
  }
}
// A RegExp object: a record whose search, test and exec run the machine. The program and its
// classes stay typed (Int[]), in the closures' environments: an Int[] cannot be a field of a
// dynamic record.
function $regex(prog /*: Int[] */, cls /*: Int[] */, ncap /*: Int */, nregs /*: Int */, fl /*: Int */, source /*: String */, flags /*: String */) /*: Any */ {
  const re /*: Any */ = { $regex: true, source: source, flags: flags, global: flags.includes('g'), sticky: flags.includes('y'),
    lastIndex: 0, ncap: ncap, $search: undefined, test: undefined, exec: undefined };
  re.$search = (s /*: Any */, start /*: Any */, sticky /*: Any */) => $reSearchAny(prog, cls, ncap, nregs, fl, s, start, sticky);
  re.exec = (s /*: Any */) => $reExec(re, String(s));
  re.test = (s /*: Any */) => $reExec(re, String(s)) !== null;
  return re;
}
// The capture slots of the first match at or after start (only at start, when sticky), or [].
function $reSearch(prog /*: Int[] */, cls /*: Int[] */, ncap /*: Int */, nregs /*: Int */, fl /*: Int */, s /*: String */, start /*: Int */, sticky /*: Bool */) /*: Int[] */ {
  // SAVE 0, CLASS 0, SAVE 1, MATCH: a single case-sensitive range needs no
  // backtracking or capture array at each candidate position. Agent tests whole
  // request strings for non-ASCII before counting their UTF-8 bytes.
  if (prog.length === 7 && prog[2] === 4 && cls.length === 4) {
    const lo = cls[2], hi = cls[3], neg = cls[1] !== 0;
    for (let p = start; p < s.length; p++) {
      const c = s.charCodeAt(p);
      if ((c >= lo && c <= hi) !== neg) return [p, p + 1];
      if (sticky) break;
    }
    return [];
  }
  const size = 2 * ncap + nregs;
  for (let p = start; p <= s.length; p++) {
    const m /*: Int[] */ = [];
    m.length = size;
    for (let k = 0; k < size; k++) m[k] = -1;
    if ($reAt(prog, cls, s, p, 0, m, fl) >= 0) return m;
    if (sticky) return [];
  }
  return [];
}
// the same, as a dynamic value: the capture slots (an Any[]), or null
function $reSearchAny(prog /*: Int[] */, cls /*: Int[] */, ncap /*: Int */, nregs /*: Int */, fl /*: Int */, s /*: Any */, start /*: Any */, sticky /*: Any */) /*: Any */ {
  const m = $reSearch(prog, cls, ncap, nregs, fl, String(s), start, sticky === true);
  if (m.length === 0) return null;
  const out /*: Any[] */ = [];
  out.length = 2 * ncap;
  for (let k = 0; k < 2 * ncap; k++) out[k] = m[k];
  return out;
}
function $reGroups(re /*: Any */, s /*: String */, m /*: Any */) /*: Any[] */ {
  const out /*: Any[] */ = [];
  out.length = re.ncap;
  for (let k = 0; k < re.ncap; k++) out[k] = m[2 * k] < 0 ? undefined : s.slice(m[2 * k], m[2 * k + 1]);
  return out;
}
// RegExp.prototype.exec: an array of the match and its groups, or null; lastIndex for g and y
function $reExec(re /*: Any */, s /*: String */) /*: Any */ {
  const lazy = !re.global && !re.sticky;
  const start /*: Any */ = lazy ? 0 : re.lastIndex;
  if (start > s.length) { re.lastIndex = 0; return null; }
  const m /*: Any */ = re.$search(s, start, re.sticky);
  if (m === null) { if (!lazy) re.lastIndex = 0; return null; }
  if (!lazy) re.lastIndex = m[1];
  return $reGroups(re, s, m);
}
function $isRegex(x /*: Any */) /*: Bool */ { return typeof x === 'object' && x !== null && x.$regex === true; }
// a replacement string's $& $1 .. $9 $$ $\` $'
function $reExpand(repl /*: String */, s /*: String */, g /*: Any[] */, at /*: Int */) /*: String */ {
  let out = '';
  for (let k = 0; k < repl.length; k++) {
    const c = repl[k];
    if (c !== '$' || k + 1 >= repl.length) { out += c; continue; }
    const d = repl[k + 1];
    if (d === '$') { out += '$'; k++; }
    else if (d === '&') { out += g[0]; k++; }
    else if (d === '\\u0060') { out += s.slice(0, at); k++; }
    else if (d === "'") { out += s.slice(at + g[0].length); k++; }
    else if (d >= '1' && d <= '9' && d.charCodeAt(0) - 48 < g.length) { const v = g[d.charCodeAt(0) - 48]; if (v !== undefined) out += v; k++; }
    else out += c;
  }
  return out;
}
// the replacement for one match: a function's result, or the expanded string
function $reReplacement(repl /*: Any */, s /*: String */, g /*: Any[] */, at /*: Int */) /*: String */ {
  if (typeof repl !== 'function') return $reExpand(String(repl), s, g, at);
  const args /*: Any[] */ = [];
  for (let k = 0; k < g.length; k++) { const n = args.length; args.length = n + 1; args[n] = g[k]; }
  args.length = g.length + 2;
  args[g.length] = at;
  args[g.length + 1] = s;
  const n = $arity(repl);
  let r /*: Any */ = undefined;
  if (n === 0) r = repl();
  else if (n === 1) r = repl(args[0]);
  else if (n === 2) r = repl(args[0], args[1]);
  else if (n === 3) r = repl(args[0], args[1], args[2]);
  else if (n === 4) r = repl(args[0], args[1], args[2], args[3]);
  else if (n === 5) r = repl(args[0], args[1], args[2], args[3], args[4]);
  else r = repl(args[0], args[1], args[2], args[3], args[4], args[5]);
  return String(r);
}
function $strReplace(s0 /*: Any */, pat /*: Any */, repl /*: Any */, all /*: Bool */) /*: Any */ {
  const s = String(s0);
  if (!$isRegex(pat)) {
    const p = String(pat);
    let out = '', from = 0;
    for (;;) {
      const at = s.indexOf(p, from);
      if (at < 0) break;
      const g /*: Any[] */ = [p];
      out += s.slice(from, at) + $reReplacement(repl, s, g, at);
      from = at + p.length;
      if (!all) break;
      if (p.length === 0) { if (at >= s.length) break; out += s[at]; from = at + 1; }
    }
    return out + s.slice(from);
  }
  if (!pat.global) {
    const m /*: Any */ = pat.$search(s, pat.sticky ? pat.lastIndex : 0, pat.sticky);
    if (m === null) { if (pat.sticky) pat.lastIndex = 0; return s; }
    if (pat.sticky) pat.lastIndex = m[1];
    return s.slice(0, m[0]) + $reReplacement(repl, s, $reGroups(pat, s, m), m[0]) + s.slice(m[1]);
  }
  let out = '', from /*: Any */ = 0, start /*: Any */ = 0;
  for (;;) {
    const m /*: Any */ = pat.$search(s, start, pat.sticky);
    if (m === null) break;
    out += s.slice(from, m[0]) + $reReplacement(repl, s, $reGroups(pat, s, m), m[0]);
    from = m[1];
    start = m[1] > m[0] ? m[1] : m[1] + 1;
    if (start > s.length) break;
  }
  pat.lastIndex = 0;
  return out + s.slice(from);
}
function $strMatch(s0 /*: Any */, re /*: Any */) /*: Any */ {
  const s = String(s0);
  if (!$isRegex(re)) { const p = String(re); const r /*: Any[] */ = [p]; return s.indexOf(p) < 0 ? null : r; }   // (a pattern string, taken literally)
  if (!re.global) return $reExec(re, s);
  const out /*: Any[] */ = [];
  let start /*: Any */ = 0;
  for (;;) {
    const m /*: Any */ = re.$search(s, start, re.sticky);
    if (m === null) break;
    const n = out.length;
    out.length = n + 1;
    out[n] = s.slice(m[0], m[1]);
    start = m[1] > m[0] ? m[1] : m[1] + 1;
    if (start > s.length) break;
  }
  re.lastIndex = 0;
  return out.length === 0 ? null : out;
}
function $strMatchAll(s0 /*: Any */, re /*: Any */) /*: Any */ {
  const s = String(s0);
  const out /*: Any[] */ = [];
  let start /*: Any */ = 0;
  for (;;) {
    const m /*: Any */ = re.$search(s, start, re.sticky);
    if (m === null) break;
    const n = out.length;
    out.length = n + 1;
    out[n] = $reGroups(re, s, m);
    start = m[1] > m[0] ? m[1] : m[1] + 1;
    if (start > s.length) break;
  }
  return out;
}
function $strSearch(s0 /*: Any */, re /*: Any */) /*: Any */ {
  const s = String(s0);
  const m /*: Any */ = re.$search(s, 0, false);
  return m === null ? -1 : m[0];
}
function $strSplit(s0 /*: Any */, sep /*: Any */) /*: Any */ {
  const s = String(s0);
  if (!$isRegex(sep)) { const parts = s.split(String(sep)); const r /*: Any[] */ = []; r.length = parts.length; for (let k = 0; k < parts.length; k++) r[k] = parts[k]; return r; }
  const out /*: Any[] */ = [];
  const size = s.length;
  if (size === 0) { if (sep.$search(s, 0, true) === null) { out.length = 1; out[0] = s; } return out; }
  let p /*: Any */ = 0, q /*: Any */ = 0;
  while (q < size) {   // RegExp.prototype[@@split], 22.2.6.14
    const m /*: Any */ = sep.$search(s, q, true);
    if (m === null) { q++; continue; }
    const e /*: Any */ = m[1] < size ? m[1] : size;
    if (e === p) { q++; continue; }
    const n = out.length;
    out.length = n + 1;
    out[n] = s.slice(p, q);
    for (let k = 1; k < sep.ncap; k++) {
      const c = out.length;
      out.length = c + 1;
      out[c] = m[2 * k] < 0 ? undefined : s.slice(m[2 * k], m[2 * k + 1]);
    }
    p = e;
    q = p;
  }
  const n = out.length;
  out.length = n + 1;
  out[n] = s.slice(p, size);
  return out;
}
`;
