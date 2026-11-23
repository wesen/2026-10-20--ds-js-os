// signatures.mjs: what each generated function needs and takes (PICOCALC-CANDELA-KERNEL-CODEGEN), fixpoints over the
// call graph of the Program (program.mjs):
//   - needsK: it uses the kernel record (module variables, tables, the scene's row buffers, SPECTRAL_ON in the kernel,
//     SKY_ON, a dispatcher) or calls a function that does;
//   - touchesState: it reads or writes module variables or dispatches to scene code (its calls are bound at once);
//   - impure: it writes module variables (select evaluates such arguments eagerly);
//   - the leaves of each aggregate parameter (a vector or struct, passed as its leaves) that the function can read:
//     those it reads by member or swizzle, those a callee it passes the parameter to can read, all of them for any
//     other use. A leaf nobody reads is not passed (WGSL parameters are values and immutable, so this is exact). A
//     dispatcher passes its parameters to every scene's function, so each of those takes the union.
import { walk } from './parse.mjs';
import { VECTORS, COMPONENTS, isVec, vecOf } from './values.mjs';

// The leaf indices of type t that a member path (names, outermost first) selects.
export function pathLeaves(P, t, path) {
  let idx = P.leaves(t).map((_, i) => i), cur = t;
  for (const name of path) {
    if (P.structs.has(cur)) {
      const m = P.structs.get(cur).members.find(m => m.name === name);
      if (!m) return idx;
      idx = idx.slice(m.off, m.off + m.n); cur = m.type;
    } else if (isVec(cur)) {
      const [elem] = VECTORS[cur];
      const ix = [...name].map(ch => COMPONENTS.indexOf(ch));
      if (ix.some(i => i < 0 || i >= idx.length)) return idx;
      idx = ix.map(i => idx[i]); cur = ix.length === 1 ? elem : vecOf(elem, ix.length);
    } else return idx;
  }
  return idx;
}

function ownFacts(P, name, f) {
  const o = { needsK: false, touches: false, writes: false, calls: new Set() };
  const isGlobal = n => P.globals.has(n);
  if (f.dispatch) { o.needsK = true; o.touches = true; for (const s of f.scenes) o.calls.add(s); return o; }
  if (f.forceK) o.needsK = true;
  walk(f.ast.body, n => {
    if (n.k === 'id') {
      if (isGlobal(n.name)) { o.needsK = true; o.touches = true; }
      if (P.tables[n.name] || n.name === 'SKY_ON' || (n.name === 'SPECTRAL_ON' && P.modules.get(f.module).spectral === undefined)) o.needsK = true;
    }
    if (n.k === 'assign') { let t = n.target; while (t.k === 'member' || t.k === 'index') t = t.obj; if (t.k === 'id' && isGlobal(t.name)) { o.writes = true; o.touches = true; o.needsK = true; } }
    if (n.k === 'call') {
      if (P.accessors[n.callee]) o.needsK = true;
      const c = P.resolveFn(n.callee, f.module);
      if (c) o.calls.add(c.name);
    }
  });
  return o;
}

// Direct leaf uses of each aggregate parameter, and the edges (param j of f reads what param k of g reads).
function leafUses(P, f) {
  const params = f.ast.params;
  const uses = params.map(p => P.isAgg(p.type) ? new Set() : null);
  const edges = [];
  const index = new Map(params.map((p, j) => [p.name, j]));
  const all = j => { for (let i = 0; i < P.leaves(params[j].type).length; i++) uses[j].add(i); };
  const aggParam = n => n && n.k === 'id' && index.has(n.name) && uses[index.get(n.name)] !== null;
  // a local of a parameter's name hides it: count every leaf of that parameter as read
  walk(f.ast.body, n => { if ((n.k === 'let' || n.k === 'var') && aggParam({ k: 'id', name: n.name })) all(index.get(n.name)); });
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.k === 'member') {
      const path = [];
      let r = n;
      while (r.k === 'member') { path.unshift(r.name); r = r.obj; }
      if (aggParam(r)) { const j = index.get(r.name); for (const i of pathLeaves(P, params[j].type, path)) uses[j].add(i); return; }
      visit(r);
      return;
    }
    if (n.k === 'call') {
      const g = P.resolveFn(n.callee, f.module);
      n.args.forEach((a, k) => {
        if (g && aggParam(a) && g.ast.params[k] && g.ast.params[k].type === params[index.get(a.name)].type) edges.push([index.get(a.name), g.name, k]);
        else visit(a);
      });
      return;
    }
    if (aggParam(n)) { all(index.get(n.name)); return; }
    for (const key of ['init', 'cond', 'step', 'body', 'then', 'else', 'value', 'target', 'e', 'a', 'b', 'obj', 'idx', 'args']) visit(n[key]);
  };
  visit(f.ast.body);
  return { uses, edges };
}

export function analyse(P) {
  const own = new Map();
  for (const [name, f] of P.fns) own.set(name, ownFacts(P, name, f));
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, o] of own) for (const c of o.calls) {
      const q = own.get(c);
      if (q.needsK && !o.needsK) { o.needsK = true; changed = true; }
      if (q.touches && !o.touches) { o.touches = true; changed = true; }
      if (q.writes && !o.writes) { o.writes = true; changed = true; }
    }
  }
  // leaf uses
  const L = new Map();
  for (const [name, f] of P.fns) {
    if (f.dispatch) {
      const uses = f.ast.params.map(p => P.isAgg(p.type) ? new Set() : null);
      const edges = [];
      for (const s of f.scenes) f.ast.params.forEach((p, j) => { if (uses[j]) edges.push([j, s, j]); });
      L.set(name, { uses, edges });
    } else L.set(name, leafUses(P, f));
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [, { uses, edges }] of L) for (const [j, g, k] of edges) {
      const from = L.get(g).uses[k];
      for (const i of from) if (!uses[j].has(i)) { uses[j].add(i); changed = true; }
    }
  }
  // a dispatcher's scene functions take what the dispatcher passes
  for (const [, f] of P.fns) if (f.dispatch) for (const s of f.scenes) L.get(s).uses = L.get(f.name).uses.map(u => u && new Set(u));
  for (const [name, f] of P.fns) {
    const o = own.get(name), { uses } = L.get(name);
    f.sig = {
      params: f.ast.params.map((p, j) => ({ name: p.name, type: p.type, leaves: uses[j] && [...uses[j]].sort((a, b) => a - b) })),
      ret: f.ast.ret, needsK: o.needsK, touchesState: o.touches, impure: o.writes,
    };
  }
}
