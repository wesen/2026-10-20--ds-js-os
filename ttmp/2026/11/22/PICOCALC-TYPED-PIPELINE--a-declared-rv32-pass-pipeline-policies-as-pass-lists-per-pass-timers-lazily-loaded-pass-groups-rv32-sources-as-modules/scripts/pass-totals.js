// Shared by 03-pass-timing.mjs (Node) and 04-qjs-pass-timing.c (bare QuickJS): compile SOURCE once with
// {policy: POLICY, timing} and return the per-pass totals as a JSON string. "frontend" is the whole call
// minus every timed pass: parsing, checking, the tape writer and the final layout.
// Globals: SOURCE, POLICY, WORLD (true: link against typedWorld.imports).
(function () {
    const timing = [];
    const program = typedRv32.compile(SOURCE, WORLD ? typedWorld.imports : [], 1 << 20, {policy: POLICY, timing});
    const totals = {};
    let passes = 0, compile = 0;
    for (const row of timing) {
        if (row.fn === null) { compile += row.ms; continue; }
        const total = totals[row.pass] ?? (totals[row.pass] = {ms: 0, runs: 0});
        total.ms += row.ms;
        total.runs++;
        passes += row.ms;
    }
    totals.frontend = {ms: compile - passes, runs: 1};
    totals.compile = {ms: compile, runs: 1};
    return JSON.stringify({bytes: program.image.length, totals});
})()
