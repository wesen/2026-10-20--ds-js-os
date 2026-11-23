// parse.mjs: a parser for the WGSL that Candela's fixed kernel and its generated sections are written in, as a syntax
// tree for the WGSL -> Typed lowering (lower.mjs). Unlike translator/parse.js (the section subset, which rejects loops)
// it takes the whole kernel: module-scope `const`, `var<private>` scalars, vectors and initialised arrays, `struct`,
// and in functions `let`/`var` (also arrays), assignment with = += -= *= /= to names, components and fields, `++`/`--`,
// `if`/`else`, `for`, `loop`, `break`, `continue`, `return`, blocks and call statements; expressions with the binary
// operators of WGSL, unary - ! ~, calls, `bitcast<T>(e)` (used only by the generator's own overrides), member access
// and indexing. Anything else throws with its line.

const PUNCT = ['>>=', '<<=', '->', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '++', '--',
  '<<', '>>', '(', ')', '{', '}', '[', ']', ',', ';', ':', '.', '=', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '@'];
const KEYWORDS = new Set(['fn', 'let', 'var', 'const', 'struct', 'if', 'else', 'for', 'loop', 'break', 'continue', 'return',
  'true', 'false']);
const REJECT = new Set(['while', 'switch', 'case', 'default', 'continuing', 'discard', 'override', 'alias', 'ptr', 'enable',
  'requires', 'fallthrough', 'function', 'workgroup', 'storage', 'uniform']);
// binary operator precedence (WGSL does not mix && and || or the bitwise operators without parentheses)
const BIN = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '<<': 8, '>>': 8,
  '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };

export class WgslError extends Error {}

export function lex(src, file) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); for (const ch of src.slice(i, j + 2)) if (ch === '\n') line++; i = j + 2; continue; }
    const at = `${file}:${line}`;
    const num = /(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fuih]?/y;
    num.lastIndex = i;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = num.exec(src);
      let t = m[0], suffix = '';
      if (/[fuih]$/.test(t)) { suffix = t.slice(-1); t = t.slice(0, -1); }
      if (suffix === 'h' || suffix === 'i') throw new WgslError(`${at}: literal suffix ${suffix}`);
      const float = /[.eE]/.test(t) || suffix === 'f';
      toks.push({ k: 'num', v: t, float, suffix, at });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w]/.test(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ k: KEYWORDS.has(w) ? 'kw' : 'id', v: w, at });
      i = j;
      continue;
    }
    const p = PUNCT.find(q => src.startsWith(q, i));
    if (!p) throw new WgslError(`${at}: unexpected character '${c}'`);
    toks.push({ k: 'p', v: p, at });
    i += p.length;
  }
  toks.push({ k: 'eof', v: '<end>', at: `${file}:${line}` });
  return toks;
}

// Parse a WGSL module. Returns its items in order: { k: 'const' | 'global' | 'struct' | 'fn', ... }.
export function parse(src, file = 'wgsl') {
  const T = lex(src, file);
  let p = 0;
  const peek = (o = 0) => T[p + o];
  const fail = (msg, t = peek()) => { throw new WgslError(`${t.at}: ${msg} (at '${t.v}')`); };
  const isP = v => peek().k === 'p' && peek().v === v;
  const isK = v => peek().k === 'kw' && peek().v === v;
  const eatP = v => { if (!isP(v)) fail(`expected '${v}'`); return T[p++]; };
  const eatK = v => { if (!isK(v)) fail(`expected '${v}'`); return T[p++]; };
  const ident = () => { const t = peek(); if (t.k !== 'id') fail('expected an identifier'); if (REJECT.has(t.v)) fail(`'${t.v}' is outside Candela's WGSL subset`); p++; return t.v; };

  // a type: a name, or array<T, N>
  function type() {
    const n = ident();
    if (n === 'array') {
      eatP('<'); const elem = type(); eatP(','); const len = T[p++]; if (len.k !== 'num') fail('array length'); eatP('>');
      return { array: elem, n: +len.v };
    }
    if (isP('<')) fail(`templated type ${n}<...>`);
    return n;
  }

  function expr(min = 1) {
    let a = unary();
    for (;;) {
      const t = peek();
      const pr = t.k === 'p' ? BIN[t.v] : undefined;
      if (pr === undefined || pr < min) return a;
      p++;
      const b = expr(pr + 1);
      a = { k: 'bin', op: t.v, a, b, at: t.at };
    }
  }
  function unary() {
    const t = peek();
    if (isP('-') || isP('!') || isP('~')) { p++; return { k: 'un', op: t.v, a: unary(), at: t.at }; }
    if (isP('&') || isP('*')) fail('pointers are outside the subset');
    return postfix(primary());
  }
  function postfix(e) {
    for (;;) {
      const t = peek();
      if (isP('.')) { p++; e = { k: 'member', obj: e, name: ident(), at: t.at }; continue; }
      if (isP('[')) { p++; const idx = expr(); eatP(']'); e = { k: 'index', obj: e, idx, at: t.at }; continue; }
      return e;
    }
  }
  function args() {
    eatP('(');
    const out = [];
    while (!isP(')')) { out.push(expr()); if (!isP(')')) eatP(','); }
    eatP(')');
    return out;
  }
  function primary() {
    const t = peek();
    if (t.k === 'num') { p++; return { k: 'num', v: t.v, float: t.float, suffix: t.suffix, at: t.at }; }
    if (isK('true') || isK('false')) { p++; return { k: 'bool', v: t.v === 'true', at: t.at }; }
    if (isP('(')) { p++; const e = expr(); eatP(')'); return e; }
    if (t.k === 'id') {
      const n = ident();
      if (n === 'bitcast') { eatP('<'); const to = type(); eatP('>'); const a = args(); if (a.length !== 1) fail('bitcast takes one argument'); return { k: 'bitcast', to, a: a[0], at: t.at }; }
      if (n === 'array' && isP('<')) { eatP('<'); const elem = type(); eatP(','); const len = T[p++]; eatP('>'); return { k: 'arrayLit', elem, n: +len.v, args: args(), at: t.at }; }
      if (isP('<') && /^(vec\d|mat\d.*|ptr|atomic)$/.test(n)) fail(`templated constructor ${n}<...>`);
      if (isP('(')) return { k: 'call', callee: n, args: args(), at: t.at };
      return { k: 'id', name: n, at: t.at };
    }
    fail('unexpected token');
  }

  function block() {
    eatP('{');
    const out = [];
    while (!isP('}')) out.push(stmt());
    eatP('}');
    return out;
  }
  // a simple statement (no trailing ';'): declaration, assignment, increment or call
  function simple() {
    const t = peek();
    if (isK('let') || isK('var') || isK('const')) {
      const kind = T[p++].v;
      const name = ident();
      let ty = null;
      if (isP(':')) { p++; ty = type(); }
      let init = null;
      if (isP('=')) { p++; init = expr(); }
      if (!ty) fail(`'${kind} ${name}' without a type (Candela always writes the type)`, t);
      if (kind !== 'var' && !init) fail(`${kind} ${name} needs a value`, t);
      return { k: kind === 'var' ? 'var' : 'let', name, type: ty, init, at: t.at };
    }
    const lhs = expr();
    const op = peek();
    if (op.k === 'p' && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(op.v)) {
      p++;
      return { k: 'assign', target: lhs, op: op.v, value: expr(), at: t.at };
    }
    if (op.k === 'p' && (op.v === '++' || op.v === '--')) { p++; return { k: 'assign', target: lhs, op: op.v === '++' ? '+=' : '-=', value: { k: 'num', v: '1', float: false, suffix: '', at: op.at }, at: t.at }; }
    if (lhs.k !== 'call') fail('an expression statement must be a call', t);
    return { k: 'expr', e: lhs, at: t.at };
  }
  function stmt() {
    const t = peek();
    if (isP('{')) return { k: 'block', body: block(), at: t.at };
    if (isP(';')) { p++; return { k: 'block', body: [], at: t.at }; }
    if (isK('if')) return ifStmt();
    if (isK('for')) {
      p++; eatP('(');
      const init = isP(';') ? null : simple(); eatP(';');
      const cond = isP(';') ? null : expr(); eatP(';');
      const step = isP(')') ? null : simple(); eatP(')');
      return { k: 'for', init, cond, step, body: block(), at: t.at };
    }
    if (isK('loop')) { p++; return { k: 'loop', body: block(), at: t.at }; }
    if (isK('break')) { p++; eatP(';'); return { k: 'break', at: t.at }; }
    if (isK('continue')) { p++; eatP(';'); return { k: 'continue', at: t.at }; }
    if (isK('return')) { p++; const value = isP(';') ? null : expr(); eatP(';'); return { k: 'return', value, at: t.at }; }
    if (peek().k === 'id' && REJECT.has(peek().v)) fail(`'${peek().v}' is outside Candela's WGSL subset`);
    const s = simple();
    eatP(';');
    return s;
  }
  function ifStmt() {
    const t = eatK('if');
    const cond = expr();
    const then = block();
    let els = null;
    if (isK('else')) { p++; els = isK('if') ? [ifStmt()] : block(); }
    return { k: 'if', cond, then, else: els, at: t.at };
  }

  const items = [];
  while (peek().k !== 'eof') {
    const t = peek();
    if (isP('@')) fail('attributes are outside the subset');
    if (isK('struct')) {
      p++;
      const name = ident(); eatP('{');
      const members = [];
      while (!isP('}')) { const m = ident(); eatP(':'); members.push({ name: m, type: type() }); if (!isP('}')) eatP(','); }
      eatP('}'); if (isP(';')) p++;
      items.push({ k: 'struct', name, members, at: t.at });
      continue;
    }
    if (isK('const')) {
      p++; const name = ident(); eatP(':'); const ty = type(); eatP('='); const init = expr(); eatP(';');
      items.push({ k: 'const', name, type: ty, init, at: t.at });
      continue;
    }
    if (isK('var')) {
      p++; eatP('<'); if (ident() !== 'private') fail('only var<private> at module scope'); eatP('>');
      const name = ident(); eatP(':'); const ty = type(); eatP('='); const init = expr(); eatP(';');
      items.push({ k: 'global', name, type: ty, init, at: t.at });
      continue;
    }
    if (isK('fn')) {
      p++;
      const name = ident(); eatP('(');
      const params = [];
      while (!isP(')')) { const pn = ident(); eatP(':'); params.push({ name: pn, type: type() }); if (!isP(')')) eatP(','); }
      eatP(')');
      let ret = null;
      if (isP('->')) { p++; ret = type(); }
      items.push({ k: 'fn', name, params, ret, body: block(), at: t.at });
      continue;
    }
    fail('unrecognised module-scope declaration');
  }
  return items;
}

// Visit every node of a function body (statements and expressions) depth first.
export function walk(node, f) {
  if (!node) return;
  if (Array.isArray(node)) { for (const n of node) walk(n, f); return; }
  if (typeof node !== 'object' || !node.k) return;
  f(node);
  for (const key of ['init', 'cond', 'step', 'body', 'then', 'else', 'value', 'target', 'e', 'a', 'b', 'obj', 'idx', 'args']) walk(node[key], f);
}
