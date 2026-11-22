// PICOCALC-RAY-PARITY scripts/workbench/compile-cost.js on this ticket's workbench: every world,
// Files and Agenda included, comes from compiler.at(rev).world(name) (I2b); parameters arrive in
// args (I2); the result is saved with results.save (I5) when args.save names it; and each
// paired comparison reports its per-round spread from stats.paired's blocks (I6).
//   trace-repl eval --addr 127.0.0.1:3811 --session "$sid" --job --job-timeout 900 \
//       --arg arms='{"base": {}, "noSplit": {"operandLocations": {"split": false}}}' --arg save='"compile-cost"' < 05-compile-cost.js
// args.arms {name: options} or args.modes (a board modes file) with args.pick {name: index};
// args.rev (default "worktree"); args.rounds {input: n}; args.inputs (default all five).
(() => {
  const started = Date.now();
  const c = compiler.at(args.rev ?? "worktree");
  let arms = args.arms;
  if (args.modes) {
    const modes = repo.read(args.modes).json();
    arms = Object.fromEntries(Object.entries(args.pick).map(([name, i]) => [name, modes[i]]));
  }
  const names = Object.keys(arms);
  const rounds = Object.assign({ray: 7, chess: 3, editor: 3, files: 3, agenda: 3}, args.rounds ?? {});
  const inputs = (args.inputs ?? ["ray", "chess", "editor", "files", "agenda"]).map(name =>
    name === "ray" ? [name, c.ray, [], "raytrace.typed"] : (w => [name, w.text, c.typedWorld.imports, w.layout])(c.world(name)));
  const once = (src, imports, options) => {
    const t = performance.now();
    const p = c.typedRv32.compile(src, imports, 96 * 1024, options);
    return [performance.now() - t, p.image.length];
  };
  const rows = [], bytes = {}, layouts = {};
  for (const [input, src, imports, layout] of inputs) {
    layouts[input] = layout;
    for (const arm of names) bytes[input + "." + arm] = once(src, imports, arms[arm])[1];
    for (let round = 0; round < rounds[input]; round++)
      for (const arm of names) rows.push({input, arm, round, ms: once(src, imports, arms[arm])[0]});
  }
  const out = {revision: c.revision ?? "worktree", layouts, medians: {}, bytes, paired: {}, seconds: 0};
  for (const [input] of inputs) {
    for (const arm of names) out.medians[input + "." + arm] = +stats.median(rows.filter(r => r.input === input && r.arm === arm).map(r => r.ms)).toFixed(1);
    for (const arm of names.slice(1)) {
      const p = stats.paired(rows.filter(r => r.input === input), {key: "round", value: "ms",
        control: r => r.arm === names[0], candidate: r => r.arm === arm});
      out.paired[input + "." + names[0] + "->" + arm] = {pairs: p.pairs, medianPercentSaved: +p.medianPercentSaved.toFixed(2), wins: p.wins,
        spread: [+p.spread.min.toFixed(2), +p.spread.max.toFixed(2)]};
    }
  }
  out.seconds = +((Date.now() - started) / 1000).toFixed(1);
  if (args.save) out.saved = results.save(args.save, out);
  return out;
})()
