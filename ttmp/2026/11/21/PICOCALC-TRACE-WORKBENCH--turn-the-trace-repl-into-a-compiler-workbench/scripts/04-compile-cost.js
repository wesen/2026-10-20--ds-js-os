// Replaces PICOCALC-RAY-PARITY scripts/03-compile-cost.py: compile time in the REPL's goja
// interpreter as one background job, summarized with the shared `stats` global.
//
//   trace-repl eval --addr ADDR --session "$sid" --job --job-timeout 1800 < 04-compile-cost.js
//
// goja is a bytecode interpreter, like QuickJS on the P4, so it exposes allocation-heavy
// compiler passes that V8 hides. It is a proxy for the P4's cold compile, not a measurement
// of it. Arms follow RAY-PARITY various/09-compile-cost-candidate-goja.json: stock and the
// candidate (saved + direct homes) on the 3213028 backend, and the previous default on the
// eaf0872 backend. Each input gets one untimed warm-up round, then n interleaved rounds
// (ray 9, Chess 5, Editor 3, as before). Times are milliseconds from performance.now().
(() => {
  const started = Date.now();
  const base = compiler.at('eaf0872'), work = compiler.at('3213028');
  const Q = { forward: true, capacity: true, homes: true };
  const arms = [
    ['stock', work, { policy: 'stock' }],
    ['previous', base, undefined],
    ['candidate', work, { inlineGuardedReturns: true, operandLocations: Object.assign({}, Q, { saved: true, direct: true }) }],
  ];
  const inputs = [
    ['ray', work.ray, [], 9],
    ['chess', work.world('chess').text, work.typedWorld.imports, 5],
    ['editor', work.world('editor').text, work.typedWorld.imports, 3],
  ];
  const once = (c, src, imports, opts) => {
    const t = performance.now();
    c.typedRv32.compile(src, imports, 96 * 1024, opts);
    return performance.now() - t;
  };
  const rows = [];
  for (const [input, src, imports, n] of inputs) {
    for (const [, c, opts] of arms) once(c, src, imports, opts);
    for (let round = 0; round < n; round++)
      for (const [arm, c, opts] of arms) rows.push({ input, arm, round, ms: once(c, src, imports, opts) });
  }
  const round1 = x => +x.toFixed(1);
  const out = { base: base.revision, candidate: work.revision, seconds: 0, medians: {}, summaries: {}, paired: {} };
  for (const [input] of inputs) {
    for (const [arm] of arms) {
      const s = stats.summary(rows.filter(r => r.input === input && r.arm === arm).map(r => r.ms));
      out.medians[input + '.' + arm] = round1(s.median);
      out.summaries[input + '.' + arm] = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'n' ? v : round1(v)]));
    }
    // Paired by round: each round compiles every arm once, back to back.
    for (const [control, candidate] of [['stock', 'previous'], ['previous', 'candidate']]) {
      const p = stats.paired(rows.filter(r => r.input === input), {
        key: 'round', value: 'ms', control: r => r.arm === control, candidate: r => r.arm === candidate });
      out.paired[input + '.' + control + '->' + candidate] = {
        pairs: p.pairs, medianPercentSaved: +p.medianPercentSaved.toFixed(2), wins: p.wins, losses: p.losses };
    }
  }
  // RAY-PARITY's medians from the same arms, for comparison (timings, so not expected to be equal).
  const parity = repo.list('ttmp/2026/11/21').find(e => e.name.startsWith('PICOCALC-RAY-PARITY--'));
  const recorded = repo.read('ttmp/2026/11/21/' + parity.name + '/various/09-compile-cost-candidate-goja.json');
  out.rayParityMedians = { sha256: recorded.sha256, values: recorded.json() };
  out.seconds = (Date.now() - started) / 1000;
  out.method = 'median of n interleaved compiles after one warm-up round; paired: median of per-round percentage saved (stats.paired)';
  return out;
})()
