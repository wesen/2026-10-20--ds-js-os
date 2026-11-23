// The "inline" group (typed-rv32-inline.js): inline, commute and rotate, the passes "balanced" adds to the
// core. Loading this module installs them in the registry.
import {INLINE_DEFAULTS, inlineCalls, inlineCandidate, loopDepth} from "./inline.js";
import {commuteConstants} from "./commute.js";
import {rotateLoops} from "./rotate.js";
import {installPasses, replaceTape} from "./registry.js";

installPasses("inline", {
    inline: {
        setup(unit) {
            unit.inlining = {...INLINE_DEFAULTS, ...unit.options.inline};
            unit.inlineLibrary = new Map();
        },
        // inlineCalls: the function's own code inlines the candidate calls in its loops; the library copy, kept
        // for later callers, inlines every candidate call. Expansion only grows a tape, so a function already
        // over the callee limit is never a library candidate and needs no fully expanded copy.
        run(fn, ctx) {
            const {inlining, inlineLibrary, arity} = ctx;
            const all = fn.code.length <= inlining.calleeCells ? inlineCalls(fn, inlineLibrary, inlining, arity, true) : null;
            ctx.libraryCopy = all ?? {code: fn.code, nlocals: fn.nlocals};
            const loops = inlineCalls(fn, inlineLibrary, inlining, arity, false);
            if (loops) {
                fn.code = loops.code;
                fn.nlocals = loops.nlocals;
            }
        },
        // After emission (a guarded-return summary, which the emitter's stages may set, excludes a candidate):
        // the library copy of an inlinable function joins the library.
        finishName: "candidate",
        finish(fn, ctx) {
            const {inlining, inlineLibrary, libraryCopy, index} = ctx;
            const candidate = inlineCandidate(fn, libraryCopy.code, inlining, ctx.targets[index]?.guardedReturn);
            if (candidate) inlineLibrary.set(index, {...candidate, nlocals: libraryCopy.nlocals, code: libraryCopy.code.slice(),
                loops: loopDepth(libraryCopy.code)});
            inlining.report?.push({name: fn.name, cells: fn.code.length, locals: fn.params.length + fn.nlocals,
                libraryCells: candidate ? libraryCopy.code.length : undefined});
        },
    },
    commute: {run: (fn, ctx) => replaceTape(fn, commuteConstants(fn.code, ctx.arity))},
    rotate: {run: fn => replaceTape(fn, rotateLoops(fn.code))},
});
// A marker for loaders that list what a realm holds (the trace-REPL workbench's module table).
globalThis.typedRv32Inline = {group: "inline"};
