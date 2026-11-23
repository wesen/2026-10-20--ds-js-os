// Score a recorded board run from the repository: paired by block, the median per-block saving.
// trace-repl eval --session "$sid" --arg board='"ttmp/2026/11/21/PICOCALC-RAY-PARITY--.../various/92-board-reuse"' < 22-board-evidence.js
(() => {
  const board = args.board ?? repo.list("ttmp/2026/11/21").map(e => e.name).filter(n => n.startsWith("PICOCALC-RAY-PARITY--"))
    .map(n => "ttmp/2026/11/21/" + n + "/various/92-board-reuse")[0];
  const rows = repo.read(board + "/rows.json").json();
  // Frame rows: arm 0 is the C renderer, arm 1 the control image (mode 0), arm 2 the candidate (mode 1); phase 0 is the whole frame.
  const frame = rows.filter(r => r.kind === "frame" && r.fixture === "default" && r.phase === 0);
  const p = stats.paired(frame, {key: "block", value: "value", control: r => r.arm === 1, candidate: r => r.arm === 2});
  return {board, cFrameUs: stats.median(frame.filter(r => r.arm === 0).map(r => r.value)),
          controlUs: p.controlMedian, candidateUs: p.candidateMedian, savedPct: +p.medianPercentSaved.toFixed(2), wins: p.wins, pairs: p.pairs};
})()
