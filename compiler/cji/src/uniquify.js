// uniquify: give every declared variable a name no other declaration has.
//
// After this pass a name means the same variable wherever it appears, so later passes can
// ignore scopes entirely. It also rejects the programs JavaScript would reject: a name that
// is not declared, a name declared twice in one block, and a read before the declaration
// (the temporal dead zone; without closures, "before" is simply "earlier in the text").

import {
  Program, Print, Const, Block, Var, Prim, If, IfStmt, Let, Set as SetExp, ExprStmt, While, ArrayLit, Index, SetIndex,
  FunDef, Call, Return, Lambda,
} from './ast.js';
//
// Chapter 8: functions may be nested and may use the variables around them, so the
// chapter 7 restriction is gone. An arrow function gets a fresh name too, under which
// closure conversion will lift it.
//
// Chapter 7: function names are declared in the outermost scope before anything runs, as
// JavaScript hoists function declarations. A function's parameters form its own scope,
// like a block's declarations, and may be assigned, like a let. A function may not use a
// variable of an enclosing scope (a top-level const, say): that needs closures, which come
// in chapter 8.
import { CompileError, gensym } from './utils.js';

// (chapter 22: outer, names the program's own functions under their unique names, for a
// library copy that calls them: Date's methods call chapter 21's Date$get)
export function uniquify(p, outer = null) {
  const scopes = [];   // innermost last; each maps a source name to { unique, ready, kind }
  if (outer) scopes.push(new Map([...outer].map(([n, u]) => [n, { unique: u, ready: true, kind: 'function' }])));
  // (scopeFn: how many functions deep each scope is)
  let fnDepth = 0;

  const scopeFn = outer ? [0] : [];
  function binding(name, what) {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const b = scopes[i].get(name);
      if (b) {
        // inside a function nested since, the read happens later, when the function runs
        // (const f = (n) => ... f(n - 1)); only a read in the same function is too early
        if (!b.ready && scopeFn[i] === fnDepth) throw new CompileError(`${name} is ${what} before its declaration`);
        return b;
      }
    }
    if (name === 'Math$random') throw new CompileError('Math.random is not in the subset (only in a world, whose runtime seeds it)');
    throw new CompileError(`${name} is not declared`);
  }
  const lookup = (name) => binding(name, 'read').unique;

  function exp(e) {
    switch (e.kind) {
      case 'Int':
      case 'Bool':
      case 'AnyLit':
      case 'Num':
      case 'Str':
      case 'Caught':
        return e;
      case 'LibCall':   // chapter 15
        return { ...e, args: e.args.map(exp) };
      case 'Await':     // chapter 16
        return { ...e, arg: exp(e.arg) };
      case 'Spread':    // chapter 17
        return { ...e, arg: exp(e.arg) };
      case 'Var':
        return Var(lookup(e.name));
      // chapter 13
      case 'Record':
        return { ...e, fields: e.fields.map((f) => ({ name: f.name, exp: exp(f.exp) })) };
      case 'Get':
        return { ...e, obj: exp(e.obj) };
      case 'SetProp':
        return { ...e, obj: exp(e.obj), exp: exp(e.exp) };
      case 'MethodCall':
        return { ...e, obj: exp(e.obj), args: e.args.map(exp) };
      case 'Prim':
        return Prim(e.op, e.args.map(exp));
      case 'If':
        return If(exp(e.cond), exp(e.thn), exp(e.els));
      case 'ArrayLit':
        return ArrayLit(e.elems.map(exp));
      case 'Index':
        return Index(exp(e.arr), exp(e.idx));
      case 'SetIndex':
        return SetIndex(exp(e.arr), exp(e.idx), exp(e.exp), e.op);
      case 'Call':
        return Call(exp(e.fn), e.args.map(exp));
      case 'Lambda': {
        const { params, body } = func(e.params, e.body);
        return { ...e, ...Lambda(params, e.retType, body, gensym('lambda')) };   // keeps inferRet (chapter 11)
      }
      case 'Set': {
        const b = binding(e.name, 'assigned');
        if (b.kind === 'function') throw new CompileError(`${e.name} is a function and cannot be assigned`);
        if (b.kind !== 'let') throw new CompileError(`${e.name} is a const and cannot be assigned`);
        return SetExp(b.unique, exp(e.exp), e.op);
      }
      default:
        throw new Error(`uniquify: unexpected ${e.kind}`);
    }
  }

  function stmt(s) {
    switch (s.kind) {
      case 'Print':
        return { ...s, arg: exp(s.arg) };
      case 'Const':
      case 'Let': {
        const init = exp(s.init);   // the initializer cannot see the name it initializes
        const b = scopes.at(-1).get(s.name);
        b.ready = true;
        return { ...s, name: b.unique, init };
      }
      case 'ExprStmt':
        return ExprStmt(exp(s.exp));
      case 'While':
        return { ...s, cond: exp(s.cond), body: stmt(s.body), update: s.update && stmt(s.update) };
      case 'Break':
      case 'Continue':
        return s;
      case 'Return':
        return Return(exp(s.arg));
      case 'FunDef': {
        const { params, body } = func(s.params, s.body);
        return { ...s, ...FunDef(scopes.at(-1).get(s.name).unique, params, s.retType, body) };
      }
      case 'Block':
        return Block(block(s.body));
      case 'IfStmt':   // a branch that is a block gets its own scope through the Block case
        return IfStmt(exp(s.cond), stmt(s.thn), s.els && stmt(s.els));
      case 'Throw':    // chapter 14 (catch's variable is declared in the handler's block)
        return { ...s, arg: exp(s.arg) };
      case 'Try':
        return { ...s, body: stmt(s.body), handler: s.handler && stmt(s.handler), finalizer: s.finalizer && stmt(s.finalizer) };
      default:
        throw new Error(`uniquify: unexpected ${s.kind}`);
    }
  }

  // A function's parameters, a scope of their own, and its body.
  function func(ps, stmts) {
    const params = new Map();
    for (const q of ps) {
      if (params.has(q.name)) throw new CompileError(`a function has two parameters named ${q.name}`);
      params.set(q.name, { unique: gensym(q.name), ready: true, kind: 'let' });
    }
    fnDepth++;
    scopes.push(params);
    scopeFn.push(fnDepth);
    const body = block(stmts);
    scopes.pop();
    scopeFn.pop();
    fnDepth--;
    return { params: ps.map((q) => ({ ...q, name: params.get(q.name).unique })), body };
  }

  // A block's declarations are in scope for the whole block, so collect them first.
  function block(stmts) {
    const scope = new Map();
    for (const s of stmts) {
      if (s.kind !== 'Const' && s.kind !== 'Let' && s.kind !== 'FunDef') continue;
      if (scope.has(s.name)) throw new CompileError(`${s.name} is declared twice in one block`);
      const kind = s.kind === 'Let' ? 'let' : s.kind === 'Const' ? 'const' : 'function';
      scope.set(s.name, { unique: gensym(s.name), ready: kind === 'function', kind });
    }
    scopes.push(scope);
    scopeFn.push(fnDepth);
    const out = stmts.map(stmt);
    scopes.pop();
    scopeFn.pop();
    return out;
  }

  return { ...Program(block(p.body)), uniquified: true, ...(p.unit ? { unit: p.unit } : {}) };   // (CJI-3: a unit's mark)
}
