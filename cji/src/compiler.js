// The compiler: an ordered list of passes. Each entry names the pass, the function that
// runs it, the interpreter for the language it produces and that language's grammar
// check, so the test harness can check the tree and run the program after every pass.

import { InterpLDyn, InterpCDyn } from './dynamic.js';
import { InterpSlir } from './slir.js';
import {
  arrayLanguage, isCArray, isSlirVar, isSlirHomes, isSlirPatched, isSlirLaid, isSlirFinal,
} from './grammar.js';
import { PIPELINE } from './pipeline.js';
import { runSlas } from './backend.js';

// (CJI-3: the passes' functions come from pipeline.js, which a build without the interpreters uses
// alone; this list adds each stage's interpreter and grammar check, for the test harness)
const RUN = Object.fromEntries(PIPELINE);
export const passes = [
  { name: 'uniquify', run: RUN.uniquify, interp: InterpLDyn, check: arrayLanguage({ lambda: true, dyn: true }) },
  { name: 'lower_rest', run: RUN.lower_rest, interp: InterpLDyn, check: arrayLanguage({ lambda: true, dyn: true }) },   // chapter 17
  { name: 'lower_async', run: RUN.lower_async, interp: InterpLDyn, check: arrayLanguage({ lambda: true, dyn: true }) },   // chapter 16
  { name: 'infer_types', run: RUN.infer_types, interp: InterpLDyn, check: arrayLanguage({ lambda: true, dyn: true }) },
  { name: 'instantiate_library', run: RUN.instantiate_library, interp: InterpLDyn, check: arrayLanguage({ lambda: true, dyn: true }) },   // chapter 15
  { name: 'type_check', run: RUN.type_check, interp: InterpLDyn, check: arrayLanguage({ typed: true, lambda: true, dyn: true }) },
  { name: 'cast_insert', run: RUN.cast_insert, interp: InterpLDyn, check: arrayLanguage({ typed: true, lambda: true, dyn: true, cast: true }) },
  { name: 'shrink', run: RUN.shrink, interp: InterpLDyn,
    check: arrayLanguage({ typed: true, shrunk: true, defs: true, lambda: true, dyn: true, cast: true }) },
  { name: 'convert_assignments', run: RUN.convert_assignments, interp: InterpLDyn,
    check: arrayLanguage({ typed: true, shrunk: true, defs: true, lambda: true, boxed: true, dyn: true, cast: true }) },
  { name: 'convert_to_closures', run: RUN.convert_to_closures, interp: InterpLDyn,
    check: arrayLanguage({ typed: true, shrunk: true, defs: true, boxed: true, closures: true, dyn: true, cast: true }) },
  { name: 'uncover_get', run: RUN.uncover_get, interp: InterpLDyn,
    check: arrayLanguage({ typed: true, shrunk: true, defs: true, boxed: true, closures: true, get: true, dyn: true, cast: true }) },
  { name: 'check_bounds', run: RUN.check_bounds, interp: InterpLDyn,
    check: arrayLanguage({ typed: true, shrunk: true, defs: true, boxed: true, closures: true, get: true, checked: true, dyn: true, cast: true }) },
  { name: 'expose_allocation', run: RUN.expose_allocation, interp: InterpLDyn,
    check: arrayLanguage({ typed: true, shrunk: true, defs: true, boxed: true, closures: true, get: true, checked: true, exposed: true, dyn: true, cast: true }) },
  { name: 'remove_complex_operands', run: RUN.remove_complex_operands, interp: InterpLDyn,
    check: arrayLanguage({ typed: true, shrunk: true, defs: true, boxed: true, closures: true, checked: true, exposed: true, mon: true, dyn: true, cast: true }) },
  { name: 'explicate_control', run: RUN.explicate_control, interp: InterpCDyn, check: isCArray },
  { name: 'remove_jumps', run: RUN.remove_jumps, interp: InterpCDyn, check: isCArray },
  { name: 'select_instructions', run: RUN.select_instructions, interp: InterpSlir, check: isSlirVar },
  { name: 'prune_functions', run: RUN.prune_functions, interp: InterpSlir, check: isSlirVar },   // chapter 25
  { name: 'uncover_live', run: RUN.uncover_live, interp: InterpSlir, check: isSlirVar },
  { name: 'build_interference', run: RUN.build_interference, interp: InterpSlir, check: isSlirVar },
  { name: 'allocate_registers', run: RUN.allocate_registers, interp: InterpSlir, check: isSlirHomes },
  { name: 'patch_instructions', run: RUN.patch_instructions, interp: InterpSlir, check: isSlirPatched },
  { name: 'layout_blocks', run: RUN.layout_blocks, interp: InterpSlir, check: isSlirLaid },
  { name: 'prelude_and_conclusion', run: RUN.prelude_and_conclusion, interp: InterpSlir, check: isSlirFinal },
  { name: 'canonical_names', run: RUN.canonical_names, interp: InterpSlir, check: isSlirFinal },   // chapter 28
];

// CJI-3 step 2: a build streams functions through the back half (compileForBuild, in pipeline.js
// with the passes, so that a build without the interpreters has it too)
export { BACK_HALF, compileForBuild, compileToText, compileBoxToText } from './pipeline.js';

// The interpreter and grammar check for the source language of this chapter.
export const sourceInterp = InterpLDyn;
export const sourceCheck = arrayLanguage({ lambda: true, dyn: true });

// Test directories whose programs this chapter's compiler must handle. Programs in
// `reject` are outside the language; each has a .err file with the error it must produce.
export const testFamilies = ['int', 'var', 'reg', 'if', 'while', 'array', 'gc', 'fun', 'closure', 'dynamic', 'core', 'infer', 'ranges', 'strings', 'exceptions', 'library', 'async', 'patterns', 'regex', 'objects', 'inspect', 'dates', 'collections', 'tail', 'worlds', 'reject'];

// From SLIR to machine code: print it, assemble and run it with slas.
export const backend = { name: 'slas', run: runSlas };
