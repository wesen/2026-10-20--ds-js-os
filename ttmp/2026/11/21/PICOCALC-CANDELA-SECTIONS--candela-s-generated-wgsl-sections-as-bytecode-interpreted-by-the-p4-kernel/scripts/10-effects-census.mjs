// 10-effects-census.mjs: where the presets' sections call kernel functions with side effects (design Section 4.6).
//   node 10-effects-census.mjs EXPORT_DIR [OUT.json]
// For every statement of every section function: how many calls with side effects it contains (calls of
// PICOCALC-CANDELA-CPU-KERNEL's kernel.sideEffects, directly or through a generated function that makes one), and
// whether a && or || has one in its right operand. Statements with two or more are the ones whose result depends on
// evaluation order (C++ leaves argument and operand order unspecified; the translator follows WGSL's left to right).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './translator/parse.js';
import { KERNEL_SIDE_EFFECTS } from './translator/isa.js';

const [dir, out] = process.argv.slice(2);
if (!dir) { console.error('usage: node 10-effects-census.mjs EXPORT_DIR [OUT.json]'); process.exit(2); }
const EFFECT = new Set(KERNEL_SIDE_EFFECTS);
const totals = { presets: 0, statements: 0, statementsWithEffects: 0, statementsWithTwoOrMore: 0, shortCircuitWithEffect: 0, callsByFunction: {} };
const where = [];
for (const id of readdirSync(dir).sort()) {
  if (!existsSync(join(dir, id, 'mat.wgsl'))) continue;
  totals.presets++;
  const fns = new Map();
  for (const f of ['field.wgsl', 'mat.wgsl']) for (const fn of parse(readFileSync(join(dir, id, f), 'utf8'), f)) fns.set(fn.name, fn);
  const memo = new Map();
  const fnEffects = name => {
    if (!fns.has(name)) return 0;
    if (!memo.has(name)) { memo.set(name, 0); memo.set(name, count(fns.get(name).body, false)); }
    return memo.get(name);
  };
  // number of effect calls in a node; stmts: also visit nested statements of if/else blocks
  function count(node, top) {
    if (!node) return 0;
    if (Array.isArray(node)) return node.reduce((s, n) => s + count(n, top), 0);
    switch (node.k) {
      case 'call': {
        let n = node.args.reduce((s, a) => s + count(a, top), 0);
        if (EFFECT.has(node.callee)) { n++; if (top) totals.callsByFunction[node.callee] = (totals.callsByFunction[node.callee] || 0) + 1; }
        else if (fnEffects(node.callee)) n++;
        return n;
      }
      case 'member': return count(node.obj, top);
      case 'un': return count(node.a, top);
      case 'bin': {
        const r = count(node.b, top);
        if (top && (node.op === '&&' || node.op === '||') && r) totals.shortCircuitWithEffect++;
        return count(node.a, top) + r;
      }
      case 'let': case 'var': return count(node.init, top);
      case 'assign': return count(node.target, top) + count(node.value, top);
      case 'return': return count(node.value, top);
      case 'expr': return count(node.e, top);
      case 'if': return count(node.cond, top) + count(node.then, top) + count(node.else, top);
      case 'block': return count(node.body, top);
    }
    return 0;
  }
  function visit(stmts, fn) {
    for (const s of stmts || []) {
      if (s.k === 'if') { stat(s.cond, fn, s); visit(s.then && s.then.body ? s.then.body : s.then, fn); visit(s.else && s.else.body ? s.else.body : (s.else ? [s.else] : []), fn); continue; }
      if (s.k === 'block') { visit(s.body, fn); continue; }
      stat(s, fn, s);
    }
  }
  function stat(node, fn, s) {
    totals.statements++;
    const n = count(node, true);
    if (n) totals.statementsWithEffects++;
    if (n >= 2) { totals.statementsWithTwoOrMore++; where.push({ preset: id, fn, line: s.at && s.at.line, calls: n }); }
  }
  for (const [name, fn] of fns) visit(fn.body, name);
}
const res = { ...totals, statementsWithTwoOrMoreAt: where };
console.log(JSON.stringify(res));
if (out) writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
