// Replaces PICOCALC-RAY-PARITY scripts/02-planner-equivalence.{js,py}: the same comparison as
// one background job instead of one cell per input driven from Python.
//
//   trace-repl eval --addr ADDR --session "$sid" --job --job-timeout 1800 < 03-planner-equivalence.js
//
// Compiles all 38 inputs with the backend at eaf0872 (control) and at 3213028 (candidate)
// under eleven option sets and compares image bytes, or error messages when both refuse.
// The first seven arms are RAY-PARITY's (its "stock: undefined" arm is "default" here,
// because since eaf0872 no options means the default policy). "stock" names the policy
// explicitly. "saved", "direct" and "savedDirect" are 3213028's new opt-in options, which
// eaf0872 ignores, so only they may differ. The job checks its first seven arms against
// RAY-PARITY's recorded result (various/06-phase1-equivalence-vs-eaf0872.json).
(() => {
  const started = Date.now();
  const base = compiler.at('eaf0872'), work = compiler.at('3213028');
  const text = path => work.read(path).text;
  const worlds = {
    chess: work.world('chess').text,
    editor: work.world('editor').text,
    agenda: text('picocalc-os/worlds/agenda/reminder.typed') + '\n' + text('picocalc-os/worlds/agenda/entry.typed'),
    files: text('picocalc-os/worlds/files/files.typed'),
  };
  const inputs = [['ray', work.ray, []],
    ...Object.entries(worlds).map(([k, v]) => ['world:' + k, v, work.typedWorld.imports]),
    ...work.typedSources().map(p => [p.replace(/^picocalc-os\//, ''), text(p), []])];
  const Q = { forward: true, capacity: true, homes: true };
  const arms = {
    default: undefined,
    forward: { operandLocations: { forward: true } },
    capacity: { operandLocations: { capacity: true } },
    homes: { operandLocations: { homes: true } },
    all: { operandLocations: Q },
    allGuarded: { inlineGuardedReturns: true, operandLocations: Q },
    allBuffered: { streamFunctions: false, inlineGuardedReturns: true, operandLocations: Q },
    stock: { policy: 'stock' },
    saved: { operandLocations: Object.assign({}, Q, { saved: true }) },
    direct: { operandLocations: Object.assign({}, Q, { direct: true }) },
    savedDirect: { operandLocations: Object.assign({}, Q, { saved: true, direct: true }) },
  };
  const RAY_PARITY_ARMS = ['default', 'forward', 'capacity', 'homes', 'all', 'allGuarded', 'allBuffered'];
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const compile = (c, src, imports, opts) => {
    try { return { ok: true, image: c.typedRv32.compile(src, imports, 96 * 1024, opts).image }; }
    catch (e) { return { ok: false, error: String(e.message) }; }
  };
  const byArm = Object.fromEntries(Object.keys(arms).map(a => [a, { identical: 0, errorsIdentical: 0, mismatches: 0 }]));
  const rows = inputs.map(([name, src, imports]) => {
    const row = { name, identical: 0, errorsIdentical: 0, mismatches: [] };
    for (const [arm, opts] of Object.entries(arms)) {
      const a = compile(base, src, imports, opts), b = compile(work, src, imports, opts);
      if (a.ok && b.ok && same(a.image, b.image)) { row.identical++; byArm[arm].identical++; }
      else if (!a.ok && !b.ok && a.error === b.error) { row.errorsIdentical++; byArm[arm].errorsIdentical++; }
      else {
        row.mismatches.push({ arm, base: a.ok ? a.image.length : a.error, candidate: b.ok ? b.image.length : b.error });
        byArm[arm].mismatches++;
      }
    }
    return row;
  });
  const total = arms => arms.reduce((t, a) => ({
    identical: t.identical + byArm[a].identical, errorsIdentical: t.errorsIdentical + byArm[a].errorsIdentical,
    mismatches: t.mismatches + byArm[a].mismatches }), { identical: 0, errorsIdentical: 0, mismatches: 0 });
  // RAY-PARITY's recorded run of the same seven arms, for a direct comparison.
  const parity = repo.list('ttmp/2026/11/21').find(e => e.name.startsWith('PICOCALC-RAY-PARITY--'));
  const recordedFile = repo.read('ttmp/2026/11/21/' + parity.name + '/various/06-phase1-equivalence-vs-eaf0872.json');
  const recorded = recordedFile.json().summary;
  const original = total(RAY_PARITY_ARMS);
  return {
    base: base.revision, candidate: work.revision,
    rv32: { base: base.files.find(f => f.path.endsWith('typed-rv32.js')).sha256, candidate: work.files.find(f => f.path.endsWith('typed-rv32.js')).sha256 },
    inputs: inputs.length,
    inputBytes: inputs.reduce((n, [, src]) => n + src.length, 0),
    compiles: 2 * inputs.length * Object.keys(arms).length,
    seconds: (Date.now() - started) / 1000,
    compiledInputs: rows.filter(r => r.identical || r.mismatches.some(m => typeof m.base === 'number')).map(r => r.name),
    byArm,
    rayParityArms: { arms: RAY_PARITY_ARMS, measured: original,
      recorded: { identical: recorded.identical, errorsIdentical: recorded.errorsIdentical, mismatches: recorded.mismatches.length },
      recordedFrom: { path: recordedFile.path, sha256: recordedFile.sha256 },
      agrees: original.identical === recorded.identical && original.errorsIdentical === recorded.errorsIdentical && original.mismatches === recorded.mismatches.length },
    stockAndDefaultIdentical: byArm.stock.mismatches === 0 && byArm.default.mismatches === 0,
    newOptInArms: total(['saved', 'direct', 'savedDirect']),
    mismatches: rows.flatMap(r => r.mismatches.map(m => Object.assign({ name: r.name }, m))),
    rows: rows.map(r => ({ name: r.name, identical: r.identical, errorsIdentical: r.errorsIdentical, mismatches: r.mismatches.length })),
  };
})()
