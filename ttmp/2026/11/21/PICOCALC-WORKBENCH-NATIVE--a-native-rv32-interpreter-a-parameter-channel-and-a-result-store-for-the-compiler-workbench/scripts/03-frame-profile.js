// PICOCALC-RAY-PARITY scripts/workbench/frame-profile.js on the native interpreter: the same
// output fields (steps, image bytes, FNV-1a, frameProfile totals, three hottest functions,
// instruction mix, compile and frame milliseconds), interpreted by rv32 instead of the
// reference in goja. Fast enough to be an ordinary cell for a few arms.
//   trace-repl eval --addr 127.0.0.1:3811 --session "$sid" \
//       --arg arms='{"default": {}, "noSplit": {"operandLocations": {"split": false}}}' < 03-frame-profile.js
// args.arms: {name: compile options}; args.rev: compiler revision (default "worktree");
// args.interp: "native" (default) or "reference", to reproduce the original timings.
(() => {
  const c = compiler.at(args.rev ?? "worktree");
  const bench = args.interp === "reference" ? c.rayBench : c.native.rayBench;
  const profile = args.interp === "reference" ? c.interp.profile : rv32.profile;
  const mix = (program, counts) => {
    const v = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    const m = {};
    const add = (k, n) => { m[k] = (m[k] ?? 0) + n; };
    for (let i = 0; i < counts.length; i++) {
      const n = counts[i];
      if (!n) continue;
      const w = v.getUint32(4 * i, true), op = w & 0x7f, f3 = (w >>> 12) & 7, rs1 = (w >>> 15) & 31;
      if (op === 0x13) add(f3 === 0 && rs1 === 0 ? "li" : f3 === 0 && (w >>> 20) === 0 ? "mv" : "alu-imm", n);
      else if (op === 0x33) add((w >>> 25) === 1 ? (f3 < 4 ? "mul" : "div/rem") : "alu-reg", n);
      else if (op === 0x03) add(rs1 === 2 ? "load sp" : "load", n);
      else if (op === 0x23) add(rs1 === 2 ? "store sp" : "store", n);
      else if (op === 0x63) add(f3 === 6 ? "bltu (check)" : "branch", n);
      else if (op === 0x6f) add("jal", n);
      else if (op === 0x67) add("jalr", n);
      else if (op === 0x37) add("lui", n);
      else add("other", n);
    }
    return m;
  };
  const out = {revision: c.revision ?? args.rev ?? "worktree", interp: args.interp ?? "native", arms: {}};
  for (const [name, options] of Object.entries(args.arms ?? {default: {}})) {
    const started = Date.now();
    const program = c.typedRv32.compile(c.ray, [], 65536, options);
    const compiled = Date.now();
    const frame = bench.openingFrame(program);
    const rows = profile(program, frame.counts).filter(r => r.steps).sort((p, q) => q.steps - p.steps);
    const total = {};
    for (const key of ["spLoad", "spStore", "load", "store", "branch", "boundsTest", "capacityLoad", "call", "mul", "div"])
      total[key] = rows.reduce((sum, r) => sum + r[key], 0);
    out.arms[name] = {
      steps: frame.steps, imageBytes: program.image.length, digest: bench.fnv1a(frame.bytes), total,
      hottest: rows.slice(0, 3).map(r => ({name: r.name, steps: r.steps, boundsTest: r.boundsTest, spLoad: r.spLoad, spStore: r.spStore})),
      mix: mix(program, frame.counts),
      compileMs: compiled - started, frameMs: Date.now() - compiled,
    };
  }
  return out;
})()
