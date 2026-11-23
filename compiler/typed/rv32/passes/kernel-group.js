// The "kernel" group (typed-rv32-kernel.js): the passes only "kernel" runs, conjunctions, sets, ranges and facts.
// Loading this module installs them in the registry.
import {fuseConjunctions} from "./conjunctions.js";
import {foldValueSets} from "./value-sets.js";
import {divisionFacts, localRanges} from "../analysis/ranges.js";
import {installPasses, replaceTape} from "./registry.js";

installPasses("kernel", {
    conjunctions: {run: fn => replaceTape(fn, fuseConjunctions(fn.code))},
    sets: {run: (fn, ctx) => replaceTape(fn, foldValueSets(fn.code, ctx.arity))},
    ranges: {run(fn, ctx) { ctx.ranges = localRanges(fn.code, fn.params.length, ctx.arity); }},
    // ctx.origin maps a local that split made to the local it came from (the loops group's split sets it).
    facts: {run(fn, ctx) {
        if (ctx.ranges) ctx.facts = divisionFacts(fn.code, fn.params.length, ctx.arity, ctx.ranges, ctx.origin) ?? undefined;
    }},
});
// A marker for loaders that list what a realm holds (the trace-REPL workbench's module table).
globalThis.typedRv32Kernel = {group: "kernel"};
