// Grammar checks: one predicate per language, true when a tree belongs to it.
//
// The harness runs the check for a pass's output language after the pass, so a pass that
// produces a tree outside its declared output language is caught even when the program
// still happens to print the right answer.

import { UNARY, NULLARY, TYPEOF } from './dynamic.js';
import { MATH_OP_NAMES, MATH_SOURCE_OPS } from './math.js';
import { STRING_ARITY, STRING_SOURCE_ARITY } from './strings.js';

export function isExp(e) {
  switch (e.kind) {
    case 'Int':
      return Number.isInteger(e.value);
    case 'Prim':
      return ['neg', '+', '-', '*'].includes(e.op)
        && e.args.length === (e.op === 'neg' ? 1 : 2)
        && e.args.every(isExp);
    default:
      return false;
  }
}

export function isStmt(s) {
  switch (s.kind) {
    case 'Print':
      return isExp(s.arg);
    default:
      return false;
  }
}

export function isLInt(p) {
  return p.kind === 'Program' && p.body.every(isStmt);
}

// ---- L_Var (chapter 2) --------------------------------------------------------------

export function isVarExp(e) {
  switch (e.kind) {
    case 'Int':
      return Number.isInteger(e.value);
    case 'Var':
      return typeof e.name === 'string';
    case 'Prim':
      return ['neg', '+', '-', '*'].includes(e.op)
        && e.args.length === (e.op === 'neg' ? 1 : 2)
        && e.args.every(isVarExp);
    default:
      return false;
  }
}

function isVarStmt(s, isE) {
  switch (s.kind) {
    case 'Print': return isE(s.arg, true);
    case 'Const': return typeof s.name === 'string' && isE(s.init, false);
    case 'Block': return s.body.every((t) => isVarStmt(t, isE));
    default: return false;
  }
}

export function isLVar(p) {
  return p.kind === 'Program' && p.body.every((s) => isVarStmt(s, isVarExp));
}

// L_Var^mon: operands are atoms; console.log takes an atom.
export const isAtom = (e) => e.kind === 'Int' || e.kind === 'Var';
const isMonExp = (e, atomOnly) =>
  isAtom(e) || (!atomOnly && e.kind === 'Prim' && isVarExp(e) && e.args.every(isAtom));

export function isLVarMon(p) {
  return p.kind === 'Program' && p.body.every((s) => isVarStmt(s, isMonExp));
}

// ---- C_Var (chapter 2) --------------------------------------------------------------

function isCStmt(s) {
  switch (s.kind) {
    case 'Assign': return typeof s.name === 'string' && isMonExp(s.exp, false);
    case 'Print': return isAtom(s.arg);
    default: return false;
  }
}

const isCTail = (t) => t.kind === 'Return' && isAtom(t.arg);

export function isCVar(p) {
  return p.kind === 'CProgram' && p.blocks.some((b) => b.label === 'start')
    && p.blocks.every((b) => b.kind === 'CBlock' && b.stmts.every(isCStmt) && isCTail(b.tail));
}

// ---- L_If (chapter 4) ---------------------------------------------------------------

const ARITH = ['neg', '+', '-', '*'];
export const CMP = ['===', '!==', '<', '<=', '>', '>='];
// Chapter 10: comparisons of two Numbers, which branch on doubles.
export const NUM_CMP = ['num===', 'num!==', 'num<', 'num<=', 'num>', 'num>='];
const arityOf = (op) => (op === 'neg' || op === '!' ? 1 : 2);

// L_If as the parser produces it. `opts.shrunk`: no && or ||, every if has an else (after
// shrink). `opts.typed`: every console.log knows its operand's type (after type_check).
function ifExp(e, opts) {
  switch (e.kind) {
    case 'Int': return Number.isInteger(e.value);
    case 'Bool': return typeof e.value === 'boolean';
    case 'Var': return typeof e.name === 'string';
    case 'Prim': {
      const ops = [...ARITH, ...CMP, '!', ...(opts.shrunk ? [] : ['&&', '||'])];
      return ops.includes(e.op) && e.args.length === arityOf(e.op) && e.args.every((a) => ifExp(a, opts));
    }
    case 'If': return ifExp(e.cond, opts) && ifExp(e.thn, opts) && ifExp(e.els, opts);
    default: return false;
  }
}

function ifStmt(s, opts, isE) {
  switch (s.kind) {
    case 'Print': return isE(s.arg, true) && (!opts.typed || s.type === 'Int' || s.type === 'Bool');
    case 'Const': return typeof s.name === 'string' && isE(s.init, false);
    case 'Block': return s.body.every((t) => ifStmt(t, opts, isE));
    case 'IfStmt':
      return isE(s.cond, false) && ifStmt(s.thn, opts, isE)
        && (s.els === null ? !opts.shrunk : ifStmt(s.els, opts, isE));
    default: return false;
  }
}

const ifProgram = (p, opts, isE) => p.kind === 'Program' && p.body.every((s) => ifStmt(s, opts, isE));

export const isLIf = (p) => ifProgram(p, {}, (e) => ifExp(e, {}));
export const isLIfTyped = (p) => ifProgram(p, { typed: true }, (e) => ifExp(e, {}));
export const isLIfShrunk = (p) => ifProgram(p, { typed: true, shrunk: true }, (e) => ifExp(e, { shrunk: true }));

// L_If^mon: operands of operators are atoms, and a branch of ?: that needs temporaries
// declares them in a Begin of its own.
const isIfAtom = (e) => e.kind === 'Int' || e.kind === 'Bool' || e.kind === 'Var';
function monExp(e, atomOnly) {
  if (isIfAtom(e)) return ifExp(e, {});
  if (atomOnly) return false;
  switch (e.kind) {
    case 'Prim': return ifExp(e, { shrunk: true }) && e.args.every(isIfAtom);
    case 'If': return monExp(e.cond, false) && monExp(e.thn, false) && monExp(e.els, false);
    case 'Begin':
      return e.stmts.every((s) => s.kind === 'Const' && monExp(s.init, false)) && monExp(e.exp, false);
    default: return false;
  }
}

export const isLIfMon = (p) => ifProgram(p, { typed: true, shrunk: true }, monExp);

// C_If: operators on atoms; tails return, goto, or branch on a comparison of two atoms.
function cIfExp(e) {
  return isIfAtom(e) || (e.kind === 'Prim' && ifExp(e, { shrunk: true }) && e.args.every(isIfAtom));
}

export function isCIf(p) {
  if (p.kind !== 'CProgram') return false;
  const labels = new Set(p.blocks.map((b) => b.label));
  const stmt = (s) => (s.kind === 'Assign' && typeof s.name === 'string' && cIfExp(s.exp))
    || (s.kind === 'Print' && isIfAtom(s.arg) && (s.type === 'Int' || s.type === 'Bool'));
  const tail = (t) => {
    switch (t.kind) {
      case 'Return': return isIfAtom(t.arg);
      case 'Goto': return labels.has(t.label);
      case 'IfGoto':
        return t.cond.kind === 'Prim' && CMP.includes(t.cond.op) && t.cond.args.every(isIfAtom)
          && labels.has(t.thn) && labels.has(t.els);
      default: return false;
    }
  };
  return labels.has('start') && labels.size === p.blocks.length
    && p.blocks.every((b) => b.kind === 'CBlock' && b.stmts.every(stmt) && tail(b.tail));
}

// ---- L_While (chapter 5) ------------------------------------------------------------

// `opts.get`: reads of assigned variables are GetBang (after uncover_get).
function whileExp(e, opts) {
  switch (e.kind) {
    case 'Int': return Number.isInteger(e.value);
    case 'Bool': return typeof e.value === 'boolean';
    case 'Var': return typeof e.name === 'string';
    case 'GetBang': return !!opts.get && typeof e.name === 'string';
    case 'Prim': {
      const ops = [...ARITH, ...CMP, '!', ...(opts.shrunk ? [] : ['&&', '||'])];
      return ops.includes(e.op) && e.args.length === arityOf(e.op) && e.args.every((a) => whileExp(a, opts));
    }
    case 'If': return whileExp(e.cond, opts) && whileExp(e.thn, opts) && whileExp(e.els, opts);
    case 'Set':
      return typeof e.name === 'string' && whileExp(e.exp, opts)
        && (opts.shrunk ? e.op === null : [null, '+', '-', '*'].includes(e.op));
    default: return false;
  }
}

function whileStmt(s, opts, isE) {
  switch (s.kind) {
    case 'Print': return isE(s.arg, true) && (!opts.typed || s.type === 'Int' || s.type === 'Bool');
    case 'Const': case 'Let': return typeof s.name === 'string' && isE(s.init, false);
    case 'ExprStmt': return !opts.mon && s.exp.kind === 'Set' && isE(s.exp, false);
    case 'Assign': return !!opts.mon && typeof s.name === 'string' && isE(s.exp, false);
    case 'Block': return s.body.every((t) => whileStmt(t, opts, isE));
    case 'IfStmt':
      return isE(s.cond, false) && whileStmt(s.thn, opts, isE)
        && (s.els === null ? !opts.shrunk : whileStmt(s.els, opts, isE));
    case 'While': return isE(s.cond, false) && whileStmt(s.body, opts, isE);
    default: return false;
  }
}

const whileProgram = (p, opts, isE) => p.kind === 'Program' && p.body.every((s) => whileStmt(s, opts, isE));

export const isLWhile = (p) => whileProgram(p, {}, (e) => whileExp(e, {}));
export const isLWhileTyped = (p) => whileProgram(p, { typed: true }, (e) => whileExp(e, {}));
export const isLWhileShrunk = (p) =>
  whileProgram(p, { typed: true, shrunk: true }, (e) => whileExp(e, { shrunk: true }));
export const isLWhileGet = (p) =>
  whileProgram(p, { typed: true, shrunk: true }, (e) => whileExp(e, { shrunk: true, get: true }));

// L_While^mon: as L_If^mon, with assignments as statements (also inside a Begin).
function whileMonExp(e, atomOnly) {
  if (isIfAtom(e)) return ifExp(e, {});
  if (atomOnly) return false;
  switch (e.kind) {
    case 'Prim': return ifExp(e, { shrunk: true }) && e.args.every(isIfAtom);
    case 'If': return whileMonExp(e.cond, false) && whileMonExp(e.thn, false) && whileMonExp(e.els, false);
    case 'Begin':
      return e.stmts.every((s) => (s.kind === 'Const' || s.kind === 'Assign') && whileMonExp(s.kind === 'Const' ? s.init : s.exp, false))
        && whileMonExp(e.exp, false);
    default: return false;
  }
}

export const isLWhileMon = (p) => whileProgram(p, { typed: true, shrunk: true, mon: true }, whileMonExp);

// ---- L_Array (chapter 6) ------------------------------------------------------------

// Chapter 9's operators (dynamic.js says what they mean).
const TYPEOF_OPS = Object.keys(TYPEOF).map((k) => `typeof=${k}`);
const DYN_OPS = ['any+', 'any-', 'any*', 'any/', 'anyneg', 'any<', 'any<=', 'any>', 'any>=', 'any===', 'truthy',
  'inject_Int', 'inject_Bool', 'inject', 'project_Int', 'project_Bool', 'project_array', 'project_fn',
  // chapter 10
  'any%', 'num+', 'num-', 'num*', 'num/', 'num%', 'numneg', 'int_to_num', 'num_to_int', 'num_to_int32', 'any_to_int32',
  'inject_Number', 'project_Number', 'any**', 'num**', 'any==', ...NUM_CMP, ...MATH_OP_NAMES];
// Chapter 10: % and the bitwise operators, on Ints; they are in every language from here on.
const INT_OPS = ['%', '&', '|', '^', '~', '<<', '>>', '>>>'];

// One check for the whole family of source-like languages from chapter 6 on, with options
// for what each stage allows:
//   typed     console.log and array literals carry their types (after type_check)
//   shrunk    no && or ||, no compound assignment, every if has an else
//   get       reads of assigned variables are GetBang (after uncover_get)
//   checked   Begin may appear (after check_bounds), with Trap among its statements
//   exposed   no array literals; Allocate, GlobalValue and Collect instead
//   mon       operands are atoms (after remove_complex_operands)
//   defs      (chapter 7) a list of definitions with main, not top-level statements
//   revealed  (chapter 7) references to functions are FunRef
//   lambda    (chapter 8) arrow functions, and function declarations inside functions
//   boxed     (chapter 8) a box may hold the placeholder Uninit (after convert_assignments)
//   closures  (chapter 8) no arrows or nested declarations; closures, environment reads and
//             static closures instead (after convert_to_closures)
//   dyn       (chapter 9) /, typeof tests, and constants of type Any
//   cast      (chapter 9) no /; the dynamic operators and casts of cast_insert instead
export function arrayLanguage(opts) {
  const atom = (e) => ['Int', 'Bool', 'Var', ...(opts.boxed ? ['Uninit'] : []), ...(opts.dyn ? ['AnyLit', 'Num'] : [])].includes(e.kind);
  // chapter 13: the operators on strings and records, with their numbers of operands
  const strOps = opts.cast ? STRING_ARITY : STRING_SOURCE_ARITY;
  const exp = (e, atomOnly = false) => {
    if (opts.mon) {
      if (atom(e)) return true;
      if (atomOnly) return false;
    }
    const sub = (x) => exp(x, true);   // an operand: an atom in mon, anything otherwise
    switch (e.kind) {
      case 'Int': return Number.isInteger(e.value);
      case 'Bool': return typeof e.value === 'boolean';
      case 'Var': return typeof e.name === 'string';
      case 'GetBang': return !!opts.get && !opts.mon;
      case 'Prim': {
        const ops = [...ARITH, ...CMP, '!', 'length', ...(opts.shrunk ? [] : ['&&', '||'])];
        if (opts.dyn) ops.push(...TYPEOF_OPS, ...INT_OPS, ...(opts.cast ? DYN_OPS : ['/', '**', '==', '!=', '??', ...MATH_SOURCE_OPS]),
          ...(opts.cast && !opts.shrunk ? ['any&&', 'any||', 'any??'] : []));
        if (opts.dyn && strOps[e.op] !== undefined) return e.args.length === strOps[e.op] && e.args.every(sub);
        return ops.includes(e.op) && e.args.length === (NULLARY.has(e.op) ? 0 : UNARY.has(e.op) ? 1 : 2)
          && e.args.every(sub) && (e.op !== 'project_fn' || e.args[1].kind === 'Int');
      }
      case 'AnyLit': return !!opts.dyn;
      case 'Num': return !!opts.dyn && typeof e.value === 'number';
      // chapter 13: a string, a record's shape (complex in mon: they become temporaries)
      case 'Str': return !!opts.dyn && typeof e.value === 'string';
      case 'Shape': return !!opts.cast && Array.isArray(e.names);
      case 'Caught': return !!opts.dyn;   // chapter 14
      case 'LibCall': return !!opts.dyn && !opts.cast && e.args.every((x) => exp(x));   // chapter 15
      case 'Await': return !!opts.dyn && !opts.cast && exp(e.arg);                       // chapter 16
      case 'Spread': return !!opts.dyn && !opts.cast && exp(e.arg);                      // chapter 17
      case 'Hoisted': return !!opts.dyn && !opts.cast;
      case 'Record': return !!opts.dyn && !opts.cast && e.fields.every((f) => exp(f.exp));
      case 'Get': return !!opts.dyn && !opts.cast && exp(e.obj);
      case 'SetProp': return !!opts.dyn && !opts.cast && exp(e.obj) && exp(e.exp);
      case 'MethodCall': return !!opts.dyn && !opts.cast && exp(e.obj) && e.args.every((x) => exp(x));
      case 'If': return exp(e.cond) && exp(e.thn) && exp(e.els);
      case 'Set': return !opts.mon && (opts.shrunk ? e.op === null : true) && exp(e.exp);
      case 'ArrayLit':
        return !opts.exposed && (e.elems.length > 0 || !!opts.dyn) && e.elems.every((x) => exp(x)) && (!opts.typed || typeof e.type === 'string');
      case 'Index': return sub(e.arr) && sub(e.idx);
      case 'SetIndex': return !opts.mon && sub(e.arr) && sub(e.idx) && exp(e.exp);
      case 'Begin': return (!!opts.checked || !!opts.mon || !!opts.closures || !!opts.cast) && e.stmts.every(stmt) && exp(e.exp);   // (CJI-3: cast_insert's own, for an object's truth)
      case 'Lambda': return !!opts.lambda && !opts.closures && e.body.every(stmt);
      case 'Uninit': return !!opts.boxed;
      case 'Closure': return !!opts.closures && !opts.exposed && e.fvs.every(sub);
      case 'EnvRef': return !!opts.closures && sub(e.env) && Number.isInteger(e.field);
      case 'StaticClosure': return !!opts.closures && typeof e.fn === 'string';
      case 'Allocate': return !!opts.exposed && Number.isInteger(e.length) && typeof e.type === 'string';
      case 'GlobalValue': return !!opts.exposed && typeof e.name === 'string';
      case 'FunRef': return (!!opts.revealed || !!opts.closures) && typeof e.name === 'string' && Number.isInteger(e.arity);
      case 'Call':
        return (opts.mon && e.fn.kind === 'FunRef' ? exp(e.fn) : sub(e.fn)) && e.args.every(sub);
      default: return false;
    }
  };
  const stmt = (s) => {
    switch (s.kind) {
      case 'Print': return exp(s.arg, true) && (!opts.typed || s.type === 'Int' || s.type === 'Bool' || (!!opts.dyn && ['Any', 'Number', 'String'].includes(s.type)));
      case 'Const': case 'Let': return typeof s.name === 'string' && exp(s.init);
      case 'ExprStmt': return !opts.mon && exp(s.exp);   // chapter 10: any expression
      case 'Return': return exp(s.arg);
      case 'FunDef': return (!opts.defs || (!!opts.lambda && !opts.closures)) && s.body.every(stmt);
      case 'Assign': return !!opts.mon && exp(s.exp);
      case 'Store': return !!opts.mon && atom(s.arr) && atom(s.idx) && atom(s.val);
      case 'Block': return s.body.every(stmt);
      case 'IfStmt': return exp(s.cond) && stmt(s.thn) && (s.els === null ? !opts.shrunk : stmt(s.els));
      case 'While': return exp(s.cond) && stmt(s.body) && (s.update === null || s.update === undefined || stmt(s.update));
      case 'Break': case 'Continue': return typeof s.label === 'string';
      case 'Trap': return !!opts.checked;
      case 'Collect': return !!opts.exposed && Number.isInteger(s.bytes);
      // chapter 14 (after remove_complex_operands, a thrown value is an atom)
      case 'Throw': return opts.mon ? atom(s.arg) : exp(s.arg);
      case 'Try': return s.body.kind === 'Block' && stmt(s.body) && (s.handler !== null || s.finalizer !== null)
        && (s.handler === null || (s.handler.kind === 'Block' && stmt(s.handler)))
        && (s.finalizer === null || (s.finalizer.kind === 'Block' && stmt(s.finalizer)));
      default: return false;
    }
  };
  if (opts.defs)
    return (p) => p.kind === 'ProgramDefs' && p.defs.some((d) => d.name === 'main')
      && p.defs.every((d) => d.kind === 'FunDef' && d.body.every(stmt));
  return (p) => p.kind === 'Program' && p.body.every(stmt);
}

// C_Array: C_If's blocks with element reads, allocation and the globals as expressions,
// and stores, collect and trap as statements.
// Chapter 7: a list of definitions (CProgramDefs), with calls, function references and
// tail calls.
export function isCArray(p) {
  if (p.kind === 'CProgramDefs')
    return p.defs.some((d) => d.name === 'main') && p.defs.every((d) => isCArray({ kind: 'CProgram', blocks: d.blocks }));
  if (p.kind !== 'CProgram') return false;
  const labels = new Set(p.blocks.map((b) => b.label));
  const atom = (e) => (isIfAtom(e) && ifExp(e, {})) || e.kind === 'Uninit' || e.kind === 'AnyLit' || e.kind === 'Num';
  const callee = (f) => f.kind === 'FunRef' || atom(f);
  const exp = (e) => atom(e)
    || (e.kind === 'Prim' && [...ARITH, ...CMP, '!', 'length', ...TYPEOF_OPS, ...DYN_OPS, ...INT_OPS].includes(e.op) && e.args.every(atom))
    || (e.kind === 'Prim' && STRING_ARITY[e.op] === e.args.length && e.args.every(atom))   // chapter 13
    || e.kind === 'Str' || e.kind === 'Shape'
    || (e.kind === 'Index' && atom(e.arr) && atom(e.idx))
    || (e.kind === 'Allocate' && Number.isInteger(e.length))
    || e.kind === 'GlobalValue' || e.kind === 'FunRef' || e.kind === 'StaticClosure'
    || (e.kind === 'EnvRef' && atom(e.env) && Number.isInteger(e.field))
    || (e.kind === 'Call' && callee(e.fn) && e.args.every(atom));
  const stmt = (s) => (s.kind === 'Assign' && typeof s.name === 'string' && exp(s.exp))
    || (s.kind === 'Print' && atom(s.arg) && ['Int', 'Bool', 'Any', 'Number', 'String'].includes(s.type))
    || (s.kind === 'Store' && atom(s.arr) && atom(s.idx) && atom(s.val))
    || (s.kind === 'Collect' && Number.isInteger(s.bytes)) || s.kind === 'Trap'
    || (s.kind === 'SetGlobal' && ['exc_flag', 'exc_value'].includes(s.name) && atom(s.value)) || s.kind === 'Uncaught';   // chapter 14
  const tail = (t) => {
    switch (t.kind) {
      case 'Return': return atom(t.arg);
      case 'TailCall': return callee(t.fn) && t.args.every(atom);
      case 'Goto': return labels.has(t.label);
      case 'IfGoto':
        return t.cond.kind === 'Prim' && (CMP.includes(t.cond.op) || NUM_CMP.includes(t.cond.op)) && t.cond.args.every(atom)
          && labels.has(t.thn) && labels.has(t.els);
      default: return false;
    }
  };
  return labels.has('start') && labels.size === p.blocks.length
    && p.blocks.every((b) => b.kind === 'CBlock' && b.stmts.every(stmt) && tail(b.tail));
}

// ---- SLIR (chapters 2 and 4) --------------------------------------------------------

const CONDS = ['eq', 'ne', 'lt', 'le', 'gt', 'ge'];
const ARITY = { mov: 2, add: 3, sub: 3, mul: 3, xor: 3, shl: 3, shr: 3, return: 1, icall: 0, jump: 0,
  call: 0, callr: 1, tailcall: 0, tailcallr: 1, funref: 1, lea: 2, closure: 1, strref: 1, shaperef: 1,
  and: 3, or: 3, sar: 3, fadd: 3, fsub: 3, fmul: 3, fdiv: 3, fneg: 2, i2f: 2 };   // chapter 10
for (const c of CONDS) { ARITY[`set${c}`] = 3; ARITY[`b${c}`] = 2; ARITY[`fset${c}`] = 3; ARITY[`fb${c}`] = 2; }
const TERMINATORS = new Set(['return', 'jump', 'tailcall', 'tailcallr']);
const HAS_TARGET = new Set(['jump', ...CONDS.map((c) => `b${c}`), ...CONDS.map((c) => `fb${c}`)]);
const WRITES = new Set(['mov', 'add', 'sub', 'mul', 'xor', 'shl', 'shr', 'funref', 'lea', 'closure', 'strref', 'shaperef', ...CONDS.map((c) => `set${c}`),
  'and', 'or', 'sar', 'fadd', 'fsub', 'fmul', 'fdiv', 'fneg', 'i2f', ...CONDS.map((c) => `fset${c}`)]);
// A memory operand whose base is a variable (or, after allocation, a variable's spilled
// home): at most one per instruction, because patch_instructions has one register to load
// such a base into.
const outsideFrame = (o) => o.kind === 'Mem' && o.base.kind !== 'Reg';

// `laidOut`: after layout_blocks a block may fall through to the next one, so only the last
// block must end in return or jump.
function isSlir(p, operandOk, needFrame, laidOut = false) {
  if (p.kind !== 'SProgram') return false;
  const names = new Set(p.funcs.map((f) => f.name));
  return names.has('main') && p.funcs.every((f) => {
    const labels = new Set(f.blocks.map((b) => b.label));
    return (!needFrame || f.frame) && labels.size === f.blocks.length && f.blocks.every((b, k) => {
      const last = b.instrs.at(-1);
      const mustEnd = !laidOut || k === f.blocks.length - 1;
      return (!mustEnd || (last && TERMINATORS.has(last.op)))
        && b.instrs.every((i, n) =>
          ARITY[i.op] === i.args.length && i.args.every(operandOk)
          && (!WRITES.has(i.op) || i.args[0].kind !== 'Imm')
          && i.args.filter(outsideFrame).length <= 1
          && (!TERMINATORS.has(i.op) || n === b.instrs.length - 1)
          && (!HAS_TARGET.has(i.op) || labels.has(i.target))
          && (!['call', 'tailcall', 'funref', 'closure'].includes(i.op) || names.has(i.fn)));
    });
  });
}

// Operands at each stage. A memory operand's base is an operand too: before allocation any
// variable or register; after it, possibly a spilled variable's home (another memory
// operand); after patch_instructions, only a register.
const anyOperand = (o) => ['Imm', 'SVar', 'Reg', 'Global'].includes(o.kind)
  || (o.kind === 'Mem' && ['SVar', 'Reg'].includes(o.base.kind) && Number.isInteger(o.offset));
const homeOperand = (o) => ['Imm', 'Reg', 'Global'].includes(o.kind)
  || (o.kind === 'Mem' && (o.base.kind === 'Reg' || (o.base.kind === 'Mem' && o.base.base.kind === 'Reg')));
const noVars = (o) => ['Imm', 'Reg', 'Global'].includes(o.kind) || (o.kind === 'Mem' && o.base.kind === 'Reg');

export const isSlirVar = (p) => isSlir(p, anyOperand, false);          // after select_instructions
export const isSlirHomes = (p) => isSlir(p, homeOperand, false);       // after register allocation
export const isSlirPatched = (p) => isSlir(p, noVars, false);          // after patch_instructions
export const isSlirLaid = (p) => isSlir(p, noVars, false, true);       // after layout_blocks
export const isSlirFinal = (p) => isSlir(p, noVars, true, true);       // after prelude_and_conclusion
