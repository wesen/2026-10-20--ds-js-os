---
Title: Examining the four compiler experiments
Ticket: PICOCALC-LAB-REVIEW
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:54:33.523070654-05:00
WhatFor: ""
WhenToUse: ""
---

# Examining the four compiler experiments

A compiler creates three observable objects. It consumes time and memory while it runs, writes a program image, and leaves behind a program with observable behavior. Write down which object each proposed result measures. The review will work from the lab’s raw receipts and host-side compilers. Only the supervisor operates the P4. No production compiler edits are part of this review.

## The examination to run

1. Freeze the review criteria here before reading the candidate receipts. Locate the supervisor’s control commit, calibration and measurement script. Make a table keyed by boot, block, app, variant and start order. Recompute medians, individual paired changes and ranges from successful runs. Flag missing rows, identities, sample exclusions and differences in instruments. A boot is an experimental unit for reproducibility. Repeated invocations inside one boot show within-boot variation. Two boots do not license a precise estimate for a population of devices.
2. Follow an Editor source string from scanner through the physical measurement boundary. Distinguish instrumentation overhead, source preparation, code execution and VM peak. Compare clean control and cursor control in the same run blocks. Use an independent generated lexical corpus for diagnostics and artifacts around ambiguous whitespace, numeric and operator boundaries. Inspect whether the independent replay reused implementation, runner, board or all three.
3. Recover the native lane’s Files-trained prediction and its timestamp relative to observing Agenda. Express prediction errors as instructions and fractions of the predicted count. Independently decode the linked Editor header or verify full template capacity with actual file offsets. A smaller raw function count, a successful link, a smaller signed-off world, and measured free runtime heap answer different questions.
4. For bounded analysis, walk one operation from the selector through proof construction to final instruction selection. Identify time or state outside a declared cap, using code inspection and an adversarial or boundary workload when available. Recompute held-out errors with the original unit and compare none, always and selected. Use a hand-computed exceptional arithmetic case or executable guest differential. Distinguish removed static guards from instruction counts and dynamic events.
5. Independently exercise the incremental compiler on actual body, signature and shared-layout edits. Require a clean build of the edited module as the artifact oracle. Seek a fourth valid edit stressing transitive assumptions, changed source offsets, state reuse, ABI history, or a no-op. Record precise reuse granularity and timing boundaries. If the prototype rejects an edit, preserve that fact separately from artifacts it rebuilds correctly.
6. Grade the Editor target using an actual same-configuration candidate and control. Define removal as control cold interval minus candidate interval. Both a saving of at least 500 ms and no observed growth in compiler peak are necessary. Summing gains across separate trials would answer a hypothetical question. Preserve the two coordinates, paired observations, tolerances if preregistered and boot scope. Keep guest and edit-to-run columns separate.

## Deliverables and stopping rule

The ticket will contain the auditable host checks, derived tables or compact receipts, a chronological diary, and a standalone chapter for the vault. Send each actionable defect immediately to the supervisor. Finish the independent portions as evidence arrives. For an unavailable measurement give its precise missing observation. A result that fails a prediction is still a completed experiment.
