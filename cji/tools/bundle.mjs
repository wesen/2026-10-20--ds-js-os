#!/usr/bin/env node
// CJI-3 step 5a: the compiler's ES modules as one program.
//
//   node tools/bundle.mjs [--entry src/build.js] [--target node|cji] [-o out.js] [--report] [--origins]
//                         [--call f]   (with --target cji: main is f(JSON.parse(input)), for one pass)
//
// From the entry module, the bundler follows `import ... from './x.js'`, splits every module into
// its top-level items (a declaration, an import, an export list, or a statement), and keeps only
// the items the entry's exports reach, transitively. So the interpreters, which the passes import
// a few constants from, are left out except for what is used. Names declared at the top level of
// two kept modules are renamed name$module in both; every other name keeps its spelling. Items
// are ordered so that each comes after the items it refers to (function declarations are hoisted,
// but a const initialiser runs where it stands).
//
// --target node (the default) keeps imports of node: modules and ends with a main that reads the
// source from a file, for checking the bundle against the compiler it came from; --target cji
// replaces them with the stage-1 I/O primitives (see ttmp/CJI-3-compile-on-device/reference/
// 03-census.md, "Input and output") and is the program cji is asked to compile.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { tokenize } from './jstok.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ENTRY = opt('--entry', 'src/build.js');
const TARGET = opt('--target', 'node');
const OUT = opt('-o', null);
const REPORT = args.includes('--report');
const CALL = opt('--call', null);   // --target cji: the entry's export the main calls (default compileSource)
const ORIGINS = args.includes('--origins');   // each item preceded by //@ module:line, for the census

const DECL_START = new Set(['import', 'export', 'function', 'const', 'let', 'var', 'class', 'async']);

// ---- modules and their items ----
const modules = new Map();   // path -> { path, id, src, toks, items, imports: Map local -> {mod, name}, exports: Map name -> local }
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const src = readFileSync(path, 'utf8');
  const toks = tokenize(src);
  const m = { path, id: basename(path, '.js').replace(/[^A-Za-z0-9]/g, '_'), src, toks, items: [], imports: new Map(), exports: new Map(), externals: [] };
  modules.set(path, m);
  split(m);
  for (const it of m.items) analyse(m, it);
  return m;
}

// Top-level items start at a declaration keyword at the start of a line, outside every bracket.
function split(m) {
  const { toks } = m;
  let depth = 0, start = 0;
  const starts = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (depth === 0 && t.t === 'id' && DECL_START.has(t.v) && (k === 0 || (toks[k - 1].t === 'ws' && toks[k - 1].v.includes('\n')))) {
      // (comments just above an item belong to it)
      let s = k;
      while (s > 0 && (toks[s - 1].t === 'ws' || toks[s - 1].t === 'com') && s - 1 >= start) s--;
      if (s > start || k === 0) starts.push(Math.max(s, start));
      start = k + 1;
    }
    if (t.t === 'p' && '({['.includes(t.v)) depth++;
    else if (t.t === 'p' && ')}]'.includes(t.v)) depth--;
    else if (t.t === 'tpl') { if (t.v.endsWith('${')) depth++; if (t.v.startsWith('}')) depth--; }
  }
  const bounds = [0, ...starts.filter((x) => x > 0), toks.length];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const ts = toks.slice(bounds[i], bounds[i + 1]);
    if (ts.every((t) => t.t === 'ws' || t.t === 'com')) { if (m.items.length) m.items[m.items.length - 1].toks.push(...ts); else m.items.push({ toks: ts, kind: 'blank', names: [] }); continue; }
    m.items.push({ toks: ts });
  }
}

const sig = (ts) => ts.filter((t) => t.t !== 'ws' && t.t !== 'com');

// The names a pattern declares: x, { a, b: c, ...d }, [e, , f = 1]
function patternNames(ts, i, out) {
  const t = ts[i];
  if (t.t === 'id') { out.push(t.v); return i + 1; }
  if (t.v === '{' || t.v === '[') {
    const close = t.v === '{' ? '}' : ']';
    i++;
    while (ts[i].v !== close) {
      if (ts[i].v === ',') { i++; continue; }
      if (ts[i].v === '...') { i = patternNames(ts, i + 1, out); continue; }
      if (t.v === '{') {
        // key, key: pattern, key = default
        const key = ts[i];
        i++;
        if (ts[i].v === ':') i = patternNames(ts, i + 1, out);
        else out.push(key.v);
      } else i = patternNames(ts, i, out);
      if (ts[i].v === '=') i = skipExpr(ts, i + 1);
    }
    return i + 1;
  }
  throw new Error(`pattern at ${t.v}`);
}
// to the next , or closing bracket at this level
function skipExpr(ts, i) {
  let d = 0;
  for (; i < ts.length; i++) {
    const v = ts[i].t === 'p' ? ts[i].v : ts[i].t === 'tpl' ? (ts[i].v.endsWith('${') ? '(' : '') : '';
    if (ts[i].t === 'tpl' && ts[i].v.startsWith('}')) { d--; if (ts[i].v.endsWith('${')) d++; continue; }
    if ('({['.includes(v) && v) d++;
    else if (')}]'.includes(v) && v) { if (d === 0) return i; d--; }
    else if (v === ',' && d === 0) return i;
  }
  return i;
}

function analyse(m, it) {
  const ts = sig(it.toks);
  it.names = [];
  if (!ts.length) { it.kind = 'blank'; return; }
  let k = 0;
  if (ts[0].v === 'import') {
    it.kind = 'import';
    const from = ts.find((t) => t.t === 'str');
    const spec = from.v.slice(1, -1);
    if (!spec.startsWith('.')) { m.externals.push({ spec, it }); it.external = spec; }
    const target = spec.startsWith('.') ? join(dirname(m.path), spec) : null;
    const brace = ts.findIndex((t) => t.v === '{');
    if (brace >= 0) {
      for (let i = brace + 1; ts[i].v !== '}'; i++) {
        if (ts[i].v === ',') continue;
        const name = ts[i].v;
        let local = name;
        if (ts[i + 1].v === 'as') { local = ts[i + 2].v; i += 2; }
        m.imports.set(local, { path: target, name, external: target ? null : spec });
      }
    }
    return;
  }
  if (ts[0].v === 'export' && ts[1].v === '{') {
    it.kind = 'exportlist';
    const fromAt = ts.findIndex((t) => t.v === 'from');
    const target = fromAt >= 0 ? join(dirname(m.path), ts[fromAt + 1].v.slice(1, -1)) : null;
    for (let i = 2; ts[i].v !== '}'; i++) {
      if (ts[i].v === ',') continue;
      const name = ts[i].v;
      let as = name;
      if (ts[i + 1].v === 'as') { as = ts[i + 2].v; i += 2; }
      if (target) { m.imports.set(name, { path: target, name }); }
      m.exports.set(as, name);
    }
    return;
  }
  if (ts[0].v === 'export') { it.exported = true; k = 1; }
  if (ts[k].v === 'async') k++;
  const kw = ts[k].v;
  if (kw === 'function') {
    it.kind = 'function';
    let n = k + 1;
    if (ts[n].v === '*') n++;
    it.names.push(ts[n].v);
  } else if (kw === 'class') {
    it.kind = 'class';
    it.names.push(ts[k + 1].v);
  } else if (kw === 'const' || kw === 'let' || kw === 'var') {
    it.kind = kw;
    let i = k + 1;
    for (;;) {
      i = patternNames(ts, i, it.names);
      if (ts[i] && ts[i].v === '=') i = skipExpr(ts, i + 1);
      if (ts[i] && ts[i].v === ',') { i++; continue; }
      break;
    }
  } else {
    it.kind = 'statement';
  }
  if (it.exported) for (const n of it.names) m.exports.set(n, n);
}

// ---- what each item refers to ----
// Identifier tokens that are not a property (after . or ?.) or a key in an object literal.
function references(it) {
  const refs = new Set();
  const ts = it.toks;
  let prev = null;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t.t === 'ws' || t.t === 'com') continue;
    if (t.t === 'id' && !(prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.'))) refs.add(t.v);
    prev = t;
  }
  return refs;
}

// ---- the bundle ----
const entry = load(ENTRY);
for (let changed = true; changed;) {   // load every module the kept ones import
  changed = false;
  for (const m of [...modules.values()]) for (const imp of m.imports.values()) if (imp.path && !modules.has(imp.path)) { load(imp.path); changed = true; }
}

// resolve a name used in module m to the item that declares it
function resolve(m, name, seen = new Set()) {
  const key = `${m.path}:${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const own = m.items.find((it) => it.names && it.names.includes(name));
  if (own) return { m, it: own, name };
  const imp = m.imports.get(name);
  if (!imp) return null;
  if (imp.external) return { external: imp.external, name: imp.name };
  const t = modules.get(imp.path);
  const local = t.exports.get(imp.name) ?? imp.name;
  return resolve(t, local, seen);
}

const kept = new Set();
const order = [];
const deps = new Map();
const externalsUsed = new Map();   // spec -> Set(names)
function keep(m, it) {
  if (kept.has(it)) return;
  kept.add(it);
  const ds = [];
  for (const r of references(it)) {
    const d = resolve(m, r);
    if (!d) continue;
    if (d.external) { if (!externalsUsed.has(d.external)) externalsUsed.set(d.external, new Set()); externalsUsed.get(d.external).add(`${d.name}${d.name === r ? '' : ` as ${r}`}`); continue; }
    if (d.it === it) continue;
    ds.push(d);
    keep(d.m, d.it);
  }
  deps.set(it, ds);
  // a statement with effects in a kept module is kept (none are expected; the report lists them)
}
for (const [as, local] of entry.exports) { if (CALL && as !== CALL) continue; const d = resolve(entry, local); if (d && !d.external) keep(d.m, d.it); }   // (--call: that export alone)
// top-level statements of modules that contribute anything
const statements = [];
for (const m of modules.values()) if (m.items.some((it) => kept.has(it))) for (const it of m.items) if (it.kind === 'statement') { statements.push({ m, it }); keep(m, it); }

// item order: depth-first, dependencies first, modules in load order
const itemModule = new Map();
for (const m of modules.values()) for (const it of m.items) itemModule.set(it, m);
const placed = new Set();
function place(it) {
  if (placed.has(it)) return;
  placed.add(it);
  for (const d of deps.get(it) ?? []) place(d.it);
  order.push(it);
}
for (const m of modules.values()) for (const it of m.items) if (kept.has(it)) place(it);
// (a cycle through function bodies can put a const before a const its initialiser reads: say so)
{
  const at = new Map(order.map((it, k) => [it, k]));
  for (const it of order) {
    if (it.kind === 'function') continue;
    for (const d of deps.get(it) ?? []) if (d.it.kind !== 'function' && d.it !== it && at.get(d.it) > at.get(it))
      console.error(`bundle: warning: ${it.names.join(',')} (${itemModule.get(it).path}) is placed before ${d.it.names.join(',')}, which it uses`);
  }
}

// names declared by kept items in more than one module are renamed in each
const declaredBy = new Map();
for (const it of kept) for (const n of it.names) {
  const m = itemModule.get(it);
  if (!declaredBy.has(n)) declaredBy.set(n, new Set());
  declaredBy.get(n).add(m);
}
// (and a name that is also a global's: ast.js's Set, an assignment node, would hide the Set class
// from every module that does not import it)
const GLOBALS = new Set(['Set', 'Map', 'WeakMap', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Math', 'JSON', 'Date', 'Error',
  'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'Symbol', 'Promise', 'RegExp', 'Function', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'Infinity', 'NaN', 'undefined', 'console', 'globalThis', 'process', 'BigInt', 'Reflect', 'Proxy',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array',
  'Float64Array', 'ArrayBuffer', 'DataView', 'escape', 'unescape', 'eval', 'encodeURIComponent', 'decodeURIComponent']);
const renamed = new Map();   // module -> Map(name -> new name)
for (const [n, ms] of declaredBy) if (ms.size > 1 || GLOBALS.has(n)) for (const m of ms) {
  if (!renamed.has(m)) renamed.set(m, new Map());
  renamed.get(m).set(n, `${n}$${m.id}`);
}
// the bundle name of a name as module m sees it
function bundleName(m, name) {
  const d = resolve(m, name);
  if (!d || d.external) return name;
  return renamed.get(d.m)?.get(d.name) ?? d.name;
}

// Rewrite one item: drop `export `, and spell each reference to a top-level name by its bundle
// name. Object keys stay; a shorthand { x } becomes { x: x$m }.
function emit(it) {
  const m = itemModule.get(it);
  const ts = it.toks;
  const sigIdx = [];
  ts.forEach((t, i) => { if (t.t !== 'ws' && t.t !== 'com') sigIdx.push(i); });
  const nextSig = (i) => { const j = sigIdx.indexOf(i); return j >= 0 && j + 1 < sigIdx.length ? ts[sigIdx[j + 1]] : null; };
  const prevSig = (i) => { const j = sigIdx.indexOf(i); return j > 0 ? ts[sigIdx[j - 1]] : null; };
  // bracket contexts: for each open brace, 'obj' (object literal or pattern) or 'block'
  const stack = [];
  const ternary = [];   // pending ? per bracket level
  let out = '';
  let dropExport = it.exported;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (dropExport && t.t === 'id' && t.v === 'export') { dropExport = false; const n = ts[i + 1]; if (n && n.t === 'ws') i++; continue; }
    if (t.t === 'p' && (t.v === '{' || t.v === '(' || t.v === '[')) {
      if (t.v === '{') {
        const p = prevSig(i);
        const obj = !p || ['(', ',', '=', ':', '[', '?', '...', '||', '&&', '??', 'return'].includes(p.v) || ['const', 'let', 'var'].includes(p.v) || (p.t === 'tpl' && p.v.endsWith('${'));
        stack.push(obj ? 'obj' : 'block');
      } else stack.push(t.v);
      ternary.push(0);
      out += t.v;
      continue;
    }
    if (t.t === 'p' && (t.v === '}' || t.v === ')' || t.v === ']')) { stack.pop(); ternary.pop(); out += t.v; continue; }
    if (t.t === 'tpl') {
      if (t.v.startsWith('}')) { stack.pop(); ternary.pop(); }
      if (t.v.endsWith('${')) { stack.push('('); ternary.push(0); }
      out += t.v;
      continue;
    }
    if (t.t === 'p' && t.v === '?') ternary[ternary.length - 1]++;
    if (t.t === 'p' && t.v === ':' && ternary[ternary.length - 1] > 0) ternary[ternary.length - 1]--;
    if (t.t !== 'id') { out += t.v; continue; }
    const p = prevSig(i), n = nextSig(i);
    const member = p && p.t === 'p' && (p.v === '.' || p.v === '?.');
    const top = stack[stack.length - 1];
    const keyPos = top === 'obj' && p && (p.v === '{' || p.v === ',');
    const nb = member ? t.v : bundleName(m, t.v);
    if (member || nb === t.v) { out += t.v; continue; }
    if (keyPos && n && (n.v === '(' )) { out += t.v; continue; }                       // a method
    if (keyPos && n && n.v === ':' && ternary[ternary.length - 1] === 0) { out += t.v; continue; }   // a key
    if (keyPos && n && (n.v === ',' || n.v === '}' || n.v === '=')) { out += `${t.v}: ${nb}`; continue; }   // shorthand
    out += nb;
  }
  return out;
}

const header = [`// The cji compiler as one program (tools/bundle.mjs from ${ENTRY}, target ${TARGET}): generated, do not edit.`];
const body = [];
if (TARGET === 'node') for (const [spec, names] of externalsUsed) header.push(`import { ${[...names].join(', ')} } from '${spec}';`);
for (const it of order) {
  if (it.kind === 'import' || it.kind === 'exportlist' || it.kind === 'blank') continue;
  const text = emit(it).replace(/^\s*\n/, '');
  if (ORIGINS) {
    const m = itemModule.get(it), first = it.toks.find((t) => t.t !== 'ws' && t.t !== 'com');
    body.push(`//@ ${m.path}:${m.src.slice(0, first ? first.s : 0).split('\n').length}\n` + text.replace(/^(\s*\/\/[^\n]*\n)*/, ''));
  } else body.push(text);
}
const entryNames = [...entry.exports.keys()].map((n) => bundleName(entry, entry.exports.get(n)));
let main = '';
if (TARGET === 'node')
  main = `\n// ---- main (node): node bundle.js FILE [--native] prints the SLIR ----\n{ const fs = await import('node:fs'); const f = process.argv[2]; if (f) process.stdout.write(${bundleName(entry, 'compileSource')}(fs.readFileSync(f, 'utf8'), process.argv.includes('--native'))); }\n`;
else
  main = `\n// ---- main (cji): the stage-1 compiler's input and output, native primitives in chapter 31's style ----\n` +
    `function $nat_read_input() /*: String */ { return ''; }\n` +
    `function $nat_write_output(s /*: String */) /*: Int */ { return s.length; }\n` +
    `function $nat_arg_flag(name /*: String */) /*: Bool */ { return false; }\n` +
    // (the argument after a flag, '' when there is none; a file's text)
    `function $nat_arg_value(name /*: String */) /*: String */ { return ''; }\n` +
    `function $nat_read_file(path /*: String */) /*: String */ { return ''; }\n` +
    // (--stats: after each pass, the live heap after a full collection, written to stderr by the runtime)
    `function $nat_pass_live(name /*: String */, ms /*: Int */) /*: Int */ { return 0; }\n` +
    // (stage 1's file store for spilling: rt_spill_put and rt_spill_get keep the texts in a file; the
    // reference bodies keep them in an array)
    `const $spilled /*: String[] */ = [];\n` +
    `function $nat_spill_put(text /*: String */) /*: Int */ { $spilled.push(text); return $spilled.length - 1; }\n` +
    `function $nat_spill_get(id /*: Int */) /*: String */ { return $spilled[id]; }\n` +
    (CALL   // (--call f: f of the input as JSON, for the census of one pass on a dynamic IR)
      ? `$nat_write_output(JSON.stringify(${bundleName(entry, CALL)}(JSON.parse($nat_read_input()))));\n`
      // (FILE [--native | --world-unit | --prelude-unit | --world [--driver SCRIPT]] [--spill] [--stats]:
      // the SLIR written function by function)
      : `$nat_write_output(${bundleName(entry, 'compileSource')}($nat_read_input(), $nat_arg_flag('--native'), {\n` +
        `  mode: $nat_arg_flag('--world-unit') ? 'unit' : $nat_arg_flag('--prelude-unit') ? 'prelude'\n` +
        `    : $nat_arg_flag('--world') || $nat_arg_flag('--driver') ? 'world' : '',\n` +
        `  driver: $nat_arg_flag('--driver') ? $nat_read_file($nat_arg_value('--driver')) : '',\n` +
        `  store: $nat_arg_flag('--spill') ? ${bundleName(entry, 'hostStore')}((t) => $nat_spill_put(t), (id) => $nat_spill_get(id)) : null,\n` +
        `  write: (t) => $nat_write_output(t),\n` +
        `  onPass: $nat_arg_flag('--stats') ? (name, ms) => $nat_pass_live(name, ms) : null }));\n`);
const text = `${header.join('\n')}\n\n${body.join('\n')}\n${main}`;
if (OUT) writeFileSync(OUT, text); else process.stdout.write(text);

if (REPORT) {
  const total = [...modules.values()].reduce((s, m) => s + m.items.filter((it) => it.kind !== 'blank' && it.kind !== 'import' && it.kind !== 'exportlist').length, 0);
  const lines = text.split('\n').length;
  console.error(`bundle: ${modules.size} modules, ${kept.size} of ${total} items kept, ${lines} lines`);
  for (const m of modules.values()) {
    const k = m.items.filter((it) => kept.has(it)).length, all = m.items.filter((it) => it.kind !== 'blank' && it.kind !== 'import' && it.kind !== 'exportlist').length;
    console.error(`  ${relative('.', m.path).padEnd(26)} ${String(k).padStart(4)} of ${String(all).padStart(4)}`);
  }
  console.error(`renamed: ${[...renamed].map(([m, r]) => `${m.id}: ${[...r.keys()].join(' ')}`).join('; ') || 'none'}`);
  console.error(`externals: ${[...externalsUsed].map(([s, n]) => `${s} {${[...n].join(', ')}}`).join('; ') || 'none'}`);
  console.error(`top-level statements kept: ${statements.length}${statements.length ? ' (' + statements.map(({ m, it }) => `${m.id}: ${sig(it.toks).slice(0, 4).map((t) => t.v).join(' ')}`).join('; ') + ')' : ''}`);
}
