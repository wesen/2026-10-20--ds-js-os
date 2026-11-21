(() => {
    const median = a => {
        const sorted = a.slice().sort((x, y) => x - y);
        return (sorted[2] + sorted[3]) / 2;
    };
    const rows = lab.frames;
    const fixtures = Array.from(new Set(rows.map(r => r.fixture)));
    if (rows.length !== 432 || fixtures.length !== 12) throw Error("incomplete trial");
    const results = [];
    for (const fixture of fixtures) {
        for (const phase of [0, 1]) {
            const deltas = [], percentages = [], incremental = [];
            for (let block = 0; block < 6; block++) {
                const trial = rows.filter(r => r.fixture === fixture && r.phase === phase && r.block === block)
                    .sort((a, b) => a.arm - b.arm);
                if (trial.map(r => r.arm).join() !== "0,1,2") throw Error("ambiguous trial");
                const [base, empty, full] = trial.map(r => r.us);
                deltas.push(base - empty);
                percentages.push(100 * (base - empty) / base);
                incremental.push(full - empty);
            }
            results.push({fixture, phase, medianUs:median(deltas), medianPct:median(percentages),
                wins:deltas.filter(d => d > 0).length,
                emptyBeatsFull:incremental.filter(d => d > 0).length,
                pairedUs:deltas});
        }
    }
    return {source:lab.sources.frames, rows:rows.length, results};
})()
