// The "loops" group (typed-rv32-loops.js): version with hoist and induction, split, and the passes only
// "kernel" runs (conjunctions, sets, ranges, facts). Loading this module installs them in the registry.
import {fuseConjunctions} from "./conjunctions.js";
import {foldValueSets} from "./value-sets.js";
import {versionLoops} from "./version-loops.js";
import {splitLocals} from "./split-locals.js";
import {divisionFacts, localRanges} from "../analysis/ranges.js";
import {installPasses, replaceTape} from "./registry.js";

installPasses("loops", {
    conjunctions: {run: fn => replaceTape(fn, fuseConjunctions(fn.code))},
    sets: {run: (fn, ctx) => replaceTape(fn, foldValueSets(fn.code, ctx.arity))},
    ranges: {run(fn, ctx) { ctx.ranges = localRanges(fn.code, fn.params.length, ctx.arity); }},
    version: {run(fn, ctx) {
        const hoist = ctx.passes.has("hoist") ?
            {storeless: ctx.storeless, arity: ctx.arity, fresh: () => fn.params.length + fn.nlocals++} : undefined;
        replaceTape(fn, versionLoops(fn.code, fn.params.length, hoist, ctx.passes.has("induction")));
    }},
    // A function's storeless answer is computed from its tape before any pass rewrites it.
    hoist: {startName: "storeless", start: (fn, ctx) => ctx.storeless(ctx.index)},
    induction: {},
    split: {run(fn, ctx) {
        const before = fn.params.length + fn.nlocals;
        const split = splitLocals(fn.code, fn.params.length, fn.nlocals);
        if (split) {
            fn.code = split.code;
            fn.nlocals = split.nlocals;
            ctx.origin = local => local >= before ? split.origin[local - before] : local;
        }
    }},
    facts: {run(fn, ctx) {
        if (ctx.ranges) ctx.facts = divisionFacts(fn.code, fn.params.length, ctx.arity, ctx.ranges, ctx.origin) ?? undefined;
    }},
});
