// The types infer_types gives a program's declarations, parameters and results, and the
// operations on Ints it makes doubles (chapters 11 and 12), one per line. tools/types.mjs
// prints it; a test with a .types file next to it must describe itself so (run-tests.js).
const name = (n) => n.replace(/\.\d+$/, '');
function show(e) {
  switch (e.kind) {
    case 'Var': return name(e.name);
    case 'Int': case 'Num': return String(e.value);
    case 'Prim': return e.args.length === 1 ? `${e.op === 'neg' ? '-' : e.op}${show(e.args[0])}` : `${show(e.args[0])} ${e.op} ${show(e.args[1])}`;
    case 'Index': return `${show(e.arr)}[${show(e.idx)}]`;
    case 'Call': return `${show(e.fn)}(${e.args.map(show).join(', ')})`;
    default: return e.kind;
  }
}

export function describeTypes(p) {
  const out = [];
  (function walk(x, indent) {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach((y) => walk(y, indent)); return; }
    if ((x.kind === 'Let' || x.kind === 'Const') && !x.name.startsWith('#') && x.init.kind !== 'Lambda')
      out.push(`${indent}${x.kind === 'Let' ? 'let' : 'const'} ${name(x.name)}: ${x.type}`);
    if (x.kind === 'FunDef' || x.kind === 'Lambda') {
      const title = x.kind === 'FunDef' ? `function ${name(x.name)}` : 'lambda';
      out.push(`${indent}${title}(${x.params.map((q) => `${name(q.name)}: ${q.type}`).join(', ')}): ${x.retType}`);
      walk(x.body, `${indent}  `);
      return;
    }
    // an operation the ranges made a double, when its operands are still Ints
    if (x.kind === 'Prim' && x.double) out.push(`${indent}double: ${show(x)}`);
    for (const v of Object.values(x)) if (typeof v === 'object') walk(v, indent);
  })(p.body, '');
  return out.join('\n') + '\n';
}
