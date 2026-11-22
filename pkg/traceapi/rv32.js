/* rv32.js — a native RV32 interpreter with the semantics of picocalc-os/tools/rv32-interp.js.
 * The host injects one bridge object, __rv32, and deletes it after this script runs.
 * Public global: rv32 = {run, profile, classify, Rv32Fault, help}, the same interface as
 * typedRv32Interp. run() executes the reference's setup statements here, unchanged, and hands
 * the registers, guest memory and counts it built to Go (pkg/tracerv32), which runs the
 * reference's loop in place on those typed arrays. Results therefore have the reference's
 * types: counts is a Uint32Array, bytes a Uint8Array view without the stack, registers an
 * Int32Array.
 */
(function (root, bridge) {
  'use strict';
  const RETURN_TO_HOST = -4;
  const CALLEE_SAVED = [2, 3, 4, 8, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];

  class Rv32Fault extends Error {}

  // run(program, entry, args, memoryBytes, options): options as the reference's,
  // {stackBytes = 65536, limit = 50e6, imports = [], handlers = {}, counts = true}.
  function run(program, entry, args, memoryBytes, options = {}) {
    // The reference's setup, statement for statement.
    const image = program.image;
    if (!(image instanceof Uint8Array)) throw new TypeError('[rv32] program.image must be a Uint8Array');
    const words = image.byteLength >>> 2;
    const stackBytes = options.stackBytes ?? 65536;
    const limit = options.limit ?? 50e6;
    const size = (memoryBytes.length + stackBytes + 15) & -16;
    const bytes = new Uint8Array(size);
    bytes.set(memoryBytes);
    const counts = options.counts === false ? null : new Uint32Array(words);
    const relocations = new Map((program.relocations ?? []).map(r => [r.offset, r.index]));
    const x = new Int32Array(32);
    for (const reg of CALLEE_SAVED) x[reg] = 0x12340000 + reg;
    x[2] = size;
    x[1] = RETURN_TO_HOST;
    for (let i = 0; i < args.length; i++) x[10 + i] = args[i];
    const at = program.entries[entry];
    if (at === undefined) throw new Error("unknown RV32 entry " + entry);
    // typedRv32.compile produces integer offsets; the reference's behaviour for other values
    // (string concatenation in `at + 4`) is not imitated.
    if (typeof at !== 'number' || !Number.isSafeInteger(at))
      throw new TypeError('[rv32] entry ' + entry + ' must be an integer offset, got ' + String(at));
    // Only integer keys can equal an instruction address; the relocation's index value is kept
    // here, so a fault names it exactly as the reference does.
    const offsets = [], indices = [];
    for (const [offset, index] of relocations) {
      if (typeof offset === 'number' && Number.isSafeInteger(offset)) { offsets.push(offset); indices.push(index); }
    }
    // An import call: lookup and invoke keep the reference's expressions and their order
    // (handler lookup, missing-handler fault, sp check in Go, then fn.params.length).
    const lookup = k => {
      const index = indices[k];
      const fn = (options.imports ?? [])[index];
      const handler = fn && options.handlers?.[fn.name];
      return handler ? [fn, handler] : "no handler for import " + index;
    };
    const invoke = (fn, handler, regs) => handler(...regs.slice(10, 10 + fn.params.length)) | 0;
    const outcome = bridge.run(image, at, x, bytes, counts, offsets, Number(limit), String(limit), lookup, invoke);
    if (outcome.fault !== undefined) {
      const error = new Rv32Fault(outcome.fault);
      error.at = outcome.at;
      error.steps = outcome.steps;
      throw error;
    }
    if (outcome.trap) return {trap: true, at: outcome.at, steps: outcome.steps, counts, bytes: bytes.subarray(0, memoryBytes.length), registers: x};
    return {trap: false, result: x[10], steps: outcome.steps, counts, bytes: bytes.subarray(0, memoryBytes.length), registers: x};
  }

  // profile(program, counts): rows {name, start, bytes, steps, spLoad, …, div, entries} per function.
  function profile(program, counts) {
    const image = program.image;
    if (!(image instanceof Uint8Array)) throw new TypeError('[rv32] program.image must be a Uint8Array');
    const starts = Object.entries(program.entries).sort((p, q) => p[1] - q[1]);
    for (const [name, start] of starts)
      if (typeof start !== 'number' || !Number.isSafeInteger(start)) throw new TypeError('[rv32] entry ' + name + ' must be an integer offset');
    return bridge.profile(image, starts.map(s => s[0]), starts.map(s => s[1]), counts instanceof Uint32Array ? counts : Uint32Array.from(counts));
  }

  const classify = (word, nextWord, afterWord) => bridge.classify(word, nextWord, afterWord);

  const HELP = [
    'rv32 — the RV32 reference interpreter (picocalc-os/tools/rv32-interp.js), run natively in Go.',
    '  rv32.run(program, entry, args, memoryBytes, {stackBytes, limit, imports, handlers, counts})',
    '      → {trap: false, result, steps, counts, bytes, registers} or {trap: true, at, steps, counts, bytes, registers}',
    '      faults throw rv32.Rv32Fault with the reference\'s message, plus err.at and err.steps',
    '  rv32.profile(program, counts)   rv32.classify(word, nextWord, afterWord)   the reference\'s helpers',
    '  compiler.at(rev).native.rayBench   that revision\'s tools/typed-ray-bench.js running on rv32',
    'Same results, bytes, registers, trap flags, fault messages and per-PC counts as the reference;',
    'a long run still stops at the cell or job deadline.',
  ].join('\n');

  root.rv32 = Object.freeze({run, profile, classify, Rv32Fault, help: () => HELP});
})(globalThis, __rv32);
