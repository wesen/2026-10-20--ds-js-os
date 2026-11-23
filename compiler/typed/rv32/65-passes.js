// The tape passes, in the one order the pipeline runs them. A policy names a subset (60-policies.js).
//
//   name     the pass's name in a policy, in timing rows and, for a transform, in observeTape
//   kind     "transform" rewrites fn.code and is observed after it runs; "analysis" leaves a result in the
//            function's context; "option" has no stage of its own and changes the pass it needs
//   needs    passes that must precede it in the same list
//   start    (fn, ctx) before any stage, on the tape as the front end wrote it
//   run      (fn, ctx) the stage
//
// ctx (see lower() in 70-compile.js): passes (a Set of names), arity(index), storeless(index), index (this
// function's), inlining and inlineLibrary, and the results ranges, origin and facts.
const replaceTape = (fn, code) => { if (code) fn.code = code; };
const PASSES = [
    // inlineCalls: the function's own code inlines the candidate calls in its loops; the library copy, kept
    // for later callers, inlines every candidate call. Expansion only grows a tape, so a function already
    // over the callee limit is never a library candidate and needs no fully expanded copy. Observed as the
    // "inline" checkpoint after the guarded-return and PIE stages (70-compile.js).
    {name: "inline", kind: "transform", observe: false, run(fn, ctx) {
        const {inlining, inlineLibrary, arity} = ctx;
        const all = fn.code.length <= inlining.calleeCells ? inlineCalls(fn, inlineLibrary, inlining, arity, true) : null;
        ctx.libraryCopy = all ?? {code: fn.code, nlocals: fn.nlocals};
        const loops = inlineCalls(fn, inlineLibrary, inlining, arity, false);
        if (loops) {
            fn.code = loops.code;
            fn.nlocals = loops.nlocals;
        }
    }},
    {name: "commute", kind: "transform", run: (fn, ctx) => replaceTape(fn, commuteConstants(fn.code, ctx.arity))},
    {name: "conjunctions", kind: "transform", run: fn => replaceTape(fn, fuseConjunctions(fn.code))},
    {name: "sets", kind: "transform", run: (fn, ctx) => replaceTape(fn, foldValueSets(fn.code, ctx.arity))},
    {name: "rotate", kind: "transform", run: fn => replaceTape(fn, rotateLoops(fn.code))},
    {name: "ranges", kind: "analysis", run(fn, ctx) { ctx.ranges = localRanges(fn.code, fn.params.length, ctx.arity); }},
    {name: "version", kind: "transform", needs: ["rotate"], run(fn, ctx) {
        const hoist = ctx.passes.has("hoist") ?
            {storeless: ctx.storeless, arity: ctx.arity, fresh: () => fn.params.length + fn.nlocals++} : undefined;
        replaceTape(fn, versionLoops(fn.code, fn.params.length, hoist, ctx.passes.has("induction")));
    }},
    // A function's storeless answer is computed from its tape before any pass rewrites it.
    {name: "hoist", kind: "option", needs: ["version"], start: (fn, ctx) => ctx.storeless(ctx.index)},
    {name: "induction", kind: "option", needs: ["version"]},
    {name: "split", kind: "transform", run(fn, ctx) {
        const before = fn.params.length + fn.nlocals;
        const split = splitLocals(fn.code, fn.params.length, fn.nlocals);
        if (split) {
            fn.code = split.code;
            fn.nlocals = split.nlocals;
            ctx.origin = local => local >= before ? split.origin[local - before] : local;
        }
    }},
    {name: "facts", kind: "analysis", needs: ["ranges"], run(fn, ctx) {
        if (ctx.ranges) ctx.facts = divisionFacts(fn.code, fn.params.length, ctx.arity, ctx.ranges, ctx.origin) ?? undefined;
    }},
];
PASSES.forEach((pass, order) => pass.order = order);
function passByName(name) {
    const pass = PASSES.find(pass => pass.name === name);
    if (!pass) throw new TypeError("unknown RV32 pass " + name);
    return pass;
}
