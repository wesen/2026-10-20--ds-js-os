// Chapter 28: canonical_names, a function's name from what it is.
//
// uniquify numbers every function in the order it meets them, so the same runtime function is
// JSON$value.83 in one world and JSON$value.90 in another, and the same lambda is lambda.214
// here and lambda.631 there. To share one copy of a function between worlds, the copies must
// have the same name. This pass renames every function after its content: its base name, a
// dot, and twelve hex digits of a hash of its code and of everything it names.
//
// The hash of a function covers its instructions (labels numbered by their order, so that the
// compiler's global label counter does not matter) and, in place of each function it calls,
// tail-calls, takes the address of or makes a static closure of, that function's hash. Calls
// can be recursive, so the hashes are computed per strongly connected component of the
// reference graph, callees first: inside a component, a function's code is encoded by a walk
// from it that follows its references in order, numbering the component's members as it meets
// them. Two functions get the same hash only if the code reachable from them is the same,
// instruction for instruction, and that holds across programs: the hash is a function of the
// code alone, never of the program around it.
//
// Two functions of one program with the same hash keep different names (the second gets x2,
// and so on): a static closure is a function's identity, and two function expressions are
// never === in JavaScript. main keeps its name. (CJI-3, lane 5: they share one body all the same;
// see sharedBodies.)
import { sha1Hex } from './sha1.js';   // (CJI-3: in the subset; node:crypto gave the same digests)
import { showInstr, SFunc, SBlock, Ins } from './slir.js';

const REFS = new Set(['call', 'tailcall', 'closure', 'funref']);
const base = (name) => name.replace(/\.\d+$/, '');

// (CJI-3: in pieces, so that a build can describe each function as soon as it is finished and drop
// its IR. canonParts gives a function's code with every function it names left as a hole, \u0001k\u0001
// for its k-th reference; a hole is '@' in the hashed text when the name is one of the program's
// functions, and the name itself otherwise. A raw \u0001 never occurs in SLIR text: strings are
// printed as JSON, which escapes it.)
export const HOLE = (k) => `\u0001${k}\u0001`;
export const HOLES = /\u0001(\d+)\u0001/g;
export function canonParts(f) {
  const labels = new Map(f.blocks.map((b, k) => [b.label, `L${k}`]));
  const out = [`${f.nparams}`, f.frame ? `${f.frame.scratches} ${f.frame.saveds} ${f.frame.local}` : ''];
  const refs = [], closures = [];   // (lane 5: closures, which references are `closure`s: see sharedBodies)
  for (const b of f.blocks) {
    out.push(`${labels.get(b.label)}:`);
    for (const i of b.instrs) {
      let j = i;
      if (REFS.has(i.op)) {
        if (i.op === 'closure') closures.push(refs.length);
        j = { ...i, fn: HOLE(refs.length) };
        refs.push(i.fn);
      }
      if (i.target !== undefined && labels.has(i.target)) j = { ...j, target: labels.get(i.target) };
      out.push(showInstr(j));
    }
  }
  return { text: out.join('\n'), refs, closures };
}

// The names, from every function's references and hashed text (refsOf, textOf: by name; a build that
// spills fetches a text only when its component is hashed), in program order: main keeps its name, and
// two functions of one program with the same hash get x2, x3, ...
export function canonNamesOf(order, refsOf, textOf) {
  const inProgram = new Set(order);
  const refs = new Map();
  for (const name of order) refs.set(name, refsOf(name).filter((r) => inProgram.has(r)));
  const hashedText = (name) => {
    const rs = refsOf(name);
    return textOf(name).replace(HOLES, (_, k) => (inProgram.has(rs[+k]) ? '@' : rs[+k]));
  };
  const hash = new Map();
  for (const scc of components(order, refs)) {
    const inside = new Set(scc), text = new Map(scc.map((name) => [name, hashedText(name)]));
    for (const root of scc) {
      // the code reachable from root inside the component, in the order a walk meets it
      const ids = new Map([[root, 0]]), walk = [root], pieces = [];
      for (let k = 0; k < walk.length; k++) {
        const name = walk[k];
        const named = refs.get(name).map((r) => {
          if (!inside.has(r)) return hash.get(r);
          if (!ids.has(r)) { ids.set(r, walk.length); walk.push(r); }
          return `@${ids.get(r)}`;
        });
        pieces.push(`${text.get(name)}\n=> ${named.join(' ')}`);
      }
      // (members are hashed after the whole component is walked: none sees another's hash)
      hash.set(root, sha1Hex(pieces.join('\n--\n')).slice(0, 12));
    }
  }
  const names = new Map(), used = new Map();
  for (const name of order) {
    if (name === 'main') { names.set(name, name); continue; }
    const n0 = `${base(name)}.${hash.get(name)}`;
    const n = (used.get(n0) ?? 0) + 1;
    used.set(n0, n);
    names.set(name, n === 1 ? n0 : `${n0}x${n}`);
  }
  return names;
}

// (CJI-3, lane 5) One body per canonical name. Two functions with the same name but for x2, x3, ... are the
// same code, instruction for instruction, and so, reference by reference, are the functions they name. One
// body serves them all: a call, a tail call or a code address (funref) of any of them goes to the first one,
// the representative, and the others are not emitted. What stays apart is identity: `closure d, f` is f's
// static closure, one per function (two function expressions are never ===). So a function whose static
// closure the program takes stays, under its own name, as a stub that tail-calls the shared body (stubOf):
// the static closure is the stub's, its arity the same. And two functions are one only if they take the same
// static closures: the classes start as the canonical names and are split until every member of a class
// names, at each reference, the same class (for a call, a tail call or a code address) or the same function
// (for a static closure). main and a native world's entries ($nw...), which C calls by name, stay apart.
// Gives each function's representative (itself, when it is emitted whole) and the functions whose static
// closure is taken.
export function sharedBodies(order, refsOf, closuresOf, names) {
  let cls = classesBy(order, (name) => {
    const n = names.get(name);
    return n === 'main' || n.startsWith('$nw') ? n : n.replace(/x\d+$/, '');
  });
  for (;;) {
    const was = cls;
    const next = classesBy(order, (name) => {
      const rs = refsOf(name), cs = closuresOf(name), key = [`${was.map.get(name)}`];
      for (let k = 0; k < rs.length; k++) {
        if (!was.map.has(rs[k])) continue;   // (a name outside the program is in the hashed text)
        key.push(cs.includes(k) ? `=${names.get(rs[k])}` : `${was.map.get(rs[k])}`);
      }
      return key.join(' ');
    });
    if (next.count === was.count) break;   // (each round splits classes: the same count, the same classes)
    cls = next;
  }
  const first = new Map(), rep = new Map(), closed = new Set();
  for (const name of order) {
    const c = cls.map.get(name);
    if (!first.has(c)) first.set(c, name);
    rep.set(name, first.get(c));
    const rs = refsOf(name);
    for (const k of closuresOf(name)) closed.add(rs[k]);
  }
  return { rep, closed };
}
function classesBy(order, keyOf) {
  const ids = new Map(), map = new Map();
  for (const name of order) {
    const key = keyOf(name);
    if (!ids.has(key)) ids.set(key, ids.size);
    map.set(name, ids.get(key));
  }
  return { map, count: ids.size };
}
// a function that is another's code under its own static closure: its arguments, r0.., go on untouched
export const stubOf = (name, rep, n) => SFunc(name, n, [SBlock('start', [Ins('tailcall', [], { fn: rep, nargs: n })])], { scratches: n, saveds: 0, local: 0 });

export function canonicalNames(p) {
  const order = p.funcs.map((f) => f.name);
  const parts = new Map(p.funcs.map((f) => [f.name, canonParts(f)]));
  const names = canonNamesOf(order, (name) => parts.get(name).refs, (name) => parts.get(name).text);
  const { rep, closed } = sharedBodies(order, (name) => parts.get(name).refs, (name) => parts.get(name).closures, names);
  const rename = (i) => (REFS.has(i.op) && names.has(i.fn) ? { ...i, fn: names.get(i.op === 'closure' ? i.fn : rep.get(i.fn)) } : i);
  const funcs = [];
  for (const f of p.funcs) {
    if (rep.get(f.name) !== f.name) {
      if (closed.has(f.name)) funcs.push(stubOf(names.get(f.name), names.get(rep.get(f.name)), f.nparams));
      continue;
    }
    funcs.push({ ...f, name: names.get(f.name), blocks: f.blocks.map((b) => ({ ...b, instrs: b.instrs.map(rename) })) });
  }
  return { ...p, funcs };
}

// Tarjan's strongly connected components, each listed after every component it reaches.
function components(names, refs) {
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  let next = 0;
  for (const start of names) {
    if (index.has(start)) continue;
    // an explicit stack: the call graph of a world is deep enough to overflow recursion
    const work = [[start, 0]];
    index.set(start, next); low.set(start, next); next++; stack.push(start); onStack.add(start);
    while (work.length) {
      const top = work[work.length - 1];
      const [v, k] = top;
      const rs = refs.get(v) ?? [];
      if (k < rs.length) {
        top[1]++;
        const w = rs[k];
        if (!refs.has(w)) continue;
        if (!index.has(w)) {
          index.set(w, next); low.set(w, next); next++; stack.push(w); onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work[work.length - 1][0];
        low.set(u, Math.min(low.get(u), low.get(v)));
      }
      if (low.get(v) === index.get(v)) {
        const scc = [];
        let w;
        do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
        out.push(scc);
      }
    }
  }
  return out;
}
