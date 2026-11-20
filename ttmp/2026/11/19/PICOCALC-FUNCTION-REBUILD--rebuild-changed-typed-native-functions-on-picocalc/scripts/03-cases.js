/* Keep data and assertions identical in the Node oracle and on the P4. */
(() => {
"use strict";

function edit(source, before, after) {
    const first = source.indexOf(before);
    if (first < 0 || source.indexOf(before, first + before.length) >= 0)
        throw new Error("edit anchor does not occur once: " + before);
    return source.slice(0, first) + after + source.slice(first + before.length);
}

const fixture = `record Shared {
    value: i32;
    tag: i32;
}

function scoreOne(row: Shared): i32 {
    return row.value;
}
function scoreTwo(row: Shared): i32 {
    return row.tag + scoreOne(row);
}
function bridge(row: Shared): i32 {
    return scoreTwo(row);
}
function base(n: i32): i32 {
    return n + 1;
}
function stretch(n: i32): i32 {
    return n;
}
function caller(n: i32): i32 {
    return base(n);
}
function chain(n: i32): i32 {
    return caller(n);
}

function filesName(value: string, output: buffer): i32 {
    return 0;
}
function filesCompare(left: string, leftDir: bool, right: string, rightDir: bool): i32 {
    return 0;
}
function filesSelect(current: i32, count: i32, delta: i32): i32 {
    return chain(current);
}
function filesAction(key: i32, once: bool, prompt: bool, item: i32, confirmed: bool): i32 {
    return 0;
}
`;

const stretch = "function stretch(n: i32): i32 {\n    return n;\n}\n";
const body = edit(fixture, stretch, stretch.replace("return n;", "return n + 4096 + 8192;"));
const signature = edit(body, "function base(n: i32): i32 {\n    return n + 1;",
    "function base(n: i32, extra: i32): i32 {\n    return n + extra;");
const signatureFixed = edit(signature, "return base(n);", "return base(n, 7);");
const layout = edit(signatureFixed, "    value: i32;", "    pad: i32;\n    value: i32;");

const fixtureCases = [
    {id: "seed", source: fixture, mode: "fragments", reused: 0, rebuilt: 11},
    {id: "exact", source: fixture, mode: "exact"},
    {id: "relink", source: fixture, mode: "fragments", exact: false, reused: 11, rebuilt: 0},
    {id: "body", source: body, mode: "fragments", reused: 10, rebuilt: 1, reasons: {stretch: "source"}},
    {id: "signature-bad", source: signature, mode: "rejected"},
    {id: "signature", source: signatureFixed, mode: "fragments", reused: 9, rebuilt: 2,
        reasons: {base: "source", caller: "source"}},
    // The unchanged caller still requires an i32 result.
    {id: "result-bad", source: edit(signatureFixed, "function base(n: i32, extra: i32): i32 {\n    return n + extra;",
        "function base(n: i32, extra: i32): bool {\n    return n === extra;"), mode: "rejected"},
    {id: "layout", source: layout, mode: "fragments", reused: 9, rebuilt: 2,
        reasons: {scoreOne: "layout", scoreTwo: "layout"}},
    {id: "layout-bad", source: edit(layout, "value: i32;", "value: bool;"), mode: "rejected"},
    {id: "stale", source: body, mode: "fallback", stale: true},
    {id: "reseed", source: body, mode: "fragments", exact: false, reused: 0, rebuilt: 11},
    {id: "remove", source: edit(body, "function stretch(n: i32): i32 {\n    return n + 4096 + 8192;\n}\n", ""),
        mode: "fragments", reused: 10, rebuilt: 0},
    {id: "lex-bad", source: fixture + "@", mode: "rejected"},
];

function filesCases(files) {
    const allowed = "return (c >= 48 && c <= 57)";
    const changed = edit(files, allowed, "return c === 95 || (c >= 48 && c <= 57)");
    return [
        {id: "seed", source: files, mode: "fragments", reused: 0, rebuilt: 7},
        {id: "exact", source: files, mode: "exact"},
        {id: "relink", source: files, mode: "fragments", exact: false, reused: 7, rebuilt: 0},
        {id: "body", source: changed, mode: "fragments", reused: 6, rebuilt: 1,
            reasons: {filesAlnum: "source"}},
        {id: "undo", source: files, mode: "fragments", reused: 6, rebuilt: 1,
            reasons: {filesAlnum: "source"}},
    ];
}

function check(test, result, clean) {
    const same = result.error ?
        clean.error && result.error.name === clean.error.name && result.error.message === clean.error.message :
        clean.bytes && result.bytes.length === clean.bytes.length
            && result.bytes.every((byte, i) => byte === clean.bytes[i]);
    if (!same || result.mode !== test.mode
        || (test.rebuilt !== undefined && (test.rebuilt !== result.built.length || test.reused !== result.reused.length))
        || (test.reasons && JSON.stringify(Object.fromEntries(result.built.map(x => [x.name, x.reason])))
            !== JSON.stringify(test.reasons)))
        throw new Error("mismatch in " + test.id + ": " + JSON.stringify({
            expected: test.mode, completeArtifactOrDiagnosticMatches: !!same,
            mode: result.mode, built: result.built, reused: result.reused, error: result.error, reason: result.reason,
        }));
}

function cleanBuild(clean, source, runtime) {
    try {
        return {bytes: clean(source, runtime)};
    } catch (error) {
        return {error: {name: error.name, message: error.message}};
    }
}

function series(kind, source, runtime, run, details) {
    const session = createFunctionRebuild(rebuildFiles, runtime);
    const suite = kind === "files" ? filesCases(source) : fixtureCases;
    let stale;
    for (const test of suite) {
        const before = session.revision;
        const result = run(session, test, test.stale ? stale : before, details);
        if (test.id === "seed") stale = session.revision;
        if (test.mode === "rejected" && session.revision !== before)
            throw new Error("diagnostic changed the successful revision");
    }
}

globalThis.rebuildCases = {edit, filesCases, fixtureCases, check, cleanBuild, series};
})();

/* labClock/labHeap are injected only by the P4 runner. All validation, hashing
 * and serialization occur after the independently timed candidate and control. */
globalThis.rebuildDevicePrepare = function(kind, source, runtime, marked) {
    const {filesCases, fixtureCases, cleanBuild, check} = rebuildCases;
    const tests = kind === "files" ? filesCases(source) : fixtureCases;
    const session = createFunctionRebuild(rebuildFiles, runtime);
    let stale;
    return {count: tests.length, step(i, cleanFirst) {
        const test = tests[i];
        const before = session.revision;
        const parent = test.stale ? stale : before;
        const options = {parent, exact: test.exact, clock: marked ? labClock : undefined};
        let result, clean, cleanUs, elapsed, heap;
        function control() {
            const at = labClock();
            clean = cleanBuild(compileFilesRv32, test.source, runtime);
            cleanUs = labClock() - at;
        }
        if (cleanFirst) control();
        labHeap(true);
        const at = labClock();
        result = session.build(test.source, options);
        elapsed = labClock() - at;
        heap = labHeap(false);
        if (!cleanFirst) control();
        check(test, result, clean);
        if (test.id === "seed") stale = session.revision;
        if (test.mode === "rejected" && session.revision !== before)
            throw new Error("diagnostic changed the successful revision");
        const {bytes, revision, ...observed} = result;
        return {
            report: JSON.stringify({id: test.id, elapsed, cleanUs, cleanFirst, heap, ...observed}),
            bytes,
            guest: kind === "files" && (test.id === "seed" || test.id === "body") ? test.id : "",
        };
    }};
};
