// Evaluated in a trace-REPL session after 08-score-board.py binds `rowsText` (13-board/rows.json).
// Mode m (07-board-modes.json): 0 previous default + pie-empty, 1 candidate + pie-empty,
// 2 previous default, 3 candidate. Predicate arms are 3+m, frame arms 1+m, cold arms m.
globalThis.rows = JSON.parse(rowsText);
globalThis.median = xs => { const s = xs.slice().sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
globalThis.offset = kind => kind === "pred" ? 3 : kind === "frame" ? 1 : 0;
globalThis.blocks = (kind, fixture, phase, mode) => {
    const s = rows.filter(r => r.kind === kind && r.fixture === fixture && r.phase === phase && r.arm === mode + offset(kind));
    if (s.length !== 6 || new Set(s.map(r => r.block)).size !== 6) throw Error("unmatched blocks " + [kind, fixture, phase, mode]);
    return s.sort((a, b) => a.block - b.block).map(r => r.value);
};
// Paired by block: the median of per-block percentage savings, and the number of blocks the candidate wins.
globalThis.compare = (kind, fixture, phase, control, candidate) => {
    const a = blocks(kind, fixture, phase, control), b = blocks(kind, fixture, phase, candidate);
    return {control: median(a), candidate: median(b), savedPct: +median(a.map((x, i) => 100 * (1 - b[i] / x))).toFixed(2),
            wins: a.filter((x, i) => x > b[i]).length};
};
const cRef = (kind, phase, arm) => median(rows.filter(r => r.kind === kind && r.fixture === "default" && r.phase === phase && r.arm === arm).map(r => r.value));
const fixtures = [...new Set(rows.filter(r => r.kind === "frame").map(r => r.fixture))];
({
    frame: {pie: compare("frame", "default", 0, 0, 1), scalar: compare("frame", "default", 0, 2, 3)},
    primary: {pie: compare("frame", "default", 1, 0, 1), scalar: compare("frame", "default", 1, 2, 3)},
    predicate: {pie: compare("pred", "default", -1, 0, 1), scalar: compare("pred", "default", -1, 2, 3)},
    compileRay: compare("compileUs", "0", 0, 2, 3),
    compileChess: compare("compileUs", "1", 0, 2, 3),
    peakRay: compare("peakBytes", "0", 0, 2, 3),
    scenes: fixtures.map(f => ({fixture: f, ...compare("frame", f, 0, 0, 1)})),
    cFrameUs: cRef("frame", 0, 0),
    candidatePieFrameUs: median(blocks("frame", "default", 0, 1)),
    previousPieFrameUs: median(blocks("frame", "default", 0, 0)),
    checkedCPredicateCycles: cRef("pred", -1, 2),
})
