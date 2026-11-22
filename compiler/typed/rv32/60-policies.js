// Named code-generation policies. "default" applies every native optimization that has
// passed the host differential, the historical replays and a paired P4 trial; a caller
// that passes no options gets it. "stock" is the code generation of 2026-11-21 before
// those became defaults, kept as the control arm for experiments. Fields given in the
// options object override the selected policy; false or null switches one off.
// PIE loop lowering stays opt-in: it needs typed-pie-loops.js and saved under 1% of a
// ray frame for about 70 ms of cold compile on the P4.
// "interactive" is for worlds that the device compiles while a person waits (the boot worlds):
// RAY-PARITY's Step 6 set, operand locations and instruction selection without inlining or
// loop transforms. On the P4 it compiles Agenda in 0.98 s and Editor in 3.35 s against 2.75 s
// and 7.90 s for "default" (PICOCALC-COMPILE-BUDGET Step 2), inside their 1.7 s and 6 s deadlines.
const DEFAULT_POLICY = Object.freeze({
    inlineGuardedReturns: true,
    operandLocations: Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true,
        capacities: true, nested: true, constants: true, share: true, pointers: true, split: true}),
    select: Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true,
        commute: true, rotate: true, shortBranches: true, version: true}),
    inline: true,
});
const POLICIES = Object.freeze({
    interactive: Object.freeze({
        inlineGuardedReturns: true,
        operandLocations: Object.freeze({forward: true, capacity: true, homes: true, saved: true, direct: true}),
        select: Object.freeze({immediates: true, divisions: true, branches: true, results: true, leafParams: true}),
        inline: false,
    }),
    // "balanced" is "default" without loop versioning and split locals (RAY-PARITY's Step 11 set),
    // for worlds with a long boot compile whose loops gain little from versioning: Chess with the
    // 3D painter compiles in 3.76 s instead of 4.66 s on the P4 (6 s deadline), and versioning saves
    // its engine 0.45% of instructions (PICOCALC-COMPILE-BUDGET Step 6).
    balanced: Object.freeze({
        ...DEFAULT_POLICY,
        operandLocations: Object.freeze({...DEFAULT_POLICY.operandLocations, split: false}),
        select: Object.freeze({...DEFAULT_POLICY.select, version: false}),
    }),
    default: DEFAULT_POLICY,
    // "kernel" is "default" plus what only a compute kernel can afford to compile: the division
    // facts cost Chess's boot compile about a quarter more, past its budget, but take the ray
    // frame from 16.25 to 15.27 ms on the P4 (RAY-PARITY Step 15); value sets take it to 13.84 ms
    // for 6% more compile time (Step 17), hoisted loop invariants to 12.45 ms for 11% more
    // (Step 18), fused conjunctions and loads into homes to 11.43 ms for 1% more (Step 19).
    // Induction variables with pointer-only sources take it to 11.17 ms for 1.5% more (Step 20).
    // Locals in the argument registers of unhomed parameters take it to 10.99 ms at no compile
    // cost (Step 21). The ray tracer uses it.
    kernel: Object.freeze({
        ...DEFAULT_POLICY,
        operandLocations: Object.freeze({...DEFAULT_POLICY.operandLocations, pointerOnly: true, reuseArgs: true}),
        select: Object.freeze({...DEFAULT_POLICY.select, facts: true, sets: true, hoist: true,
            conjunctions: true, loadHomes: true, induction: true}),
    }),
    stock: Object.freeze({}),
});

function resolveOptions(options) {
    const name = options?.policy ?? "default";
    if (!Object.hasOwn(POLICIES, name)) throw new TypeError("unknown RV32 code-generation policy " + name);
    const resolved = {...POLICIES[name]};
    for (const key in options ?? {}) if (options[key] !== undefined) resolved[key] = options[key];
    return resolved;
}

