// Definitional interpreters.
//
// An interpreter is the definition of what a language means: a pass is correct when the
// interpreter for its output language gives the same output as the interpreter for its
// input language, on every program. Each chapter's interpreter extends the previous
// chapter's class and overrides only the cases it adds, as the Racket edition of the book
// does with its interpreter classes.

// Values in our subsets are integers that JavaScript's doubles and 64-bit machine integers
// both represent exactly. A program that leaves that range (or produces -0, which a machine
// integer cannot represent) is outside the language, and the interpreter says so rather
// than silently disagreeing with Node.
import { isRecordType } from './types.js';

export class OutsideSubset extends Error {}

// A run-time error that the subset defines: the program stops with a message, and the
// compiled program does the same (exit status 2). Chapter 6's index out of range is one.
export class Trap extends Error {}

// Chapter 14: a JavaScript exception on its way to a catch, carrying the value thrown. (Not
// an Error: the interpreters' own errors and traps are not exceptions the program sees.)
export class Thrown {
  constructor(value) { this.value = value; }
}
// An Error object in the interpreters: a record (chapter 13) whose list of names says it is
// an Error's.
export const ERROR_NAMES = Object.assign(['message', 'name'], { error: true });
export function makeError(name, message) {
  return Object.assign([ERROR_NAMES, message, name], { isRecord: true });
}

// Interpreters stop after this many loop iterations or blocks, so that a compiler bug that
// turns a loop infinite fails a test instead of hanging the harness.
export const STEP_LIMIT = 2_000_000;

export function checkInt(v) {
  if (!Number.isSafeInteger(v) || Object.is(v, -0))
    throw new OutsideSubset(`value ${Object.is(v, -0) ? '-0' : v} is outside the integer subset`);
  return v;
}

// Arithmetic shared by every interpreter and by the partial evaluator.
export function arith(op, a, b) {
  switch (op) {
    case 'neg': return checkInt(-a);
    case '+': return checkInt(a + b);
    case '-': return checkInt(a - b);
    case '*': return checkInt(a * b);
    default: throw new Error(`arith: unknown operator ${op}`);
  }
}

// What console.log prints for a value.
export function display(v) {
  return String(v);
}

// One value of a console.log: a line, or (chapter 10) a value and a space when more values
// of the same console.log follow (Print's `end`).
export function emit(out, text, end) {
  if (end === ' ') {
    out.partial = (out.partial ?? '') + text + ' ';
    return;
  }
  out.push((out.partial ?? '') + text);
  out.partial = '';
}

// break and continue (chapter 10) unwind the interpreter to their loop.
class LoopSignal {
  constructor(label, isBreak) { this.label = label; this.isBreak = isBreak; }
}

export class InterpLInt {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Int':
        return e.value;
      case 'Prim': {
        const args = e.args.map((a) => this.interpExp(a, env));
        return arith(e.op, args[0], args[1]);
      }
      default:
        throw new Error(`interpExp: unexpected ${e.kind}`);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Print':
        emit(out, display(this.interpExp(s.arg, env)), s.end);
        return;
      default:
        throw new Error(`interpStmt: unexpected ${s.kind}`);
    }
  }

  // Runs a program and returns everything it prints, one line per console.log.
  interpProgram(p) {
    const out = [];
    const env = new Map();
    for (const s of p.body) this.interpStmt(s, env, out);
    return out.map((l) => l + '\n').join('');
  }
}

// ---- L_Var (chapter 2) --------------------------------------------------------------

// Block scopes. A `const` is visible in its whole block, but reading it before its
// declaration has run is an error in JavaScript (the "temporal dead zone"); such programs
// are outside the subset.
const UNINITIALIZED = Symbol('uninitialized');

export class Env {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  declare(name) { this.vars.set(name, UNINITIALIZED); }
  define(name, v) { this.vars.set(name, v); }
  assign(name, v) {
    for (let env = this; env; env = env.parent) {
      if (env.vars.has(name)) {
        if (env.vars.get(name) === UNINITIALIZED) throw new OutsideSubset(`${name} is assigned before its declaration`);
        env.vars.set(name, v);
        return v;
      }
    }
    throw new OutsideSubset(`${name} is not declared`);
  }
  lookup(name) {
    for (let env = this; env; env = env.parent) {
      if (env.vars.has(name)) {
        const v = env.vars.get(name);
        if (v === UNINITIALIZED) throw new OutsideSubset(`${name} is read before its declaration`);
        return v;
      }
    }
    throw new OutsideSubset(`${name} is not declared`);
  }
}

export class InterpLVar extends InterpLInt {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Var':
        return env.lookup(e.name);
      default:
        return super.interpExp(e, env);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Const':
        env.define(s.name, this.interpExp(s.init, env));
        return;
      case 'Block':
        this.interpBlock(s.body, new Env(env), out);
        return;
      default:
        super.interpStmt(s, env, out);
    }
  }

  interpBlock(stmts, env, out) {
    for (const s of stmts) if (s.kind === 'Const' || s.kind === 'Let') env.declare(s.name);
    for (const s of stmts) this.interpStmt(s, env, out);
  }

  interpProgram(p) {
    const out = [];
    this.interpBlock(p.body, new Env(), out);
    return out.map((l) => l + '\n').join('');
  }
}

// ---- C_Var (chapter 2) --------------------------------------------------------------

// A C_Var program is a set of labelled blocks; execution starts at `start`. Variables are
// global to the program, and every statement reads its operands before it writes.
export class InterpCVar {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Int':
        return e.value;
      case 'Var':
        if (!env.has(e.name)) throw new Error(`C_Var: ${e.name} is read before it is assigned`);
        return env.get(e.name);
      case 'Prim': {
        const args = e.args.map((a) => this.interpExp(a, env));
        return arith(e.op, args[0], args[1]);
      }
      default:
        throw new Error(`C_Var interpExp: unexpected ${e.kind}`);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Assign':
        env.set(s.name, this.interpExp(s.exp, env));
        return;
      case 'Print':
        emit(out, display(this.interpExp(s.arg, env)), s.end);
        return;
      default:
        throw new Error(`C_Var interpStmt: unexpected ${s.kind}`);
    }
  }

  // A tail says where to go next: { next: label } or { value: v } to stop.
  interpTail(t, env) {
    switch (t.kind) {
      case 'Return':
        return { value: this.interpExp(t.arg, env) };
      default:
        throw new Error(`C_Var interpTail: unexpected ${t.kind}`);
    }
  }

  // Runs blocks from `label` until a tail returns. A loop, not recursion: from chapter 5 on,
  // a program can visit blocks any number of times.
  runBlocks(label, env, blocks, out) {
    for (let steps = 0; ; steps++) {
      if (steps > STEP_LIMIT) throw new Error(`C: more than ${STEP_LIMIT} blocks run; an infinite loop?`);
      const b = blocks.get(label);
      if (!b) throw new Error(`C: no block ${label}`);
      for (const s of b.stmts) this.interpStmt(s, env, out);
      const r = this.interpTail(b.tail, env);
      if ('value' in r) return r.value;
      label = r.next;
    }
  }

  interpProgram(p) {
    const out = [];
    const blocks = new Map(p.blocks.map((b) => [b.label, b]));
    this.runBlocks('start', new Map(), blocks, out);
    return out.map((l) => l + '\n').join('');
  }
}

// ---- L_If (chapter 4) ---------------------------------------------------------------

// The operators that are not arithmetic. In a well-typed program `!` sees a boolean,
// `<` and friends see integers, and `===` sees two values of the same type, so JavaScript's
// own operators give exactly the subset's meaning.
export function prim(op, a, b) {
  switch (op) {
    case '!': return !a;
    case '===': return a === b;
    case '!==': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case 'length': return a.length;
    default: return arith(op, a, b);
  }
}

export class InterpLIf extends InterpLVar {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Bool':
        return e.value;
      case 'Prim':
        // && and || evaluate their right operand only when it decides the result
        if (e.op === '&&') return this.interpExp(e.args[0], env) ? this.interpExp(e.args[1], env) : false;
        if (e.op === '||') return this.interpExp(e.args[0], env) ? true : this.interpExp(e.args[1], env);
        return prim(e.op, ...e.args.map((a) => this.interpExp(a, env)));
      case 'If':
        return this.interpExp(e.cond, env) ? this.interpExp(e.thn, env) : this.interpExp(e.els, env);
      case 'Begin':   // L_If^mon: the declarations' names are unique, so they need no new scope
        for (const s of e.stmts) this.interpStmt(s, env, null);
        return this.interpExp(e.exp, env);
      default:
        return super.interpExp(e, env);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'IfStmt':
        if (this.interpExp(s.cond, env)) this.interpStmt(s.thn, env, out);
        else if (s.els) this.interpStmt(s.els, env, out);
        return;
      default:
        super.interpStmt(s, env, out);
    }
  }
}

// ---- C_If (chapter 4) ---------------------------------------------------------------

export class InterpCIf extends InterpCVar {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Bool':
        return e.value;
      case 'Prim':
        return prim(e.op, ...e.args.map((a) => this.interpExp(a, env)));
      default:
        return super.interpExp(e, env);
    }
  }

  interpTail(t, env) {
    switch (t.kind) {
      case 'Goto':
        return { next: t.label };
      case 'IfGoto':
        return { next: this.interpExp(t.cond, env) ? t.thn : t.els };
      default:
        return super.interpTail(t, env);
    }
  }
}

// ---- L_While (chapter 5) ------------------------------------------------------------

export class InterpLWhile extends InterpLIf {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Set': {
        // x += e reads x before it evaluates e, as JavaScript does
        const old = e.op ? env.lookup(e.name) : null;
        const v = this.interpExp(e.exp, env);
        return env.assign(e.name, e.op ? arith(e.op, old, v) : v);
      }
      case 'GetBang':
        return env.lookup(e.name);
      default:
        return super.interpExp(e, env);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Let':
        env.define(s.name, this.interpExp(s.init, env));
        return;
      case 'ExprStmt':
        this.interpExp(s.exp, env);
        return;
      case 'Assign':   // L_While^mon: x = e; as a statement
        env.assign(s.name, this.interpExp(s.exp, env));
        return;
      case 'While':
        for (let n = 0; this.interpExp(s.cond, env); n++) {
          if (n > STEP_LIMIT) throw new Error(`more than ${STEP_LIMIT} iterations; an infinite loop?`);
          try {
            this.interpStmt(s.body, env, out);
          } catch (sig) {
            if (!(sig instanceof LoopSignal) || sig.label !== s.label) throw sig;
            if (sig.isBreak) return;
          }
          try {
            if (s.update) this.interpStmt(s.update, env, out);
          } catch (sig) {   // do-while's update is its test, which can break
            if (!(sig instanceof LoopSignal) || sig.label !== s.label || !sig.isBreak) throw sig;
            return;
          }
        }
        return;
      case 'Break':
      case 'Continue':
        throw new LoopSignal(s.label, s.kind === 'Break');
      default:
        super.interpStmt(s, env, out);
    }
  }
}

// ---- L_Array (chapter 6) ------------------------------------------------------------

// Arrays are JavaScript arrays, so === on two of them compares references, as in the
// subset. An index outside the array stops the program: JavaScript would read undefined
// or grow the array, neither of which the subset has.
function checkIndex(a, i) {
  if (i < 0 || i >= a.length) throw new Trap(`index out of range: ${i} in an array of length ${a.length}`);
}

// A new object. A closure (chapter 8: its allocation has a pointer mask) is marked, so that
// chapter 9's typeof can tell it from an array.
function allocate(e) {
  const a = new Array(e.length);
  // a masked object is a closure, or (chapter 13) a record, whose type is a record type
  if (e.mask !== undefined) {
    if (isRecordType(e.type)) a.isRecord = true;
    else a.isClosure = true;
  }
  return a;
}
const closure = (fields) => Object.assign(fields, { isClosure: true });

// What a box holds before its variable's declaration has run (chapter 8).
export const UNINIT = Symbol('uninitialized');

function readElement(a, i) {
  if (!(i in a)) throw new Error(`reads element ${i}, which was never written`);
  if (a[i] === UNINIT) throw new OutsideSubset('a variable is read before its declaration (in its temporal dead zone)');
  return a[i];
}

export class InterpLArray extends InterpLWhile {
  interpExp(e, env) {
    switch (e.kind) {
      case 'ArrayLit':
        return e.elems.map((x) => this.interpExp(x, env));
      case 'Index': {
        const a = this.interpExp(e.arr, env), i = this.interpExp(e.idx, env);
        checkIndex(a, i);
        return readElement(a, i);
      }
      case 'SetIndex': {
        const a = this.interpExp(e.arr, env), i = this.interpExp(e.idx, env);
        const old = e.op ? (checkIndex(a, i), a[i]) : null;
        const v = this.interpExp(e.exp, env);
        checkIndex(a, i);
        a[i] = e.op ? arith(e.op, old, v) : v;
        return a[i];
      }
      // The allocator's pieces (after expose_allocation): the interpreter has no heap of
      // its own, so collecting does nothing and the globals are 0.
      case 'GlobalValue':
        return 0;
      case 'Allocate':
        return allocate(e);
      default:
        return super.interpExp(e, env);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Trap':
        throw new Trap(s.message);
      case 'Collect':
        return;
      case 'Store':
        this.interpExp(s.arr, env)[this.interpExp(s.idx, env)] = this.interpExp(s.val, env);
        return;
      default:
        super.interpStmt(s, env, out);
    }
  }
}

export class InterpCArray extends InterpCIf {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Index': {   // checked by the code check_bounds inserted
        const a = this.interpExp(e.arr, env);
        return readElement(a, this.interpExp(e.idx, env));
      }
      case 'GlobalValue':
        return 0;
      case 'Allocate':
        return allocate(e);
      default:
        return super.interpExp(e, env);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'Trap':
        throw new Trap(s.message);
      case 'Collect':
        return;
      case 'Store':
        this.interpExp(s.arr, env)[this.interpExp(s.idx, env)] = this.interpExp(s.val, env);
        return;
      default:
        super.interpStmt(s, env, out);
    }
  }
}

// ---- L_Fun (chapter 7) --------------------------------------------------------------

// `return` unwinds the interpreter's own calls up to the function call it belongs to.
class ReturnSignal {
  constructor(value) { this.value = value; }
}

// A function value. One object per function, so === on functions works as in JavaScript.
const functionValue = (cache, def) => {
  if (!cache.has(def.name)) cache.set(def.name, { fun: def.name, arity: def.params.length });
  return cache.get(def.name);
};

export class InterpLFun extends InterpLArray {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Call': {
        const f = this.interpExp(e.fn, env);
        const args = e.args.map((a) => this.interpExp(a, env));
        return this.callFunction(f, args);
      }
      case 'FunRef':
        return functionValue(this.values, this.defs.get(e.name));
      case 'Caught':   // chapter 14: the value the enclosing catch caught
        return this.caught.at(-1);
      default:
        return super.interpExp(e, env);
    }
  }

  interpStmt(s, env, out) {
    switch (s.kind) {
      case 'FunDef':
        return;                     // defined before the program runs (hoisted)
      case 'Return':
        throw new ReturnSignal(this.interpExp(s.arg, env));
      // Chapter 14: throw, and try with catch and finally, as JavaScript's own. A finally
      // runs on every way out of its try: normally, by an exception, by a return, break or
      // continue. A trap is not one: it stops the program at once, as it does compiled.
      case 'Throw':
        throw new Thrown(this.interpExp(s.arg, env));
      case 'Try': {
        let pending = null;
        try {
          this.interpStmt(s.body, env, out);
        } catch (x) {
          if (x instanceof Thrown && s.handler) {
            this.caught.push(x.value);
            try { this.interpStmt(s.handler, env, out); } catch (y) { pending = y; } finally { this.caught.pop(); }
          } else pending = x;
        }
        const leaves = (x) => x instanceof Thrown || x instanceof ReturnSignal || x instanceof LoopSignal;
        if (pending && !leaves(pending)) throw pending;
        if (s.finalizer) this.interpStmt(s.finalizer, env, out);
        if (pending) throw pending;
        return;
      }
      case 'ExprStmt':
        if (s.exp.kind === 'Call') { this.interpExp(s.exp, env); return; }
        return super.interpStmt(s, env, out);
      default:
        super.interpStmt(s, env, out);
    }
  }

  describeThrown(v) { return String(v); }

  callFunction(f, args) {
    const def = this.defs.get(f.fun);
    if (++this.depth > 10_000) throw new Error('more than 10000 nested calls');
    const env = new Env(this.globals);
    def.params.forEach((p, k) => env.define(p.name, args[k]));
    try {
      this.interpBlock(def.body, env, this.out);
    } catch (r) {
      if (r instanceof ReturnSignal) return r.value;
      throw r;
    } finally {
      this.depth--;
    }
    throw new Error(`${def.name} reached its end without returning a value`);
  }

  // Functions are visible everywhere, before their declarations too. A program is either
  // the parser's list of statements and declarations, or (after shrink) a list of
  // definitions whose `main` holds the top-level statements.
  interpProgram(p) {
    this.out = [];
    this.depth = 0;
    this.caught = [];
    this.values = new Map();
    const defs = p.kind === 'ProgramDefs' ? p.defs : p.body.filter((s) => s.kind === 'FunDef');
    this.defs = new Map(defs.map((d) => [d.name, d]));
    this.globals = new Env();
    for (const d of defs) this.globals.define(d.name, functionValue(this.values, d));
    try {
      if (p.kind === 'ProgramDefs') this.callFunction(functionValue(this.values, this.defs.get('main')), []);
      else this.interpBlock(p.body, new Env(this.globals), this.out);
    } catch (x) {   // chapter 14: an exception nobody caught stops the program
      if (x instanceof Thrown) throw new Trap(`Uncaught ${this.describeThrown(x.value)}`);
      throw x;
    }
    return this.out.map((l) => l + '\n').join('');
  }
}

export class InterpCFun extends InterpCArray {
  interpExp(e, env) {
    switch (e.kind) {
      case 'FunRef':
        return functionValue(this.values, this.defs.get(e.name));
      case 'Call':
        return this.callFunction(this.interpExp(e.fn, env), e.args.map((a) => this.interpExp(a, env)));
      default:
        return super.interpExp(e, env);
    }
  }

  interpTail(t, env) {
    if (t.kind === 'TailCall')
      return { value: this.callFunction(this.interpExp(t.fn, env), t.args.map((a) => this.interpExp(a, env))) };
    return super.interpTail(t, env);
  }

  callFunction(f, args) {
    const def = this.defs.get(f.fun);
    if (++this.depth > 10_000) throw new Error('more than 10000 nested calls');
    const env = new Map(def.params.map((p, k) => [p, args[k]]));
    try {
      return this.runBlocks('start', env, new Map(def.blocks.map((b) => [b.label, b])), this.out);
    } finally {
      this.depth--;
    }
  }

  interpProgram(p) {
    this.out = [];
    this.depth = 0;
    this.values = new Map();
    this.defs = new Map(p.defs.map((d) => [d.name, { ...d, params: d.params }]));
    this.callFunction(functionValue(this.values, { name: 'main', params: [] }), []);
    return this.out.map((l) => l + '\n').join('');
  }
}

// ---- L_Lambda (chapter 8) -----------------------------------------------------------

// Before closure conversion a function value is a JavaScript object holding the function
// and the environment it was created in, so the interpreter gets lexical scope from Env.
// After closure conversion it is an array: the code (a {fun} value) and the free
// variables' values, which is what the compiled program builds on the heap.
export class InterpLLambda extends InterpLFun {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Lambda':
        return { fun: e.name, def: e, env };
      case 'Uninit':
        return UNINIT;
      case 'Closure':
        return closure([functionValue(this.values, this.defs.get(e.fn)), ...e.fvs.map((x) => this.interpExp(x, env))]);
      case 'StaticClosure':
        return this.staticClosure(e.fn);
      case 'EnvRef':
        return readElement(this.interpExp(e.env, env), e.field);
      default:
        return super.interpExp(e, env);
    }
  }

  staticClosure(name) {
    if (!this.statics.has(name)) this.statics.set(name, closure([functionValue(this.values, this.defs.get(name))]));
    return this.statics.get(name);
  }

  // Function declarations are hoisted to the start of their block, each a closure of the
  // block's environment.
  // (After convert_assignments, a declaration whose name is boxed stores its closure into
  // the box instead, where it stands, which is at the start of the block by then.)
  interpBlock(stmts, env, out) {
    for (const s of stmts) if (s.kind === 'FunDef' && !s.boxed) env.define(s.name, { fun: s.name, def: s, env });
    super.interpBlock(stmts, env, out);
  }

  interpStmt(s, env, out) {
    if (s.kind === 'FunDef' && s.boxed) {
      env.lookup(s.name)[0] = { fun: s.name, def: s, env };
      return;
    }
    super.interpStmt(s, env, out);
  }

  callFunction(f, args) {
    if (!f.def) return super.callFunction(f, args);
    if (++this.depth > 10_000) throw new Error('more than 10000 nested calls');
    const env = new Env(f.env);
    f.def.params.forEach((p, k) => env.define(p.name, args[k]));
    try {
      this.interpBlock(f.def.body, env, this.out);
    } catch (r) {
      if (r instanceof ReturnSignal) return r.value;
      throw r;
    } finally {
      this.depth--;
    }
    throw new Error(`${f.fun} reached its end without returning a value`);
  }

  interpProgram(p) {
    this.statics = new Map();
    if (p.kind === 'ProgramDefs') return super.interpProgram(p);
    this.out = [];
    this.depth = 0;
    this.caught = [];
    this.values = new Map();
    this.defs = new Map();
    this.globals = new Env();
    try {
      this.interpBlock(p.body, new Env(this.globals), this.out);
    } catch (x) {   // chapter 14, as above
      if (x instanceof Thrown) throw new Trap(`Uncaught ${this.describeThrown(x.value)}`);
      throw x;
    }
    return this.out.map((l) => l + '\n').join('');
  }
}

export class InterpCLambda extends InterpCFun {
  interpExp(e, env) {
    switch (e.kind) {
      case 'Uninit':
        return UNINIT;
      case 'StaticClosure':
        if (!this.statics.has(e.fn)) this.statics.set(e.fn, closure([functionValue(this.values, this.defs.get(e.fn))]));
        return this.statics.get(e.fn);
      case 'EnvRef':
        return readElement(this.interpExp(e.env, env), e.field);
      default:
        return super.interpExp(e, env);
    }
  }

  interpProgram(p) {
    this.statics = new Map();
    return super.interpProgram(p);
  }
}
