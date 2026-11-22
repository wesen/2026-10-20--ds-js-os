// 12-score-board as one workbench cell (PICOCALC-TRACE-WORKBENCH W2, W5): the rows are read
// with repo.read and every comparison is stats.paired, so nothing is shipped into the session.
//   (echo 'globalThis.BOARD = "ttmp/.../various/47-board-pointers"'; cat 15-score-board-workbench.js) |
//       trace-repl eval --addr 127.0.0.1:PORT --session "$sid"
// Mode 0 is the control; every other mode is compared with it, paired by block: the median of
// per-block percentage savings, and wins out of 6. Chess compares mode 0 with the last mode.
(() => {
  const rows = repo.read(BOARD + "/rows.json").json();
  const modes = repo.read(BOARD + "/receipt.json").json().modes;
  const offset = kind => kind === "pred" ? 3 : kind === "frame" ? 1 : 0;
  const pick = (kind, fixture, phase, arm) => r => r.kind === kind && r.fixture === fixture && r.phase === phase && r.arm === arm;
  const pair = (rowsIn, control, candidate) => {
    const p = stats.paired(rowsIn, {key: "block", value: "value", control, candidate});
    if (p.pairs !== 6) throw new Error("expected 6 paired blocks, found " + p.pairs);
    return {control: p.controlMedian, candidate: p.candidateMedian, savedPct: +p.medianPercentSaved.toFixed(2), wins: p.wins};
  };
  const mode = (kind, fixture, phase, m) => pick(kind, fixture, phase, m + offset(kind));
  const compare = (kind, fixture, phase, m) => pair(rows, mode(kind, fixture, phase, 0), mode(kind, fixture, phase, m));
  const fixtures = [...new Set(rows.filter(r => r.kind === "frame").map(r => r.fixture))];
  // Chess: per block, the mean of the six position-and-depth rows of an arm.
  const chess = [];
  for (const arm of [0, modes - 1]) for (let b = 0; b < 6; b++) {
    const s = rows.filter(r => r.kind === "chess" && r.block === b && r.arm === arm);
    chess.push({arm, block: b, value: s.reduce((t, r) => t + r.value, 0) / 6});
  }
  const result = {
    cFrameUs: stats.median(rows.filter(pick("frame", "default", 0, 0)).map(r => r.value)),
    checkedCPredicateCycles: stats.median(rows.filter(pick("pred", "default", -1, 2)).map(r => r.value)),
    chess: pair(chess, r => r.arm === 0, r => r.arm === modes - 1),
  };
  for (let m = 1; m < modes; m++) {
    const scenes = fixtures.map(f => compare("frame", f, 0, m));
    result["mode" + m] = {
      frame: compare("frame", "default", 0, m), primary: compare("frame", "default", 1, m),
      shade: compare("frame", "default", 2, m), predicate: compare("pred", "default", -1, m),
      compileRay: compare("compileUs", "0", 0, m), compileChess: compare("compileUs", "1", 0, m),
      peakRay: compare("peakBytes", "0", 0, m),
      scenesSavedPct: scenes.map(s => s.savedPct), sceneWins: scenes.map(s => s.wins),
    };
  }
  return result;
})()
