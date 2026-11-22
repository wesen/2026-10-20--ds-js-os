// Does the way the compiler is loaded change its compile time in goja? Run as a job in a
// fresh session (it defines the compiler's globals the old way, so do not reuse the session):
//
//   trace-repl eval --addr ADDR --session "$sid" --job --job-timeout 900 < 07-loading-method-cost.js
//
// "eval" loads the five compiler files at 3213028 the way RAY-PARITY's repl_client.py did:
// (0, eval)(text), which defines real globals. "workbench" is compiler.at('3213028'), the
// same files evaluated from a precompiled program inside the isolating wrapper. Both compile
// the same ray and Chess sources with the same options, interleaved, after a warm-up round.
(() => {
  const REV = '3213028';
  const work = compiler.at(REV);
  for (const path of ['typed-wasm', 'typed-async', 'typed-world', 'typed-rv32', 'typed-pie-loops'])
    (0, eval)(repo.show(REV, 'picocalc-os/compiler/' + path + '.js').text);
  const viaEval = globalThis.typedRv32;
  if (!viaEval || viaEval === work.typedRv32) throw new Error('eval loading did not define a separate typedRv32');
  const once = (rv32, src, imports) => { const t = performance.now(); rv32.compile(src, imports, 96 * 1024); return performance.now() - t; };
  const inputs = [['ray', work.ray, [], 9], ['chess', work.world('chess').text, work.typedWorld.imports, 5]];
  const rows = [];
  for (const [input, src, imports, n] of inputs) {
    once(viaEval, src, imports); once(work.typedRv32, src, imports);
    for (let round = 0; round < n; round++) {
      rows.push({ input, round, arm: 'eval', ms: once(viaEval, src, imports) });
      rows.push({ input, round, arm: 'workbench', ms: once(work.typedRv32, src, imports) });
    }
  }
  const same = inputs.every(([, src, imports]) => {
    const a = viaEval.compile(src, imports, 96 * 1024).image, b = work.typedRv32.compile(src, imports, 96 * 1024).image;
    return a.length === b.length && a.every((v, i) => v === b[i]);
  });
  const out = { revision: work.revision, sameImages: same };
  for (const [input] of inputs) {
    const p = stats.paired(rows.filter(r => r.input === input), { key: 'round', value: 'ms', control: r => r.arm === 'eval', candidate: r => r.arm === 'workbench' });
    out[input] = { evalMedianMs: +p.controlMedian.toFixed(1), workbenchMedianMs: +p.candidateMedian.toFixed(1),
      medianPercentSaved: +p.medianPercentSaved.toFixed(2), wins: p.wins, pairs: p.pairs };
  }
  return out;
})()
