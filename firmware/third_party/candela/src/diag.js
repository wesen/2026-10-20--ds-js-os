// diag.js — diagnostics: coded errors and warnings that point at the line of *your* code that caused them.
// Builder misuse throws at once (E1xx); problems that span nodes are collected while a scene is built and compiled.

export class CandelaError extends Error {
  constructor(code, message, o = {}) {
    super(message);
    this.name = 'CandelaError'; this.code = code; this.hint = o.hint || null; this.suggest = o.suggest || null;
    this.loc = o.loc || callSite(); this.severity = 'error';
  }
}

// the files whose frames count as "user code" (scene.js, lib/*.js, the agent's eval)
export const userFiles = new Set(['scene.js', 'agent-eval.js']);
export const lineOffset = { n: 2 };            // lines `new Function` adds before the body; measured at boot
export const sources = new Map();              // file → source text, to show a line and to sniff an operator

const FRAME = /(?:at\s+(?:.*?\()?|@)(?:[^\s()]*\/)?([\w.\/-]+\.js):(\d+):(\d+)\)?\s*$/;
export function callSite(stack) {
  const s = stack || new Error().stack || '';
  for (const line of s.split('\n')) {
    const m = line.match(FRAME); if (!m) continue;
    const file = m[1].replace(/^.*?((?:lib\/)?[\w.-]+\.js)$/, '$1');
    if (!userFiles.has(file) && !userFiles.has(m[1])) continue;
    const ln = +m[2] - (file === 'agent-eval.js' ? 1 : lineOffset.n), col = +m[3];
    return { file, line: Math.max(1, ln), col };
  }
  return null;
}
export const fmtLoc = l => l ? `${l.file}:${l.line}${l.col ? ':' + l.col : ''}` : '';
export function lineText(loc) { if (!loc) return ''; const s = sources.get(loc.file); return s ? (s.split('\n')[loc.line - 1] || '') : ''; }

// ---------- the collector ----------
let sink = null;
export function collecting(fn) {
  const prev = sink, mine = []; sink = mine;
  const done = r => { sink = prev; return r; };
  try { const r = fn(); if (r && typeof r.then === 'function') return r.then(v => done({ value: v, diags: mine }), e => { sink = prev; e.diags = mine; throw e; }); return done({ value: r, diags: mine }); }
  catch (e) { sink = prev; e.diags = mine; throw e; }
}
export async function collectingAsync(fn) {
  const prev = sink, mine = []; sink = mine;
  try { const v = await fn(); return { value: v, diags: mine }; } catch (e) { e.diags = mine; throw e; } finally { sink = prev; }
}
export function currentSink() { return sink; }
export function report(severity, code, message, o = {}) {
  const d = { severity, code, message, hint: o.hint || null, loc: o.loc === undefined ? callSite() : o.loc, suggest: o.suggest || null, node: o.node || null };
  if (o.unchecked && o.unchecked.has && (o.unchecked.has(code) || o.unchecked.has('*'))) return null;
  if (sink) { if (!sink.some(x => x.code === d.code && x.message === d.message)) sink.push(d); }
  return d;
}
export const warn = (code, message, o) => report('warning', code, message, o);
export const info = (code, message, o) => report('info', code, message, o);

// ---------- did you mean ----------
export function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return prev[n];
}
export function didYouMean(name, options, max = 3) {
  const scored = options.filter(o => typeof o === 'string').map(o => [o, lev(name, o) - (o.toLowerCase().startsWith(name.toLowerCase().slice(0, 3)) ? 0.5 : 0)]).sort((a, b) => a[1] - b[1]);
  const best = scored.filter(([o, d]) => d <= Math.max(2, Math.ceil(name.length / 3))).slice(0, max).map(x => x[0]);
  return best;
}

// probes that libraries, React, devtools and `await` make on any object: never an error
export const BENIGN = new Set(['then', 'toJSON', 'constructor', '$$typeof', 'asymmetricMatch', 'nodeType', 'tagName', 'inspect', 'toString', 'valueOf', 'length', 'prototype', '__proto__', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '@@__IMMUTABLE_ITERABLE__@@', '@@__IMMUTABLE_RECORD__@@', '_isMockFunction', 'render', 'size', 'displayName', '_reactFragment', 'getElementsByTagName', 'ownerDocument', 'nodeName']);

// format a diagnostic like a compiler would
export function formatDiag(d) {
  const head = `${d.severity === 'error' ? '✖' : d.severity === 'warning' ? '⚠' : 'ⓘ'} ${d.code}  ${d.message}`;
  const where = d.loc ? `   ${fmtLoc(d.loc)}` : '';
  const hint = d.hint ? '\n        ' + [].concat(d.hint).join('\n        ') : '';
  const sug = d.suggest && d.suggest.length ? `\n        Did you mean ${d.suggest.map(s => `'${s}'`).join(' or ')}?` : '';
  return head + where + sug + hint;
}
export function toDiag(e) {
  if (e && e.code && /^[EWI]\d/.test(e.code)) return { severity: e.severity || 'error', code: e.code, message: e.message, hint: e.hint, loc: e.loc, suggest: e.suggest };
  const loc = callSite(e && e.stack);
  return { severity: 'error', code: e && e.name === 'SyntaxError' ? 'E001' : 'E000', message: (e && e.message) || String(e), loc, hint: null };
}
