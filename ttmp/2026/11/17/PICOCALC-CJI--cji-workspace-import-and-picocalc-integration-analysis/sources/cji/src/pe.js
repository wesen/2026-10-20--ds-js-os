// A partial evaluator for L_Int: the first "compiler" of the book (chapter 1).
//
// It folds every operation whose operands are known at compile time and leaves the rest of
// the tree alone. Its output is again an L_Int program, so the L_Int interpreter tests it.

import { Int, Prim, Print, Program } from './ast.js';
import { arith, OutsideSubset } from './interp.js';

function peExp(e) {
  switch (e.kind) {
    case 'Int':
      return e;
    case 'Prim': {
      const args = e.args.map(peExp);
      if (args.every((a) => a.kind === 'Int')) {
        try {
          return Int(arith(e.op, args[0].value, args[1]?.value));
        } catch (err) {
          if (!(err instanceof OutsideSubset)) throw err;
          // leave it to run time, where the program leaves the subset anyway
        }
      }
      return Prim(e.op, args);
    }
    default:
      throw new Error(`peExp: unexpected ${e.kind}`);
  }
}

function peStmt(s) {
  switch (s.kind) {
    case 'Print':
      return Print(peExp(s.arg));
    default:
      throw new Error(`peStmt: unexpected ${s.kind}`);
  }
}

export function peProgram(p) {
  return Program(p.body.map(peStmt));
}
