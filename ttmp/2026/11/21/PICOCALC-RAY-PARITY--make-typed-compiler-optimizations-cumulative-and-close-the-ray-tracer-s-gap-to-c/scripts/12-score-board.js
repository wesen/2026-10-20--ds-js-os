// Evaluated in a trace-REPL session after 12-score-board.py binds globalThis.rowsText and
// globalThis.modes (the number of compile modes). Mode 0 is the control; every other mode
// is compared with it, paired by block: the median of per-block percentage savings, and
// wins out of 6. Chess compares mode 0 with the last mode (bench.c times only those).
globalThis.rows = JSON.parse(rowsText);
globalThis.median = xs => { const s = xs.slice().sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
const offset = kind => kind === "pred" ? 3 : kind === "frame" ? 1 : 0;
const blocks = (kind, fixture, phase, arm) => {
    const s = rows.filter(r => r.kind === kind && r.fixture === fixture && r.phase === phase && r.arm === arm);
    if (s.length !== 6 || new Set(s.map(r => r.block)).size !== 6) throw Error("unmatched blocks " + [kind, fixture, phase, arm]);
    return s.sort((a, b) => a.block - b.block).map(r => r.value);
};
const compare = (a, b) => ({control: median(a), candidate: median(b),
    savedPct: +median(a.map((x, i) => 100 * (1 - b[i] / x))).toFixed(2), wins: a.filter((x, i) => x > b[i]).length});
const mode = (kind, fixture, phase, m) => blocks(kind, fixture, phase, m + offset(kind));
const fixtures = [...new Set(rows.filter(r => r.kind === "frame").map(r => r.fixture))];
const chessBlock = arm => [0, 1, 2, 3, 4, 5].map(b =>
    rows.filter(r => r.kind === "chess" && r.block === b && r.arm === arm).reduce((s, r) => s + r.value, 0) / 6);
const result = {
    cFrameUs: median(blocks("frame", "default", 0, 0)),
    checkedCPredicateCycles: median(blocks("pred", "default", -1, 2)),
    chess: compare(chessBlock(0), chessBlock(modes - 1)),
};
for (let m = 1; m < modes; m++) result["mode" + m] = {
    frame: compare(mode("frame", "default", 0, 0), mode("frame", "default", 0, m)),
    primary: compare(mode("frame", "default", 1, 0), mode("frame", "default", 1, m)),
    shade: compare(mode("frame", "default", 2, 0), mode("frame", "default", 2, m)),
    predicate: compare(mode("pred", "default", -1, 0), mode("pred", "default", -1, m)),
    compileRay: compare(mode("compileUs", "0", 0, 0), mode("compileUs", "0", 0, m)),
    compileChess: compare(mode("compileUs", "1", 0, 0), mode("compileUs", "1", 0, m)),
    peakRay: compare(mode("peakBytes", "0", 0, 0), mode("peakBytes", "0", 0, m)),
    scenesSavedPct: fixtures.map(f => compare(mode("frame", f, 0, 0), mode("frame", f, 0, m)).savedPct),
    sceneWins: fixtures.map(f => compare(mode("frame", f, 0, 0), mode("frame", f, 0, m)).wins),
};
result
