// Compile time and image size in goja for named arms, as one workbench job. Replaces
// scripts/13-compile-cost-arms.py (one REPL cell per compile, to stay under the cell deadline).
//   (echo 'globalThis.args = {modes: "ttmp/.../various/52-board-modes-version.json", pick: {base: 0, split: 1}};'
//    cat compile-cost.js) | trace-repl eval --addr ... --session "$sid" --job --job-timeout 600
// Arms come from a board modes file (args.modes, a JSON list read with repo.read; args.pick names
// the indices) or directly from args.arms {name: options}. args.rev (default "worktree") is the
// compiler revision for every arm. Each input gets one untimed warm-up of every arm, then rounds
// interleaved rounds; the first arm is the control of the paired comparisons, paired by round.
// goja is a bytecode interpreter like QuickJS on the P4: a proxy for cold compile, not a
// measurement of it, and sensitive to other load on the host.
// Parameters arrive in globalThis.args, which each invocation replaces whole: session globals
// persist between cells, so a parameter left by an earlier script must not leak into this one.
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
  // c.world(name) assembles worlds with a source.list (Chess, Editor); Files and Agenda are
  // read the way 01-open-compiler-session.py assembles them.
  const text = path => {
    const file = c.read(path);
    return typeof file === "string" ? file : file.text;
  };
  const source = name => name === "files" ? text("picocalc-os/worlds/files/files.typed")
    : name === "agenda" ? text("picocalc-os/worlds/agenda/reminder.typed") + "\n" + text("picocalc-os/worlds/agenda/entry.typed")
    : c.world(name).text;
  const inputs = (args.inputs ?? ["ray", "chess", "editor", "files", "agenda"]).map(name =>
    name === "ray" ? [name, c.ray, []] : [name, source(name), c.typedWorld.imports]);
  const once = (src, imports, options) => {
    const t = performance.now();
    const p = c.typedRv32.compile(src, imports, 96 * 1024, options);
    return [performance.now() - t, p.image.length];
  };
  const rows = [], bytes = {};
  for (const [input, src, imports] of inputs) {
    for (const arm of names) bytes[input + "." + arm] = once(src, imports, arms[arm])[1];
    for (let round = 0; round < rounds[input]; round++)
      for (const arm of names) rows.push({input, arm, round, ms: once(src, imports, arms[arm])[0]});
  }
  const out = {revision: c.revision ?? "worktree", medians: {}, bytes, paired: {}, seconds: 0};
  for (const [input] of inputs) {
    for (const arm of names) out.medians[input + "." + arm] = +stats.median(rows.filter(r => r.input === input && r.arm === arm).map(r => r.ms)).toFixed(1);
    for (const arm of names.slice(1)) {
      const p = stats.paired(rows.filter(r => r.input === input), {key: "round", value: "ms",
        control: r => r.arm === names[0], candidate: r => r.arm === arm});
      out.paired[input + "." + names[0] + "->" + arm] = {pairs: p.pairs, medianPercentSaved: +p.medianPercentSaved.toFixed(2), wins: p.wins};
    }
  }
  out.seconds = +((Date.now() - started) / 1000).toFixed(1);
  return out;
})()
