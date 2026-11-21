(() => {
    const trials = lab.scores.cases;
    const misses = trials.filter(t => t.predicted !== t.best);
    return {cases:trials.length, winners:trials.length-misses.length,
        distinctPredictions:[...new Set(trials.map(t=>t.predicted))],
        misses:misses.map(t=>({n:t.n, reach:t.reach, excessPercent:t.regretPct})),
        laneLoads:["pie","empty","full"].map(k=>
            simd.executions(k+"-row", k+"-opening", "scalar-lane-load").executions)};
})()
