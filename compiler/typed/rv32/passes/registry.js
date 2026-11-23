// The tape passes, in the one order the pipeline runs them. A policy names a subset (policy.js); compile.js
// runs it. The table is part of the core bundle (typed-rv32.js); each pass's code is in its group's bundle,
// which installs it here when it loads.
//
//   name     the pass's name in a policy, in timing rows and, for a transform, in observeTape
//   group    the bundle that holds its code (GROUPS)
//   kind     "transform" rewrites fn.code and is observed after it runs (observe: false, never; "changed", when its
//            run returns "changed"); "analysis" leaves a result in the
//            function's context; "option" has no stage of its own and changes the pass it needs
//   needs    passes that must precede it in the same list
//
// A group installs, per pass, any of:
//   setup(unit)        once per compile, before the first function; unit is the compile's context
//   start(fn, ctx)     before any stage, on the tape as the front end wrote it (timed as `startName`)
//   run(fn, ctx)       the stage
//   finish(fn, ctx)    after the function is emitted (timed as `finishName`)
// ctx is the function's context: Object.create(unit) with passes (a Set), index, Emitter and the results
// of earlier stages (libraryCopy, ranges, origin, facts). unit holds options, callables, targets, arity and
// storeless.
export const PASSES = [
    // inline is observed at the "inline" checkpoint, after the guarded-return and PIE stages (compile.js).
    {name: "inline", group: "inline", kind: "transform", observe: false},
    // fields rewrites only functions with f32 field loads, and is observed with the next transform, so the observed
    // tapes of integer programs stay what they were.
    {name: "fields", group: "inline", kind: "transform", observe: false},
    {name: "commute", group: "inline", kind: "transform"},
    {name: "conjunctions", group: "loops", kind: "transform"},
    {name: "sets", group: "loops", kind: "transform"},
    {name: "rotate", group: "inline", kind: "transform"},
    {name: "ranges", group: "loops", kind: "analysis"},
    {name: "version", group: "loops", kind: "transform", needs: ["rotate"]},
    {name: "hoist", group: "loops", kind: "option", needs: ["version"]},
    {name: "induction", group: "loops", kind: "option", needs: ["version"]},
    {name: "split", group: "loops", kind: "transform"},
    // rows and coalesce rewrite only f32 functions and is observed only when it changes a tape, so integer programs' observed
    // tapes stay what they were.
    {name: "rows", group: "loops", kind: "transform", observe: "changed"},
    {name: "coalesce", group: "loops", kind: "transform", observe: "changed"},
    {name: "facts", group: "loops", kind: "analysis", needs: ["ranges"]},
];
PASSES.forEach((pass, order) => pass.order = order);

// The bundle file of each group, next to typed-rv32.js.
export const GROUPS = Object.freeze({inline: "typed-rv32-inline.js", loops: "typed-rv32-loops.js"});

// A transform's result is the rewritten tape, or null when it changed nothing.
export const replaceTape = (fn, code) => { if (code) fn.code = code; };

export function passByName(name) {
    const pass = PASSES.find(pass => pass.name === name);
    if (!pass) throw new TypeError("unknown RV32 pass " + name);
    return pass;
}

const installed = new Set();
export function installPasses(group, stages) {
    for (const [name, stage] of Object.entries(stages)) {
        const pass = passByName(name);
        if (pass.group !== group) throw new Error("the RV32 pass " + name + " belongs to the group " + pass.group);
        Object.assign(pass, stage);
    }
    installed.add(group);
}

// Make sure the groups of these passes are loaded. A host that loads compiler files on demand (the P4's
// typed_p4.c, which keeps every file's bytecode) defines globalThis.typedRv32Load(file), which evaluates
// the file in this realm; a host without it loads every group file after typed-rv32.js.
export function loadPasses(names) {
    for (const name of names) {
        const {group} = passByName(name);
        if (installed.has(group)) continue;
        globalThis.typedRv32Load?.(GROUPS[group]);
        if (!installed.has(group))
            throw new Error("the RV32 pass " + name + " needs " + GROUPS[group] + "; load it after typed-rv32.js");
    }
}
