// SLIR: SLJIT's instruction set as data and as text.
//
// SLJIT is a portable assembler: a C library with one function per instruction
// (sljit_emit_op2 for `add`, sljit_emit_return for `return`, ...). SLIR is those calls written
// down. The compiler's last passes produce SLIR; `print_slir` turns it into text; the C
// program `slas` reads the text and makes the SLJIT calls.
//
// Operands:
//   #5        Imm       an immediate integer
//   x.1       SVar      a variable (only before assign_homes)
//   r0..r6    Reg       SLJIT's scratch registers R0..R6 (a call may overwrite them)
//   s0..s5    Reg       SLJIT's saved registers S0..S5 (a call preserves them)
//   [sp+16]   Mem       a word in the function's stack frame
//
// Instructions (chapter 2):
//   mov d, s            d = s
//   add d, a, b         d = a + b      (also sub, mul)
//   icall f/n           call runtime function f with n arguments in r0..; clobbers r0..r6
//   return a            leave the function with value a
//
// Chapter 4 adds control flow. cc is one of eq ne lt le gt ge (signed comparisons):
//   jump L              continue at block L
//   bcc a, b, L         continue at block L if a cc b, else with the next instruction
//   setcc d, a, b       d = 1 if a cc b, else 0
//   xor d, a, b         d = a ^ b (bitwise)
// After layout_blocks, a block that does not end in return or jump falls through to the
// block printed after it.
//
// Chapter 6 adds the heap. Memory operands may be based on any register or variable,
// [x.3+8] or [s0-16], and [@free_ptr] names a global of the C runtime. Two more
// instructions: shl d, a, b and shr d, a, b (logical) shift a by b bits. Two registers are
// set aside from then on: s0 holds the top of the root stack, and r6 is the one
// patch_instructions uses to load a memory operand's base.
//
// Chapter 7 adds calls between the program's own functions, with arguments in r0..r3 and
// the result in r0 (SLJIT's register-argument convention):
//   call f/n            call function f;  callr x/n   call the function whose address is x
//   tailcall f/n        call f in place of this function: f returns to this one's caller
//   tailcallr x/n       the same through an address
//   funref d, f         d = the address of function f
//   lea d, [sp+k]       d = the address of a word in the frame
// Chapter 8 adds one:
//   closure d, f        d = the address of f's static closure, an object outside the heap
//                       whose only field is f's code address (slas makes one per function)

import { Trap, emit } from './interp.js';
import { MATH_OPS, MATH_INT_RESULT } from './math.js';
import { Strings } from './slir-strings.js';
import { ANY_NULL, ANY_FALSE, ANY_TRUE, ANY_UNDEFINED, encodeNumber, decodeNumber, formatNumber, doubleBits, bitsDouble, TYPEOF, TYPE_ERROR, OUTSIDE_EQ } from './dynamic.js';
import { isPointerType } from './types.js';

export const Imm = (value) => ({ kind: 'Imm', value });
export const SVar = (name) => ({ kind: 'SVar', name });
export const Reg = (name) => ({ kind: 'Reg', name });
export const Mem = (base, offset) => ({ kind: 'Mem', base, offset });      // base: an operand
export const Global = (name) => ({ kind: 'Global', name });                  // [@name]
export const SP = { kind: 'Reg', name: 'sp' };

export const Ins = (op, args, extra = {}) => ({ op, args, ...extra });
export const SBlock = (label, instrs) => ({ label, instrs });
export const SFunc = (name, nparams, blocks, frame = null) => ({ name, nparams, blocks, frame });
export const SProgram = (funcs) => ({ kind: 'SProgram', funcs });

export const SCRATCH = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
export const SAVED = ['s0', 's1', 's2', 's3', 's4', 's5'];
export const ROOTS = 's0';          // the root stack's top (chapter 6)
export const PATCH = 'r6';          // patch_instructions' register (chapter 6)

// The analyses and decisions passes attach to a function, which every pass that rebuilds a
// function carries over.
const INFO = ['homes', 'frameBytes', 'rootSlots', 'types', 'usesHeap', 'outArgs'];
export function withInfo(f, from) {
  for (const k of INFO) if (from[k] !== undefined) f[k] = from[k];
  return f;
}

// ---- text ---------------------------------------------------------------------------

export function showOperand(o) {
  switch (o.kind) {
    case 'Imm': return `#${o.value}`;
    case 'SVar': return o.name;
    case 'Reg': return o.name;
    case 'Mem': return `[${showOperand(o.base)}${o.offset < 0 ? '-' : '+'}${Math.abs(o.offset)}]`;
    case 'Global': return `[@${o.name}]`;
    default: throw new Error(`showOperand: ${o.kind}`);
  }
}

const pad = (op) => (op.length >= 8 ? `${op} ` : op.padEnd(8));

const asciiJson = (v) => JSON.stringify(v).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export function showInstr(i) {
  switch (i.op) {
    case 'icall':
    case 'call':
    case 'tailcall':
      return `${pad(i.op)}${i.fn}/${i.nargs}`;
    case 'callr':
    case 'tailcallr':
      return `${pad(i.op)}${showOperand(i.args[0])}/${i.nargs}`;
    case 'funref':
    case 'closure':
      return `${pad(i.op)}${showOperand(i.args[0])}, ${i.fn}`;
    // chapter 13: a static string's address (its text in JSON, every non-ASCII code unit as
    // \uXXXX), and a shape's (its field names, a JSON array)
    case 'strref':
      return `${pad(i.op)}${showOperand(i.args[0])}, ${asciiJson(i.text)}`;
    case 'shaperef':
      return `${pad(i.op)}${showOperand(i.args[0])}, ${asciiJson(i.names)}${i.error ? ', error' : ''}`;   // (chapter 14: an Error's)
    case 'jump':
      return `jump    ${i.target}`;
    default:
      return `${i.op.padEnd(8)}${[...i.args.map(showOperand), ...(i.target ? [i.target] : [])].join(', ')}`;
  }
}

// Analyses attached to a function (liveness, the interference graph, the homes chosen by
// the allocator) are printed as comments, which slas ignores.
export function printSlir(p) {
  if (typeof p === 'string') return p;   // (CJI-3: a build's text, compileToText)
  const lines = [];
  for (const f of p.funcs) {
    const fr = f.frame;
    lines.push(`function ${f.name}/${f.nparams}` +
      (fr ? ` scratches=${fr.scratches} saveds=${fr.saveds} local=${fr.local}` : ''));
    for (const b of f.blocks) {
      lines.push(`${b.label}:`);
      const live = f.liveAfter?.get(b.label);
      b.instrs.forEach((i, k) => {
        const text = `    ${showInstr(i)}`;
        lines.push(live ? `${text.padEnd(36)}; live after: {${[...live[k]].join(', ')}}` : text);
      });
    }
    lines.push('end');
    if (f.graph) {
      lines.push('; interference:');
      for (const v of f.graph.nodes().filter((n) => !SCRATCH.includes(n) && !SAVED.includes(n)))
        lines.push(`;   ${v}: ${[...f.graph.neighbors(v)].join(' ')}`);
    }
    if (f.livenessRounds !== undefined && f.graph === undefined)
      lines.push(`; liveness: ${f.livenessRounds} block visits to reach the fixed point`);
    if (f.homes && fr === null)
      lines.push(`; homes: ${[...f.homes].map(([v, o]) => `${v}->${showOperand(o)}`).join(' ')}`);
    if (f.rootSlots && fr === null) lines.push(`; root slots: ${f.rootSlots}`);
  }
  return lines.join('\n') + '\n';
}

// ---- the machine model --------------------------------------------------------------

// 64-bit two's-complement arithmetic, as the machine does it.
export function wrap64(v) {
  return Number(BigInt.asIntN(64, BigInt(v)));
}

// Words are JavaScript numbers while they are safe integers, and BigInts otherwise: a
// double's bits (chapter 10's Number, chapter 9's boxed numbers) are always BigInts, and an
// integer intermediate that leaves the safe range (x << 32 on the way to a sign extension)
// becomes one until a shift brings it back. Arithmetic on a BigInt stays a BigInt, except
// that a right shift, which only the integer code emits, returns to a number when it can.
function machineArith(op, a, b) {
  const A = BigInt(a), B = BigInt(b);
  let r;
  switch (op) {
    case 'add': r = A + B; break;
    case 'sub': r = A - B; break;
    case 'mul': r = A * B; break;
    case 'xor': r = A ^ B; break;
    case 'and': r = A & B; break;
    case 'or': r = A | B; break;
    case 'shl': r = A << (B & 63n); break;
    case 'shr': r = BigInt.asUintN(64, A) >> (B & 63n); break;
    case 'sar': r = A >> (B & 63n); break;
    default: throw new Error(`machine: unknown operation ${op}`);
  }
  r = BigInt.asIntN(64, r);
  const big = typeof a === 'bigint' || typeof b === 'bigint';
  if (big && op !== 'shr' && op !== 'sar') return r;
  const n = Number(r);
  return Number.isSafeInteger(n) ? n : r;
}

// Chapter 10: the floating-point instructions take and give a double's bits.
const FLOAT = {
  fadd: (x, y) => x + y,
  fsub: (x, y) => x - y,
  fmul: (x, y) => x * y,
  fdiv: (x, y) => x / y,
};

// The six conditions, on signed words.
// A number and a BigInt are compared as BigInts.
const same = (a, b) => (typeof a === typeof b ? [a, b] : [BigInt(a), BigInt(b)]);
export const CONDITIONS = {
  eq: (a, b) => { [a, b] = same(a, b); return a === b; },
  ne: (a, b) => { [a, b] = same(a, b); return a !== b; },
  lt: (a, b) => { [a, b] = same(a, b); return a < b; },
  le: (a, b) => { [a, b] = same(a, b); return a <= b; },
  gt: (a, b) => { [a, b] = same(a, b); return a > b; },
  ge: (a, b) => { [a, b] = same(a, b); return a >= b; },
};
// Chapter 10: the same six on doubles, with JavaScript's (IEEE's) meaning: every comparison
// with NaN is false except !==, which is true.
const FCONDITIONS = {
  eq: (x, y) => x === y,
  ne: (x, y) => x !== y,
  lt: (x, y) => x < y,
  le: (x, y) => x <= y,
  gt: (x, y) => x > y,
  ge: (x, y) => x >= y,
};
export const NEGATE = { eq: 'ne', ne: 'eq', lt: 'ge', ge: 'lt', gt: 'le', le: 'gt' };

export class MachineError extends Error {}

// Where things live in the model's address space. The numbers do not matter, only that
// regions do not overlap and that a heap space gets addresses no space of the last SPACES
// had, so a pointer into a space the collector has released is recognised as such.
const ROOTSTACK_BASE = 0x10000000;
const HEAP_BASE = 0x20000000;
const SPACE_STRIDE = 0x01000000;
const SPACES = 64;   // (chapter 21) 0x20000000 to 0x60000000; the frames grow down from 0x7f000000
const FRAME_BASE = 0x7f000000;
const FRAME_STRIDE = 0x00100000;
const FUNC_BASE = 0x00400000;      // function addresses, for funref and callr
const STATIC_BASE = 0x00800000;    // static objects (chapter 8: closures of closed functions)
export const INITIAL_HEAP = 512;

// An interpreter for SLIR that models the machine rather than the language: registers are
// shared state, a call overwrites every scratch register, memory holds nothing until it is
// written, and (chapter 6) the heap is collected by a copying collector that moves every
// object and releases the space it moved them from. Each of those can catch a compiler
// bug that real hardware would let pass silently: a value kept in a scratch register
// across a call, a frame slot read before it is written, a pointer the collector did not
// update. The program stops with the function, block and what went wrong.
export class InterpSlir {
  interpProgram(p) {
    this.funcs = new Map(p.funcs.map((f) => [f.name, f]));
    this.addresses = new Map(p.funcs.map((f, k) => [FUNC_BASE + 16 * k, f.name]));
    this.addressOf = new Map(p.funcs.map((f, k) => [f.name, FUNC_BASE + 16 * k]));
    this.statics = new Map();       // function -> its static closure (chapter 8)
    this.strings = new Strings(this);   // static strings and shapes, string functions (chapter 13)
    this.out = [];
    this.regs = new Map();          // register name -> value; absent means "holds nothing"
    this.mem = new Map();           // address -> word
    this.steps = 0;
    this.depth = 0;
    this.spaces = 0;
    this.released = [];             // [begin, end) of heap spaces the collector gave up
    const heap = this.newSpace();
    this.globals = new Map([
      ['free_ptr', heap], ['fromspace_begin', heap], ['fromspace_end', heap + INITIAL_HEAP],
      ['rootstack_begin', ROOTSTACK_BASE],
      ['exc_flag', 0], ['exc_value', 0],   // chapter 14
    ]);
    this.frames = [];
    // Until prelude_and_conclusion adds the root stack setup, the model does it: s0 starts
    // at the bottom of the root stack, and each call makes room for its function's slots.
    const main = this.funcs.get('main');
    if (main && !main.frame) this.regs.set('s0', ROOTSTACK_BASE);
    this.tailCalls = 0;
    this.call('main');
    return this.out.map((l) => l + '\n').join('');
  }

  // Chapter 21: the addresses go round after SPACES spaces, so that a program that collects
  // often (a date loop on a 4 KB heap: about a hundred collections) never reaches the frames
  // at FRAME_BASE; a space taken again is no longer released.
  newSpace() {
    const begin = HEAP_BASE + SPACE_STRIDE * (this.spaces++ % SPACES);
    this.released = this.released.filter(([b]) => b !== begin);
    return begin;
  }

  // A call, as the machine sees it. The arguments are already in r0..; the other scratch
  // registers hold nothing the callee may read. On return the result is in r0, every other
  // scratch register is clobbered, and every saved register holds what it held before the
  // call, which SLJIT's prologue and epilogue guarantee. A tail call replaces the frame
  // instead of adding one.
  call(name, nargs = 0) {
    const saved = new Map(SAVED.map((r) => [r, this.regs.get(r)]));
    // The model's stack holds 500 frames, about what a small device affords: deep recursion
    // stops it, while a loop written as tail calls, which reuse one frame, does not.
    if (this.depth >= 500) throw new MachineError(`machine model: more than 500 nested calls (a tail call does not nest)`);
    let ret;
    for (;;) {
      const f = this.funcs.get(name);
      if (!f) throw new MachineError(`no function ${name}`);
      for (const r of SCRATCH.slice(nargs)) this.regs.delete(r);
      const frame = { f, vars: new Map(), sp: FRAME_BASE - FRAME_STRIDE * this.depth++, written: new Set(),
        label: f.blocks[0].label };
      this.frames.push(frame);
      if (!f.frame && f.rootSlots) {   // the prelude's root slots, before there is a prelude
        const top = this.regs.get('s0');
        for (let k = 0; k < f.rootSlots; k++) this.mem.set(top + 8 * k, 0);
        this.regs.set('s0', top + 8 * f.rootSlots);
      }
      let r;
      try {
        r = this.run(f, frame);
      } finally {
        this.depth--;
        this.frames.pop();
        for (const a of frame.written) this.mem.delete(a);   // the frame is gone
      }
      if (r.tail === undefined) { ret = r.ret; break; }
      // SLJIT restores the saved registers before it jumps to the tail callee
      for (const [reg, v] of saved) { if (v === undefined) this.regs.delete(reg); else this.regs.set(reg, v); }
      name = r.tail;
      nargs = r.nargs;
      this.tailCalls++;
    }
    for (const [r, v] of saved) { if (v === undefined) this.regs.delete(r); else this.regs.set(r, v); }
    this.clobberScratch();
    this.regs.set('r0', ret);
    return ret;
  }

  callee(o, frame) {
    const a = this.read(o, frame);
    if (!this.addresses.has(a)) this.stop(frame, `calls ${this.hex(a)}, which is not a function`);
    return this.addresses.get(a);
  }

  run(f, frame) {
    const index = new Map(f.blocks.map((b, k) => [b.label, k]));
    for (;;) {
      const k = index.get(frame.label);
      if (k === undefined) throw new MachineError(`${f.name}: no block ${frame.label}`);
      let next = null;
      for (const i of f.blocks[k].instrs) {
        if (++this.steps > 20_000_000) this.stop(frame, 'more than 20000000 instructions; an infinite loop?');
        const r = this.exec(i, frame);
        if (r && (r.ret !== undefined || r.tail !== undefined)) return r;
        if (r && r.jump !== undefined) { next = r.jump; break; }
      }
      if (next === null) {   // no jump taken: fall through to the next block
        if (k + 1 === f.blocks.length) this.stop(frame, 'falls off the end of the function');
        next = f.blocks[k + 1].label;
      }
      frame.label = next;
    }
  }

  stop(frame, what) {
    throw new MachineError(`machine model: ${frame.f.name} block ${frame.label}: ${what}`);
  }

  hex(a) {
    return `0x${a.toString(16)}`;
  }

  // The address a memory operand names.
  address(o, frame) {
    const base = o.base.kind === 'Reg' && o.base.name === 'sp' ? frame.sp : this.read(o.base, frame);
    return base + o.offset;
  }

  inHeap(a) {
    return a >= HEAP_BASE && a < FRAME_BASE - FRAME_STRIDE * 64;
  }

  read(o, frame) {
    switch (o.kind) {
      case 'Imm':   // (a double's bits arrive as their decimal text, src/words.js: the model's BigInt)
        return typeof o.value === 'string' ? BigInt(o.value) : o.value;
      case 'SVar':
        if (!frame.vars.has(o.name)) this.stop(frame, `reads ${o.name} before it is written`);
        return frame.vars.get(o.name);
      case 'Reg':
        if (!this.regs.has(o.name)) this.stop(frame, `reads ${o.name}, which holds no value (clobbered by a call, or never written)`);
        return this.regs.get(o.name);
      case 'Mem': {
        const a = this.address(o, frame);
        if (!this.mem.has(a)) {
          if (this.released.some(([b, e]) => a >= b && a < e))
            this.stop(frame, `reads ${showOperand(o)} = ${this.hex(a)}, in a heap space the collector has released (a pointer it did not update?)`);
          this.stop(frame, `reads ${showOperand(o)} = ${this.hex(a)}, which was never written`);
        }
        return this.mem.get(a);
      }
      case 'Global':
        if (!this.globals.has(o.name)) this.stop(frame, `no global ${o.name}`);
        return this.globals.get(o.name);
      default:
        throw new Error(`read: ${o.kind}`);
    }
  }

  write(o, v, frame) {
    switch (o.kind) {
      case 'SVar': frame.vars.set(o.name, v); return;
      case 'Reg': this.regs.set(o.name, v); return;
      case 'Mem': {
        const a = this.address(o, frame);
        if (a >= STATIC_BASE && a < STATIC_BASE + 0x100000) this.stop(frame, `writes to a static object at ${this.hex(a)}`);
        if (this.inHeap(a)) {
          const b = this.globals.get('fromspace_begin'), e = this.globals.get('fromspace_end');
          if (a < b || a >= e) this.stop(frame, `writes ${showOperand(o)} = ${this.hex(a)}, outside the current heap space`);
        }
        if (o.base.kind === 'Reg' && o.base.name === 'sp') frame.written.add(a);
        this.mem.set(a, v);
        return;
      }
      case 'Global': this.globals.set(o.name, v); return;
      default:
        this.stop(frame, `cannot write to ${showOperand(o)}`);
    }
  }

  // A double operand: its word must be a double's bits, which the model keeps as a BigInt.
  double(o, frame) {
    const w = this.read(o, frame);
    if (typeof w !== 'bigint') this.stop(frame, `${showOperand(o)} holds ${w}, which is not a double's bits`);
    return bitsDouble(w);
  }

  clobberScratch() {
    for (const r of SCRATCH) this.regs.delete(r);
  }

  bitsOf(w, frame) {
    if (typeof w !== 'bigint') this.stop(frame, `${w} is not a double's bits`);
    return bitsDouble(w);
  }

  exec(i, frame) {
    const [d, a, b] = i.args;
    switch (i.op) {
      case 'mov':
        this.write(d, this.read(a, frame), frame);
        return null;
      case 'add':
      case 'sub':
      case 'mul':
      case 'xor':
      case 'shl':
      case 'shr':
      case 'and':
      case 'or':
      case 'sar':
        this.write(d, machineArith(i.op, this.read(a, frame), this.read(b, frame)), frame);
        return null;
      case 'fadd':
      case 'fsub':
      case 'fmul':
      case 'fdiv':
        this.write(d, doubleBits(FLOAT[i.op](this.double(a, frame), this.double(b, frame))), frame);
        return null;
      case 'fneg':
        this.write(d, doubleBits(-this.double(a, frame)), frame);
        return null;
      case 'i2f': {
        const v = this.read(a, frame);
        if (typeof v !== 'number') this.stop(frame, `i2f of ${v}, which is not an integer word`);
        this.write(d, doubleBits(v), frame);
        return null;
      }
      case 'icall':
        return this.runtime(i, frame);
      case 'return':
        return { ret: this.read(d, frame) };
      case 'jump':
        return { jump: i.target };
      case 'call':
        this.call(i.fn, i.nargs);
        return null;
      case 'callr':
        this.call(this.callee(d, frame), i.nargs);
        return null;
      case 'tailcall':
        return { tail: i.fn, nargs: i.nargs };
      case 'tailcallr':
        return { tail: this.callee(d, frame), nargs: i.nargs };
      case 'funref':
        this.write(d, this.addressOf.get(i.fn), frame);
        return null;
      case 'closure': {
        if (!this.statics.has(i.fn)) {
          const a = STATIC_BASE + 16 * this.statics.size;
          // one field, kind 2, mask 0, and (chapter 9) the arity, without the closure parameter
          this.mem.set(a, (this.funcs.get(i.fn).nparams - 1) * 2 ** 46 + 1 * 8 + 2 * 2 + 1);
          this.mem.set(a + 8, this.addressOf.get(i.fn));
          this.statics.set(i.fn, a);
        }
        this.write(d, this.statics.get(i.fn), frame);
        return null;
      }
      case 'lea':
        this.write(d, this.address(a, frame), frame);
        return null;
      case 'strref':     // chapter 13
        this.write(d, this.strings.intern(i.text), frame);
        return null;
      case 'shaperef':
        this.write(d, this.strings.shape(i.names, i.error), frame);
        return null;
      default:
        if (i.op.startsWith('set') && CONDITIONS[i.op.slice(3)]) {
          this.write(d, CONDITIONS[i.op.slice(3)](this.read(a, frame), this.read(b, frame)) ? 1 : 0, frame);
          return null;
        }
        if (i.op.startsWith('b') && CONDITIONS[i.op.slice(1)])   // operands are args[0], args[1]
          return CONDITIONS[i.op.slice(1)](this.read(d, frame), this.read(a, frame)) ? { jump: i.target } : null;
        if (i.op.startsWith('fset') && FCONDITIONS[i.op.slice(4)]) {
          this.write(d, FCONDITIONS[i.op.slice(4)](this.double(a, frame), this.double(b, frame)) ? 1 : 0, frame);
          return null;
        }
        if (i.op.startsWith('fb') && FCONDITIONS[i.op.slice(2)])
          return FCONDITIONS[i.op.slice(2)](this.double(d, frame), this.double(a, frame)) ? { jump: i.target } : null;
        throw new Error(`machine: unknown instruction ${i.op}`);
    }
  }

  // The C runtime's functions, as the machine sees them: arguments in r0.., and every
  // scratch register overwritten when they return.
  runtime(i, frame) {
    const args = SCRATCH.slice(0, i.nargs).map((r) => this.read(Reg(r), frame));
    const sr = this.strings.call(i.fn, args, frame);   // chapter 13
    if (sr !== null) {
      if (sr && sr.print !== undefined) emit(this.out, sr.print, i.fn === 'put_str' ? ' ' : '\n');
      this.clobberScratch();
      if (sr !== undefined && !(sr && sr.print !== undefined)) this.regs.set('r0', sr);
      return null;
    }
    if (MATH_OPS[i.fn]) {   // chapter 10: Math, on a double's bits or on integers
      const int = MATH_INT_RESULT.has(i.fn);
      const xs = args.map((a) => (int ? Number(a) : this.bitsOf(a, frame)));
      this.clobberScratch();
      const r = MATH_OPS[i.fn](...xs);
      this.regs.set('r0', int ? r : doubleBits(r));
      return null;
    }
    switch (i.fn) {
      case 'print_int':
      case 'put_int':
        if (typeof args[0] !== 'number') this.stop(frame, `${i.fn} of ${args[0]}, which is not an integer word`);
        emit(this.out, String(args[0]), i.fn === 'put_int' ? ' ' : '\n');
        break;
      case 'print_bool':
      case 'put_bool':
        if (args[0] !== 0 && args[0] !== 1) this.stop(frame, `${i.fn} of ${args[0]}, which is not 0 or 1`);
        emit(this.out, args[0] ? 'true' : 'false', i.fn === 'put_bool' ? ' ' : '\n');
        break;
      case 'print_num':
      case 'put_num':
        if (typeof args[0] !== 'bigint') this.stop(frame, `${i.fn} of ${args[0]}, which is not a double's bits`);
        emit(this.out, formatNumber(bitsDouble(args[0])), i.fn === 'put_num' ? ' ' : '\n');
        break;
      case 'int_mod':   // chapter 10
        if (args[1] === 0) throw new Trap('x % 0 is NaN, which is outside the integer subset');
        this.clobberScratch();
        this.regs.set('r0', Number(BigInt(args[0]) % BigInt(args[1])));   // C's %: the sign of the dividend
        return null;
      case 'num_mod':
        this.clobberScratch();
        this.regs.set('r0', doubleBits(this.bitsOf(args[0], frame) % this.bitsOf(args[1], frame)));
        return null;
      case 'num_pow':
        this.clobberScratch();
        this.regs.set('r0', doubleBits(this.bitsOf(args[0], frame) ** this.bitsOf(args[1], frame)));
        return null;
      case 'num_to_int': {
        const d = this.bitsOf(args[0], frame);
        if (!Number.isSafeInteger(d)) throw new Trap(TYPE_ERROR.Int);
        this.clobberScratch();
        this.regs.set('r0', d === 0 ? 0 : d);
        return null;
      }
      case 'num_to_int32':
        this.clobberScratch();
        this.regs.set('r0', this.bitsOf(args[0], frame) | 0);
        return null;
      case 'collect':
        this.collect(args[0], args[1], frame);
        break;
      case 'index_error':
        throw new Trap('index out of range');
      case 'uncaught':   // chapter 14
        throw new Trap(`Uncaught ${this.strings.describe(args[0], frame)}`);
      default:
        if (i.fn.startsWith('any_')) {      // chapter 9
          const r = this.dynamic(i.fn, args, frame);
          this.clobberScratch();
          if (r !== undefined) this.regs.set('r0', r);
          return null;
        }
        this.stop(frame, `unknown runtime function ${i.fn}`);
    }
    this.clobberScratch();
    return null;
  }

  // ---- chapter 9: runtime.c's functions on dynamic values, on the words themselves ----
  //
  // A number's word is above 2^53, so the model keeps it as a BigInt; pointers and the
  // constants are ordinary numbers. Every function checks what it is given as runtime.c
  // does, and a word that is none of the three stops the model.

  isPointerWord(w) { return typeof w === 'number' && w >= 4096; }
  // Chapter 15: an array is [header with bit 53, length, storage]; the storage is a plain
  // object of capacity words.
  isArray(w) { return this.isPointerWord(w) && this.mem.has(w) && this.kindOf(w) === 2 && Math.floor(this.mem.get(w) / 2 ** 51) % 4 === 3; }
  arrayElements(a) {
    const n = this.mem.get(a + 8), st = this.mem.get(a + 16);
    return Array.from({ length: n }, (_, k) => this.mem.get(st + 8 + 8 * k));
  }

  toNumber(w, frame) {
    if (typeof w === 'bigint') return decodeNumber(w);
    if (w === ANY_TRUE) return 1;
    if (w === ANY_FALSE || w === ANY_NULL) return 0;
    if (w === ANY_UNDEFINED) return NaN;
    if (this.strings.isString(w)) return Number(this.strings.read(w, frame));   // chapter 13
    if (this.isPointerWord(w)) throw new Trap(TYPE_ERROR.number);
    this.stop(frame, `${w} is not a dynamic value`);
  }

  kindOf(w) { return InterpSlir.kind(this.mem.get(w)); }

  dynamic(fn, args, frame) {
    const [a, b] = args;
    const num = (x) => this.toNumber(x, frame);
    const bool = (x) => (x ? 1 : 0);
    const S = this.strings;
    switch (fn) {
      case 'any_add':   // chapter 13: a string operand makes it a concatenation
        if (S.isString(a) || S.isString(b)) return S.make(S.toString(a, frame) + S.toString(b, frame), args[2], frame);
        return encodeNumber(num(a) + num(b));
      case 'any_sub': return encodeNumber(num(a) - num(b));
      case 'any_mul': return encodeNumber(num(a) * num(b));
      case 'any_div': return encodeNumber(num(a) / num(b));
      case 'any_neg': return encodeNumber(-num(a));
      // (chapter 22: two strings by their code units)
      case 'any_lt': return S.isString(a) && S.isString(b) ? bool(S.read(a, frame) < S.read(b, frame)) : bool(num(a) < num(b));
      case 'any_le': return S.isString(a) && S.isString(b) ? bool(S.read(a, frame) <= S.read(b, frame)) : bool(num(a) <= num(b));
      case 'any_gt': return S.isString(a) && S.isString(b) ? bool(S.read(a, frame) > S.read(b, frame)) : bool(num(a) > num(b));
      case 'any_ge': return S.isString(a) && S.isString(b) ? bool(S.read(a, frame) >= S.read(b, frame)) : bool(num(a) >= num(b));
      case 'any_eq':
        if (typeof a === 'bigint' && typeof b === 'bigint') return bool(decodeNumber(a) === decodeNumber(b));
        if (S.isString(a) && S.isString(b)) return bool(S.read(a, frame) === S.read(b, frame));
        return bool(a === b);
      case 'any_truthy':
        if (typeof a === 'bigint') { const d = decodeNumber(a); return bool(d !== 0 && !Number.isNaN(d)); }
        if (S.isString(a)) return bool(this.mem.get(a + 8) > 0);
        return bool(a === ANY_TRUE || this.isPointerWord(a));
      case 'any_typeof':
        if (typeof a === 'bigint') return TYPEOF.number;
        if (a === ANY_TRUE || a === ANY_FALSE) return TYPEOF.boolean;
        if (a === ANY_UNDEFINED) return TYPEOF.undefined;
        if (a === ANY_NULL) return TYPEOF.object;
        if (this.isPointerWord(a)) return TYPEOF[S.typeName(a)];
        return this.stop(frame, `any_typeof of ${a}, which is not a dynamic value`);
      case 'any_from_int':
        if (typeof a !== 'number' || !Number.isSafeInteger(a)) this.stop(frame, `any_from_int of ${a}`);
        return encodeNumber(a);
      case 'any_to_int': {
        const d = typeof a === 'bigint' ? decodeNumber(a) : NaN;
        if (!Number.isSafeInteger(d)) throw new Trap(TYPE_ERROR.Int);
        return d === 0 ? 0 : d;
      }
      case 'any_to_bool':
        if (a !== ANY_TRUE && a !== ANY_FALSE) throw new Trap(TYPE_ERROR.Bool);
        return bool(a === ANY_TRUE);
      case 'any_to_array':
        if (!this.isArray(a)) throw new Trap(TYPE_ERROR.array);
        return a;
      case 'any_to_function':
        if (!this.isPointerWord(a) || this.kindOf(a) !== 2 || Math.floor(this.mem.get(a) / 2 ** 46) !== b)
          throw new Trap(TYPE_ERROR.fn(b));
        return a;
      case 'any_print':
      case 'any_put': {
        let text;
        if (typeof a === 'bigint') text = formatNumber(decodeNumber(a));
        else if (a === ANY_TRUE || a === ANY_FALSE) text = String(a === ANY_TRUE);
        else if (a === ANY_NULL || a === ANY_UNDEFINED) text = a === ANY_NULL ? 'null' : 'undefined';
        else if (S.isString(a)) text = S.read(a, frame);
        else if (this.isPointerWord(a)) throw new Trap(TYPE_ERROR.print);
        else this.stop(frame, `${fn} of ${a}, which is not a dynamic value`);
        emit(this.out, text, fn === 'any_put' ? ' ' : '\n');
        return undefined;
      }
      case 'any_mod': return encodeNumber(num(a) % num(b));            // chapter 10
      case 'any_to_int32': return num(a) | 0;
      case 'any_pow': return encodeNumber(num(a) ** num(b));
      case 'any_loose_eq': {
        const nullish = (w) => w === ANY_NULL || w === ANY_UNDEFINED;
        const prim = (w) => typeof w === 'bigint' || w === ANY_TRUE || w === ANY_FALSE || S.isString(w);
        if (nullish(a) || nullish(b)) return bool(nullish(a) && nullish(b));
        if (S.isString(a) && S.isString(b)) return bool(S.read(a, frame) === S.read(b, frame));
        if (prim(a) && prim(b)) return bool(num(a) === num(b));
        if (prim(a) || prim(b)) throw new Trap(OUTSIDE_EQ);
        return bool(a === b);
      }
      case 'any_to_number':
        if (typeof a !== 'bigint') throw new Trap(TYPE_ERROR.Number);
        return BigInt.asIntN(64, a - (1n << 49n));
      default:
        return this.stop(frame, `unknown runtime function ${fn}`);
    }
  }

  // ---- the collector: Cheney's algorithm, as runtime.c does it ----
  //
  // Headers: mask << 16 | length << 3 | kind << 1 | 1 (see runtime.c). Numbers here may be
  // above 2^32, so the fields are taken apart with division rather than JavaScript's
  // 32-bit shifts.

  static kind(h) { return Math.floor(h / 2) % 4; }
  static length(h) { return InterpSlir.kind(h) === 2 ? Math.floor(h / 8) % 8192 : Math.floor(h / 8); }
  static isPointerField(h, i) {
    const k = InterpSlir.kind(h);
    return k === 1 || (k === 2 && Math.floor(Math.floor(h / 65536) / 2 ** i) % 2 === 1);
  }

  collect(rootTop, bytes, frame) {
    const begin = this.globals.get('fromspace_begin'), end = this.globals.get('fromspace_end');
    let size = end - begin;
    let to = this.newSpace();
    let next = this.cheney(rootTop, to, frame, begin, end);
    this.release(begin, end);
    if (next - to + bytes > size) {
      const live = next - to, old = size;
      while (live + bytes > size) size *= 2;
      const bigger = this.newSpace();
      next = this.cheney(rootTop, bigger, frame, to, to + old);
      this.release(to, to + old);
      to = bigger;
    }
    this.globals.set('fromspace_begin', to);
    this.globals.set('fromspace_end', to + size);
    this.globals.set('free_ptr', next);
  }

  cheney(rootTop, to, frame, fromBegin, fromEnd) {
    const st = { next: to, fromBegin, fromEnd };
    for (let a = ROOTSTACK_BASE; a < rootTop; a += 8) {
      if (!this.mem.has(a)) this.stop(frame, `collect: root slot ${this.hex(a)} was never written`);
      this.mem.set(a, this.copy(this.mem.get(a), st, frame, `root slot ${this.hex(a)}`));
    }
    // chapter 14: the value being thrown
    this.globals.set('exc_value', this.copy(this.globals.get('exc_value'), st, frame, 'exc_value'));
    // Before register allocation, variables have no homes yet, so the model treats every
    // variable that holds an array as a root. After allocation there are no variables left,
    // and only the root stack counts, as in runtime.c.
    for (const fr of this.frames)
      for (const [v, val] of fr.vars)
        if (isPointerType(fr.f.types?.get(v))) fr.vars.set(v, this.copy(val, st, frame, `variable ${v}`));
    for (let scan = to; scan < st.next; ) {
      const h = this.mem.get(scan), len = InterpSlir.length(h);
      for (let k = 0; k < len; k++)
        if (InterpSlir.isPointerField(h, k))
          this.mem.set(scan + 8 * (k + 1), this.copy(this.mem.get(scan + 8 * (k + 1)), st, frame, `field ${k} of ${this.hex(scan)}`));
      scan += 8 * (len + 1);
    }
    return st.next;
  }

  copy(p, st, frame, where) {
    if (p === 0) return 0;
    if (typeof p === 'bigint' || p < 4096) return p;   // a dynamic number or constant (chapter 9)
    if (p < HEAP_BASE && this.mem.has(p)) return p;   // a static object (a closure; chapter 13: a string)
    if (p < st.fromBegin || p >= st.fromEnd || !this.mem.has(p))
      this.stop(frame, `collect: ${where} holds ${this.hex(p)}, which is not an object`);
    const h = this.mem.get(p);
    if (h % 2 === 0) return h;                    // forwarded
    const words = InterpSlir.length(h) + 1, q = st.next;
    for (let k = 0; k < words; k++) {
      if (!this.mem.has(p + 8 * k)) this.stop(frame, `collect: word ${k} of the object at ${this.hex(p)} was never written`);
      this.mem.set(q + 8 * k, this.mem.get(p + 8 * k));
    }
    st.next += 8 * words;
    this.mem.set(p, q);
    return q;
  }

  release(begin, end) {
    for (let a = begin; a < end; a += 8) this.mem.delete(a);
    this.released.push([begin, end]);
  }
}
