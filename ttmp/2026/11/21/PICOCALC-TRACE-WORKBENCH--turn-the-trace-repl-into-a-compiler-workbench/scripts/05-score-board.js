// Replaces PICOCALC-RAY-PARITY scripts/08-score-board.{js,py}: one ordinary cell. The rows
// are read with repo.read instead of being shipped into the session, the paired comparison
// is stats.paired instead of a hand-written median and block matcher, and the cell checks
// its result against RAY-PARITY's recorded various/14-board-scores.json.
//
//   trace-repl eval --addr ADDR --session "$sid" < 05-score-board.js
//
// The service's --repo must be a checkout that contains RAY-PARITY's various/13-board/.
// Mode m (07-board-modes.json): 0 previous default + pie-empty, 1 candidate + pie-empty,
// 2 previous default, 3 candidate. Predicate arms are 3+m, frame arms 1+m, cold arms m.
(() => {
  const parity = repo.list('ttmp/2026/11/21').find(e => e.name.startsWith('PICOCALC-RAY-PARITY--'));
  const dir = 'ttmp/2026/11/21/' + parity.name + '/various/';
  const rowsFile = repo.read(dir + '13-board/rows.json');
  const rows = rowsFile.json();
  const offset = kind => kind === 'pred' ? 3 : kind === 'frame' ? 1 : 0;
  const arm = (kind, fixture, phase, mode) => r => r.kind === kind && r.fixture === fixture && r.phase === phase && r.arm === mode + offset(kind);
  // Paired by load block: the median of per-block percentage savings, and the blocks the candidate wins.
  const compare = (kind, fixture, phase, control, candidate) => {
    const p = stats.paired(rows, { key: 'block', value: 'value',
      control: arm(kind, fixture, phase, control), candidate: arm(kind, fixture, phase, candidate) });
    if (p.pairs !== 6) throw new Error('expected 6 blocks for ' + [kind, fixture, phase, control, candidate] + ', found ' + p.pairs);
    return { control: p.controlMedian, candidate: p.candidateMedian, savedPct: +p.medianPercentSaved.toFixed(2), wins: p.wins };
  };
  const armMedian = (kind, phase, a) => stats.median(rows.filter(r => r.kind === kind && r.fixture === 'default' && r.phase === phase && r.arm === a).map(r => r.value));
  const fixtures = [...new Set(rows.filter(r => r.kind === 'frame').map(r => r.fixture))];
  const scores = {
    frame: { pie: compare('frame', 'default', 0, 0, 1), scalar: compare('frame', 'default', 0, 2, 3) },
    primary: { pie: compare('frame', 'default', 1, 0, 1), scalar: compare('frame', 'default', 1, 2, 3) },
    predicate: { pie: compare('pred', 'default', -1, 0, 1), scalar: compare('pred', 'default', -1, 2, 3) },
    compileRay: compare('compileUs', '0', 0, 2, 3),
    compileChess: compare('compileUs', '1', 0, 2, 3),
    peakRay: compare('peakBytes', '0', 0, 2, 3),
    scenes: fixtures.map(f => Object.assign({ fixture: f }, compare('frame', f, 0, 0, 1))),
    cFrameUs: armMedian('frame', 0, 0),
    candidatePieFrameUs: stats.median(rows.filter(arm('frame', 'default', 0, 1)).map(r => r.value)),
    previousPieFrameUs: stats.median(rows.filter(arm('frame', 'default', 0, 0)).map(r => r.value)),
    checkedCPredicateCycles: armMedian('pred', -1, 2),
  };
  // Compare with the recorded scores value by value and report every path that differs.
  const recordedFile = repo.read(dir + '14-board-scores.json');
  const recorded = recordedFile.json().scores;
  const differences = [];
  const walk = (a, b, path) => {
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) walk(a[k], b[k], path + '.' + k);
    } else if (a !== b) differences.push({ path, measured: a, recorded: b });
  };
  walk(scores, recorded, 'scores');
  return {
    rows: { path: rowsFile.path, sha256: rowsFile.sha256, count: rows.length },
    recorded: { path: recordedFile.path, sha256: recordedFile.sha256 },
    identicalToRecorded: differences.length === 0 && JSON.stringify(scores) === JSON.stringify(recorded),
    differences,
    scores,
  };
})()
