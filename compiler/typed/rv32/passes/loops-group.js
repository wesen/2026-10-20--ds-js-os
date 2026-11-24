// The "loops" group (typed-rv32-loops.js): what "default" adds to "balanced", version with its options hoist and
// induction, and split. Loading this module installs them in the registry.
import {versionLoops} from "./version-loops.js";
import {splitLocals} from "./split-locals.js";
import {installPasses, replaceTape} from "./registry.js";

installPasses("loops", {
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
            // A web of an f32 local is an f32 local.
            if (fn.localTypes) {
                const types = fn.localTypes.slice(); // a library copy of the inline pass may share the array
                for (let i = 0; i < split.origin.length; i++)
                    types[before - fn.params.length + i] = types[split.origin[i] - fn.params.length] ?? "i32";
                fn.localTypes = types;
            }
            ctx.origin = local => local >= before ? split.origin[local - before] : local;
        }
    }},
});
// A marker for loaders that list what a realm holds (the trace-REPL workbench's module table).
globalThis.typedRv32Loops = {group: "loops"};
