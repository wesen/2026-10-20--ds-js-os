// parse.js: lexer and parser for the WGSL subset that Candela's section generators emit (design Section 3).
// Pure JavaScript, QuickJS-compatible. Produces an AST of functions; anything outside the subset throws a
// SectionError whose `construct` names it (the key of the coverage report).
//
// Accepted: `fn name(p: T, ...) -> T { ... }`; statements `let`/`var` with a type and an initialiser (or `var x: T;`),
// assignment `lvalue = expr;` (lvalue: a name or a field/swizzle chain), `if (e) { } [else if ... | else { }]`,
// `return [e];`, blocks; expressions with + - * / % < <= > >= == != && || & | ^ ! and unary -, calls, member access,
// numbers, true/false. Everything else (loops, switch, attributes, pointers, arrays, compound assignment,
// increment, `const`, `alias`, `struct`, `discard`) is a diagnostic.

export class SectionError extends Error {
  constructor(code, construct, message, where) {
    super(message);
    this.code = code; this.construct = construct; this.where = where || null;
  }
}

const PUNCT = ['->', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--', '<<', '>>',
  '(', ')', '{', '}', '[', ']', ',', ';', ':', '.', '=', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '@'];
const KEYWORDS = new Set(['fn', 'let', 'var', 'if', 'else', 'return', 'true', 'false']);
const REJECT = new Set(['for', 'loop', 'while', 'switch', 'break', 'continue', 'continuing', 'discard', 'const', 'override',
  'alias', 'struct', 'enable', 'requires', 'ptr', 'array', 'bitcast', 'private', 'function', 'workgroup', 'uniform', 'storage']);

// two-character punctuators by first character, and the single-character ones
const PUNCT2 = {};
for (const q of PUNCT) if (q.length === 2) (PUNCT2[q[0]] = PUNCT2[q[0]] || []).push(q);
const PUNCT1 = new Set(PUNCT.filter(q => q.length === 1));
const isDigit = c => c >= 48 && c <= 57;
const isIdStart = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isIdChar = c => isIdStart(c) || isDigit(c);

// The lexer works on character codes (no regular expression or slice per token): it runs on the device, where
// QuickJS's interpreter is the cost. Positions are tracked by remembering where the current line starts.
export function lex(src, file) {
  const toks = [];
  const n = src.length;
  let i = 0, line = 1, lineStart = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 10) { i++; line++; lineStart = i; continue; }
    if (c === 32 || c === 9 || c === 13) { i++; continue; }
    if (c === 47 && src.charCodeAt(i + 1) === 47) { while (i < n && src.charCodeAt(i) !== 10) i++; continue; }
    if (c === 47 && src.charCodeAt(i + 1) === 42) {
      const j = src.indexOf('*/', i + 2), e = j < 0 ? n : j + 2;
      for (; i < e; i++) if (src.charCodeAt(i) === 10) { line++; lineStart = i + 1; }
      continue;
    }
    const at = { file, line, col: i - lineStart + 1 };
    if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) {
      if (c === 48 && (src.charCodeAt(i + 1) | 32) === 120) throw new SectionError('E-SECT-UNSUPPORTED', 'literal:hex', 'hexadecimal literals are not in the section subset', at);
      let j = i, float = false;
      while (isDigit(src.charCodeAt(j))) j++;
      if (src.charCodeAt(j) === 46) { float = true; j++; while (isDigit(src.charCodeAt(j))) j++; }
      if ((src.charCodeAt(j) | 32) === 101) {
        let k = j + 1; const s = src.charCodeAt(k); if (s === 43 || s === 45) k++;
        if (isDigit(src.charCodeAt(k))) { float = true; j = k; while (isDigit(src.charCodeAt(j))) j++; }
      }
      const body = src.slice(i, j);
      const suf = src[j];
      if (suf === 'h' || suf === 'i' || suf === 'u') throw new SectionError('E-SECT-UNSUPPORTED', 'literal:suffix-' + suf, `literal suffix '${suf}' is not in the section subset`, at);
      if (suf === 'f') { float = true; j++; }
      toks.push({ k: 'num', v: body, float, at });
      i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdChar(src.charCodeAt(j))) j++;
      const m = src.slice(i, j);
      toks.push({ k: KEYWORDS.has(m) ? 'kw' : 'id', v: m, at });
      i = j; continue;
    }
    const ch = src[i], two = PUNCT2[ch];
    let p = null;
    if (two) { const nx = src[i + 1]; for (const q of two) if (q[1] === nx) { p = q; break; } }
    if (!p && PUNCT1.has(ch)) p = ch;
    if (!p) throw new SectionError('E-SECT-UNSUPPORTED', 'character:' + ch, `unexpected character '${ch}'`, at);
    toks.push({ k: 'p', v: p, at });
    i += p.length;
  }
  toks.push({ k: 'eof', v: '<end>', at: { file, line, col: i - lineStart + 1 } });
  return toks;
}

// operator precedence (WGSL has no mixing of && and || without parentheses; Candela always parenthesises)
const BIN = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };

export function parse(src, file) {
  const T = lex(src, file);
  let p = 0;
  const peek = (o = 0) => T[p + o];
  const next = () => T[p++];
  const where = t => t.at;
  const fail = (construct, msg, t = peek()) => { throw new SectionError('E-SECT-UNSUPPORTED', construct, msg, where(t)); };
  const syntax = (msg, t = peek()) => { throw new SectionError('E-SECT-SYNTAX', 'syntax', msg, where(t)); };
  const is = (k, v) => peek().k === k && (v === undefined || peek().v === v);
  const isP = v => is('p', v);
  const eat = (k, v) => { const t = peek(); if (t.k !== k || (v !== undefined && t.v !== v)) { if (t.k === 'id' && REJECT.has(t.v)) fail('keyword:' + t.v, `'${t.v}' is not in the section subset`, t); syntax(`expected ${v || k}, found '${t.v}'`, t); } p++; return t; };
  const ident = () => { const t = peek(); if (t.k === 'id' && REJECT.has(t.v)) fail('keyword:' + t.v, `'${t.v}' is not in the section subset`, t); return eat('id').v; };

  function type() {
    const t = peek(), n = ident();
    if (isP('<')) fail('type:' + n + '<>', `templated type '${n}<...>' is not in the section subset (use vec3f, not vec3<f32>)`, t);
    return { name: n, at: where(t) };
  }
  function fn() {
    const t0 = peek();
    if (isP('@')) fail('attribute', 'attributes are not in the section subset');
    if (is('id') && REJECT.has(peek().v)) fail('declaration:' + peek().v, `top-level '${peek().v}' is not in the section subset`);
    if (is('kw', 'var') || is('kw', 'let')) fail('declaration:global-' + peek().v, 'module-scope variables are not in the section subset');
    eat('kw', 'fn');
    const name = ident();
    eat('p', '(');
    const params = [];
    while (!isP(')')) {
      const pn = ident(); eat('p', ':'); params.push({ name: pn, type: type() });
      if (!isP(')')) eat('p', ',');
    }
    eat('p', ')');
    let ret = null;
    if (isP('->')) { next(); ret = type(); }
    const body = block();
    return { name, params, ret, body, at: where(t0) };
  }
  function block() {
    eat('p', '{');
    const out = [];
    while (!isP('}')) out.push(stmt());
    eat('p', '}');
    return out;
  }
  function stmt() {
    const t = peek();
    if (t.k === 'id' && REJECT.has(t.v)) fail('statement:' + t.v, `statement '${t.v}' is not in the section subset`, t);
    if (isP('@')) fail('attribute', 'attributes are not in the section subset', t);
    if (isP('{')) return { k: 'block', body: block(), at: where(t) };
    if (isP(';')) { next(); return { k: 'empty', at: where(t) }; }
    if (is('kw', 'let') || is('kw', 'var')) {
      const kind = next().v;
      if (isP('<')) fail('declaration:var<>', 'address-space variables are not in the section subset', t);
      const name = ident();
      if (!isP(':')) fail('declaration:untyped-' + kind, `'${kind} ${name}' without a type is not in the section subset (Candela always writes the type)`, t);
      eat('p', ':');
      const ty = type();
      let init = null;
      if (isP('=')) { next(); init = expr(); }
      else if (kind === 'let') syntax(`let ${name} needs an initialiser`, t);
      eat('p', ';');
      return { k: kind, name, type: ty, init, at: where(t) };
    }
    if (is('kw', 'if')) return ifStmt();
    if (is('kw', 'return')) {
      next();
      const value = isP(';') ? null : expr();
      eat('p', ';');
      return { k: 'return', value, at: where(t) };
    }
    // assignment or call statement
    const lhs = expr();
    if (isP('=')) {
      next();
      const value = expr();
      eat('p', ';');
      return { k: 'assign', target: lhs, value, at: where(t) };
    }
    if (['+=', '-=', '*=', '/=', '++', '--'].includes(peek().v)) fail('assign:' + peek().v, `'${peek().v}' is not in the section subset`, peek());
    eat('p', ';');
    if (lhs.k !== 'call') syntax('expression statement must be a call', t);
    return { k: 'expr', e: lhs, at: where(t) };
  }
  function ifStmt() {
    const t = eat('kw', 'if');
    const hasParen = isP('(');
    const cond = expr();
    if (!hasParen) { /* WGSL allows if cond { }, accept */ }
    const then = block();
    let els = null;
    if (is('kw', 'else')) {
      next();
      els = is('kw', 'if') ? [ifStmt()] : block();
    }
    return { k: 'if', cond, then, else: els, at: where(t) };
  }
  function expr(minPrec = 1) {
    let a = unary();
    for (;;) {
      const t = peek();
      const pr = t.k === 'p' ? BIN[t.v] : undefined;
      if (pr === undefined || pr < minPrec) break;
      next();
      const b = expr(pr + 1);
      a = { k: 'bin', op: t.v, a, b, at: where(t) };
    }
    return a;
  }
  function unary() {
    const t = peek();
    if (isP('-') || isP('!') || isP('~')) { next(); return { k: 'un', op: t.v, a: unary(), at: where(t) }; }
    if (isP('&') || isP('*')) fail('operator:pointer', 'pointers are not in the section subset', t);
    return postfix(primary());
  }
  function postfix(e) {
    for (;;) {
      const t = peek();
      if (isP('.')) { next(); const n = ident(); e = { k: 'member', obj: e, name: n, at: where(t) }; continue; }
      if (isP('[')) fail('operator:index', 'indexing is not in the section subset', t);
      return e;
    }
  }
  function primary() {
    const t = peek();
    if (t.k === 'num') { next(); return { k: 'num', v: t.v, float: t.float, at: where(t) }; }
    if (is('kw', 'true') || is('kw', 'false')) { next(); return { k: 'bool', v: t.v === 'true', at: where(t) }; }
    if (isP('(')) { next(); const e = expr(); eat('p', ')'); return e; }
    if (t.k === 'id') {
      const n = ident();
      if (isP('<') && /^(vec[234]|mat\d(x\d)?|array|ptr|atomic|texture\w*)$/.test(n)) {
        // a templated constructor such as vec3<f32>(...) or array<f32, 3>(...)
        fail('call:' + n + '<>', `templated constructor '${n}<...>' is not in the section subset`, t);
      }
      if (isP('(')) {
        next();
        const args = [];
        while (!isP(')')) { args.push(expr()); if (!isP(')')) eat('p', ','); }
        eat('p', ')');
        return { k: 'call', callee: n, args, at: where(t) };
      }
      return { k: 'id', name: n, at: where(t) };
    }
    syntax(`unexpected '${t.v}'`, t);
  }

  const fns = [];
  while (!is('eof')) fns.push(fn());
  return fns;
}

// structural equality of expressions (used to recognise genSurface's selection pattern)
export function sameExpr(a, b) {
  if (!a || !b || a.k !== b.k) return false;
  switch (a.k) {
    case 'num': return a.v === b.v && a.float === b.float;
    case 'bool': return a.v === b.v;
    case 'id': return a.name === b.name;
    case 'member': return a.name === b.name && sameExpr(a.obj, b.obj);
    case 'un': return a.op === b.op && sameExpr(a.a, b.a);
    case 'bin': return a.op === b.op && sameExpr(a.a, b.a) && sameExpr(a.b, b.b);
    case 'call': return a.callee === b.callee && a.args.length === b.args.length && a.args.every((x, i) => sameExpr(x, b.args[i]));
  }
  return false;
}

// does a statement list (or expression) mention a name?
export function mentions(node, name) {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(n => mentions(n, name));
  switch (node.k) {
    case 'id': return node.name === name;
    case 'num': case 'bool': case 'empty': return false;
    case 'member': return mentions(node.obj, name);
    case 'un': return mentions(node.a, name);
    case 'bin': return mentions(node.a, name) || mentions(node.b, name);
    case 'call': return node.args.some(a => mentions(a, name));
    case 'let': case 'var': return mentions(node.init, name);
    case 'assign': return mentions(node.target, name) || mentions(node.value, name);
    case 'if': return mentions(node.cond, name) || mentions(node.then, name) || mentions(node.else, name);
    case 'return': return mentions(node.value, name);
    case 'expr': return mentions(node.e, name);
    case 'block': return mentions(node.body, name);
  }
  return false;
}
