// Abstract syntax trees.
//
// A node is a plain object with a `kind` field. Constructors keep the field names in one
// place; `show` prints any tree as an S-expression, which is how every IR in this book is
// dumped and how tests compare trees.

// ---- L_Int --------------------------------------------------------------------------
export const Int = (value) => ({ kind: 'Int', value });
export const Prim = (op, args) => ({ kind: 'Prim', op, args });
// `type` is filled in by the type checker (chapter 4): console.log prints an Int and a Bool
// differently, and after the type checker nothing else knows which one an operand is.
// Chapter 10: `end` is ' ' for every value of a console.log of several but the last, which
// ends the line (undefined).
export const Print = (arg, type, end) => ({ kind: 'Print', arg, type, end });
export const Program = (body) => ({ kind: 'Program', body });

// ---- L_Var (chapter 2) --------------------------------------------------------------
export const Var = (name) => ({ kind: 'Var', name });
// `type` (chapter 8) is filled in by the type checker; closure conversion needs it.
export const Const = (name, init, type) => ({ kind: 'Const', name, init, type });
export const Block = (body) => ({ kind: 'Block', body });

// ---- C_Var (chapter 2): statements in labelled blocks, each ending in a tail -------
export const Assign = (name, exp) => ({ kind: 'Assign', name, exp });
export const Return = (arg) => ({ kind: 'Return', arg });
export const CBlock = (label, stmts, tail) => ({ kind: 'CBlock', label, stmts, tail });
export const CProgram = (blocks) => ({ kind: 'CProgram', blocks });

// ---- L_If (chapter 4) ---------------------------------------------------------------
export const Bool = (value) => ({ kind: 'Bool', value });
export const If = (cond, thn, els) => ({ kind: 'If', cond, thn, els });              // c ? a : b
export const IfStmt = (cond, thn, els) => ({ kind: 'IfStmt', cond, thn, els });      // els may be null
// L_If^mon only: run the declarations, then evaluate exp. remove_complex_operands puts
// the temporaries a branch of `?:` needs inside that branch.
export const Begin = (stmts, exp) => ({ kind: 'Begin', stmts, exp });

// ---- L_While (chapter 5) ------------------------------------------------------------
export const Let = (name, init, type) => ({ kind: 'Let', name, init, type });
// x = e, x += e, ...: an expression whose value is the value assigned. `op` is null for =,
// or '+', '-', '*' for the compound forms (shrink removes them).
export const Set = (name, exp, op = null) => ({ kind: 'Set', name, exp, op });
export const ExprStmt = (exp) => ({ kind: 'ExprStmt', exp });
// Chapter 10: a loop has a label, which break and continue name, and an update, which
// continue runs before the next test (a for loop's i++).
export const While = (cond, body, update = null, label = null) => ({ kind: 'While', cond, body, update, label });
export const Break = (label) => ({ kind: 'Break', label });
export const Continue = (label) => ({ kind: 'Continue', label });
// A number that is not a safe integer, such as 1.5: a constant of type Number (chapter 10).
export const Num = (value) => ({ kind: 'Num', value });

// Chapter 13: strings and records.
export const Str = (value) => ({ kind: 'Str', value });                               // 'text'
export const Record = (fields) => ({ kind: 'Record', fields });                      // { a: e, b: e }; fields: [{ name, exp }]
export const Get = (obj, name) => ({ kind: 'Get', obj, name });                      // o.name
export const SetProp = (obj, name, exp) => ({ kind: 'SetProp', obj, name, exp });    // o.name = e
export const MethodCall = (obj, name, args) => ({ kind: 'MethodCall', obj, name, args });   // o.name(args)
export const Shape = (names, error = false) => ({ kind: 'Shape', names, error });   // (chapter 14: an Error's)                          // a record's field names, static

// Chapter 14: exceptions. A catch (e) block starts with let e = Caught(), the value thrown.
export const Throw = (arg) => ({ kind: 'Throw', arg });
// Chapter 15: Array.from(...), Array.isArray(x), new Array(n), until instantiate_library.
export const LibCall = (name, args) => ({ kind: 'LibCall', name, args });
// Chapter 16: await e, inside an async function, until lower_async.
export const Await = (arg) => ({ kind: 'Await', arg });
export const Try = (body, handler, finalizer) => ({ kind: 'Try', body, handler, finalizer });   // blocks; handler, finalizer may be null
export const Caught = () => ({ kind: 'Caught' });
export const SetGlobal = (name, value) => ({ kind: 'SetGlobal', name, value });      // C: a runtime global := atom
export const Uncaught = () => ({ kind: 'Uncaught' });                                // C: report an exception nobody caught
// A read of a variable that is assigned somewhere (uncover_get marks them): unlike Var, not
// an atom, because its value depends on when it is read.
export const GetBang = (name) => ({ kind: 'GetBang', name });

// ---- L_Array (chapter 6) ------------------------------------------------------------
// [e1, e2, ...]; `type` (such as 'Int[]') is filled in by the type checker.
export const ArrayLit = (elems, type) => ({ kind: 'ArrayLit', elems, type });
export const Index = (arr, idx) => ({ kind: 'Index', arr, idx });                    // a[i]
export const SetIndex = (arr, idx, exp, op = null) => ({ kind: 'SetIndex', arr, idx, exp, op });  // a[i] = e
// Introduced by the passes: a run-time error, the allocator's pieces, and a store.
export const Trap = (message) => ({ kind: 'Trap', message });
export const GlobalValue = (name) => ({ kind: 'GlobalValue', name });               // free_ptr, ...
export const Allocate = (length, type) => ({ kind: 'Allocate', length, type });     // header written
export const Collect = (bytes) => ({ kind: 'Collect', bytes });
export const Store = (arr, idx, val) => ({ kind: 'Store', arr, idx, val });         // a[i] = v; no check

// ---- L_Fun (chapter 7) --------------------------------------------------------------
// function name(p1 /*: T1 */, ...) /*: R */ { body }: params are [{ name, type }].
export const FunDef = (name, params, retType, body) => ({ kind: 'FunDef', name, params, retType, body });
export const Call = (fn, args) => ({ kind: 'Call', fn, args });
export const FunRef = (name, arity) => ({ kind: 'FunRef', name, arity });   // a function as a value
// After shrink: the functions, with the top-level statements in a function called main.
export const ProgramDefs = (defs) => ({ kind: 'ProgramDefs', defs });
// C_Fun: a function's blocks; and a call in tail position, which replaces the caller.
export const CDef = (name, params, blocks) => ({ kind: 'CDef', name, params, blocks });
export const CProgramDefs = (defs) => ({ kind: 'CProgramDefs', defs });
export const TailCall = (fn, args) => ({ kind: 'TailCall', fn, args });

// ---- L_Dyn (chapter 9) --------------------------------------------------------------
// A constant of type Any: a number that is not a safe integer (1.5, 1e300), undefined or null.
export const AnyLit = (value) => ({ kind: 'AnyLit', value });

// ---- L_Lambda (chapter 8) -----------------------------------------------------------
// (p1 /*: T1 */, ...) /*: R */ => body; an expression body becomes [Return(e)]. `name` is
// a fresh name given by uniquify, under which closure conversion lifts it.
export const Lambda = (params, retType, body, name) => ({ kind: 'Lambda', params, retType, body, name });
// After convert_assignments: the placeholder a box holds before its variable is declared.
export const Uninit = (type) => ({ kind: 'Uninit', type });
// After convert_to_closures: a new closure of a lifted function, with the values of its free
// variables; field k of a closure (0 is the code address); the one static closure of a
// function with no free variables.
export const Closure = (fn, fvs, types) => ({ kind: 'Closure', fn, fvs, types });
export const EnvRef = (env, field, type) => ({ kind: 'EnvRef', env, field, type });
export const StaticClosure = (fn) => ({ kind: 'StaticClosure', fn });

// ---- C_If (chapter 4): two more tails ------------------------------------------------
export const Goto = (label) => ({ kind: 'Goto', label });
export const IfGoto = (cond, thn, els) => ({ kind: 'IfGoto', cond, thn, els });     // thn, els: labels

// ---- printing -----------------------------------------------------------------------

// Fields printed for each kind, in order. Arrays print as their elements.
const FIELDS = {
  Int: ['value'],
  Prim: ['op', 'args'],
  Print: ['arg', 'type'],
  Break: ['label'],
  Continue: ['label'],
  Num: ['value'],
  Str: ['value'],
  Record: ['fields'],
  Get: ['obj', 'name'],
  SetProp: ['obj', 'name', 'exp'],
  MethodCall: ['obj', 'name', 'args'],
  Shape: ['names'],
  Throw: ['arg'],
  LibCall: ['name', 'args'],
  Await: ['arg'],
  Hoisted: [],
  Try: ['body', 'handler', 'finalizer'],
  Caught: [],
  SetGlobal: ['name', 'value'],
  Uncaught: [],
  Program: ['body'],
  Var: ['name'],
  Const: ['name', 'init'],
  Lambda: ['name', 'params', 'retType', 'body'],
  Uninit: ['type'],
  AnyLit: ['value'],
  Closure: ['fn', 'fvs'],
  EnvRef: ['env', 'field', 'type'],
  StaticClosure: ['fn'],
  Block: ['body'],
  Assign: ['name', 'exp'],
  Return: ['arg'],
  CBlock: ['label', 'stmts', 'tail'],
  CProgram: ['blocks'],
  Bool: ['value'],
  If: ['cond', 'thn', 'els'],
  IfStmt: ['cond', 'thn', 'els'],
  Begin: ['stmts', 'exp'],
  Goto: ['label'],
  Let: ['name', 'init'],
  Set: ['name', 'exp', 'op'],
  ExprStmt: ['exp'],
  While: ['label', 'cond', 'body', 'update'],
  GetBang: ['name'],
  ArrayLit: ['elems', 'type'],
  Index: ['arr', 'idx'],
  SetIndex: ['arr', 'idx', 'exp', 'op'],
  Trap: ['message'],
  GlobalValue: ['name'],
  Allocate: ['length', 'type'],
  Collect: ['bytes'],
  Store: ['arr', 'idx', 'val'],
  FunDef: ['name', 'params', 'retType', 'body'],
  Call: ['fn', 'args'],
  FunRef: ['name', 'arity'],
  ProgramDefs: ['defs'],
  CDef: ['name', 'params', 'blocks'],
  CProgramDefs: ['defs'],
  TailCall: ['fn', 'args'],
  IfGoto: ['cond', 'thn', 'els'],
};

export function show(node) {
  if (Array.isArray(node)) return node.map(show).join(' ');
  if (node === null || typeof node !== 'object') return String(node);
  if (node.kind === undefined && node.name !== undefined) return `${node.name}: ${node.type}`;   // a parameter
  if (node.kind === 'AnyLit') return `(AnyLit ${String(node.value)})`;
  if (node.kind === 'Num') return `(Num ${String(node.value)})`;
  if (node.kind === 'Str') return `(Str ${JSON.stringify(node.value)})`;
  if (node.kind === 'Record') return `(Record ${node.fields.map((f) => `${f.name}: ${show(f.exp)}`).join(', ')})`;
  if (node.kind === 'Shape') return `(Shape ${node.names.join(' ')})`;
  const fields = FIELDS[node.kind];
  if (!fields) throw new Error(`show: unknown node kind ${node.kind}`);
  const parts = fields.filter((f) => node[f] !== undefined).map((f) => show(node[f])).filter((s) => s !== '');
  return `(${node.kind}${parts.length ? ' ' + parts.join(' ') : ''})`;
}

// Multi-line form for programs: one statement per line, blocks indented.
export function showProgram(p) {
  const lines = [];
  const stmt = (s, depth) => {
    const pad = '  '.repeat(depth);
    if (s.kind === 'Block' && s.body.length) {
      lines.push(`${pad}(Block`);
      s.body.forEach((t) => stmt(t, depth + 1));
      lines[lines.length - 1] += ')';
    } else if (s.kind === 'FunDef') {
      lines.push(`${pad}(FunDef ${s.name} (${s.params.map(show).join(', ')}) ${s.retType}`);
      s.body.forEach((t) => stmt(t, depth + 1));
      lines[lines.length - 1] += ')';
    } else if (s.kind === 'While') {
      lines.push(`${pad}(While ${show(s.cond)}`);
      stmt(s.body, depth + 1);
      lines[lines.length - 1] += ')';
    } else if (s.kind === 'IfStmt') {
      lines.push(`${pad}(IfStmt ${show(s.cond)}`);
      stmt(s.thn, depth + 1);
      if (s.els) stmt(s.els, depth + 1);
      lines[lines.length - 1] += ')';
    } else lines.push(pad + show(s));
  };
  if (p.kind === 'ProgramDefs') {
    p.defs.forEach((d) => stmt(d, 1));
    return `(ProgramDefs\n${lines.join('\n')})`;
  }
  p.body.forEach((s) => stmt(s, 1));
  return `(Program\n${lines.join('\n')})`;
}

// C_Var programs print in a C-like form, one statement per line.
export function showC(p) {
  const exp = (e) => {
    switch (e.kind) {
      case 'Int': return String(e.value);
      case 'Num': return String(e.value);
      case 'Str': return JSON.stringify(e.value);
      case 'Shape': return `${e.error ? 'error' : ''}shape(${e.names.join(',')})`;
      case 'Caught': return 'caught';
      case 'Bool': return String(e.value);
      case 'Var': return e.name;
      case 'GlobalValue': return e.name;
      case 'Index': return `${exp(e.arr)}[${exp(e.idx)}]`;
      case 'Allocate': return `allocate(${e.length}, ${e.type})`;
      case 'FunRef': return `${e.name}/${e.arity}`;
      case 'EnvRef': return `${exp(e.env)}[${e.field}]`;
      case 'StaticClosure': return `static_closure(${e.fn})`;
      case 'Uninit': return 'uninitialized';
      case 'AnyLit': return String(e.value);
      case 'Call': return `${exp(e.fn)}(${e.args.map(exp).join(', ')})`;
      case 'Prim':
        if (e.op === 'neg') return `-${exp(e.args[0])}`;
        if (e.op === '!') return `!${exp(e.args[0])}`;
        if (e.op === 'length') return `${exp(e.args[0])}.length`;
        if (e.args.length !== 2 || /^[a-z]/.test(e.op)) return `${e.op}(${e.args.map(exp).join(', ')})`;
        return `${exp(e.args[0])} ${e.op} ${exp(e.args[1])}`;
      default: return show(e);
    }
  };
  const stmt = (s) => {
    switch (s.kind) {
      case 'Assign': return `${s.name} = ${exp(s.exp)};`;
      case 'Print': return `console.log(${exp(s.arg)});`;
      case 'Return': return `return ${exp(s.arg)};`;
      case 'Goto': return `goto ${s.label};`;
      case 'Store': return `${exp(s.arr)}[${exp(s.idx)}] = ${exp(s.val)};`;
      case 'Collect': return `collect(${s.bytes});`;
      case 'Trap': return `trap(${JSON.stringify(s.message)});`;
      case 'SetGlobal': return `${s.name} = ${exp(s.value)};`;   // chapter 14
      case 'Uncaught': return 'uncaught(exc_value);';
      case 'TailCall': return `return ${exp(s.fn)}(${s.args.map(exp).join(', ')});   // tail call`;
      case 'IfGoto': return `if (${exp(s.cond)}) goto ${s.thn}; else goto ${s.els};`;
      default: return show(s);
    }
  };
  const blocks = (bs) => bs.map((b) => `${b.label}:\n${[...b.stmts, b.tail].map((s) => '    ' + stmt(s)).join('\n')}`).join('\n');
  if (p.kind === 'CProgramDefs')
    return p.defs.map((d) => `function ${d.name}(${d.params.join(', ')}) {\n${blocks(d.blocks)}\n}`).join('\n');
  return blocks(p.blocks);
}
