// Lexer and parser for the book's JavaScript subsets.
//
// The parser produces abstract syntax trees made of plain objects, each with a `kind`
// field (see ast.js). It only accepts what the current chapter's language contains;
// every later chapter adds a few cases here.
//
// Chapter 1 (L_Int):
//   stmt ::= console.log(exp);
//   exp  ::= int | -exp | exp + exp | exp - exp | exp * exp | (exp)
// Chapter 2 (L_Var) adds:
//   stmt ::= const name = exp; | { stmt* }
//   exp  ::= name
// Chapter 4 (L_If) adds:
//   stmt ::= if (exp) stmt | if (exp) stmt else stmt
//   exp  ::= true | false | !exp | exp cmp exp | exp && exp | exp || exp | exp ? exp : exp
//   cmp  ::= === | !== | < | <= | > | >=
// Chapter 5 (L_While) adds:
//   stmt ::= let name = exp; | while (exp) stmt | name asg exp;
//   exp  ::= name asg exp                       (an assignment expression; its value is the new value)
//   asg  ::= = | += | -= | *=
// Chapter 6 (L_Array) adds:
//   exp  ::= [exp, ...] | exp[exp] | exp.length | exp[exp] asg exp
//   stmt ::= exp[exp] asg exp;
// Chapter 7 (L_Fun) adds, at the top level only:
//   def  ::= function name(name /*: T */, ...) /*: T */ { stmt* }
// and anywhere:
//   stmt ::= return exp; | exp(exp, ...);
//   exp  ::= exp(exp, ...)
// A comment that starts with /*: is a type, which the parser reads (Flow's syntax for
// types in comments, so Node still runs every program unchanged).
// Chapter 8 (L_Lambda) adds:
//   exp  ::= (name /*: T */, ...) /*: T */ => exp | (name /*: T */, ...) /*: T */ => { stmt* }
// (the result type may be left out when the body is an expression), and function
// declarations at the top of a function body, as well as at the top level.

import {
  Int, Prim, Print, Program, Var, Const, Block, Bool, If, IfStmt, Let, Set as SetExp, ExprStmt, While,
  ArrayLit, Index, SetIndex, FunDef, Call, Return, Lambda, AnyLit, Break, Continue, Num,
  Str, Record, Get, SetProp, MethodCall, Throw, Try, Caught, LibCall, Await,
} from './ast.js';
//
// Chapter 10 completes the core: the remaining operators (% and the bitwise ones, ++ and --,
// every compound assignment), for, for...of, switch, break and continue, several
// declarations in one statement, console.log of several values, and automatic semicolon
// insertion. Most of these become constructs the later passes already know:
//   x op= e              x = x op e
//   ++x, x++             x = x + 1, and (x = x + 1) - 1 where the old value is used
//   for (i; c; u) s      { i; while (c) s, with u run before each next test }
//   for (const x of a)   { const #a = a; let #i = 0; while (#i < #a.length) { const x = #a[#i]; s } #i += 1 }
//   switch               a while loop that runs once, its cases as ifs (see switchStatement)
//   console.log(a, b)    const #p1 = a; const #p2 = b; then one Print per value
// Names with # cannot be written in JavaScript, so they never meet the program's own.
import { parseType } from './types.js';
import { $nat_id_char } from './idchar.js';   // (CJI-3: \p{ID_Start}, \p{ID_Continue} as a table)
import { MATH, MATH_CONSTANTS } from './math.js';
import { CompileError } from './utils.js';
import { compileRegex, REGEX_SOURCE } from './regex.js';
import { CLASSES, TYPED_KINDS } from './classes.js';
const TYPED_KINDS_SRC = TYPED_KINDS;
import { noteKeyOrder } from './types.js';

// ---- lexer --------------------------------------------------------------------------

// Longest first, so that `<=` is not read as `<` followed by `=`. `==` and `!=` are
// recognised only to reject them with a useful message.
const PUNCT = ['>>>=', '===', '!==', '<<=', '>>=', '>>>', '**=', '...', '??=', '||=', '&&=', '==', '!=', '<=', '>=', '=>', '&&', '||', '??', '?.', '++', '--',
  '**', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '(', ')', '{', '}', '[', ']', ';', ',', '.', '+', '-', '*', '/', '%', '&', '|', '^', '~', '=', '<', '>', '!', '?', ':'];

// Assignment operators and the arithmetic operator a compound one applies.
const ASSIGN = { '=': null, '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '&=': '&', '|=': '|', '^=': '^',
  '<<=': '<<', '>>=': '>>', '>>>=': '>>>', '**=': '**' };

export class SyntaxError_ extends Error {}

function fail(tok, msg) {
  throw new SyntaxError_(`${tok.line}:${tok.col}: ${msg}`);
}

// Chapter 13: one escape sequence starting at src[k] (a backslash): its text and where the
// rest begins.
// String.fromCodePoint in the subset: above U+FFFF, a surrogate pair; out of range, its RangeError
function fromCodePoint(cp) {
  if (!(cp >= 0 && cp <= 0x10ffff && Math.floor(cp) === cp)) throw new RangeError(`Invalid code point ${cp}`);
  if (cp < 0x10000) return String.fromCharCode(cp);
  const v = cp - 0x10000;
  return String.fromCharCode(0xd800 + (v >> 10)) + String.fromCharCode(0xdc00 + (v & 0x3ff));
}
function escape(src, k, at) {
  const c = src[k + 1];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', "'": "'", '"': '"', '\\': '\\', '`': '`', $: '$' };
  if (c === 'x') return [String.fromCharCode(parseInt(src.slice(k + 2, k + 4), 16)), k + 4];
  if (c === 'u' && src[k + 2] === '{') {
    const end = src.indexOf('}', k + 3);
    return [fromCodePoint(parseInt(src.slice(k + 3, end), 16)), end + 1];
  }
  if (c === 'u') return [String.fromCharCode(parseInt(src.slice(k + 2, k + 6), 16)), k + 6];
  if (c === '\n') return ['', k + 2];   // a line continuation
  if (simple[c] !== undefined && !(c === '0' && /[0-9]/.test(src[k + 2] ?? ''))) return [simple[c], k + 2];
  if (c === undefined) fail(at, 'unterminated string');
  return [c, k + 2];
}

// A string literal's text, from just after its opening quote; and the index of its closing one.
function stringBody(src, k, quote, at) {
  let text = '';
  for (;;) {
    if (k >= src.length || src[k] === '\n') fail(at, 'unterminated string');
    if (src[k] === quote) return [text, k];
    if (src[k] === '\\') {
      const [ch, next] = escape(src, k, at);
      text += ch;
      k = next;
    } else text += src[k++];
  }
}

// The } that closes the { at src[open], skipping strings and nested braces.
function matchingBrace(src, open, at) {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (c === "'" || c === '"') { k = stringBody(src, k + 1, c, at)[1]; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return k;
  }
  fail(at, 'unterminated ${ in a template');
}

const VALUE_ENDS = new Set([')', ']', '}', 'int', 'num', 'str', 'template', 'regex']);
const BEFORE_EXPRESSION = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'await', 'yield']);
function regexMayStart(prev) {
  if (!prev) return true;
  if (prev.t === 'name') return BEFORE_EXPRESSION.has(prev.v);
  if (prev.t === '}') return true;   // the end of a block (an object literal before / is rare)
  return !VALUE_ENDS.has(prev.t);
}

export function tokenize(src) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const adv = (n) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  let newline = false;   // a line break since the last token: automatic semicolon insertion needs it
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') newline = true;
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(1); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(1); continue; }
    // chapter 18: a regular expression literal, where an expression may start (not after
    // a value: there / divides)
    if (c === '/' && src[i + 1] !== '*' && regexMayStart(toks.at(-1))) {
      let k = i + 1, inClass = false;
      while (k < src.length && (src[k] !== '/' || inClass)) {
        if (src[k] === '\n') fail({ line, col }, 'unterminated regular expression');
        if (src[k] === '\\') k++;
        else if (src[k] === '[') inClass = true;
        else if (src[k] === ']') inClass = false;
        k++;
      }
      let e = k + 1;
      while (e < src.length && /[a-z]/.test(src[e])) e++;
      toks.push({ t: 'regex', v: { source: src.slice(i + 1, k), flags: src.slice(k + 1, e) }, line, col, nl: newline });
      newline = false;
      adv(e - i);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) fail({ line, col }, 'unterminated comment');
      if (src.slice(i, end).includes('\n')) newline = true;
      if (src[i + 2] === ':') toks.push({ t: 'type', v: src.slice(i + 3, end), line, col });
      adv(end + 2 - i);
      continue;
    }
    const at = { line, col, nl: newline };
    newline = false;
    if (c >= '0' && c <= '9') {
      // chapter 9: a number with a fraction or an exponent; one that is not a safe integer
      // is a double. Chapter 10: hexadecimal, binary and octal integers, and _ between digits.
      const m = /^0[xX][0-9a-fA-F_]+|^0[bB][01_]+|^0[oO][0-7_]+|^[\d_]+(\.[\d_]+)?([eE][+-]?\d+)?/.exec(src.slice(i));
      if (/[A-Za-z0-9_$]/.test(src[i + m[0].length] ?? '')) fail(at, `a malformed number`);
      const v = Number(m[0].replace(/_/g, ''));
      toks.push({ t: Number.isInteger(v) && Math.abs(v) <= 9007199254740991 ? 'int' : 'num', v, ...at });   // (a safe integer)
      adv(m[0].length);
      continue;
    }
    if (c === "'" || c === '"') {      // chapter 13: strings, with JavaScript's escapes
      const [value, end] = stringBody(src, i + 1, c, at);
      toks.push({ t: 'str', v: value, ...at });
      adv(end + 1 - i);
      continue;
    }
    if (c === '`') {                   // chapter 13: a template: text and ${ expressions }
      const quasis = [], exprs = [];
      let k = i + 1, text = '';
      for (;;) {
        if (k >= src.length) fail(at, 'unterminated template');
        if (src[k] === '`') break;
        if (src[k] === '$' && src[k + 1] === '{') {
          const end = matchingBrace(src, k + 1, at);
          quasis.push(text);
          text = '';
          exprs.push(src.slice(k + 2, end));
          k = end + 1;
          continue;
        }
        if (src[k] === '\\') {
          const [ch, next] = escape(src, k, at);
          text += ch;
          k = next;
          continue;
        }
        text += src[k++];
      }
      quasis.push(text);
      toks.push({ t: 'template', quasis, exprs, ...at });
      adv(k + 1 - i);
      continue;
    }
    if (/[A-Za-z_$]/.test(c) || (c > '\x7f' && $nat_id_char(c.charCodeAt(0), 0) === 1)) {   // (chapter 20: and Unicode letters, naïve)
      let j = i;
      while (j < src.length && (/[A-Za-z0-9_$]/.test(src[j]) || (src[j] > '\x7f' && $nat_id_char(src.charCodeAt(j), 1) === 1))) j++;
      toks.push({ t: 'name', v: src.slice(i, j), ...at });
      adv(j - i);
      continue;
    }
    // (CJI-3: ?. followed by a digit is ? and a number, as in a?.5:1)
    const p = PUNCT.find((q) => src.startsWith(q, i) && !(q === '?.' && /[0-9]/.test(src[i + 2] ?? '')));
    if (!p) fail(at, `unexpected character '${c}'`);
    toks.push({ t: p, ...at });
    adv(p.length);
  }
  toks.push({ t: 'eof', line, col });
  return toks;
}

// ---- parser -------------------------------------------------------------------------

// Words that cannot name a variable (JavaScript reserves many more; these are the ones the
// subsets use so far).
const RESERVED = new Set(['const', 'console', 'true', 'false', 'if', 'else', 'let', 'while', 'function', 'return',
  'typeof', 'null', 'undefined', 'for', 'of', 'switch', 'case', 'default', 'break', 'continue', 'do', 'var', 'void', 'Math',
  'NaN', 'Infinity', 'String', 'throw', 'try', 'catch', 'finally', 'new', 'Array', 'Promise', 'await', 'Number', 'JSON']);

// Binary operators: precedence (higher binds tighter) and the AST operator name. The
// numbers follow JavaScript's own table; `?:` binds loosest of all and is parsed separately.
const BINARY = {
  '??': { prec: 4, op: '??' },
  '||': { prec: 5, op: '||' },
  '&&': { prec: 6, op: '&&' },
  '|': { prec: 7, op: '|' },
  '^': { prec: 8, op: '^' },
  '&': { prec: 9, op: '&' },
  '<<': { prec: 12, op: '<<' },
  '>>': { prec: 12, op: '>>' },
  '>>>': { prec: 12, op: '>>>' },
  '%': { prec: 14, op: '%' },
  '===': { prec: 10, op: '===' },
  '!==': { prec: 10, op: '!==' },
  '==': { prec: 10, op: '==' },     // chapter 10: the type checker decides what they mean
  '!=': { prec: 10, op: '!=' },
  '**': { prec: 15, op: '**', right: true },
  '<': { prec: 11, op: '<' },
  '<=': { prec: 11, op: '<=' },
  '>': { prec: 11, op: '>' },
  '>=': { prec: 11, op: '>=' },
  '+': { prec: 13, op: '+' },
  '/': { prec: 14, op: '/' },
  '-': { prec: 13, op: '-' },
  '*': { prec: 14, op: '*' },
};

class Parser {
  constructor(src) {
    this.toks = tokenize(src);
    this.k = 0;
    this.targets = [];   // enclosing loops and switches, innermost last: { label, loop, name }
    this.userLabel = null;   // the source's label (outer:) for the loop about to be parsed
    this.fresh = 0;
    this.core = new Set();   // chapter 17: library functions the program uses (CORE_SOURCE)
    this.lateCore = new Set();   // (CJI-3: those that a ${ } in a template uses: after the others)
    this.useDate = () => DATE_NAMES.forEach((n) => this.core.add(n));   // chapter 21
    // CJI-3: the classes the source declares, found first, since new C() may come before class C:
    // name -> true for one that extends Error
    this.classes = new Map();
    for (let i = 0; i + 1 < this.toks.length; i++) {
      const t = this.toks[i], n = this.toks[i + 1];
      if (t.t === 'name' && t.v === 'class' && n.t === 'name')
        this.classes.set(n.v, this.toks[i + 2]?.v === 'extends' && this.toks[i + 3]?.v === 'Error');
    }
    this.classSelf = null;   // in a class's constructor or method, the name `this` stands for
  }

  // CJI-3 (no comma operator in the subset): = e in a pattern, or null; the arguments after (
  defaultValue() {
    if (!this.at('=')) return null;
    this.next();
    return this.assignment();
  }
  argsToParen() {
    if (!this.at(')')) return this.argList();
    this.next();
    return [];
  }

  // A statement ends at ;, or where JavaScript inserts one: before a line break, a }, or
  // the end of the file.
  semi() {
    if (this.at(';')) { this.next(); return; }
    const tok = this.peek();
    if (this.inArrow && [')', ',', ']'].includes(tok.t)) return;   // the end of an arrow's body
    if (tok.nl || tok.t === '}' || tok.t === 'eof') return;
    fail(tok, `expected ;, found ${tok.v ?? tok.t}`);
  }

  name(prefix) { return `#${prefix}${++this.fresh}`; }

  // Statements, where one statement of the source may be several (const a = 1, b = 2).
  push(list, s) {
    if (Array.isArray(s)) list.push(...s);
    else list.push(s);
  }

  // The body of a loop or switch, with its label as the target of break (and continue).
  // A labelled loop (outer: for ...) is also found by its source name.
  withTarget(label, loop, parse) {
    const name = loop ? this.userLabel : null;
    this.userLabel = null;
    this.targets.push({ label, loop, name });
    try { return parse(); } finally { this.targets.pop(); }
  }
  peek(n = 0) { return this.toks[this.k + n]; }
  next() { return this.toks[this.k++]; }
  at(t, v) { const tok = this.peek(); return tok.t === t && (v === undefined || tok.v === v); }
  expect(t, v) {
    const tok = this.next();
    if (tok.t !== t || (v !== undefined && tok.v !== v)) fail(tok, `expected ${v ?? t}, found ${tok.v ?? tok.t}`);
    return tok;
  }

  program() {
    const body = [];
    while (!this.at('eof')) this.push(body, this.funAhead() ? this.funDef() : this.at('name', 'class') ? this.classDef() : this.statement());
    return Program(body);
  }

  // A type comment, required where the subset needs a type until chapter 10 infers them.
  // Chapter 9: a type comment may be left out; the type is then Any.
  typeAnnotation(what) {
    const tok = this.peek();
    if (tok.t !== 'type') return 'Any';
    this.next();
    try {
      return parseType(tok.v);
    } catch (e) {
      if (e instanceof CompileError) fail(tok, e.message);
      throw e;
    }
  }

  // CJI-3: class C { x = e; constructor(a) { ... } m(b) { ... } }, as a function C$new(a) that
  // makes the instance: a record holding a brand ($class$C, for instanceof), the fields with their
  // initial values, and the methods, as arrows over the instance (the name $this$C, which `this`
  // stands for in them); then runs the constructor's body and returns the instance. A method is
  // the instance's own field (Object.keys shows it, as it shows the brand). class E extends Error {}
  // is a kind of Error: new E(m) is an Error record (chapter 14) with the brand. Getters, setters,
  // static members, computed names and extends of anything else are refused.
  classDef() {
    this.next();
    const name = this.expect('name');
    if (RESERVED.has(name.v)) fail(name, `'${name.v}' cannot be used as a name`);
    if (this.at('name', 'extends')) {
      this.next();
      const base = this.expect('name');
      if (base.v !== 'Error') fail(base, `a class may extend only Error in this subset, not ${base.v}`);
      this.expect('{');
      if (!this.at('}')) fail(this.peek(), 'a class that extends Error has no members in this subset');
      this.next();
      return [];   // (new E(m) makes the record; the declaration leaves nothing behind)
    }
    this.expect('{');
    const self = `$this$${name.v}`, fields = [{ name: `$class$${name.v}`, exp: Bool(true) }];
    let ctor = null;
    const outerSelf = this.classSelf;
    while (!this.at('}')) {
      if (this.at(';')) { this.next(); continue; }
      const key = this.peek();
      if (key.t !== 'name') fail(key, `a class member must be a name in this subset, found ${key.v ?? key.t}`);
      const next = this.peek(1);
      if (['get', 'set', 'static', 'async'].includes(key.v) && next.t !== '(' && next.t !== '=' && next.t !== ';')
        fail(key, `a ${key.v} member is not in the subset`);
      this.next();
      if (fields.some((f) => f.name === key.v) || (key.v === 'constructor' && ctor))
        fail(key, `the member ${key.v} appears twice`);
      if (this.at('(')) {   // a method, or the constructor
        this.classSelf = self;
        const f = this.methodFunction(`${name.v}.${key.v}`);
        this.classSelf = outerSelf;
        if (key.v === 'constructor') ctor = f;
        else fields.push({ name: key.v, exp: f });
        continue;
      }
      // a field, with its initial value (which may not use this) or undefined
      let init = AnyLit(undefined);
      if (this.at('=')) {
        this.next();
        this.classSelf = null;
        init = this.assignment();
        this.classSelf = outerSelf;
      }
      this.semi();
      fields.push({ name: key.v, exp: init });
    }
    this.next();
    // the constructor's body runs in an arrow of its own when it may return early
    const ctorBody = ctor ? ctor.body : [];
    const run = !ctor ? [] : hasReturn(ctorBody)
      ? [ExprStmt(Call({ ...Lambda([], 'Any', ctorBody), inferRet: true }, []))] : ctorBody;
    const params = ctor ? ctor.params : [];
    return { ...FunDef(`${name.v}$new`, params, 'Any', [Const(self, this.recordOf(fields, [])), ...run, Return(Var(self))]), inferRet: true };
  }

  // A record literal's node: its fields, then the computed ones set by key. (CJI-3: past an object
  // header's 28 fields, the rest are set after the first 28, as computed keys are.)
  recordOf(fields, computed) {
    if (fields.length > 28) {
      computed = [...fields.slice(28).map((f) => [Str(f.name), f.exp]), ...computed];
      fields = fields.slice(0, 28);
    }
    if (computed.length) this.core.add('$setIn');
    noteKeyOrder(fields.map((f) => f.name));
    return computed.reduce((o, [k, v]) => Call(Var('$setIn'), [o, k, v]), Record(fields));
  }

  // A method's (or a constructor's) parameters and body, as an arrow's
  methodFunction(what) {
    this.expect('(');
    const params = [], unpack = [];
    while (!this.at(')')) {
      const info = {};
      const p = this.param(unpack, info);
      const untyped = !this.at('type');
      params.push({ name: p, type: this.typeAnnotation(`parameter ${p}`), untyped, ...(untyped ? { inferred: true } : {}), ...(info.rest ? { rest: true } : {}) });
      if (!this.at(')')) this.expect(',');
    }
    this.next();
    const retType = this.at('type') ? this.typeAnnotation(what) : null;
    const body = [...unpack, ...this.functionBody()];
    return { ...Lambda(params.map(strip), retType ?? 'Any', body), ...(retType === null ? { inferRet: true } : {}) };
  }

  // chapter 16: async function f(...) too
  funAhead() { return this.at('name', 'function') || (this.at('name', 'async') && this.peek(1).t === 'name' && this.peek(1).v === 'function'); }

  funDef() {
    const async = this.at('name', 'async');
    if (async) this.next();
    this.next();
    const name = this.expect('name').v;
    if (RESERVED.has(name)) fail(this.peek(), `'${name}' cannot be used as a name`);
    this.expect('(');
    const params = [], unpack = [];
    while (!this.at(')')) {
      const info = {};
      const p = this.param(unpack, info);
      // chapter 11: a parameter or result without a type comment is inferred
      const inferred = !this.at('type');
      params.push({ name: p, type: this.typeAnnotation(`parameter ${p}`), ...(inferred ? { inferred } : {}), ...(info.rest ? { rest: true } : {}) });
      if (!this.at(')')) this.expect(',');
    }
    this.next();
    const inferRet = !this.at('type');
    const retType = this.typeAnnotation(`function ${name}`);
    const outer = this.inAsync, outerSelf = this.classSelf;
    this.inAsync = async;
    this.classSelf = null;   // (CJI-3: a function declaration's this is not the class's)
    const body = [...unpack, ...this.functionBody()];
    this.inAsync = outer;
    this.classSelf = outerSelf;
    return { ...FunDef(name, params, async ? 'Any' : retType, body), ...(inferRet && !async ? { inferRet } : {}), ...(async ? { async } : {}) };
  }

  // A parameter: a name, or (chapter 16) a pattern, which becomes a parameter of its own
  // and declarations at the start of the body; (chapter 17) with a default value, or ...rest.
  param(unpack, info = {}) {
    if (this.at('...')) { this.next(); info.rest = true; }
    let name;
    if (this.at('{') || this.at('[')) {
      const pat = this.pattern();
      name = this.name('arg');
      if (this.at('=')) { this.next(); const d = this.assignment(); unpack.push(this.defaulted(name, d)); }
      unpack.push(...this.bind(pat, Var(name), 'let'));
      return name;
    }
    const tok = this.expect('name');
    if (RESERVED.has(tok.v)) fail(tok, `'${tok.v}' cannot be used as a name`);
    name = tok.v;
    if (this.at('=') && !this.at('type')) { this.next(); unpack.push(this.defaulted(name, this.assignment())); }
    return name;
  }
  // if (x === undefined) x = d, for a parameter's default
  defaulted(name, d) { return IfStmt(Prim('is_undefined', [Var(name)]), ExprStmt(SetExp(name, d)), null); }

  // Chapter 17: a destructuring pattern: a name, [p, , q = d, ...r] or { a, b: p, c = d }.
  pattern() {
    if (this.at('[')) {
      this.next();
      const elems = [];
      let rest = null;
      while (!this.at(']')) {
        if (this.at(',')) { this.next(); elems.push(null); continue; }
        if (this.at('...')) { this.next(); rest = this.pattern(); break; }
        const pat = this.pattern();
        const dflt = this.defaultValue();
        elems.push({ pat, dflt });
        if (!this.at(']')) this.expect(',');
      }
      this.expect(']');
      return { kind: 'PatArr', elems, rest };
    }
    if (this.at('{')) {
      this.next();
      const props = [];
      let rest = null;
      while (!this.at('}')) {
        // chapter 22: { a, ...rest }, the other properties in a new object
        if (this.at('...')) { this.next(); rest = this.pattern(); if (rest.kind !== 'PatName') fail(this.peek(), 'a rest property must be a name'); break; }
        const key = this.next();
        if (key.t !== 'name' && key.t !== 'str') fail(key, 'a property name must be a name or a string');
        let pat = { kind: 'PatName', name: key.v };
        if (this.at(':')) { this.next(); pat = this.pattern(); }
        const dflt = this.defaultValue();
        props.push({ key: key.v, pat, dflt });
        if (!this.at('}')) this.expect(',');
      }
      this.expect('}');
      return { kind: 'PatObj', props, rest };
    }
    const tok = this.expect('name');
    if (RESERVED.has(tok.v)) fail(tok, `'${tok.v}' cannot be used as a name`);
    return { kind: 'PatName', name: tok.v };
  }

  // The statements that bind a pattern to a value: kind 'const' or 'let' declares, 'set'
  // assigns (a pattern target may then also be an element or a property). The value is
  // computed once, into a temporary; a default replaces only undefined.
  bind(pat, value, kind) {
    const decl = (name, v) => (kind === 'set' ? ExprStmt(SetExp(name, v)) : (kind === 'const' ? Const : Let)(name, v));
    switch (pat.kind) {
      case 'PatName': return [decl(pat.name, value)];
      case 'PatTarget': return [this.exprStmt(this.assign(this.peek(), pat.target, null, value))];
      case 'PatArr':
      case 'PatObj': {
        const t = this.name('pat');
        const out = [Const(t, value)];
        const one = (sub, v, dflt) => {
          if (!dflt) return out.push(...this.bind(sub, v, kind));
          const d = this.name('dflt');
          out.push(Const(d, v), ...this.bind(sub, If(Prim('is_undefined', [Var(d)]), dflt, Var(d)), kind));
        };
        if (pat.kind === 'PatArr') {
          // an element with a default may be missing: then the default (JavaScript reads
          // undefined there; the subset's arrays have no undefined to read)
          pat.elems.forEach((el, k) => {
            if (!el) return;
            if (!el.dflt) { one(el.pat, Index(Var(t), Int(k)), null); return; }
            const at = Index(Var(t), Int(k));
            out.push(...this.bind(el.pat, If(Prim('<', [Int(k), Prim('length', [Var(t)])]),
              If(Prim('is_undefined', [at]), el.dflt, at), el.dflt), kind));
          });
          if (pat.rest) out.push(...this.bind(pat.rest, MethodCall(Var(t), 'slice', [Int(pat.elems.length)]), kind));
        } else {
          for (const pr of pat.props) one(pr.pat, Get(Var(t), pr.key), pr.dflt);
          if (pat.rest) {   // chapter 22: Object$rest, the properties the pattern did not name
            this.core.add('Object$rest');
            out.push(...this.bind(pat.rest, Call(Var('Object$rest'), [Var(t), ArrayLit(pat.props.map((pr) => Str(pr.key)))]), kind));
          }
        }
        return out;
      }
      default: throw new Error(`bind: ${pat.kind}`);
    }
  }
  // An array or object literal on the left of =, as a pattern of assignment targets.
  toPattern(e, start) {
    if (e.kind === 'Var') return { kind: 'PatName', name: e.name };
    if (e.kind === 'Index' || e.kind === 'Get') return { kind: 'PatTarget', target: e };
    if (e.kind === 'ArrayLit') {
      return { kind: 'PatArr', elems: e.elems.map((x) => (x.kind === 'Hole' ? null : x.kind === 'Spread' ? null : { pat: this.toPattern(x, start), dflt: null })),
        rest: e.elems.at(-1)?.kind === 'Spread' ? this.toPattern(e.elems.at(-1).arg, start) : null };
    }
    if (e.kind === 'Record') return { kind: 'PatObj', props: e.fields.map((f) => ({ key: f.name, pat: this.toPattern(f.exp, start), dflt: null })) };
    fail(start, 'only names, elements and properties can be assigned by a pattern');
  }

  // { stmt* }, where function declarations may appear among the statements (chapter 8).
  functionBody() {
    this.expect('{');
    const body = [];
    const outer = this.inFunction;
    this.inFunction = true;
    const targets = this.targets;
    this.targets = [];                 // break and continue do not cross a function
    while (!this.at('}')) this.push(body, this.funAhead() ? this.funDef() : this.at('name', 'class') ? this.classDef() : this.statement());
    this.targets = targets;
    this.inFunction = outer;
    this.next();
    return body;
  }

  // Is the ( here the start of an arrow function's parameters? It is if it is followed by
  // ) or by a name with a type comment, or by a name and a comma, or by a name, ) and =>.
  arrowAhead() {
    const t1 = this.peek(1), t2 = this.peek(2), t3 = this.peek(3);
    if (t1.t === ')') return true;
    if (t1.t === 'name' && t2.t === 'type') return true;
    if (t1.t === 'name' && (t2.t === ',' || (t2.t === ')' && t3.t === '=>'))) return true;
    // chapter 16: a parameter list with an object pattern: is the matching ) followed by =>?
    let depth = 0;
    for (let k = 0; ; k++) {
      const t = this.peek(k);
      if (t.t === 'eof') return false;
      if (t.t === '(' || t.t === '{' || t.t === '[') depth++;
      if (t.t === ')' || t.t === '}' || t.t === ']') depth--;
      if (depth === 0) return this.peek(k + 1).t === '=>';
    }
  }

  arrow(async = false) {
    this.expect('(');
    const params = [], unpack = [];
    while (!this.at(')')) {
      const info = {};
      const p = this.param(unpack, info);
      const untyped = !this.at('type');
      params.push({ name: p, type: this.typeAnnotation(`parameter ${p}`), untyped, ...(untyped ? { inferred: true } : {}), ...(info.rest ? { rest: true } : {}) });
      if (!this.at(')')) this.expect(',');
    }
    this.next();
    const retType = this.at('type') ? this.typeAnnotation('an arrow function') : null;
    return this.arrowBody(params, retType, async, unpack);
  }

  // Without a result type, an arrow with a block body returns Any, and so does one whose
  // parameters all lack types (it is a dynamic function); otherwise the result type is the
  // body's (a null retType).
  arrowBody(params, retType, async = false, unpack = []) {
    this.expect('=>');
    const outer = this.inAsync;
    this.inAsync = async;
    try {
      // chapter 16: an async arrow returns a promise, which is dynamic
      if (async) {
        const body = this.at('{') ? this.functionBody() : [Return(this.assignment())];
        return { ...Lambda(params.map(strip), 'Any', [...unpack, ...body]), async: true };
      }
      const inferRet = retType === null ? { inferRet: true } : {};   // chapter 11
      if (this.at('{')) return { ...Lambda(params.map(strip), retType ?? 'Any', [...unpack, ...this.functionBody()]), ...inferRet };
      const untyped = params.length > 0 && params.every((q) => q.untyped);
      // chapter 16: () => console.log(x), a statement as the body, whose value is undefined
      if (this.at('name', 'console')) {
        this.inArrow = true;
        const print = this.statement();
        this.inArrow = false;
        return { ...Lambda(params.map(strip), retType ?? 'Any', [...unpack, ...(Array.isArray(print) ? print : [print]), Return(AnyLit(undefined))]), ...inferRet };
      }
      return { ...Lambda(params.map(strip), retType ?? (untyped ? 'Any' : null), [...unpack, Return(this.assignment())]), ...inferRet };
    } finally {
      this.inAsync = outer;
    }
  }

  // const a = 1, b = 2 (chapter 10: several in one statement; let x; is let x = undefined)
  // chapter 10: var is let here. JavaScript hoists a var to the top of its function; a
  // program that uses one before its declaration is outside the subset, and the rest
  // behave the same either way.
  declarations() {
    const kw = this.next().v === 'const' ? 'const' : 'let', out = [];
    do {
      if (this.at('[') || this.at('{')) {   // chapter 17: const [a, b] = e, const { a, b } = e
        const pat = this.pattern();
        this.expect('=');
        out.push(...this.bind(pat, this.assignment(), kw));
        continue;
      }
      const tok = this.expect('name'), name = tok.v;
      if (RESERVED.has(name)) fail(tok, `'${name}' cannot be used as a name`);
      // chapter 9: a declaration may give its variable a type, let x /*: Any */ = 0;
      const declared = this.at('type') ? this.typeAnnotation(`${kw} ${name}`) : undefined;
      if (!this.at('=')) {
        if (kw === 'const') fail(this.peek(), `const ${name} needs an initializer`);
        out.push({ ...Let(name, AnyLit(undefined), declared ?? 'Any'), noInit: true });
        continue;
      }
      this.next();
      out.push((kw === 'const' ? Const : Let)(name, this.assignment(), declared));
    } while (this.at(',') && this.next());
    return out;
  }

  // An expression used as a statement: x++ there needs no old value.
  exprStmt(e) {
    if (e.kind === 'PatAssign') return Block(e.stmts);   // chapter 17
    return ExprStmt(e.postfix ? e.update : e);
  }

  statement() {
    if (this.at('name', 'console')) {
      const start = this.next();
      this.expect('.');
      this.expect('name', 'log');
      this.expect('(');
      const args = [];
      while (!this.at(')')) {
        args.push(this.assignment());
        if (!this.at(')')) this.expect(',');
      }
      this.next();
      this.semi();
      if (args.length === 0) fail(start, 'console.log needs a value in this subset');
      if (args.length === 1) return Print(args[0]);
      // every value first, as JavaScript evaluates them, then the line
      const names = args.map(() => this.name('log'));
      return [...args.map((a, k) => Const(names[k], a)),
        ...names.map((x, k) => Print(Var(x), undefined, k < names.length - 1 ? ' ' : undefined))];
    }
    if (this.at('name', 'const') || this.at('name', 'let') || this.at('name', 'var')) {
      const ds = this.declarations();
      this.semi();
      return ds.length === 1 ? ds[0] : ds;
    }
    if (this.at('name', 'while')) {
      this.next();
      this.expect('(');
      const cond = this.assignment();
      this.expect(')');
      const label = this.name('loop');
      return While(cond, this.withTarget(label, true, () => this.branch()), null, label);
    }
    if (this.at('name', 'for')) return this.forStatement();
    // chapter 14: throw e; try { } catch (e) { } finally { }
    if (this.at('name', 'throw')) {
      const tok = this.next();
      if (this.peek().nl) fail(tok, 'throw needs its value on the same line');
      const e = this.assignment();
      this.semi();
      return Throw(e);
    }
    if (this.at('name', 'try')) {
      const tok = this.next();
      if (!this.at('{')) fail(this.peek(), 'try needs a block');
      const body = this.statement();
      let handler = null, finalizer = null;
      if (this.at('name', 'catch')) {
        this.next();
        let param = null;
        if (this.at('(')) {
          this.next();
          param = this.expect('name');
          if (RESERVED.has(param.v)) fail(param, `'${param.v}' cannot be used as a name`);
          this.expect(')');
        }
        if (!this.at('{')) fail(this.peek(), 'catch needs a block');
        const block = this.statement();
        // the caught value is a variable of the handler's block
        handler = param ? Block([Let(param.v, Caught()), ...block.body]) : block;
      }
      if (this.at('name', 'finally')) {
        this.next();
        if (!this.at('{')) fail(this.peek(), 'finally needs a block');
        finalizer = this.statement();
      }
      if (!handler && !finalizer) fail(tok, 'try needs a catch or a finally');
      return Try(body, handler, finalizer);
    }
    if (this.at(';')) {   // the empty statement
      this.next();
      return Block([]);
    }
    if (this.at('name', 'do')) {
      // do s while (c) runs s before the first test: a while (true) loop whose update is
      // the test, if (!c) break, so that continue also goes to the test.
      this.next();
      const label = this.name('loop');
      const body = this.withTarget(label, true, () => this.branch());
      this.expect('name', 'while');
      this.expect('(');
      const cond = this.assignment();
      this.expect(')');
      if (this.at(';')) this.next();   // JavaScript inserts the ; after do-while's ) anyway
      return While(Bool(true), body, IfStmt(Prim('!', [cond]), Break(label), null), label);
    }
    // name: before a loop labels it, for break name and continue name inside
    if (this.at('name') && this.peek(1).t === ':' && !RESERVED.has(this.peek().v)) {
      const tok = this.next();
      this.next();
      if (!this.at('name', 'while') && !this.at('name', 'for'))
        fail(tok, 'only a loop can be labelled in this subset');
      if (this.targets.some((t) => t.name === tok.v)) fail(tok, `the label ${tok.v} is already in use`);
      this.userLabel = tok.v;
      return this.statement();
    }
    if (this.at('name', 'switch')) return this.switchStatement();
    if (this.at('name', 'break') || this.at('name', 'continue')) {
      const tok = this.next();
      let target;
      if (this.at('name') && !this.peek().nl) {   // break name, continue name
        const name = this.next();
        target = this.targets.find((t) => t.name === name.v);
        if (!target) fail(name, `no enclosing loop is labelled ${name.v}`);
      } else {
        target = [...this.targets].reverse().find((t) => tok.v === 'break' || t.loop);
        if (!target) fail(tok, `${tok.v} outside a loop${tok.v === 'break' ? ' or switch' : ''}`);
      }
      this.semi();
      return tok.v === 'break' ? Break(target.label) : Continue(target.label);
    }
    if (this.at('name', 'function'))
      fail(this.peek(), 'a function declaration must be at the top level of the program or of a function body in this subset');
    if (this.at('name', 'return')) {
      const tok = this.next();
      if (!this.inFunction) fail(tok, 'return outside a function');
      // chapter 9: return; is return undefined; chapter 10: so is return before a line break
      const bare = this.at(';') || this.at('}') || this.peek().nl;
      const e = bare ? AnyLit(undefined) : this.assignment();
      this.semi();
      return Return(e);
    }
    if (this.at('name', 'if')) {
      this.next();
      this.expect('(');
      const cond = this.assignment();
      this.expect(')');
      const thn = this.branch();
      let els = null;
      if (this.at('name', 'else')) {
        this.next();
        els = this.branch();
      }
      return IfStmt(cond, thn, els);
    }
    if (this.at('{')) {
      this.next();
      const body = [];
      while (!this.at('}')) this.push(body, this.statement());
      this.next();
      return Block(body);
    }
    if (this.at('name') && !RESERVED.has(this.peek().v)) {   // an assignment statement
      const start = this.peek();
      const e = this.assignment();
      this.semi();   // chapter 10: any expression may be a statement; its value is dropped
      return this.exprStmt(e);
    }
    // chapter 10: any other expression as a statement: ++x, (f)(), -x, a literal
    if (['++', '--', '(', '-', '+', '!', '~', 'int', 'num', '[', 'str', 'template'].includes(this.peek().t) || this.at('name')) {
      const e = this.assignment();
      this.semi();
      return this.exprStmt(e);
    }
    fail(this.peek(), 'expected a statement');
  }

  // const <pattern> of: scan to the matching bracket of a pattern
  forOfAhead() {
    let k = 1, depth = 0;
    for (;; k++) {
      const t = this.peek(k);
      if (t.t === 'eof') return false;
      if (t.t === '[' || t.t === '{') depth++;
      if (t.t === ']' || t.t === '}') depth--;
      if (depth === 0) break;
    }
    const after = this.peek(k + 1);
    return after.t === 'name' && after.v === 'of';
  }

  // for (init; test; update) body, and for (const x of a) body
  forStatement() {
    const start = this.next();
    this.expect('(');
    const label = this.name('loop');
    if ((this.at('name', 'const') || this.at('name', 'let')) && this.forOfAhead()) {
      const kw = this.next().v;
      const pat = this.pattern();   // chapter 17: for (const [k, v] of pairs)
      this.expect('name', 'of');
      const a = this.assignment();
      this.expect(')');
      const arr = this.name('of'), i = this.name('i');
      const body = this.withTarget(label, true, () => this.branch());
      // (chapter 22: through $items, which instantiate_library makes the array itself, a
      // string itself, or a library class's items: a Map's entries, a Set's values)
      return Block([Const(arr, MethodCall(a, '$items', [])), Let(i, Int(0)),
        While(Prim('<', [Var(i), Prim('length', [Var(arr)])]),
          Block([...this.bind(pat, Index(Var(arr), Var(i)), kw), body]),
          ExprStmt(SetExp(i, Prim('+', [Var(i), Int(1)]))), label)]);
    }
    if (this.at('name', 'of') || (this.peek(1).t === 'name' && this.peek(1).v === 'in') || (this.peek(2).t === 'name' && this.peek(2).v === 'in'))
      fail(start, 'this kind of for loop is not in the subset: use for (;;) or for (const x of a)');
    let init = [];
    if (this.at('name', 'const') || this.at('name', 'let') || this.at('name', 'var')) {
      // a closure must not capture these: JavaScript gives each iteration its own copy
      // (except of a var, which the whole function shares, as a closure does here)
      const shared = this.at('name', 'var');
      init = this.declarations().map((d) => ({ ...d, forInit: !shared }));
    } else if (!this.at(';')) {
      init = [this.exprStmt(this.assignment())];
    }
    this.expect(';');
    const cond = this.at(';') ? Bool(true) : this.assignment();
    this.expect(';');
    // the update may be several expressions separated by commas: i++, j--
    const updates = [];
    while (!this.at(')')) {
      if (updates.length) this.expect(',');
      updates.push(this.exprStmt(this.assignment()));
    }
    const update = updates.length === 0 ? null : updates.length === 1 ? updates[0] : Block(updates);
    this.expect(')');
    const body = this.withTarget(label, true, () => this.branch());
    return Block([...init, While(cond, body, update, label)]);
  }

  // switch (d) { case v0: s0 ... default: sk ... } becomes
  //   const #sw = d;
  //   const #k = #sw === v0 ? 0 : #sw === v1 ? 1 : ... : (the index of default, or n);
  //   while (true) { if (#k <= 0) { s0 } if (#k <= 1) { s1 } ... break; }
  // Each clause runs when the matching one is it or an earlier one: falling through, until
  // a break, which leaves the loop. With a default, #k is at most n - 1, so the last clause
  // needs no test. continue inside still names the enclosing loop.
  switchStatement() {
    this.next();
    this.expect('(');
    const disc = this.assignment();
    this.expect(')');
    this.expect('{');
    const label = this.name('switch'), d = this.name('sw'), k = this.name('k');
    const clauses = this.withTarget(label, false, () => {
      const out = [];
      while (!this.at('}')) {
        const tok = this.next();
        let test = null;
        if (tok.t === 'name' && tok.v === 'case') test = this.assignment();
        else if (!(tok.t === 'name' && tok.v === 'default')) fail(tok, 'expected case or default');
        this.expect(':');
        const body = [];
        while (!this.at('}') && !this.at('name', 'case') && !this.at('name', 'default')) this.push(body, this.statement());
        out.push({ test, body });
      }
      return out;
    });
    this.next();
    const di = clauses.findIndex((c) => c.test === null);
    let select = Int(di >= 0 ? di : clauses.length);
    for (let j = clauses.length - 1; j >= 0; j--)
      if (clauses[j].test) select = If(Prim('===', [Var(d), clauses[j].test]), Int(j), select);
    const ifs = clauses.map((c, j) => (di >= 0 && j === clauses.length - 1
      ? Block(c.body) : IfStmt(Prim('<=', [Var(k), Int(j)]), Block(c.body), null)));
    return Block([Const(d, disc), Const(k, select), While(Bool(true), Block([...ifs, Break(label)]), null, label)]);
  }

  // The body of an if or else. JavaScript forbids a bare declaration here
  // (`if (c) const x = 1;` is a SyntaxError): its scope would be the statement alone.
  branch() {
    if (this.at('name', 'const') || this.at('name', 'let') || this.at('name', 'var'))
      fail(this.peek(), 'a declaration cannot be the body of if, else or while; use a block');
    const s = this.statement();
    return Array.isArray(s) ? Block(s) : s;
  }

  // target = exp (and +=, -=, *=), right-associative and looser than everything else. The
  // target is a variable or an element a[i].
  assignment() {
    const start = this.peek();
    const left = this.conditional();
    // CJI-3: a ??= e, a ||= e, a &&= e assign only when a is nullish, falsy or truthy: they are
    // a ?? (a = e), a || (a = e), a && (a = e), with a's object or index evaluated once
    const logical = { '??=': '??', '||=': '||', '&&=': '&&' }[this.peek().t];
    if (logical) {
      this.next();
      return this.logicalAssign(start, left, logical, this.assignment());
    }
    if (ASSIGN[this.peek().t] === undefined) return left;
    const op = ASSIGN[this.next().t];
    return this.assign(start, left, op, this.assignment());
  }

  logicalAssign(start, left, op, e) {
    const simple = (x) => x.kind === 'Var' || x.kind === 'Int' || x.kind === 'Str';
    if (left.kind === 'Var') return Prim(op, [left, SetExp(left.name, e)]);
    if (left.kind === 'Get' && left.obj.kind === 'Var') return Prim(op, [left, SetProp(left.obj, left.name, e)]);
    if (left.kind === 'Get') {   // ((o) => o.f op (o.f = e))(obj)
      const o = this.name('lgo');
      return Call(Lambda([{ name: o, type: 'Any', untyped: true, inferred: true }], null, [Return(Prim(op, [Get(Var(o), left.name), SetProp(Var(o), left.name, e)]))]), [left.obj]);
    }
    if (left.kind === 'Index' && simple(left.arr) && simple(left.idx)) return Prim(op, [left, SetIndex(left.arr, left.idx, e)]);
    if (left.kind === 'Index') {
      const a = this.name('lga'), i = this.name('lgi');
      return Call(Lambda([{ name: a, type: 'Any', untyped: true, inferred: true }, { name: i, type: 'Any', untyped: true, inferred: true }], null,
        [Return(Prim(op, [Index(Var(a), Var(i)), SetIndex(Var(a), Var(i), e)]))]), [left.arr, left.idx]);
    }
    fail(start, 'only a variable, an array element or a property can be assigned');
  }

  // target = e, or target = target op e (chapter 10: every compound assignment becomes the
  // plain one here, so later passes see only =). JavaScript reads the target before it
  // evaluates e, and so does target op e.
  assign(start, left, op, e) {
    if (left.kind === 'Var') return SetExp(left.name, op ? Prim(op, [left, e]) : e);
    if (left.kind === 'Index') {
      // a[i] += e reads a[i] and then stores to it; that is a[i] = a[i] + e only if a and i
      // are evaluated once, so anything but a name or a literal goes through a lambda's parameters
      const simple = (x) => x.kind === 'Var' || x.kind === 'Int' || x.kind === 'Str';
      if (op && !(simple(left.arr) && simple(left.idx))) {   // chapter 19: ((a, i) => a[i] = a[i] op e)(arr, idx)
        const a = this.name('cmpa'), i = this.name('cmpi');
        return Call(Lambda([{ name: a, type: 'Any', untyped: true, inferred: true }, { name: i, type: 'Any', untyped: true, inferred: true }], null,
          [Return(SetIndex(Var(a), Var(i), Prim(op, [Index(Var(a), Var(i)), e])))]), [left.arr, left.idx]);
      }
      return SetIndex(left.arr, left.idx, op ? Prim(op, [Index(left.arr, left.idx), e]) : e);
    }
    if (left.kind === 'Get') {   // chapter 13: o.f = e, and o.f += e for a variable o
      if (op && left.obj.kind !== 'Var') {   // chapter 19: ((o) => o.f = o.f op e)(obj)
        const o = this.name('cmpo');
        return Call(Lambda([{ name: o, type: 'Any', untyped: true, inferred: true }], null, [Return(SetProp(Var(o), left.name, Prim(op, [Get(Var(o), left.name), e])))]), [left.obj]);
      }
      return SetProp(left.obj, left.name, op ? Prim(op, [Get(left.obj, left.name), e]) : e);
    }
    if ((left.kind === 'ArrayLit' || left.kind === 'Record') && !op) {   // chapter 17: [a, b] = [b, a]
      return { kind: 'PatAssign', stmts: this.bind(this.toPattern(left, start), e, 'set') };
    }
    if (left.kind === 'Prim' && left.op === 'length') {   // chapter 15: a.length = n
      if (op && left.args[0].kind !== 'Var') fail(start, 'a compound assignment to a property needs a variable object');
      return SetProp(left.args[0], 'length', op ? Prim(op, [left, e]) : e);
    }
    fail(start, 'only a variable, an array element or a property can be assigned');
  }

  // ++x is x += 1, whose value is the new x. x++ has the old value: (x += 1) - 1, marked so
  // that a statement x++ can drop the subtraction.
  increment(start, target, op, post) {
    const update = this.assign(start, target, op === '++' ? '+' : '-', Int(1));
    if (!post) return update;
    return { ...Prim(op === '++' ? '-' : '+', [update, Int(1)]), postfix: true, update };
  }

  // exp ? exp : exp, right-associative, looser than every binary operator.
  conditional() {
    const cond = this.expression(0);
    if (!this.at('?')) return cond;
    this.next();
    const thn = this.assignment();
    this.expect(':');
    const els = this.assignment();
    return If(cond, thn, els);
  }

  // Precedence climbing: parse an expression whose operators all bind tighter than minPrec.
  expression(minPrec) {
    let left = this.unary();
    for (;;) {
      const t = this.peek().t;
      if (t === 'name' && this.peek().v === 'in' && 11 > minPrec) {   // chapter 19: k in o
        this.next();
        left = Prim('any_in', [left, this.expression(11)]);
        continue;
      }
      if (t === 'name' && this.peek().v === 'instanceof' && 11 > minPrec) {   // CJI-3: o instanceof C, by C's brand
        this.next();
        const cls = this.expect('name');
        if (!this.classes.has(cls.v)) fail(cls, `instanceof needs a class the program declares in this subset, not ${cls.v}`);
        this.core.add('$isInstance');
        left = Call(Var('$isInstance'), [Call(Var('$any'), [left]), Str(`$class$${cls.v}`)]);
        this.core.add('$any');
        continue;
      }
      const b = BINARY[t];
      if (!b || b.prec <= minPrec) return left;
      const tok = this.next();
      // equal precedence stays outside: left-associative; ** is right-associative
      const right = this.expression(b.right ? b.prec - 1 : b.prec);
      left = typeofTest(tok, b.op, left, right) ?? Prim(b.op, [left, right]);
    }
  }

  unary() {
    if (this.at('name', 'await')) {   // chapter 16
      const tok = this.next();
      if (!this.inAsync) fail(tok, 'await outside an async function');
      return Await(this.unary());
    }
    if (this.at('++') || this.at('--')) {
      const tok = this.next();
      return this.increment(tok, this.unary(), tok.t, false);
    }
    if (this.at('~')) {
      this.next();
      return Prim('~', [this.unary()]);
    }
    if (this.at('-')) {
      this.next();
      return Prim('neg', [this.unary()]);
    }
    if (this.at('+')) {   // chapter 10: +e is a number: e itself for a number, e * 1 otherwise
      this.next();
      const e = this.unary();
      return e.kind === 'Int' || e.kind === 'Num' ? e : Prim('*', [e, Int(1)]);
    }
    if (this.at('!')) {
      this.next();
      return Prim('!', [this.unary()]);
    }
    if (this.at('name', 'void')) {   // chapter 10: void e is undefined, after e
      const tok = this.next();
      const e = this.unary();
      if (!['Int', 'Num', 'Bool', 'AnyLit', 'Var'].includes(e.kind)) fail(tok, 'void of an expression that does something is not in the subset');
      return AnyLit(undefined);
    }
    if (this.at('name', 'delete')) {   // chapter 19: delete o[k], delete o.f
      const tok = this.next();
      const e = this.unary();
      if (e.kind === 'Index') return Prim('any_delete', [e.arr, e.idx]);
      if (e.kind === 'Get') return Prim('any_delete', [e.obj, Str(e.name)]);
      fail(tok, 'delete of something other than a property');
    }
    if (this.at('name', 'typeof')) {   // chapter 9: only as typeof e === 'kind' (see typeofTest)
      const tok = this.next();
      return { kind: 'TypeOf', arg: this.unary(), tok };
    }
    return this.postfix(this.primary());
  }

  // Arguments, each an expression or (chapter 17) ...spread.
  argList() {
    const args = [];
    while (!this.at(')')) {
      if (this.at('...')) { this.next(); args.push({ kind: 'Spread', arg: this.assignment() }); }
      else args.push(this.assignment());
      if (!this.at(')')) this.expect(',');
    }
    this.next();
    return args;
  }

  // Chapter 17: [a, ...xs, b] is [a].concat(Array.from(xs), [b]), in the same order.
  spreadArray(elems) {
    const segs = [];
    for (const x of elems) {
      if (x.kind === 'Spread') segs.push(LibCall('Array.from', [x.arg]));
      else if (segs.length && segs.at(-1).kind === 'ArrayLit') segs.at(-1).elems.push(x);
      else segs.push(ArrayLit([x]));
    }
    const [first, ...rest] = segs[0].kind === 'ArrayLit' ? segs : [ArrayLit([]), ...segs];
    return rest.length ? MethodCall(first, 'concat', rest) : first;
  }

  // a[i], a.length and f(x), any number of times: a[i][j].length, f(x)(y)
  postfix(e) {
    for (;;) {
      if (this.at('(')) {
        this.next();
        e = Call(e, this.argList());
      } else if (this.at('[')) {
        this.next();
        const idx = this.assignment();
        this.expect(']');
        e = Index(e, idx);
      } else if (this.at('?.')) {
        // CJI-3: a?.b, a?.[i], f?.(x): undefined when the value before ?. is null or undefined,
        // and then the rest of the chain is not evaluated: ((t) => t === null || t === undefined
        // ? undefined : t.b...)(a)
        this.next();
        const t = this.name('opt');
        let rest;
        if (this.at('(')) { this.next(); rest = Call(Var(t), this.argList()); }
        else if (this.at('[')) { this.next(); const idx = this.assignment(); this.expect(']'); rest = Index(Var(t), idx); }
        else rest = this.member(Var(t));
        rest = this.postfix(rest);
        const nullish = Prim('||', [Prim('===', [Var(t), AnyLit(null)]), Prim('===', [Var(t), AnyLit(undefined)])]);
        return Call(Lambda([{ name: t, type: 'Any', untyped: true, inferred: true }], null, [Return(If(nullish, AnyLit(undefined), rest))]), [e]);
      } else if (this.at('.')) {
        this.next();
        e = this.member(e);
      } else {
        if ((this.at('++') || this.at('--')) && !this.peek().nl) {
          const tok = this.next();
          return this.increment(tok, e, tok.t, true);
        }
        return e;
      }
    }
  }

  // chapter 13: o.name, and o.name(args), a method call (of a string, or a record's
  // function); .length stays the operator of chapter 6 (after . or ?.)
  member(e) {
    {
      {
        const name = this.expect('name');
        if (this.at('(')) {
          this.next();
          const args = this.argList();
          // chapter 17: push(...xs) and its kind: one array of the items
          const sp = args.findIndex((a) => a.kind === 'Spread');
          if (sp >= 0 && ['push', 'unshift'].includes(name.v)) e = MethodCall(e, `${name.v}Array`, [this.spreadArray(args)]);
          else if (sp >= 0 && name.v === 'splice' && sp >= 2) e = MethodCall(e, 'spliceArray', [args[0], args[1], this.spreadArray(args.slice(2))]);
          else if (name.v === 'splice' && args.length > 2) e = MethodCall(e, 'spliceArray', [args[0], args[1], ArrayLit(args.slice(2))]);
          else if (sp >= 0 && name.v === 'concat') e = MethodCall(e, 'concat', args.map((a) => (a.kind === 'Spread' ? LibCall('Array.from', [a.arg]) : a)));
          else if (sp >= 0 && !['col', 'row', 'box', 'needs', 'provides'].includes(name.v))   // (those: lower_rest packs, src/spread.js)
            fail(name, `.${name.v}(...) with a spread argument is not in the subset`);
          else if (name.v === 'apply' && args.length === 2) {   // chapter 22: f.apply(t, xs), up to 8 arguments
            this.core.add('Function$apply');
            e = Call(Var('Function$apply'), [e, args[1]]);
          }
          else if (REGEX_METHODS[name.v] && args.length >= REGEX_METHODS[name.v].min && (name.v !== 'split' || args[0]?.regex)) {   // chapter 18
            this.core.add('$regex');
            const r = REGEX_METHODS[name.v];
            e = Call(Var(r.fn), [e, ...args.slice(0, r.n), ...r.extra]);
          }
          else e = MethodCall(e, name.v, args);
        } else e = name.v === 'length' ? Prim('length', [e]) : Get(e, name.v);
      }
    }
    return e;
  }

  // Chapter 10: Math's constants and functions, as operators of their own (math.js).
  math(start) {
    this.expect('.');
    const name = this.expect('name');
    if (MATH_CONSTANTS[name.v] !== undefined) return Num(MATH_CONSTANTS[name.v]);
    // chapter 17: a world's Math.random is its runtime's seeded generator (src/world.js)
    if (name.v === 'random') { this.expect('('); this.expect(')'); return Call(Var('Math$random'), []); }
    if (!MATH[name.v]) fail(name, `Math.${name.v} is not in the subset`);
    // chapter 22: Math.max.apply(null, xs) is Math.max(...xs)
    let applied = null;
    if (this.at('.') && this.peek(1).t === 'name' && this.peek(1).v === 'apply') {
      this.next(); this.next(); this.expect('(');
      const [, xs] = this.argList();
      if (!xs) fail(name, `Math.${name.v}.apply needs an array of arguments`);
      applied = [{ kind: 'Spread', arg: xs }];
    }
    // chapter 22: Math.max as a value takes any number of arguments, up to the first undefined
    // (as a rest function used as a value does, src/spread.js)
    if (!applied && !this.at('(') && MATH[name.v].arity === 'n') {
      const ps = Array.from({ length: 8 }, (_, k) => `$m${k}`);
      return parse(`const $f = (${ps.join(', ')}) => { const v = [${ps.join(', ')}]; let n = 0; while (n < 8 && v[n] !== undefined) n++; v.length = n; return Math.${name.v}(...v); };`).body[0].init;
    }
    if (!applied && !this.at('(')) {   // chapter 19: Math.f as a value, (x) => Math.f(x)
      const n = MATH[name.v].arity === 'n' ? 2 : MATH[name.v].arity;
      const ps = Array.from({ length: n }, (_, k) => ({ name: `$m${k}`, type: 'Any', inferred: true }));
      const call = name.v === 'pow' ? Prim('**', ps.map((q) => Var(q.name))) : Prim(`Math.${name.v}`, ps.map((q) => Var(q.name)));
      return Lambda(ps, null, [Return(call)]);
    }
    let args = applied;
    if (args === null || args === undefined) { this.expect('('); args = this.argList(); }   // (CJI-3: no comma operator)
    const { arity } = MATH[name.v];
    // chapter 17: Math.max(a, ...xs): each spread array reduced with the same operator first
    if (arity === 'n' && args.some((a) => a.kind === 'Spread')) {
      const op = `Math.${name.v}`, start = Num(name.v === 'max' ? -Infinity : Infinity);
      args = args.map((a) => (a.kind !== 'Spread' ? a
        : MethodCall(a.arg, 'reduce', [Lambda([{ name: '$m', type: 'Any', inferred: true }, { name: '$x', type: 'Any', inferred: true }], null,
          [Return(Prim(op, [Var('$m'), Var('$x')]))]), start])));
      if (args.length === 1) args = [start, args[0]];
    } else if (args.some((a) => a.kind === 'Spread')) fail(name, `Math.${name.v}(...) with a spread argument is not in the subset`);
    if (arity === 'n' && args.length === 0) return Num(name.v === 'max' ? -Infinity : Infinity);
    if (arity !== 'n' && args.length !== arity)
      fail(name, `Math.${name.v} takes ${arity} argument${arity === 1 ? '' : 's'} in this subset`);
    if (name.v === 'pow') return Prim('**', args);
    if (arity !== 'n') return Prim(`Math.${name.v}`, args);
    // min and max: of one value, the value as a number (as unary +); of several, nested:
    // Math.max(a, b, c) is max(max(a, b), c)
    if (args.length === 1) return Prim('*', [args[0], Int(1)]);
    return args.slice(2).reduce((acc, x) => Prim(`Math.${name.v}`, [acc, x]), Prim(`Math.${name.v}`, args.slice(0, 2)));
  }

  primary() {
    // CJI-3: a named function expression, (function f(x) { ... }), is an arrow that declares f
    // and returns it, so f is a name only inside it, as in JavaScript
    if (this.funAhead()) {
      const k = this.at('name', 'async') ? 2 : 1;
      if (this.peek(k).t !== 'name') fail(this.peek(k), 'a function expression needs a name in this subset (or use an arrow)');
      const def = this.funDef();
      return Call({ ...Lambda([], 'Any', [def, Return(Var(def.name))]), inferRet: true }, []);
    }
    const tok = this.next();
    switch (tok.t) {
      case 'regex': {   // chapter 18: compiled now, run by the library's machine
        let r;
        try { r = compileRegex(tok.v.source, tok.v.flags); } catch (e) { if (e instanceof CompileError) fail(tok, e.message); throw e; }
        this.core.add('$regex');
        return { ...Call(Var('$regex'), [ArrayLit(r.prog.map((x) => Int(x))), ArrayLit(r.cls.map((x) => Int(x))), Int(r.ncap), Int(r.nregs), Int(r.fl),
          Str(tok.v.source), Str(tok.v.flags)]), regex: true };
      }
      case 'int':
        return Int(tok.v);
      case 'num':
        return Num(tok.v);
      case 'str':
        return { kind: 'Str', value: tok.v, tok };
      case 'template': {
        // chapter 13: `a${x}b` is '' + 'a' + x + 'b': + with a string operand converts the
        // other to a string, as a template does
        let e = Str(tok.quasis[0]);
        tok.exprs.forEach((src, k) => {
          const sub = new Parser(src);
          sub.fresh = this.fresh;
          sub.inFunction = this.inFunction;
          sub.classes = this.classes;   // (CJI-3)
          sub.lateCore = this.lateCore;
          sub.classSelf = this.classSelf;
          const x = sub.assignment();
          for (const n of sub.core) this.lateCore.add(n);   // (CJI-3: its library functions, added last)
          if (!sub.at('eof')) fail(tok, 'a ${ } in a template holds one expression');
          this.fresh = sub.fresh;
          e = Prim('+', [e, x]);
          if (tok.quasis[k + 1]) e = Prim('+', [e, Str(tok.quasis[k + 1])]);
        });
        return e;
      }
      case '{': {   // chapter 13: a record, { a: e, b, 'c': e }
        let fields = [], computed = [];
        // CJI-3: { a, ...e, b: 1 } is Object.assign({ a }, e, { b: 1 }): the fields before the
        // first spread are the target (or {}), then each spread and each run of fields after it
        const parts = [];
        const record = () => {
          const r = this.recordOf(fields, computed);
          fields = [];
          computed = [];
          return r;
        };
        while (!this.at('}')) {
          if (this.at('...')) {
            this.next();
            if (fields.length || computed.length || parts.length === 0) parts.push(record());
            parts.push(this.assignment());
            if (!this.at('}')) this.expect(',');
            continue;
          }
          if (this.at('[')) {   // chapter 19: { [k]: e } sets the property k after the others
            this.next();
            const k = this.assignment();
            this.expect(']');
            this.expect(':');
            computed.push([k, this.assignment()]);
            this.core.add('$setIn');
            if (!this.at('}')) this.expect(',');
            continue;
          }
          const key = this.next();
          if (key.t === 'int' || key.t === 'num') key.v = String(key.v);   // chapter 19: { 1: e } is { "1": e }
          else if (key.t !== 'name' && key.t !== 'str') fail(key, 'a field name must be a name, a string or a number in this subset');
          if (fields.some((f) => f.name === key.v)) fail(key, `the field ${key.v} appears twice`);
          if (key.t === 'name' && (this.at(',') || this.at('}'))) fields.push({ name: key.v, exp: Var(key.v) });
          else {
            this.expect(':');
            fields.push({ name: key.v, exp: this.assignment() });
          }
          if (!this.at('}')) this.expect(',');
        }
        this.next();
        if (parts.length === 0) return record();
        if (fields.length || computed.length) parts.push(record());
        this.core.add('Object$assign');
        this.core.add('$any');
        return Call(Var('Object$assign'), [parts[0], ArrayLit(parts.slice(1).map((a) => Call(Var('$any'), [a])))]);
      }
      case 'name':
        if (tok.v === 'this') {   // CJI-3: in a class's constructor or method, the instance
          if (!this.classSelf) fail(tok, 'this is only in the constructor and methods of a class in this subset');
          return Var(this.classSelf);
        }
        if (tok.v === 'true' || tok.v === 'false') return Bool(tok.v === 'true');
        if (tok.v === 'null') return AnyLit(null);
        if (tok.v === 'undefined') return AnyLit(undefined);
        if (tok.v === 'NaN' || tok.v === 'Infinity') return Num(tok.v === 'NaN' ? NaN : Infinity);
        if (tok.v === 'Math') return this.math(tok);
        // chapter 21: Number, String and Boolean as values, (x) => Number(x) and its kind
        if ((tok.v === 'Number' || tok.v === 'String' || tok.v === 'Boolean') && !this.at('(') && !this.at('.')) {
          const x = Var('$c0');
          const body = tok.v === 'Number' ? Prim('*', [x, Int(1)]) : tok.v === 'String' ? Prim('String', [x]) : Prim('!', [Prim('!', [x])]);
          return Lambda([{ name: '$c0', type: 'Any', inferred: true }], null, [Return(body)]);
        }
        if (tok.v === 'Boolean') {   // chapter 21: Boolean(x), as !!x
          this.expect('(');
          const x = this.assignment();
          this.expect(')');
          return Prim('!', [Prim('!', [x])]);
        }
        if (tok.v === 'Number') {   // chapter 17: Number(x), as +x; Number.isFinite(x) and its kind
          if (this.at('(')) { this.next(); const x = this.assignment(); this.expect(')'); return Prim('*', [x, Int(1)]); }
          this.expect('.');
          const name = this.expect('name');
          const f = `Number$${name.v}`;
          if (!CORE_SOURCE[f]) fail(name, `Number.${name.v} is not in the subset`);
          if (name.v === 'parseInt') this.core.add('Number$digit');
          this.core.add(f);
          if (!this.at('(')) return Var(f);   // chapter 19: as a value
          this.expect('(');
          return Call(Var(f), this.argList());   // (chapter 21: Number.parseInt(s, radix) takes two)
        }
        if (tok.v === 'Date') {   // chapter 21: Date.UTC(y, ...), Date.now(), Date.now as a value
          this.expect('.');
          const name = this.expect('name');
          this.useDate();
          if (name.v === 'now') {
            if (!this.at('(')) return Var('Date$now');
            this.expect('(');
            this.expect(')');
            return Call(Var('Date$now'), []);
          }
          if (name.v !== 'UTC') fail(name, `Date.${name.v} is not in the subset`);
          this.expect('(');
          const args = this.argList();
          return Call(Var('Date$UTC'), args.length ? dateParts(args) : [AnyLit(undefined), Int(0), Int(1), Int(0), Int(0), Int(0), Int(0)]);
        }
        if (tok.v === 'parseInt' || tok.v === 'parseFloat') {   // chapter 21: library functions
          const f = `Number$${tok.v}`;
          this.core.add('Number$digit');
          this.core.add(f);
          return Var(f);
        }
        if (tok.v === 'JSON') {   // chapter 19: JSON.stringify(v) and JSON.parse(t), library functions
          this.expect('.');
          const name = this.expect('name');
          if (name.v !== 'stringify' && name.v !== 'parse') fail(name, `JSON.${name.v} is not in the subset`);
          this.expect('(');
          const args = this.argList();
          if (args.length !== 1) fail(name, `JSON.${name.v} with a replacer, reviver or indentation is not in the subset`);
          const deps = { stringify: ['JSON$stringify', 'JSON$str', 'JSON$quote', 'Object$keys', ...DATE_CORE],
            parse: ['JSON$parse', 'JSON$value', 'JSON$string', 'JSON$ws', 'JSON$digits', 'JSON$fail'] };
          for (const f of deps[name.v]) this.core.add(f);
          return Call(Var(`JSON$${name.v}`), args);
        }
        if (tok.v === 'Object') {   // chapter 19: Object.keys and its kind, on dynamic objects
          this.expect('.');
          const name = this.expect('name');
          if (name.v === 'prototype') {   // Object.prototype.hasOwnProperty.call(o, k): an own property
            this.expect('.');
            const m = this.expect('name');
            if (m.v !== 'hasOwnProperty') fail(m, `Object.prototype.${m.v} is not in the subset`);
            this.expect('.');
            if (this.expect('name').v !== 'call') fail(m, 'only Object.prototype.hasOwnProperty.call(o, k) is in the subset');
            this.expect('(');
            const [o, k] = this.argList();
            return Prim('any_in', [k, o]);
          }
          // CJI-3: Object.create(null), a dictionary without a prototype, is {}: no object here has one
          if (name.v === 'create') {
            this.expect('(');
            const a = this.peek();
            if (!(a.t === 'name' && a.v === 'null')) fail(a, 'only Object.create(null) is in the subset');
            this.next();
            this.expect(')');
            return Record([]);
          }
          const f = `Object$${name.v}`;
          if (name.v !== 'keys' && !CORE_SOURCE[f]) fail(name, `Object.${name.v} is not in the subset`);
          this.expect('(');
          const args = this.argList();
          if (name.v === 'keys') return Prim('any_keys', args);
          this.core.add(f);
          if (name.v === 'entries' || name.v === 'values') this.core.add('Object$keys');
          // (its sources packed, each dynamic on its own: in one array their classes would meet)
          if (name.v === 'assign') { this.core.add('$any'); return Call(Var(f), [args[0], ArrayLit(args.slice(1).map((a) => Call(Var('$any'), [a])))]); }
          return Call(Var(f), args);
        }
        if (tok.v === 'Promise') {   // chapter 16: Promise.resolve, .reject, .all
          this.expect('.');
          const name = this.expect('name');
          if (!['resolve', 'reject', 'all'].includes(name.v)) fail(name, `Promise.${name.v} is not in the subset`);
          this.expect('(');
          const args = [];
          while (!this.at(')')) { args.push(this.assignment()); if (!this.at(')')) this.expect(','); }
          this.expect(')');
          return LibCall(`Promise.${name.v}`, args.length ? args : [AnyLit(undefined)]);
        }
        // CJI-3: Int32Array.from(items, f) is new Int32Array(Array.from(items, f)), for each typed kind
        if (TYPED_KINDS.some(([n]) => n === tok.v) && this.at('.')) {
          this.next();
          const name = this.expect('name');
          if (name.v !== 'from') fail(name, `${tok.v}.${name.v} is not in the subset`);
          this.expect('(');
          return LibCall(`new ${tok.v}`, [LibCall('Array.from', this.argList())]);
        }
        if (tok.v === 'Array') {   // chapter 15: Array.from, Array.isArray
          this.expect('.');
          const name = this.expect('name');
          if (!['from', 'isArray'].includes(name.v)) fail(name, `Array.${name.v} is not in the subset`);
          this.expect('(');
          const args = [];
          while (!this.at(')')) { args.push(this.assignment()); if (!this.at(')')) this.expect(','); }
          this.expect(')');
          return LibCall(`Array.${name.v}`, args);
        }
        if (tok.v === 'new') {   // chapter 14: new Error(message), as a record { message, name }
          const cls = this.expect('name');
          if (cls.v === 'Promise') {   // chapter 16: new Promise(executor)
            this.expect('(');
            const f = this.assignment();
            this.expect(')');
            return LibCall('Promise', [f]);
          }
          if (cls.v === 'Array') {   // chapter 15: new Array(n)
            this.expect('(');
            const n = this.assignment();
            this.expect(')');
            return LibCall('Array', [n]);
          }
          if (CLASSES[cls.v]) {   // chapter 22: a library class's constructor (chapter 21's Date among them)
            this.expect('(');
            const args = this.argsToParen();
            if (cls.v === 'Date') this.useDate();
            return LibCall(`new ${cls.v}`, args);
          }
          if (this.classes.has(cls.v)) {   // CJI-3: a class the program declares
            this.expect('(');
            const args = this.argsToParen();
            if (!this.classes.get(cls.v)) return Call(Var(`${cls.v}$new`), args);
            // (class E extends Error {}: an Error, named Error as JavaScript names it, with E's brand)
            if (args.length > 1) fail(cls, `new ${cls.v} takes one argument, the message, in this subset`);
            const msg = args.length ? args[0] : null;
            return { ...Record([{ name: 'message', exp: msg ? Prim('String', [msg]) : Str('') }, { name: 'name', exp: Str('Error') },
              { name: `$class$${cls.v}`, exp: Bool(true) }]), error: true };
          }
          if (!['Error', 'TypeError', 'RangeError', 'SyntaxError'].includes(cls.v)) fail(cls, `new ${cls.v} is not in the subset`);
          this.expect('(');
          const msg = this.at(')') ? null : this.assignment();
          this.expect(')');
          return { ...Record([{ name: 'message', exp: msg ? Prim('String', [msg]) : Str('') }, { name: 'name', exp: Str(cls.v) }]), error: true };
        }
        if (tok.v === 'String') {   // chapter 13: String(x), String.fromCharCode(c)
          if (this.at('.')) {
            this.next();
            const name = this.expect('name');
            if (name.v !== 'fromCharCode') fail(name, `String.${name.v} is not in the subset`);
            this.expect('(');
            const c = this.assignment();
            this.expect(')');
            return Prim('String.fromCharCode', [c]);
          }
          this.expect('(');
          const x = this.assignment();
          this.expect(')');
          return Prim('String', [x]);
        }
        if (tok.v === 'async' && (this.at('(') || (this.at('name') && this.peek(1).t === '=>'))) {   // chapter 16
          if (this.at('(')) return this.arrow(true);
          const x = this.next();
          return this.arrowBody([{ name: x.v, type: 'Any', untyped: true, inferred: true }], null, true);
        }
        if (this.at('=>')) {          // x => ...: one parameter, without a type
          if (RESERVED.has(tok.v)) fail(tok, `'${tok.v}' cannot be used as a name`);
          return this.arrowBody([{ name: tok.v, type: 'Any', untyped: true, inferred: true }], null);
        }
        if (RESERVED.has(tok.v)) fail(tok, `'${tok.v}' cannot be used as a name`);
        return Var(tok.v);
      case '(': {
        this.k--;                   // back to the ( : is it an arrow function's?
        if (this.arrowAhead()) return this.arrow();
        this.k++;
        const e = this.assignment();
        this.expect(')');
        return e;
      }
      case '[': {
        const elems = [];
        while (!this.at(']')) {
          if (this.at(',')) { this.next(); elems.push({ kind: 'Hole' }); continue; }   // chapter 17: [, v] = ...
          if (this.at('...')) { this.next(); elems.push({ kind: 'Spread', arg: this.assignment() }); }
          else elems.push(this.assignment());
          if (!this.at(']')) this.expect(',');
        }
        this.next();
        // a hole can only be a pattern's; a spread becomes concat (unless this is a pattern)
        if (this.at('=') && !this.at('==')) return ArrayLit(elems);
        if (elems.some((x) => x.kind === 'Hole')) fail(tok, 'an array literal with a hole is not in the subset');
        if (elems.some((x) => x.kind === 'Spread')) return this.spreadArray(elems);
        return ArrayLit(elems);
      }
      default:
        fail(tok, `expected an expression, found ${tok.v ?? tok.t}`);
    }
  }
}

// typeof gives a string, and strings are chapter 12's; until then typeof may only be
// compared with a string literal, and the comparison becomes one operator:
// typeof x === 'number' is (typeof=number x).
function typeofTest(tok, op, l, r) {
  if (!['===', '!==', '==', '!='].includes(op)) return null;
  const [t, s] = l.kind === 'TypeOf' ? [l, r] : [r, l];
  if (t.kind !== 'TypeOf' || s.kind !== 'Str') return null;   // chapter 13: else typeof is a string
  if (!Object.prototype.hasOwnProperty.call(TYPEOF_KINDS, s.value))
    fail(s.tok, `typeof never gives '${s.value}' in this subset; it gives ${Object.keys(TYPEOF_KINDS).join(', ')}`);
  const test = Prim(`typeof=${s.value}`, [t.arg]);
  return op === '===' || op === '==' ? test : Prim('!', [test]);
}
const TYPEOF_KINDS = { undefined: 0, boolean: 1, number: 2, object: 3, function: 4, string: 5 };

// Chapter 13: a typeof that is not compared with a string literal gives the string itself;
// string literals lose their tokens.
function settle(x) {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(settle);
  if (x.kind === 'TypeOf') return Prim('typeof', [settle(x.arg)]);
  if (x.kind === 'Str') return Str(x.value);
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = typeof v === 'object' ? settle(v) : v;
  return out;
}

// CJI-3: does a body return, other than from a function inside it? (a constructor's early return)
function hasReturn(x) {
  if (x === null || typeof x !== 'object') return false;
  if (Array.isArray(x)) return x.some(hasReturn);
  if (x.kind === 'Return') return true;
  if (x.kind === 'Lambda' || x.kind === 'FunDef') return false;
  return Object.values(x).some(hasReturn);
}
const strip = ({ name, type, inferred, rest }) => ({ name, type, ...(inferred ? { inferred } : {}), ...(rest ? { rest } : {}) });

// Chapter 18: string methods that take a regular expression (or a string), as library calls
const REGEX_METHODS = Object.assign(Object.create(null), {
  replace: { fn: '$strReplace', n: 2, min: 2, extra: [Bool(false)] }, replaceAll: { fn: '$strReplace', n: 2, min: 2, extra: [Bool(true)] },
  match: { fn: '$strMatch', n: 1, min: 1, extra: [] }, matchAll: { fn: '$strMatchAll', n: 1, min: 1, extra: [] },
  search: { fn: '$strSearch', n: 1, min: 1, extra: [] }, split: { fn: '$strSplit', n: 1, min: 1, extra: [] },
});

// Chapter 17: small functions of JavaScript's library, written in the subset and added to a
// program that uses them (function declarations are hoisted, so at its end).
// Chapter 21: the missing arguments of Date.UTC. (Chapter 22: a date's methods and
// constructors are the Date class's, src/classes.js.)
const dateParts = (args) => [...args, ...[Int(0), Int(1), Int(0), Int(0), Int(0), Int(0)].slice(args.length - 1)].slice(0, 7);
export const DATE_CORE = ['Date$leap', 'Date$dayFromYear', 'Date$monthStart', 'Date$fields', 'Date$pad', 'Date$isoOf'];
const DATE_NAMES = [...DATE_CORE, 'Date$is', 'Date$value', 'Date$get', 'Date$tzo', 'Date$clip', 'Date$makeDay',
  'Date$makeTime', 'Date$compose', 'Date$UTC', 'Date$utc', 'Date$now', 'Date$iso', 'Date$json', 'Date$utcString', 'Date$timeString'];

const CORE_SOURCE = {
  $regex: REGEX_SOURCE,   // chapter 18
  // chapter 19: objects as tables
  $setIn: 'function $setIn(o /*: Any */, k /*: Any */, v /*: Any */) /*: Any */ { o[k] = v; return o; }',
  $any: 'function $any(x /*: Any */) /*: Any */ { return x; }',
  // CJI-3: o instanceof C, for a class the program declares: o is an object with C's brand
  $isInstance: 'function $isInstance(o /*: Any */, brand /*: String */) /*: Bool */ { return o !== null && typeof o === "object" && !Array.isArray(o) && brand in o; }',
  Object$keys: '',
  Object$values: `function Object$values(o /*: Any */) /*: Any[] */ {
    const ks = Object.keys(o), out /*: Any[] */ = [];
    out.length = ks.length;
    for (let k = 0; k < ks.length; k++) out[k] = o[ks[k]];
    return out;
  }`,
  Object$entries: `function Object$entries(o /*: Any */) /*: Any[] */ {
    const ks = Object.keys(o), out /*: Any[] */ = [];
    out.length = ks.length;
    for (let k = 0; k < ks.length; k++) { const pair /*: Any[] */ = [ks[k], o[ks[k]]]; out[k] = pair; }
    return out;
  }`,
  Object$assign: `function Object$assign(t /*: Any */, srcs /*: Any[] */) /*: Any */ {
    for (const s of srcs) {
      if (s === null || s === undefined) continue;
      const ks = Object.keys(s);
      for (let k = 0; k < ks.length; k++) t[ks[k]] = s[ks[k]];
    }
    return t;
  }`,
  Object$fromEntries: `function Object$fromEntries(pairs /*: Any */) /*: Any */ {
    const o /*: Any */ = {};
    for (let k = 0; k < pairs.length; k++) { const p /*: Any */ = pairs[k]; o[p[0]] = p[1]; }
    return o;
  }`,
  Object$is: `function Object$is(a /*: Any */, b /*: Any */) /*: Bool */ {
    if (typeof a === "number" && typeof b === "number") return a === b ? (a !== 0 || 1 / a === 1 / b) : (a !== a && b !== b);
    return a === b;
  }`,
  Object$freeze: 'function Object$freeze(o /*: Any */) /*: Any */ { return o; }',
  // chapter 19: JSON, written in the subset over dynamic values. No backslash appears in these
  // sources: escapes are built from their code units.
  JSON$quote: `function JSON$quote(s /*: String */) /*: String */ {
    const BS = String.fromCharCode(92), Q = String.fromCharCode(34);
    let out = Q, from = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      let esc = "";
      if (c === 34 || c === 92) esc = BS + s[i];
      else if (c === 10) esc = BS + "n";
      else if (c === 13) esc = BS + "r";
      else if (c === 9) esc = BS + "t";
      else if (c === 8) esc = BS + "b";
      else if (c === 12) esc = BS + "f";
      else if (c < 32) esc = BS + "u" + c.toString(16).padStart(4, "0");
      else if (c >= 55296 && c <= 56319) {
        const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        if (d >= 56320 && d <= 57343) { i++; continue; }
        esc = BS + "u" + c.toString(16);
      } else if (c >= 56320 && c <= 57343) esc = BS + "u" + c.toString(16);
      if (esc !== "") { out += s.slice(from, i) + esc; from = i + 1; }
    }
    return out + s.slice(from) + Q;
  }`,
  JSON$str: `function JSON$str(v /*: Any */) /*: Any */ {
    if (v === null) return "null";
    if (typeof v === "string") return JSON$quote(v);
    if (typeof v === "number") return v - v === 0 ? String(v) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "undefined" || typeof v === "function") return undefined;
    if (!Array.isArray(v) && typeof v.$date === "number") return v.$date !== v.$date ? "null" : JSON$quote(Date$isoOf(v.$date));   // chapter 21
    if (!Array.isArray(v) && ("$mk" in v || "$sv" in v)) return "{}";   // chapter 22: a Map or a Set has no own properties
    if (Array.isArray(v)) {
      let out /*: String */ = "[";
      for (let k = 0; k < v.length; k++) {
        const s = JSON$str(v[k]);
        out += (k > 0 ? "," : "") + (s === undefined ? "null" : String(s));
      }
      return out + "]";
    }
    const ks = Object.keys(v);
    let out /*: String */ = "{", first = true;
    for (let k = 0; k < ks.length; k++) {
      const s = JSON$str(v[ks[k]]);
      if (s === undefined) continue;
      out += (first ? "" : ",") + JSON$quote(ks[k]) + ":" + String(s);
      first = false;
    }
    return out + "}";
  }`,
  JSON$stringify: 'function JSON$stringify(v /*: Any */) /*: Any */ { return JSON$str(v); }',
  JSON$fail: `function JSON$fail(t /*: String */, i /*: Int */) /*: Any */ {
    if (i >= t.length) throw new SyntaxError("Unexpected end of JSON input");
    throw new SyntaxError("Unexpected token '" + t[i] + "' in JSON at position " + i);
  }`,
  JSON$ws: `function JSON$ws(t /*: String */, st /*: Int[] */) /*: Int */ {
    let i = st[0];
    while (i < t.length) {
      const c = t.charCodeAt(i);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) break;
      i++;
    }
    st[0] = i;
    return i < t.length ? t.charCodeAt(i) : -1;
  }`,
  JSON$digits: `function JSON$digits(t /*: String */, j /*: Int */) /*: Int */ {
    while (j < t.length && t.charCodeAt(j) >= 48 && t.charCodeAt(j) <= 57) j++;
    return j;
  }`,
  JSON$string: `function JSON$string(t /*: String */, st /*: Int[] */) /*: String */ {
    let i = st[0] + 1, from = i, out = "";
    for (;;) {
      if (i >= t.length) JSON$fail(t, i);
      const c = t.charCodeAt(i);
      if (c === 34) { st[0] = i + 1; return out + t.slice(from, i); }
      if (c < 32) JSON$fail(t, i);
      if (c !== 92) { i++; continue; }
      out += t.slice(from, i);
      const e = i + 1 < t.length ? t.charCodeAt(i + 1) : 0;
      if (e === 117) {
        let h = 0;
        for (let k = i + 2; k < i + 6; k++) {
          const d = k < t.length ? t.charCodeAt(k) : 0;
          if (d >= 48 && d <= 57) h = h * 16 + d - 48;
          else if (d >= 97 && d <= 102) h = h * 16 + d - 87;
          else if (d >= 65 && d <= 70) h = h * 16 + d - 55;
          else JSON$fail(t, k);
        }
        out += String.fromCharCode(h);
        i += 6;
      } else {
        const m = e === 34 || e === 92 || e === 47 ? e : e === 98 ? 8 : e === 102 ? 12 : e === 110 ? 10 : e === 114 ? 13 : e === 116 ? 9 : -1;
        if (m < 0) JSON$fail(t, i + 1);
        out += String.fromCharCode(m);
        i += 2;
      }
      from = i;
    }
  }`,
  JSON$value: `function JSON$value(t /*: String */, st /*: Int[] */) /*: Any */ {
    const c = JSON$ws(t, st), i = st[0];
    if (c === 123) {
      const o /*: Any */ = {};
      st[0] = i + 1;
      if (JSON$ws(t, st) === 125) { st[0]++; return o; }
      for (;;) {
        if (JSON$ws(t, st) !== 34) JSON$fail(t, st[0]);
        const k = JSON$string(t, st);
        if (JSON$ws(t, st) !== 58) JSON$fail(t, st[0]);
        st[0]++;
        o[k] = JSON$value(t, st);
        const d = JSON$ws(t, st);
        if (d !== 44 && d !== 125) JSON$fail(t, st[0]);
        st[0]++;
        if (d === 125) return o;
      }
    }
    if (c === 91) {
      const a /*: Any[] */ = [];
      st[0] = i + 1;
      if (JSON$ws(t, st) === 93) { st[0]++; return a; }
      for (;;) {
        a.push(JSON$value(t, st));
        const d = JSON$ws(t, st);
        if (d !== 44 && d !== 93) JSON$fail(t, st[0]);
        st[0]++;
        if (d === 93) return a;
      }
    }
    if (c === 34) return JSON$string(t, st);
    if (t.startsWith("true", i)) { st[0] = i + 4; return true; }
    if (t.startsWith("false", i)) { st[0] = i + 5; return false; }
    if (t.startsWith("null", i)) { st[0] = i + 4; return null; }
    let j = c === 45 ? i + 1 : i;
    const d0 = j;
    j = JSON$digits(t, j);
    if (j === d0 || (t.charCodeAt(d0) === 48 && j > d0 + 1)) JSON$fail(t, j === d0 ? j : d0 + 1);
    if (j < t.length && t.charCodeAt(j) === 46) {
      const f = j + 1;
      j = JSON$digits(t, f);
      if (j === f) JSON$fail(t, j);
    }
    if (j < t.length && (t.charCodeAt(j) === 101 || t.charCodeAt(j) === 69)) {
      let e = j + 1;
      if (e < t.length && (t.charCodeAt(e) === 43 || t.charCodeAt(e) === 45)) e++;
      j = JSON$digits(t, e);
      if (j === e) JSON$fail(t, j);
    }
    st[0] = j;
    return Number(t.slice(i, j));
  }`,
  JSON$parse: `function JSON$parse(t /*: String */) /*: Any */ {
    const st /*: Int[] */ = [0];
    const v = JSON$value(t, st);
    if (JSON$ws(t, st) !== -1) JSON$fail(t, st[0]);
    return v;
  }`,
  // chapter 20: console.log of arrays and objects, in Node's format (util.inspect with its
  // defaults: depth 2, lines of 80, the three innermost levels on one line, arrays of more
  // than six entries in columns). Checked against util.inspect on random values.
  $insp_quote: `function $insp_quote(s /*: String */) /*: String */ {
  const BS = String.fromCharCode(92);
  let q = 39;
  if (s.indexOf("'") >= 0) {
    if (s.indexOf(String.fromCharCode(34)) < 0) q = 34;
    else if (s.indexOf("\`") < 0 && s.indexOf("\${") < 0) q = 96;
  }
  let out = "", from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let esc = "";
    if (c === q || c === 92) esc = BS + s[i];
    else if (c === 10) esc = BS + "n";
    else if (c === 9) esc = BS + "t";
    else if (c === 13) esc = BS + "r";
    else if (c === 8) esc = BS + "b";
    else if (c === 12) esc = BS + "f";
    else if (c === 11) esc = BS + "x0B";
    else if (c < 32 || (c > 126 && c < 160)) esc = BS + "x" + c.toString(16).toUpperCase().padStart(2, "0");
    else if (c >= 55296 && c <= 57343) {
      if (c <= 56319 && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        if (d >= 56320 && d <= 57343) { i++; continue; }
      }
      esc = BS + "u" + c.toString(16);
    }
    if (esc !== "") { out += s.slice(from, i) + esc; from = i + 1; }
  }
  const Q = String.fromCharCode(q);
  return Q + out + s.slice(from) + Q;
}`,
  $insp_key: `function $insp_key(k /*: String */) /*: String */ {
  let plain = k.length > 0;
  for (let i = 0; i < k.length && plain; i++) {
    const c = k.charCodeAt(i);
    plain = c === 95 || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (i > 0 && c >= 48 && c <= 57);
  }
  return plain ? k : $insp_quote(k);
}`,
  $insp_group: `function $insp_group(out /*: String[] */, ind /*: Int */, numbers /*: Bool */, more /*: Bool */) /*: String[] */ {
  let total = 0, maxLen = 0;
  const n = more ? out.length - 1 : out.length;
  for (let i = 0; i < n; i++) {
    const len = out[i].length;
    total += len + 2;
    if (maxLen < len) maxLen = len;
  }
  const actualMax = maxLen + 2;
  if (!(actualMax * 3 + ind < 80 && (total / actualMax > 5 || maxLen <= 6))) return out;
  const averageBias = Math.sqrt(actualMax - total / out.length);
  const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
  const columns = Math.min(Math.round(Math.sqrt(2.5 * biasedMax * n) / biasedMax), Math.floor((80 - ind) / actualMax), 12, 15);
  if (columns <= 1) return out;
  const widths /*: Int[] */ = [];
  for (let i = 0; i < columns; i++) {
    let w = 0;
    for (let j = i; j < n; j += columns) if (out[j].length > w) w = out[j].length;
    { const m = widths.length; widths.length = m + 1; widths[m] = w + 2; }
  }
  const rows /*: String[] */ = [];
  for (let i = 0; i < n; i += columns) {
    const max = Math.min(i + columns, n);
    let line = "";
    let j = i;
    for (; j < max - 1; j++) line += numbers ? (out[j] + ", ").padStart(widths[j - i]) : (out[j] + ", ").padEnd(widths[j - i]);
    line += numbers ? out[j].padStart(widths[j - i] - 2) : out[j];
    { const m = rows.length; rows.length = m + 1; rows[m] = line; }
  }
  if (more) { const m = rows.length; rows.length = m + 1; rows[m] = out[n]; }
  return rows;
}`,
  // chapter 22: the library class of a dynamic object, by its brand ("" for none); and the
  // brand, whose field holds a typed array's elements
  $insp_class: `function $insp_class(v /*: Any */) /*: String */ {
    if ("$mk" in v) return "Map";
    if ("$sv" in v) return "Set";
${TYPED_KINDS_SRC.map(([n, b]) => `    if ("${b}" in v) return "${n}";`).join('\n')}
    return "";
  }`,
  $insp_brand: `function $insp_brand(c /*: String */) /*: String */ {
${TYPED_KINDS_SRC.map(([n, b]) => `    if (c === "${n}") return "${b}";`).join('\n')}
    return "";
  }`,
  $insp: `function $insp(v /*: Any */, rt /*: Int */, ind /*: Int */, cur /*: Int[] */) /*: String */ {
  if (v === null) return "null";
  if (typeof v === "string") {
    if (v.length > 16 && v.length > 76 - ind && v.indexOf(String.fromCharCode(10)) >= 0) {
      let out = "", from = 0;
      for (let i = 0; i < v.length; i++) {
        if (v.charCodeAt(i) === 10 || i === v.length - 1) {
          out += (from > 0 ? " +" + String.fromCharCode(10) + " ".repeat(ind + 2) : "") + $insp_quote(v.slice(from, i + 1));
          from = i + 1;
        }
      }
      return out;
    }
    return $insp_quote(v);
  }
  if (typeof v === "number") return v === 0 && 1 / v < 0 ? "-0" : String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "undefined") return "undefined";
  if (typeof v === "function") throw new TypeError("console.log of a function is outside the subset");
  if (!Array.isArray(v) && typeof v.$date === "number") return v.$date !== v.$date ? "Invalid Date" : Date$isoOf(v.$date);   // (chapter 21: a date)
  // chapter 22: a Map, a Set or a typed array, written with its class and size in front,
  // a typed array's elements as an array's
  const cls = Array.isArray(v) ? "" : $insp_class(v);
  const isArr = Array.isArray(v) || (cls !== "" && cls !== "Map" && cls !== "Set");
  const items = cls === "" || !isArr ? v : v[$insp_brand(cls)];
  const size = cls === "" ? (isArr ? v.length : Object.keys(v).length) : isArr ? items.length : v.size;
  const pre = cls === "" ? "" : cls + "(" + size + ") ";
  if (size === 0) return pre + (isArr ? "[]" : "{}");
  if (rt > 2) return cls !== "" ? "[" + cls + "]" : isArr ? "[Array]" : "[Object]";
  rt++;
  cur[0] = rt;
  const out /*: String[] */ = [];
  let numbers = true, more = false;
  if (isArr) {
    const n = items.length;
    for (let i = 0; i < n && i < 100; i++) {
      if (typeof items[i] !== "number") numbers = false;
      { const m = out.length; out.length = m + 1; out[m] = $insp(items[i], rt, ind + 2, cur); }
    }
    if (n > 100) {
      if (typeof items[100] !== "number") numbers = false;
      { const m = out.length; out.length = m + 1; out[m] = "... " + (n - 100) + " more item" + (n - 100 > 1 ? "s" : ""); }
      more = true;
    }
  } else if (cls === "Map") {
    for (let i = 0; i < v.size; i++) { const m = out.length; out.length = m + 1; out[m] = $insp(v.$mk[i], rt, ind + 2, cur) + " => " + $insp(v.$mv[i], rt, ind + 2, cur); }
  } else if (cls === "Set") {
    for (let i = 0; i < v.size; i++) { const m = out.length; out.length = m + 1; out[m] = $insp(v.$sv[i], rt, ind + 2, cur); }
  } else {
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) { const m = out.length; out.length = m + 1; out[m] = $insp_key(ks[i]) + ": " + $insp(v[ks[i]], rt, ind + 2, cur); }
  }
  const entries = out.length;
  let lines = out;
  if (isArr && entries > 6) lines = $insp_group(out, ind, numbers, more);
  if (cur[0] - rt < 3 && entries === lines.length) {
    let total = lines.length + lines.length + ind + pre.length + 1 + 10;
    let fits = total + lines.length <= 80;
    for (let i = 0; i < lines.length && fits; i++) {
      total += lines[i].length;
      fits = total <= 80;
    }
    if (fits) {
      const one = lines.join(", ");
      if (one.indexOf(String.fromCharCode(10)) < 0) return pre + (isArr ? "[ " : "{ ") + one + (isArr ? " ]" : " }");
    }
  }
  const nl = String.fromCharCode(10) + " ".repeat(ind);
  return pre + (isArr ? "[" : "{") + nl + "  " + lines.join("," + nl + "  ") + nl + (isArr ? "]" : "}");
}`,
  $show: `function $show(v /*: Any */) /*: Any */ {
  if (v !== null && (typeof v === "object" || typeof v === "function")) return $insp(v, 0, 0, [0]);
  return v;
}`,
  // chapter 21: Date, in the subset. A date is a dynamic object { $date: t }, t its time value
  // (ms since 1970, UTC, or NaN). The calendar is ECMAScript's (20.4.1); the host gives the
  // clock and the local time zone's offset (Math.$now, Math.$tz in src/math.js).
  Date$leap: 'function Date$leap(y /*: Number */) /*: Int */ { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 1 : 0; }',
  Date$dayFromYear: 'function Date$dayFromYear(y /*: Number */) /*: Number */ { return 365 * (y - 1970) + Math.floor((y - 1969) / 4) - Math.floor((y - 1901) / 100) + Math.floor((y - 1601) / 400); }',
  Date$monthStart: 'function Date$monthStart(m /*: Int */, leap /*: Int */) /*: Int */ { const s /*: Int[] */ = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; return s[m] + (m >= 2 ? leap : 0); }',
  Date$fields: `function Date$fields(t /*: Number */) /*: Number[] */ {
    const day = Math.floor(t / 86400000);
    let y = Math.floor(day / 365.2425) + 1970;
    while (Date$dayFromYear(y) > day) y--;
    while (Date$dayFromYear(y + 1) <= day) y++;
    const leap = Date$leap(y), yd = day - Date$dayFromYear(y);
    let m = 0;
    while (m < 11 && yd >= Date$monthStart(m + 1, leap)) m++;
    const tod = t - day * 86400000;
    const out /*: Number[] */ = [y, m, yd - Date$monthStart(m, leap) + 1, ((day + 4) % 7 + 7) % 7,
      Math.floor(tod / 3600000), Math.floor(tod / 60000) % 60, Math.floor(tod / 1000) % 60, tod % 1000];
    return out;
  }`,
  Date$pad: 'function Date$pad(n /*: Number */, w /*: Int */) /*: String */ { return String(n).padStart(w, "0"); }',
  Date$isoOf: `function Date$isoOf(t /*: Number */) /*: String */ {
    const f = Date$fields(t), y = f[0];
    const ys = y >= 0 && y <= 9999 ? Date$pad(y, 4) : (y < 0 ? "-" : "+") + Date$pad(Math.abs(y), 6);
    return ys + "-" + Date$pad(f[1] + 1, 2) + "-" + Date$pad(f[2], 2) + "T" + Date$pad(f[4], 2) + ":" + Date$pad(f[5], 2) + ":"
      + Date$pad(f[6], 2) + "." + Date$pad(f[7], 3) + "Z";
  }`,
  Date$is: 'function Date$is(v /*: Any */) /*: Bool */ { return v !== null && typeof v === "object" && !Array.isArray(v) && typeof v.$date === "number"; }',
  // (chapter 22: functions of the time value; the Date class's methods, src/classes.js, call them)
  Date$get: `function Date$get(t /*: Number */, local /*: Bool */, k /*: Int */) /*: Number */ {
    if (t !== t) return NaN;
    return Date$fields(local ? t + Math.$tz(t) : t)[k];
  }`,
  Date$tzo: 'function Date$tzo(t /*: Number */) /*: Number */ { return t !== t ? NaN : (t - (t + Math.$tz(t))) / 60000; }',
  // new Date(v) of a dynamic v: a date's time value, or ToNumber of anything else but a string
  Date$value: `function Date$value(v /*: Any */) /*: Number */ {
    if (typeof v === "string") throw new TypeError("new Date(string) is outside the subset");
    return Date$is(v) ? v.$date : Number(v);
  }`,
  Date$clip: 'function Date$clip(t /*: Number */) /*: Number */ { if (!(Math.abs(t) <= 8.64e15)) return NaN; return Math.trunc(t) + 0; }',
  Date$makeDay: `function Date$makeDay(y /*: Number */, m /*: Number */, dt /*: Number */) /*: Number */ {
    if (!(y - y === 0 && m - m === 0 && dt - dt === 0)) return NaN;
    const ym = Math.trunc(y) + Math.floor(Math.trunc(m) / 12);
    if (!(Math.abs(ym) < 400000)) return NaN;
    const mn = ((Math.trunc(m) % 12) + 12) % 12;
    return Date$dayFromYear(ym) + Date$monthStart(mn, Date$leap(ym)) + Math.trunc(dt) - 1;
  }`,
  Date$makeTime: `function Date$makeTime(h /*: Number */, m /*: Number */, s /*: Number */, ms /*: Number */) /*: Number */ {
    if (!(h - h === 0 && m - m === 0 && s - s === 0 && ms - ms === 0)) return NaN;
    return Math.trunc(h) * 3600000 + Math.trunc(m) * 60000 + Math.trunc(s) * 1000 + Math.trunc(ms);
  }`,
  Date$compose: `function Date$compose(y /*: Any */, m /*: Any */, d /*: Any */, h /*: Any */, mi /*: Any */, s /*: Any */, ms /*: Any */) /*: Number */ {
    let yr = Number(y);
    if (yr === yr) { const yi = Math.trunc(yr); if (yi >= 0 && yi <= 99) yr = 1900 + yi; }
    const day = Date$makeDay(yr, Number(m), Number(d)), time = Date$makeTime(Number(h), Number(mi), Number(s), Number(ms));
    if (!(day - day === 0 && time - time === 0)) return NaN;
    return day * 86400000 + time;
  }`,
  Date$UTC: 'function Date$UTC(y /*: Any */, m /*: Any */, d /*: Any */, h /*: Any */, mi /*: Any */, s /*: Any */, ms /*: Any */) /*: Number */ { return Date$clip(Date$compose(y, m, d, h, mi, s, ms)); }',
  // A local time to UTC. In a gap or an overlap (daylight saving time beginning or ending) the
  // offset before the change counts, as in V8 (ICU's "former"): the two offsets 6 hours before
  // and after are tried, the one whose local time is l wins, and the former if neither or both.
  Date$utc: `function Date$utc(l /*: Number */) /*: Number */ {
    if (l !== l) return NaN;
    const o0 = Math.$tz(l), before = Math.$tz(l - o0 - 21600000), after = Math.$tz(l - o0 + 21600000);
    const u1 = l - before, u2 = l - after;
    if (Math.$tz(u1) === before) return u1;
    if (Math.$tz(u2) === after) return u2;
    return u1;
  }`,
  Date$now: 'function Date$now() /*: Number */ { return Math.$now(); }',
  Date$iso: 'function Date$iso(t /*: Number */) /*: String */ { if (t !== t) throw new RangeError("Invalid time value"); return Date$isoOf(t); }',
  Date$json: 'function Date$json(t /*: Number */) /*: Any */ { return t !== t ? null : Date$isoOf(t); }',
  Date$utcString: `function Date$utcString(t /*: Number */) /*: String */ {
    if (t !== t) return "Invalid Date";
    const f = Date$fields(t), y = f[0], days = "SunMonTueWedThuFriSat", months = "JanFebMarAprMayJunJulAugSepOctNovDec";
    return days.slice(f[3] * 3, f[3] * 3 + 3) + ", " + Date$pad(f[2], 2) + " " + months.slice(f[1] * 3, f[1] * 3 + 3) + " "
      + (y < 0 ? "-" : "") + Date$pad(Math.abs(y), 4) + " " + Date$pad(f[4], 2) + ":" + Date$pad(f[5], 2) + ":" + Date$pad(f[6], 2) + " GMT";
  }`,
  // (the zone's name, which V8 adds in parentheses from ICU's database, is left out)
  Date$timeString: `function Date$timeString(t /*: Number */) /*: String */ {
    if (t !== t) return "Invalid Date";
    const o = Math.$tz(t), f = Date$fields(t + o), m = Math.abs(o) / 60000;
    return Date$pad(f[4], 2) + ":" + Date$pad(f[5], 2) + ":" + Date$pad(f[6], 2) + " GMT" + (o < 0 ? "-" : "+")
      + Date$pad(Math.floor(m / 60), 2) + Date$pad(Math.floor(m % 60), 2);
  }`,
  // chapter 22: f.apply(t, xs): f called with the elements of xs (this is not in the subset)
  Function$apply: `function Function$apply(f /*: Any */, xs /*: Any */) /*: Any */ {
    const n = xs === undefined || xs === null ? 0 : xs.length;
    if (n === 0) return f();
    if (n === 1) return f(xs[0]);
    if (n === 2) return f(xs[0], xs[1]);
    if (n === 3) return f(xs[0], xs[1], xs[2]);
    if (n === 4) return f(xs[0], xs[1], xs[2], xs[3]);
    if (n === 5) return f(xs[0], xs[1], xs[2], xs[3], xs[4]);
    if (n === 6) return f(xs[0], xs[1], xs[2], xs[3], xs[4], xs[5]);
    if (n === 7) return f(xs[0], xs[1], xs[2], xs[3], xs[4], xs[5], xs[6]);
    if (n === 8) return f(xs[0], xs[1], xs[2], xs[3], xs[4], xs[5], xs[6], xs[7]);
    throw new RangeError("apply with more than 8 arguments is outside the subset");
  }`,
  // chapter 22: the rest of an object pattern, { a, ...rest }: a new object with the other
  // own properties, in their order
  Object$rest: `function Object$rest(o /*: Any */, named /*: String[] */) /*: Any */ {
    const r /*: Any */ = {};
    const ks = Object.keys(o);
    for (let i = 0; i < ks.length; i++) {
      let skip = false;
      for (let j = 0; j < named.length; j++) if (named[j] === ks[i]) skip = true;
      if (!skip) r[ks[i]] = o[ks[i]];
    }
    return r;
  }`,
  // chapter 21: parseInt and parseFloat (also Number.parseInt, Number.parseFloat)
  Number$parseFloat: `function Number$parseFloat(x /*: Any */) /*: Number */ {
    const s = String(x).trimStart();
    let i = 0;
    if (i < s.length && (s[i] === "+" || s[i] === "-")) i++;
    if (s.startsWith("Infinity", i)) return s[0] === "-" ? -Infinity : Infinity;
    const d0 = i;
    while (i < s.length && s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) i++;
    let digits = i > d0;
    if (i < s.length && s[i] === ".") {
      const f0 = i + 1;
      let j = f0;
      while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) j++;
      if (digits || j > f0) { i = j; digits = true; }
    }
    if (!digits) return NaN;
    if (i < s.length && (s[i] === "e" || s[i] === "E")) {
      let j = i + 1;
      if (j < s.length && (s[j] === "+" || s[j] === "-")) j++;
      const e0 = j;
      while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) j++;
      if (j > e0) i = j;
    }
    return Number(s.slice(0, i));
  }`,
  Number$parseInt: `function Number$parseInt(x /*: Any */, radix /*: Any */) /*: Number */ {
    let s = String(x).trimStart();
    let sign = 1;
    if (s.length > 0 && (s[0] === "-" || s[0] === "+")) { if (s[0] === "-") sign = -1; s = s.slice(1); }
    let r = radix | 0, strip = true;
    if (r !== 0) {
      if (r < 2 || r > 36) return NaN;
      if (r !== 16) strip = false;
    } else r = 10;
    if (strip && s.length >= 2 && s[0] === "0" && (s[1] === "x" || s[1] === "X")) { s = s.slice(2); r = 16; }
    let end = 0;
    while (end < s.length) {
      const c = s.charCodeAt(end);
      const v = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 122 ? c - 87 : c >= 65 && c <= 90 ? c - 55 : 99;
      if (v >= r) break;
      end++;
    }
    if (end === 0) return NaN;
    const z = s.slice(0, end);
    if (r === 10) return sign * Number(z);   // (correctly rounded, as V8 does for radix 10)
    const lg = r === 2 ? 1 : r === 4 ? 2 : r === 8 ? 3 : r === 16 ? 4 : r === 32 ? 5 : 0;
    if (lg > 0) {   // a power of two: exactly rounded, as V8's InternalStringToIntDouble
      let n = 0, k = 0;
      while (k < end && n * r + Number$digit(z, k) < 9007199254740992) { n = n * r + Number$digit(z, k); k++; }
      if (k === end) return sign * n;
      const d = Number$digit(z, k);
      let ov = 1;   // the bits above 53: the digit's low ov bits are dropped
      while (n * 2 ** (lg - ov) + Math.floor(d / 2 ** ov) >= 9007199254740992) ov++;
      let hi = n * 2 ** (lg - ov) + Math.floor(d / 2 ** ov), e = ov, zeroTail = true;
      const dropped = d % 2 ** ov, middle = 2 ** (ov - 1);
      for (let j = k + 1; j < end; j++) { if (z[j] !== "0") zeroTail = false; e += lg; }
      if (dropped > middle || (dropped === middle && (hi % 2 === 1 || !zeroTail))) hi++;
      if (hi === 9007199254740992) { hi = hi / 2; e++; }
      return sign * hi * 2 ** e;
    }
    let result = 0, k = 0;   // another radix: in parts that keep the multiplier in 32 bits, as V8,
    while (k < end && z[k] === "0") k++;   // after the leading zeros
    while (k < end) {
      let part = 0, mult = 1;
      while (k < end && mult * r <= 119304647) { part = part * r + Number$digit(z, k); mult = mult * r; k++; }
      result = result * mult + part;
    }
    return sign * result;
  }`,
  Number$digit: 'function Number$digit(z /*: String */, k /*: Int */) /*: Int */ { const c = z.charCodeAt(k); return c <= 57 ? c - 48 : c >= 97 ? c - 87 : c - 55; }',
  Number$isFinite: 'function Number$isFinite(x /*: Any */) /*: Bool */ { return typeof x === "number" && x - x === 0; }',
  Number$isNaN: 'function Number$isNaN(x /*: Any */) /*: Bool */ { return typeof x === "number" && x !== x; }',
  Number$isInteger: 'function Number$isInteger(x /*: Any */) /*: Bool */ { return typeof x === "number" && x - x === 0 && Math.floor(x) === x; }',
};

// Chapter 20: library functions that a pass after inference decides a program needs
// (instantiate_library's console.log of arrays and objects), parsed as parse() appends them.
export const INSPECT_NAMES = [...DATE_CORE, '$insp_quote', '$insp_key', '$insp_group', '$insp_class', '$insp_brand', '$insp', '$show'];   // (chapter 21: dates too)
export const coreSource = (name) => CORE_SOURCE[name];   // (for tools/inspect-fuzz.mjs)
export function coreDefs(names) {
  return names.flatMap((name) => new Parser(CORE_SOURCE[name]).program().body);
}

export function parse(src) {
  const parser = new Parser(src);
  const p = settle(parser.program());
  // ($arity in the library: the number of parameters of a function value, an operator)
  const arity = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(arity);
    if (x.kind === 'Call' && x.fn.kind === 'Var' && x.fn.name === '$arity') return Prim('fn_arity', x.args.map(arity));
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = arity(v);
    return out;
  };
  const core = [...new Set([...parser.core, ...parser.lateCore])].filter((name) => CORE_SOURCE[name]).flatMap((name) => arity(new Parser(CORE_SOURCE[name]).program().body));
  return core.length ? { ...p, body: [...p.body, ...core] } : p;
}
