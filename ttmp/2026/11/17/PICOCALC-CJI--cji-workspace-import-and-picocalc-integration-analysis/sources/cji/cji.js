#!/usr/bin/env node
// Command-line driver.
//   node cji.js prog.js            compile and run the program as machine code (needs slas)
//   node cji.js prog.js --dump     print the IR after every pass, then run
//   node cji.js prog.js --emit     print the final SLIR instead of running it
//   node cji.js prog.js --interp   run the last IR in its interpreter instead of slas
//   node cji.js prog.js --aot      compile it ahead of time to an object, link it with the runtime, run that
//   node cji.js - --prelude-unit --emit     (CJI-3) the world runtime compiled alone, as a unit
//   node cji.js world.js --world-unit --emit  (CJI-3) a world compiled alone, against that unit
//   node cji.js prog.js --stats    (CJI-3) also write each pass's time and live heap as JSON to stderr
//   node cji.js prog.js --spill    (CJI-3) functions wait between passes in a file, not the heap
//                                  (with node --expose-gc the heap is measured after a full collection)
//   node cji.js prog.js --emit-sidecar F  (CJI-3 lane 4) also write the front end's facts to F
//   node cji.js prog.js --sidecar F       (CJI-3 lane 4) compile with F's facts, checked, instead of
//                                  inferring them (--sidecar-strict: refuse when they do not hold)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { worldProgram } from './src/world.js';
import { nativeWorldProgram, nativePreludeUnit, nativeWorldUnit } from './src/world-native.js';
import { parse } from './src/parse.js';
import { showProgram, showC } from './src/ast.js';
import { printSlir } from './src/slir.js';
import { runAot, runRv32 } from './src/backend.js';
import { resetGensym, CompileError } from './src/utils.js';
import { passes, sourceInterp, backend, compileBoxToText, BACK_HALF } from './src/compiler.js';
import { fileStore } from './src/spill-file.js';
import { withSidecar, recordingSession, usingSession, sidecarText } from './src/sidecar.js';

const [file, ...opts] = process.argv.slice(2);
if (!file) {
  console.error('usage: node cji.js prog.js [--dump] [--emit] [--interp]');
  process.exit(1);
}

function showIR(ir) {
  switch (ir.kind) {
    case 'Program':
    case 'ProgramDefs': return showProgram(ir);
    case 'CProgram':
    case 'CProgramDefs': return showC(ir);
    case 'SProgram': return printSlir(ir).trimEnd();
    default: return JSON.stringify(ir);
  }
}

process.on('uncaughtException', (e) => {   // a program outside the language: say why, briefly
  console.error(`cji: ${e.constructor.name === 'Error' ? 'internal error' : 'error'}: ${e.message}`);
  process.exit(1);
});

resetGensym();
// chapter 16: --world: the file is a picocalc-os world, compiled with the world runtime;
// --driver d.js: and run with the harness's script d.js
const wi = opts.indexOf('--driver');
// chapter 24: --native: a world compiled with the native runtime, for picocalc-os (with --emit, its SLIR)
const source = () => (opts.includes('--prelude-unit') ? nativePreludeUnit()   // CJI-3 step 1: the world runtime alone
  : opts.includes('--world-unit') ? nativeWorldUnit(readFileSync(file, 'utf8'))   // a world alone, against it
  : opts.includes('--native') ? nativeWorldProgram(readFileSync(file, 'utf8'))
  : opts.includes('--world') || wi >= 0
  ? worldProgram(readFileSync(file, 'utf8'), wi >= 0 ? readFileSync(opts[wi + 1], 'utf8') : '')
  : parse(readFileSync(file, 'utf8')));
let ir = source();
// (CJI-3 lane 4: a sidecar is for one source compiled one way: its key is a hash of both)
const optArg = (k) => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : undefined; };
const sidecarKey = () => createHash('sha256').update(JSON.stringify([
  ['--prelude-unit', '--world-unit', '--native', '--world'].filter((o) => opts.includes(o)),
  file === '-' ? '' : readFileSync(file, 'utf8'), wi >= 0 ? readFileSync(opts[wi + 1], 'utf8') : '',
])).digest('hex').slice(0, 32);
const emitSidecar = optArg('--emit-sidecar'), useSidecar = optArg('--sidecar');
const session = emitSidecar ? recordingSession()
  : useSidecar ? usingSession(existsSync(useSidecar) ? readFileSync(useSidecar, 'utf8') : '', sidecarKey(), { strict: opts.includes('--sidecar-strict') }) : null;
const dump = opts.includes('--dump');
if (dump) console.log(`;; source\n${showIR(ir)}\n`);
let interp = sourceInterp;
// (CJI-3: --stats, for tools/budget.mjs: per pass, its time and the live heap after it)
const stats = opts.includes('--stats') ? [] : null;
const live = () => { if (globalThis.gc) globalThis.gc(); return process.memoryUsage().heapUsed; };
const t0 = Date.now();
if (stats) stats.push({ pass: 'source', ms: 0, live: live() });
const compileAll = () => {
if (dump || opts.includes('--interp') || opts.includes('--whole')) {
  // every pass over the whole program, as the test harness runs them (--whole: for comparison)
  for (const p of passes) {
    const t = Date.now();
    ir = p.run(ir);
    if (stats) stats.push({ pass: p.name, ms: Date.now() - t, live: live() });
    if (p.interp) interp = p.interp;
    if (dump) console.log(`;; after ${p.name}\n${showIR(ir)}\n`);
  }
} else {
  // CJI-3 step 2: a build streams functions through the back half, and finishes each to text (compileToText)
  // (--spill: the functions wait in a file instead of the heap; with --emit the text goes out function by
  // function instead of as one string)
  let peak = 0;
  const store = opts.includes('--spill') ? fileStore() : undefined;
  const emitting = opts.includes('--emit');
  // (CJI-3, lane 5: the source program in a box, which the compile empties: not held here meanwhile)
  const box = { ir };
  ir = null;
  ir = compileBoxToText(box, {
    onPass: (name, ms) => { if (stats) stats.push({ pass: name, ms, live: BACK_HALF.includes(name) ? peak : live() }); },
    onFunction: () => { if (stats) peak = Math.max(peak, live()); },
    store, write: emitting ? (text) => process.stdout.write(text) : null,
  });
  if (store) store.close();
  if (emitting) ir = '';
}
};
// (CJI-3 lane 4: a sidecar that holds can still be above what inference would find, and type_check may
// reject what such types make of the program (a value made Any that a written Int[] receives). A compile
// with a sidecar that fails is made again without it: the program's own error, if it has one, comes back.
// With --sidecar-strict, it is refused.)
try {
  withSidecar(session, compileAll);
} catch (e) {
  if (session?.mode !== 'use' || session.ignored) throw e;
  if (session.strict) throw new CompileError(`the sidecar does not hold for this program (with it: ${e.message})`);
  session.log.push('an error with the sidecar: compiled again without it');
  resetGensym();
  ir = source();
  if (stats) stats.length = 1;
  withSidecar(null, compileAll);
}
if (emitSidecar) writeFileSync(emitSidecar, sidecarText(session, sidecarKey()));
// (what could not be written: an entry that did not hold when checked as it was written)
if (emitSidecar && session.notes && opts.includes('--sidecar-log')) process.stderr.write(`CJI-SIDECAR-NOTES ${session.notes.join('; ')}\n`);
// (what each call did with its entry: ok, or why it inferred instead)
if (session?.mode === 'use' && (opts.includes('--sidecar-log') || stats)) process.stderr.write(`CJI-SIDECAR ${session.ignored ? 'ignored' : session.log.join('; ')}\n`);
if (stats) process.stderr.write(`CJI-STATS ${JSON.stringify({ ms: Date.now() - t0, passes: stats })}\n`);
if (opts.includes('--emit')) process.stdout.write(printSlir(ir));
else if (opts.includes('--interp') || !backend) process.stdout.write(new interp().interpProgram(ir));
else if (opts.includes('--aot')) process.stdout.write(runAot(ir, file));   // chapter 26
else if (opts.includes('--rv32')) process.stdout.write(runRv32(ir, file));   // chapter 29
else process.stdout.write(backend.run(ir, file));
