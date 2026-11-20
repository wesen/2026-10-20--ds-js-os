// A build: source text in, SLIR text out, with no interpreter and no file system (CJI-3, step 5).
// This is the entry tools/bundle.mjs bundles; cji.js and the test harness keep using
// src/compiler.js. A plain program (native = false) or a picocalc-os world compiled with the
// native world runtime (native = true, chapter 24).
//
// (CJI-3, for the stage-1 compiler: `mode` 'unit' compiles a world alone against the runtime's
// unit, 'prelude' the runtime's unit itself (the text is not read), as cji.js's --world-unit and
// --prelude-unit; 'world' a world with chapter 16's runtime and the harness script `driver`, as
// cji.js's --world and --driver (the test suite's world tests); `store` is where functions wait between turns (spill.js; a memory store when
// none is given); `write`, when given, takes the output function by function, and the result is
// then empty; `onPass(name, ms)` is called after each pass, as compileToText calls it.)

import { parse } from './parse.js';
import { nativeWorldProgram, nativeWorldUnit, nativePreludeUnit } from './world-native.js';
import { worldProgram } from './world.js';
import { resetGensym } from './utils.js';
import { compileBoxToText } from './pipeline.js';
import { memoryStore } from './spill.js';

export function compileSource(text, native, { mode = '', driver = '', store = null, write = null, onPass = null } = {}) {
  resetGensym();
  // (lane 5: the program in a box, made in a function of its own and emptied by the compile, so that no
  // frame here holds the source program meanwhile)
  const box = sourceBox(text, native, mode, driver);
  if (onPass) onPass('source', 0);
  // (lane 5: with no store given, functions wait in the heap, and so would the ranges' memo, which costs stage 1
  // more memory than the time it saves: it is kept only with the host's file store, --spill)
  return compileBoxToText(box, { store: store ?? memoryStore(), write, onPass, memo: store !== null });   // (CJI-3 step 2: the back half one function at a time, each finished to text)
}
function sourceBox(text, native, mode, driver) {
  return { ir: mode === 'unit' ? nativeWorldUnit(text) : mode === 'prelude' ? nativePreludeUnit()
    : mode === 'world' ? worldProgram(text, driver) : native ? nativeWorldProgram(text) : parse(text) };
}

// (CJI-3) A spill store whose texts the host keeps, put and get being native primitives (the
// stage-1 compiler's file store; runtime.c rt_spill_put, rt_spill_get).
export function hostStore(put, get) {
  return { put, get, drop: (id) => undefined };
}
