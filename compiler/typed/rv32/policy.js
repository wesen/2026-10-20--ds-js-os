// Named code-generation policies. A policy is a list of tape passes (passes/registry.js, in pipeline order) and
// the parameters of the stages that are not tape passes: guarded-return inlining, the operand-location
// planner (operandLocations) and the emitter's instruction selection (select).
//
// "default" applies every native optimization that has passed the host differential, the historical
// replays and a paired P4 trial; a caller that passes no options gets it. "stock" is the code generation of
// 2026-11-21 before those became defaults, kept as the control arm for experiments.
// PIE loop lowering stays opt-in (pieLoops): it needs typed-pie-loops.js and saved under 1% of a ray frame
// for about 70 ms of cold compile on the P4.
import {PASSES, passByName} from "./passes/registry.js";

const DEFAULT_SELECT = Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true,
    shortBranches: true});
const DEFAULT_LOCATIONS = Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true,
    capacities: true, nested: true, constants: true, share: true, pointers: true});
const DEFAULT_POLICY = Object.freeze({
    passes: Object.freeze(["inline", "fields", "commute", "rotate", "version", "split"]),
    inlineGuardedReturns: true,
    operandLocations: DEFAULT_LOCATIONS,
    select: DEFAULT_SELECT,
});
export const POLICIES = Object.freeze({
    // "interactive" is for worlds that the device compiles while a person waits (the boot worlds):
    // RAY-PARITY's Step 6 set, operand locations and instruction selection without a tape pass. On the
    // P4 it compiles Agenda in 0.98 s and Editor in 3.35 s against 2.75 s and 7.90 s for "default"
    // (PICOCALC-COMPILE-BUDGET Step 2), inside their 1.7 s and 6 s deadlines.
    interactive: Object.freeze({
        passes: Object.freeze([]),
        inlineGuardedReturns: true,
        operandLocations: Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true}),
        select: Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true}),
    }),
    // "balanced" is "default" without loop versioning and split locals (RAY-PARITY's Step 11 set), for
    // worlds with a long boot compile whose loops gain little from versioning: Chess with the 3D painter
    // compiles in 3.76 s instead of 4.66 s on the P4 (6 s deadline), and versioning saves its engine 0.45%
    // of instructions (PICOCALC-COMPILE-BUDGET Step 6).
    balanced: Object.freeze({...DEFAULT_POLICY, passes: Object.freeze(["inline", "fields", "commute", "rotate"])}),
    default: DEFAULT_POLICY,
    // "kernel" is "default" plus what only a compute kernel can afford to compile: the division facts
    // (ranges, facts) cost Chess's boot compile about a quarter more, past its budget, but take the ray
    // frame from 16.25 to 15.27 ms on the P4 (RAY-PARITY Step 15); value sets take it to 13.84 ms for 6%
    // more compile time (Step 17), hoisted loop invariants to 12.45 ms for 11% more (Step 18), fused
    // conjunctions and loads into homes to 11.43 ms for 1% more (Step 19). Induction variables with
    // pointer-only sources take it to 11.17 ms for 1.5% more (Step 20). Locals in the argument registers
    // of unhomed parameters take it to 10.99 ms at no compile cost (Step 21). The ray tracer uses it.
    kernel: Object.freeze({
        ...DEFAULT_POLICY,
        passes: Object.freeze(["inline", "fields", "commute", "conjunctions", "sets", "rotate", "ranges", "version", "hoist",
            "induction", "split", "rows", "coalesce", "facts"]),
        operandLocations: Object.freeze({...DEFAULT_LOCATIONS, pointerOnly: true, reuseArgs: true}),
        select: Object.freeze({...DEFAULT_SELECT, loadHomes: true}),
    }),
    stock: Object.freeze({passes: Object.freeze([])}),
});

// Options select a policy (default "default"); any other field given replaces the policy's field, and an
// undefined one leaves it. `enable` and `disable` add passes to and remove passes from the resulting list
// (an added pass takes its place in pipeline order), so a study can toggle one pass by name.
export function resolveOptions(options) {
    const name = options?.policy ?? "default";
    if (!Object.hasOwn(POLICIES, name)) throw new TypeError("unknown RV32 code-generation policy " + name);
    const resolved = {...POLICIES[name]};
    for (const key in options ?? {}) if (options[key] !== undefined) resolved[key] = options[key];
    let passes = resolved.passes ?? [];
    if (!Array.isArray(passes)) throw new TypeError("RV32 passes must be a list of pass names");
    if (resolved.enable || resolved.disable) {
        const chosen = new Set(passes);
        for (const pass of resolved.enable ?? []) chosen.add(pass);
        for (const pass of resolved.disable ?? []) chosen.delete(pass);
        for (const pass of chosen) passByName(pass);
        passes = PASSES.filter(pass => chosen.has(pass.name)).map(pass => pass.name);
    }
    let last = -1;
    for (const name of passes) {
        const pass = passByName(name);
        if (pass.order <= last) throw new TypeError("RV32 passes run in pipeline order: " + PASSES.map(p => p.name).join(", "));
        last = pass.order;
        for (const need of pass.needs ?? []) if (!passes.includes(need))
            throw new TypeError("RV32 pass " + name + " needs " + need);
    }
    for (const key in resolved.select || {}) if (PASSES.some(pass => pass.name === key))
        throw new TypeError("select." + key + " is the RV32 pass \"" + key + "\"; name it in passes or enable");
    if (resolved.operandLocations?.split !== undefined)
        throw new TypeError("operandLocations.split is the RV32 pass \"split\"; name it in passes or enable");
    if (resolved.inline !== undefined && (typeof resolved.inline !== "object" || resolved.inline === null))
        throw new TypeError("inline holds the inliner's limits; the RV32 pass \"inline\" is named in passes or enable");
    resolved.passes = passes;
    return resolved;
}
