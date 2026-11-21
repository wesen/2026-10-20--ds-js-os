---
Title: Experimental design and implementation guide
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:24:59.487544799-05:00
WhatFor: ""
WhenToUse: ""
---

# Experimental design and implementation guide


The ray renderer clears row storage, visits each sphere, tests each horizontal position and updates the nearest depth and ID. Its earlier specialized scalar implementation changed several costs at once. The experiment holds the Typed source, row semantics and loop domain fixed across a two-factor comparison. One factor admits checked accesses once per region, the other retains local values in registers. Compare a common-admission control, guards only, registers only, and both. Measure empty-row rejection in a separate comparison. Preserve the default compiler control to account for the common admission cost.

    ordinary backend -> common control -> guards only     -> both -> both + row skip
                                       -> registers only  -> both

Render the twelve frozen poses. Compare every visible pixel, winning object and depth, padding and failure behavior. Report guest instructions as counts, target primary and clean frame times in milliseconds, and compile costs separately. The row timing includes work outside the optimized loop. A hardware result must identify its firmware. Use compiler inspection to explain which actual operations changed, including checks retained in guard paths. A null or interaction result is a publishable result.

## Define the unit of work

The frame is 160 by 160 RGB565 pixels. In the default pose three sphere descriptors are live. For each row, the primary routine clears depth and object identity, tests the horizontal coordinates against each sphere, and retains the nearest qualifying intersection. Later code uses the winner to shade a pixel, test for a shadow and pack RGB565. A whole-frame improvement can therefore be much smaller than the improvement measured inside the primary routine. The ordinary playable program remains the control. Candidate emitters and replay scripts live under this ticket's scripts directory.

A Typed buffer stores a capacity followed by 16-bit cells. Each ordinary checked access verifies its unsigned index against that capacity. Within a carefully admitted row, the capacity, count, radii and coordinate limits imply that each accessed field fits. A guard at entry checks those prerequisites before producing any output. On failure the original implementation runs from its normal entry. That preserves partial writes and traps for inadmissible inputs. A separate experiment assigns selected named locals to six registers for the duration of a call-free function. This preserves the set of horizontal coordinates visited. The third experiment proves a row misses a sphere from the vertical distance alone and skips its entire horizontal scan.

```text
if row_inputs_admissible(work, y):
    for each sphere:
        row_term = radius_squared - vertical_distance_squared
        if skip_enabled and row_term < 0: continue
        for x in the original horizontal domain:
            evaluate the ordinary discriminant, depth and nearest identity
            use the chosen register homes and address checks
else:
    execute the original body
```

## Separate three effects

1. Compare ordinary code with checked-stack to measure the cost of entering the experiment. Use checked-stack as the reference for the two-factor table.
2. Compare the guard effect at both register settings, then the register effect at both guard settings. Check whether the combined saving equals their sum. Perform the calculation separately for guest instructions and hardware time.
3. Compare the empty-row variant with the combined fixed-domain variant. Verify horizontal table-read counts directly. Compare with the previously hand-matched row only after separating these effects.

## Reproduce and interpret

Start with the sibling guide `02-reproduce-the-scalar-factorial.md` for the precise generator and host commands. The companion physical protocol `03-protocol-for-the-paired-physical-scalar-trial.md` describes the command selectors, pairing, and timing boundaries. Read `various/compiler/rows.json` for function-local counts and `inspection.json` for the corresponding final fast/fallback images. Both are derived from emitted machine code. The fallback can add hundreds of bytes even when the workload executes none of its instructions.

The host gate compares payload, depth, ID and padding with the C oracle over twelve poses and both rendering entry points. Negative tests exercise admission and failure behavior. Separately, the P4 runs candidate and reference implementations with the same inputs; it checks outputs before accepting timings. Use per-pose paired differences, state the denominator for percentages and distinguish clean timings from instrumented audit calls. The C scalar and C+PIE variants measure a further implementation gap. An instruction count alone cannot assign that gap to pipeline stalls or bus traffic.

The transfer test uses a different function, `typedRayInShadow`. Identify its visited descriptor fields and prove their highest index from the capacity and sphere count. Preregister how many executed comparisons, capacity loads and entry operations that transformation should change. Build the candidate from the frozen source and compare the prediction with observed guest instructions, then with physical wall time. A successful prediction in this function warrants investigating reusable bounded-region lowering. The row and shadow candidates currently select reviewed kernels and retain their fallback. Widening the compiler pass requires an independent way to recognize and validate other source programs.
