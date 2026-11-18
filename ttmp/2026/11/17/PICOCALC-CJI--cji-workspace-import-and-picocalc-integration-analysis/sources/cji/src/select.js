// select_instructions: C_Var to SLIR with variables.
//
// Each C_Var statement becomes one or a few SLJIT instructions. SLJIT is a three-address
// machine (`add d, a, b`), so unlike x86 nothing has to be copied into the destination first.
// Calling the runtime follows SLJIT's convention: arguments in r0, r1, ...
//
// Chapter 4: true and false are the words 1 and 0. A comparison whose value is kept becomes
// `set<cc>`; one that decides a branch becomes `b<cc>` followed by `jump` to the other
// branch; `!a` is `a xor 1`.

import { MATH_OP_SET } from './math.js';
import { STRING_ALLOC, STRING_ARITY } from './strings.js';
import { Imm, SVar as newSVar, Reg as newReg, Mem, Global, Ins, SBlock, SFunc, SProgram, ROOTS, SP } from './slir.js';
import { localTypes } from './local-types.js';
import { gensym } from './utils.js';
import { isArrayType, isPointerType, elementType, functionType, functionParts, isRecordType } from './types.js';
import { TYPEOF, ANY_FALSE } from './dynamic.js';
import { constantWord, $nat_double_bits } from './words.js';   // (CJI-3: a number's word as text, without BigInt)
//
// Chapter 10: a Number is a double kept in an ordinary word, as its 64 bits, and its
// operations are SLIR's float instructions (fadd, fset<cc>, fb<cc>, ...), which slas carries
// out in SLJIT's float registers. The bitwise operators work on 64-bit integers and then
// keep the low 32 bits, sign-extended (shl 32, sar 32), which is JavaScript's ToInt32 for an
// integer. % of two Ints, and every conversion of a double to 32 bits, call the runtime.
//
// Chapter 9: a constant of type Any is the immediate of its NaN-boxed word. Most dynamic
// operators are calls of runtime.c, which works on those words: any+ is any_add, a cast
// to Int is any_to_int, and so on. Two need no call: inject_Bool adds 6 (false and true
// are 6 and 7), and inject keeps the word, since a pointer is its own dynamic value.
//
// Chapter 7: SLJIT passes at most four arguments, in r0 to r3, and returns the result in
// r0. A function of up to four parameters takes them from r0..r3 on entry. With more, the
// first three come in r0..r2 and r3 points to the rest, which the caller stores at the
// bottom of its own frame ("the outgoing area") just before the call:
//
//   f(a, b, c, d, e)   =>   mov [sp+0], d     mov [sp+8], e     lea r3, [sp+0]
//                           mov r0, a   mov r1, b   mov r2, c   call f/4
//
// A call through a variable is callr; a return of a call is tailcall, unless the callee
// takes more than four arguments, whose outgoing area would vanish with this frame.
//
// Chapter 6: an array is a pointer to its header word, and element k is the word at
// offset 8(k + 1). Reading or writing an element with a variable index first computes its
// address into a temporary. allocate bumps free_ptr and writes the header. collect passes
// the root stack's top (s0) and the size needed to the runtime. Every instruction has at
// most one memory operand that is not in the frame, which patch_instructions relies on.

// (CJI-3, lane 5: within one function, one operand object per variable and per register, however often
// the code names it: they were 40 % of the objects of agent's largest function in its back half. No pass
// changes an operand in place or tells two equal ones apart, and allocate_registers already gives
// every use of a variable its one home object.)
// (made when first called: slir.js and this module import each other)
let operands = null;   // 'v name' or 'r name' -> the SVar or Reg, while a function is selected
function interned(key, make) {
  if (operands === null) return make();
  let o = operands.get(key);
  if (o === undefined) { o = make(); operands.set(key, o); }
  return o;
}
const SVar = (name) => interned(`v ${name}`, () => newSVar(name));
const Reg = (name) => interned(`r ${name}`, () => newReg(name));

function atom(a) {
  switch (a.kind) {
    case 'Int': return Imm(a.value);
    case 'Bool': return Imm(a.value ? 1 : 0);
    case 'Uninit': return Imm(0);      // a box's placeholder (chapter 8)
    case 'AnyLit': return Imm(constantWord(a.value));
    case 'Num': return Imm($nat_double_bits(a.value, 0));
    case 'Var': return SVar(a.name);
    default: throw new Error(`select: not an atom: ${a.kind}`);
  }
}

const MACHINE_OP = { '+': 'add', '-': 'sub', '*': 'mul' };
export const CC = { '===': 'eq', '!==': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };

// The memory operand for a[i]; a variable index needs its address computed first.
function element(a, i, out) {
  if (i.kind === 'Int') return Mem(atom(a), 8 * (i.value + 1));
  const t = SVar(gensym('addr'));
  out.push(Ins('shl', [t, atom(i), Imm(3)]));
  out.push(Ins('add', [t, t, atom(a)]));
  return Mem(t, 8);
}

// The header of an object: mask << 16 | length << 3 | kind << 1 | 1, where kind 1 means
// every field is a pointer and kind 2 means the mask says which ones are (runtime.c).
// Chapter 9: a closure's header also holds its function's arity, in bits 46 and up, which
// a dynamic call checks.
// Chapter 15: an array is a kind-2 object with bits 52 and 51 set (a record has 52 only),
// of two fields: its length and a pointer to its storage (mask 10b).
export const ARRAY_HEADER = 2 ** 52 + 2 ** 51 + 2 * 65536 + 2 * 8 + 2 * 2 + 1;
export function header(length, type, mask) {
  // chapter 13: a record is kind 2 too, with bit 52 set; its arity bits are 0
  if (mask !== undefined && isRecordType(type)) return 2 ** 52 + mask * 65536 + length * 8 + 2 * 2 + 1;
  if (mask !== undefined) return functionParts(type).params.length * 2 ** 46 + mask * 65536 + length * 8 + 2 * 2 + 1;
  return length * 8 + (isPointerType(elementType(type)) ? 2 : 0) + 1;
}

// The runtime function behind each dynamic operator, and how many arguments it takes.
const RUNTIME_OP = {
  'any+': 'any_add', 'any-': 'any_sub', 'any*': 'any_mul', 'any/': 'any_div', anyneg: 'any_neg',
  'any<': 'any_lt', 'any<=': 'any_le', 'any>': 'any_gt', 'any>=': 'any_ge', 'any===': 'any_eq', truthy: 'any_truthy',
  inject_Int: 'any_from_int', project_Int: 'any_to_int', project_Bool: 'any_to_bool', project_array: 'any_to_array',
  project_fn: 'any_to_function',
  '%': 'int_mod', 'num%': 'num_mod', 'any%': 'any_mod', num_to_int32: 'num_to_int32', any_to_int32: 'any_to_int32',
  project_Number: 'any_to_number', num_to_int: 'num_to_int', 'num**': 'num_pow', 'any**': 'any_pow', 'any==': 'any_loose_eq',
};
const FLOAT_OP = { 'num+': 'fadd', 'num-': 'fsub', 'num*': 'fmul', 'num/': 'fdiv' };
export const FCC = { 'num===': 'eq', 'num!==': 'ne', 'num<': 'lt', 'num<=': 'le', 'num>': 'gt', 'num>=': 'ge' };

// JavaScript's bitwise operators on two Ints (chapter 10).
function bitwise(op, args, dst, out) {
  const [a, b] = args;
  const sext32 = (d) => out.push(Ins('shl', [d, d, Imm(32)]), Ins('sar', [d, d, Imm(32)]));
  const count = () => {          // the shift count is the low 5 bits
    if (b.kind === 'Int') return Imm(b.value & 31);
    const c = SVar(gensym('count'));
    out.push(Ins('and', [c, atom(b), Imm(31)]));
    return c;
  };
  switch (op) {
    case '&': case '|': case '^':
      out.push(Ins({ '&': 'and', '|': 'or', '^': 'xor' }[op], [dst, atom(a), atom(b)]));
      sext32(dst);
      return;
    case '~':
      out.push(Ins('xor', [dst, atom(a), Imm(-1)]));
      sext32(dst);
      return;
    case '<<': {
      const c = count();
      out.push(Ins('shl', [dst, atom(a), c]));
      sext32(dst);
      return;
    }
    case '>>': case '>>>': {
      const c = count(), t = SVar(gensym('word'));
      out.push(Ins('shl', [t, atom(a), Imm(32)]), Ins(op === '>>' ? 'sar' : 'shr', [t, t, Imm(32)]));
      out.push(Ins(op === '>>' ? 'sar' : 'shr', [dst, t, c]));
      return;
    }
    default:
      throw new Error(`select: unknown bitwise operator ${op}`);
  }
}

function runtimeCall(fn, args, dst, out) {
  args.forEach((a, k) => out.push(Ins('mov', [Reg(ARG_REGS[k]), atom(a)])));
  // chapter 13: a function that allocates gets the root stack's top too, where it can keep
  // its pointer arguments while it collects
  const roots = STRING_ALLOC.has(fn);
  if (roots) out.push(Ins('mov', [Reg(ARG_REGS[args.length]), Reg(ROOTS)]));
  out.push(Ins('icall', [], { fn, nargs: args.length + (roots ? 1 : 0) }));
  if (dst) out.push(Ins('mov', [dst, Reg('r0')]));
}
const STR_CC = { 'str<': 'lt', 'str<=': 'le', 'str>': 'gt', 'str>=': 'ge' };

const ARG_REGS = ['r0', 'r1', 'r2', 'r3'];

// Puts a call's arguments where the callee expects them; returns how many registers carry them.
function passArguments(args, out, frame) {
  if (args.length <= 4) {
    args.forEach((a, k) => out.push(Ins('mov', [Reg(ARG_REGS[k]), atom(a)])));
    return args.length;
  }
  frame.outArgs = Math.max(frame.outArgs, args.length - 3);
  args.slice(3).forEach((a, k) => out.push(Ins('mov', [Mem(SP, 8 * k), atom(a)])));
  out.push(Ins('lea', [Reg('r3'), Mem(SP, 0)]));
  args.slice(0, 3).forEach((a, k) => out.push(Ins('mov', [Reg(ARG_REGS[k]), atom(a)])));
  return 4;
}

function selectCall(e, out, frame, tail = false) {
  const n = passArguments(e.args, out, frame);
  const direct = e.fn.kind === 'FunRef';
  const op = (tail ? 'tail' : '') + (direct ? 'call' : 'callr');
  out.push(Ins(op, direct ? [] : [atom(e.fn)], { fn: direct ? e.fn.name : undefined, nargs: n }));
}

function selectAssign(dst, e, out, frame) {
  switch (e.kind) {
    case 'Call':
      selectCall(e, out, frame);
      out.push(Ins('mov', [dst, Reg('r0')]));
      return;
    case 'FunRef':
      out.push(Ins('funref', [dst], { fn: e.name }));
      return;
    case 'StaticClosure':
      out.push(Ins('closure', [dst], { fn: e.fn }));
      return;
    case 'EnvRef':
      out.push(Ins('mov', [dst, Mem(atom(e.env), 8 * (e.field + 1))]));
      return;
    case 'Index':
      out.push(Ins('mov', [dst, element(e.arr, e.idx, out)]));
      return;
    case 'GlobalValue':
      out.push(Ins('mov', [dst, Global(e.name)]));
      return;
    case 'Allocate': {
      const bytes = 8 * (e.length + 1) + (e.growable ? 24 : 0);
      out.push(Ins('mov', [dst, Global('free_ptr')]));
      out.push(Ins('add', [Global('free_ptr'), Global('free_ptr'), Imm(bytes)]));
      if (e.growable) {   // chapter 15: [header, length, storage], then the storage
        const s = SVar(gensym('storage'));
        out.push(Ins('mov', [Mem(dst, 0), Imm(ARRAY_HEADER)]));
        out.push(Ins('mov', [Mem(dst, 8), Imm(e.length)]));
        out.push(Ins('add', [s, dst, Imm(24)]));
        out.push(Ins('mov', [Mem(dst, 16), s]));
        out.push(Ins('mov', [Mem(s, 0), Imm(header(e.length, e.type))]));
        return;
      }
      out.push(Ins('mov', [Mem(dst, 0), Imm(header(e.length, e.type, e.mask))]));
      return;
    }
    case 'Int':
    case 'Bool':
    case 'Var':
    case 'Uninit':
    case 'AnyLit':
    case 'Num':
      out.push(Ins('mov', [dst, atom(e)]));
      return;
    case 'Str':          // chapter 13
      out.push(Ins('strref', [dst], { text: e.value }));
      return;
    case 'Shape':
      out.push(Ins('shaperef', [dst], { names: e.names, error: !!e.error }));
      return;
    case 'Prim':
      if (['&', '|', '^', '~', '<<', '>>', '>>>'].includes(e.op)) {
        bitwise(e.op, e.args, dst, out);
        return;
      }
      if (FLOAT_OP[e.op]) {
        out.push(Ins(FLOAT_OP[e.op], [dst, atom(e.args[0]), atom(e.args[1])]));
        return;
      }
      if (FCC[e.op]) {
        out.push(Ins(`fset${FCC[e.op]}`, [dst, atom(e.args[0]), atom(e.args[1])]));
        return;
      }
      if (e.op === 'numneg' || e.op === 'int_to_num') {
        out.push(Ins(e.op === 'numneg' ? 'fneg' : 'i2f', [dst, atom(e.args[0])]));
        return;
      }
      if (e.op === 'inject_Number') {   // the double's bits plus 2^49 (chapter 9's encoding)
        out.push(Ins('add', [dst, atom(e.args[0]), Imm(2 ** 49)]));
        return;
      }
      if (RUNTIME_OP[e.op] || MATH_OP_SET.has(e.op)) {   // chapter 10: Math's are named as in runtime.c
        runtimeCall(RUNTIME_OP[e.op] ?? e.op, e.args, dst, out);
        return;
      }
      // chapter 13: a string's length is its word 1; comparisons of strings ask str_cmp;
      // every other operator on strings and records is a runtime function of its own name
      if (e.op === 'str_length') {
        out.push(Ins('mov', [dst, element(e.args[0], { kind: 'Int', value: 0 }, out)]));
        return;
      }
      if (STR_CC[e.op]) {
        runtimeCall('str_cmp', e.args, null, out);
        out.push(Ins(`set${STR_CC[e.op]}`, [dst, Reg('r0'), Imm(0)]));
        return;
      }
      if (e.op === 'arr_storage') {     // chapter 15: an array's word 2
        out.push(Ins('mov', [dst, Mem(atom(e.args[0]), 16)]));
        return;
      }
      if (STRING_ARITY[e.op] !== undefined) {
        runtimeCall({ project_String: 'any_as_str', project_record: 'any_to_record' }[e.op] ?? e.op, e.args, dst, out);
        return;
      }
      if (e.op.startsWith('typeof=')) {
        runtimeCall('any_typeof', e.args, null, out);
        out.push(Ins('seteq', [dst, Reg('r0'), Imm(TYPEOF[e.op.slice(7)])]));
        return;
      }
      if (e.op === 'inject_Bool') {
        out.push(Ins('add', [dst, atom(e.args[0]), Imm(ANY_FALSE)]));
        return;
      }
      if (e.op === 'inject') {
        out.push(Ins('mov', [dst, atom(e.args[0])]));
        return;
      }
      if (e.op === 'neg') {
        out.push(Ins('sub', [dst, Imm(0), atom(e.args[0])]));
        return;
      }
      if (e.op === '!') {
        out.push(Ins('xor', [dst, atom(e.args[0]), Imm(1)]));
        return;
      }
      if (e.op === 'length') {          // chapter 15: an array's word 1
        out.push(Ins('mov', [dst, Mem(atom(e.args[0]), 8)]));
        return;
      }
      if (CC[e.op]) {
        out.push(Ins(`set${CC[e.op]}`, [dst, atom(e.args[0]), atom(e.args[1])]));
        return;
      }
      out.push(Ins(MACHINE_OP[e.op], [dst, atom(e.args[0]), atom(e.args[1])]));
      return;
    default:
      throw new Error(`select: unexpected ${e.kind}`);
  }
}

function selectStmt(s, out, frame) {
  switch (s.kind) {
    case 'Assign':
      selectAssign(SVar(s.name), s.exp, out, frame);
      return;
    case 'Print':
      out.push(Ins('mov', [Reg('r0'), atom(s.arg)]));
      out.push(Ins('icall', [], {
        fn: (s.end === ' ' ? { Bool: 'put_bool', Int: 'put_int', Number: 'put_num', Any: 'any_put', String: 'put_str' }
          : { Bool: 'print_bool', Int: 'print_int', Number: 'print_num', Any: 'any_print', String: 'print_str' })[s.type], nargs: 1 }));
      return;
    case 'Store':
      out.push(Ins('mov', [element(s.arr, s.idx, out), atom(s.val)]));
      return;
    case 'Collect':
      out.push(Ins('mov', [Reg('r0'), Reg(ROOTS)]));
      out.push(Ins('mov', [Reg('r1'), Imm(s.bytes)]));
      out.push(Ins('icall', [], { fn: 'collect', nargs: 2 }));
      return;
    case 'Trap':
      out.push(Ins('icall', [], { fn: 'index_error', nargs: 0 }));
      return;
    case 'SetGlobal':   // chapter 14: exc_flag or exc_value
      out.push(Ins('mov', [Global(s.name), atom(s.value)]));
      return;
    case 'Uncaught':    // main's exit for an exception: the runtime reports it and stops
      out.push(Ins('mov', [Reg('r0'), Global('exc_value')]));
      out.push(Ins('icall', [], { fn: 'uncaught', nargs: 1 }));
      return;
    default:
      throw new Error(`select: unexpected ${s.kind}`);
  }
}

function selectTail(t, out, frame) {
  switch (t.kind) {
    case 'Return':
      out.push(Ins('return', [atom(t.arg)]));
      return;
    case 'TailCall':
      if (t.args.length > 4) {   // the outgoing area is in this frame, so no tail call
        const r = SVar(gensym('result'));
        selectAssign(r, { kind: 'Call', fn: t.fn, args: t.args }, out, frame);
        out.push(Ins('return', [r]));
      } else selectCall(t, out, frame, true);
      return;
    case 'Goto':
      out.push(Ins('jump', [], { target: t.label }));
      return;
    case 'IfGoto': {
      const [a, b] = t.cond.args;
      const op = FCC[t.cond.op] ? `fb${FCC[t.cond.op]}` : `b${CC[t.cond.op]}`;
      out.push(Ins(op, [atom(a), atom(b)], { target: t.thn }));
      out.push(Ins('jump', [], { target: t.els }));
      return;
    }
    default:
      throw new Error(`select: unexpected tail ${t.kind}`);
  }
}

// The parameters, from where the caller put them into the parameters' variables.
function receiveParameters(params) {
  const out = [];
  if (params.length > 4)
    params.slice(3).forEach((q, k) => out.push(Ins('mov', [SVar(q), Mem(Reg('r3'), 8 * k)])));
  params.slice(0, params.length > 4 ? 3 : 4).forEach((q, k) => out.push(Ins('mov', [SVar(q), Reg(ARG_REGS[k])])));
  return out;
}

export function selectInstructions(p) {
  const ctx = selectContext(p);
  return SProgram(p.defs.map((d) => selectDef(d, ctx)));
}
// (CJI-3: in two parts, so that a build can select one function at a time: what the program as a whole
// tells each function, and one function's selection)
export function selectContext(p) {
  // a function's type, as its callers see it (chapter 8: without the closure parameter)
  const funTypes = new Map(p.defs.map((d) => [d.name, d.name === 'main' ? '()=>Int' : d.paramTypes[0]]));
  const usesHeap = p.defs.some((d) => d.blocks.some((b) => b.stmts.some((s) => s.kind === 'Assign' && s.exp.kind === 'Allocate')));
  return { funTypes, usesHeap };
}
export function selectDef(d, { funTypes, usesHeap }) {
  operands = new Map();
  const frame = { outArgs: 0 };
  const blocks = d.blocks.map((b, k) => {
    const out = k === 0 ? receiveParameters(d.params) : [];
    for (const s of b.stmts) selectStmt(s, out, frame);
    selectTail(b.tail, out, frame);
    return SBlock(b.label, out);
  });
  const f = SFunc(d.name, Math.min(d.params.length, 4), blocks);
  f.types = localTypes(d, new Map(d.params.map((q, k) => [q, d.paramTypes[k]])), funTypes);
  f.usesHeap = usesHeap;
  f.outArgs = frame.outArgs;
  operands = null;
  return f;
}
