// The type of every variable of a C program (the book's type_check_C, for locals_types).
//
// From chapter 6 on, the back end needs to know which variables hold pointers: the
// collector must find and update every pointer that survives a collection, so those
// variables get special homes. The type checker knew every source variable's type, but the
// passes since have invented many more (temporaries, the elements of an allocation), so
// the types are worked out again here, from the C program itself. A variable's type is the
// type of what is assigned to it; assignments may come in any order across blocks, so the
// pass repeats until every variable has a type.

import { MATH_INT_RESULT, MATH_NUMBER_RESULT } from './math.js';
import { STRING_RESULT } from './strings.js';
import { elementType, functionParts, dynamicFunctionType } from './types.js';

// Chapter 9: what the dynamic operators give (cast_insert's operators).
const ANY_RESULT = new Set(['any+', 'any-', 'any*', 'any/', 'any%', 'any**', 'anyneg', 'inject_Int', 'inject_Bool', 'inject', 'inject_Number',
  'host_call', 'host_event']);   // (chapter 24)
// Chapter 10: the operators that give a Number, and those that give a 32-bit Int.
const NUMBER_RESULT = new Set(['num+', 'num-', 'num*', 'num/', 'num%', 'num**', 'numneg', 'int_to_num', 'project_Number']);
const INT_RESULT = new Set(['neg', '+', '-', '*', '%', 'length', 'project_Int', '&', '|', '^', '~', '<<', '>>', '>>>',
  'num_to_int32', 'any_to_int32', 'num_to_int']);

function typeOf(e, types) {
  switch (e.kind) {
    case 'Int': return 'Int';
    case 'Bool': return 'Bool';
    case 'Var': return types.get(e.name);
    case 'GlobalValue': return e.name === 'exc_value' ? 'Any' : 'Int';   // (chapter 14: the value thrown)
    case 'Allocate': return e.type;
    case 'Index': {
      if (e.fieldType) return e.fieldType;   // chapter 13: a record's field
      const a = types.get(e.arr.name);
      return a && elementType(a);
    }
    case 'Str': return 'String';             // chapter 13
    case 'Shape': return 'Code';             // a static table, not a heap pointer
    case 'AnyLit':
      return 'Any';
    case 'Num':
      return 'Number';
    case 'Prim':
      if (INT_RESULT.has(e.op) || MATH_INT_RESULT.has(e.op)) return 'Int';
      if (NUMBER_RESULT.has(e.op) || MATH_NUMBER_RESULT.has(e.op)) return 'Number';
      if (ANY_RESULT.has(e.op)) return 'Any';
      if (e.op === 'project_array') return 'Any[]';
      if (e.op === 'arr_storage') return typeOf(e.args[0], types);   // chapter 15: a pointer like its array
      if (e.op === 'arr_resize' || e.op === 'any_length' || e.op === 'any_arity' || e.op === 'host_arg' || e.op === 'host_entries') return 'Int';
      // chapter 13
      if (STRING_RESULT.has(e.op)) return 'String';
      if (e.op === 'str_split') return 'String[]';
      if (e.op === 'project_record') return e.type;
      if (['str_length', 'str_indexOf', 'str_lastIndexOf'].includes(e.op)) return 'Int';
      if (e.op === 'str_charCodeAt') return 'Number';
      if (e.op === 'any_get' || e.op === 'any_set') return 'Any';
      if (e.op === 'any_index' || e.op === 'any_set_index' || e.op === 'any_unhole') return 'Any';   // chapter 19, 20
      if (e.op === 'any_keys') return 'Any[]';
      if (e.op === 'project_fn') return dynamicFunctionType(e.args[1].value);
      return 'Bool';
    case 'FunRef':        // chapter 8: only ever a closure's code address
      return 'Code';
    case 'StaticClosure':
      return types.funTypes.get(e.fn);
    case 'EnvRef':
    case 'Uninit':
      return e.type;
    case 'Call': {
      if (e.type) return e.type;
      const f = e.fn.kind === 'FunRef' ? types.funTypes.get(e.fn.name) : types.get(e.fn.name);
      return f && functionParts(f).ret;
    }
    default:
      throw new Error(`local types: unexpected ${e.kind}`);
  }
}

// `seed`: the types known already (chapter 7: a function's parameters); `funTypes`: the
// type of every function, for calls and function references.
export function localTypes(p, seed = new Map(), funTypes = new Map()) {
  const types = new Map(seed);
  types.funTypes = funTypes;
  const assigns = p.blocks.flatMap((b) => b.stmts.filter((s) => s.kind === 'Assign'));
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of assigns) {
      if (types.has(s.name)) continue;
      const t = typeOf(s.exp, types);
      if (t) { types.set(s.name, t); changed = true; }
    }
  }
  for (const s of assigns) if (!types.has(s.name)) throw new Error(`local types: no type for ${s.name}`);
  return types;
}
