// Opening-frame profile of named compile arms, as one workbench job. Replaces
// tools/typed-ray-profile.mjs and the scratch instruction-mix scripts for RAY-PARITY.
//   (echo 'globalThis.args = {arms: {name: {options}, ...}, rev: "worktree"};'; cat frame-profile.js) |
//       trace-repl eval --addr 127.0.0.1:PORT --session "$sid" --job --job-timeout 600
// Per arm: executed instructions, image bytes, FNV-1a of the guest memory, the totals of
// typedRayBench.frameProfile, the three hottest functions, and an instruction mix computed from
// the per-PC counts. args.rev is a commit or "worktree" (compiler.at).
// Parameters arrive in globalThis.args, which each invocation replaces whole: session globals
// persist between cells, so a parameter left by an earlier script must not leak into this one.
(() => {
  const c = compiler.at(args.rev ?? "worktree");
  const mix = (program, counts) => {
    const v = new DataView(program.image.buffer, program.image.byteOffset, program.image.byteLength);
    const m = {};
    const add = (k, n) => { m[k] = (m[k] ?? 0) + n; };
    for (let i = 0; i < counts.length; i++) {
      const n = counts[i];
      if (!n) continue;
      const w = v.getUint32(4 * i, true), op = w & 0x7f, f3 = (w >>> 12) & 7, rd = (w >>> 7) & 31, rs1 = (w >>> 15) & 31;
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
  const out = {revision: c.revision ?? args.rev ?? "worktree", arms: {}};
  for (const [name, options] of Object.entries(args.arms)) {
    const started = Date.now();
    const program = c.typedRv32.compile(c.ray, [], 65536, options);
    const compiled = Date.now();
    // One interpretation per arm: frameProfile() does not return its per-PC counts, so the
    // rows and totals are rebuilt here from openingFrame() the way frameProfile() builds them.
    const frame = c.rayBench.openingFrame(program);
    const rows = c.interp.profile(program, frame.counts).filter(r => r.steps).sort((p, q) => q.steps - p.steps);
    const total = {};
    for (const key of ["spLoad", "spStore", "load", "store", "branch", "boundsTest", "capacityLoad", "call", "mul", "div"])
      total[key] = rows.reduce((sum, r) => sum + r[key], 0);
    out.arms[name] = {
      steps: frame.steps, imageBytes: program.image.length, digest: c.rayBench.fnv1a(frame.bytes), total,
      hottest: rows.slice(0, 3).map(r => ({name: r.name, steps: r.steps, boundsTest: r.boundsTest, spLoad: r.spLoad, spStore: r.spStore})),
      mix: mix(program, frame.counts),
      compileMs: compiled - started, frameMs: Date.now() - compiled,
    };
  }
  return out;
})()
