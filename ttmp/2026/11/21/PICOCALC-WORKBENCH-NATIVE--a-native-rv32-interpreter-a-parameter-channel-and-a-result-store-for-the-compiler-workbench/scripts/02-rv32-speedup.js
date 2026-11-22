// The opening frame run by the reference interpreter in goja and by rv32 in one job, compared
// array for array and timed. The I1 conformance and speedup measurement.
//   trace-repl eval --addr 127.0.0.1:3811 --session "$sid" --job --job-timeout 900 \
//       --arg rev='"2712684"' --arg arms='{"default": {}, "stock": {"policy": "stock"}}' < 02-rv32-speedup.js
// args.rev: compiler revision (default "worktree"). args.arms: {name: compile options}.
// args.repeat: native runs per arm (default 5); args.reference: false skips the goja reference.
(() => {
  const c = compiler.at(args.rev ?? "worktree");
  const arms = args.arms ?? {default: {}};
  const repeat = args.repeat ?? 5;
  const equal = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const out = {revision: c.revision, requested: c.requested, arms: {}};
  for (const [name, options] of Object.entries(arms)) {
    const program = c.typedRv32.compile(c.ray, [], 65536, options);
    const row = {imageBytes: program.image.length};
    const nativeMs = [];
    let native;
    for (let i = 0; i < repeat; i++) {
      const t = performance.now();
      native = c.native.rayBench.openingFrame(program);
      nativeMs.push(performance.now() - t);
    }
    row.steps = native.steps;
    row.digest = c.native.rayBench.fnv1a(native.bytes);
    row.nativeMs = +stats.median(nativeMs).toFixed(1);
    row.nativeRange = [+Math.min(...nativeMs).toFixed(1), +Math.max(...nativeMs).toFixed(1)];
    row.nativeMstepsPerSecond = +(native.steps / row.nativeMs / 1000).toFixed(1);
    if (args.reference !== false) {
      const t = performance.now();
      const reference = c.rayBench.openingFrame(program);
      row.referenceMs = Math.round(performance.now() - t);
      row.speedup = Math.round(row.referenceMs / row.nativeMs);
      row.same = {
        steps: reference.steps === native.steps, result: reference.result === native.result, trap: reference.trap === native.trap,
        bytes: equal(reference.bytes, native.bytes), counts: equal(reference.counts, native.counts), registers: equal(reference.registers, native.registers),
        profile: JSON.stringify(c.interp.profile(program, reference.counts)) === JSON.stringify(rv32.profile(program, native.counts)),
      };
    }
    out.arms[name] = row;
  }
  return out;
})()
