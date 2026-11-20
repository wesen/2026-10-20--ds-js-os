---
Title: A fixed-budget proof for guarded Editor text reads
Ticket: PICOCALC-BOUNDED-INDEX
Status: active
Topics:
    - picocalc
    - compiler
    - research
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Pre-implementation experiment for local versioned relations and an eight-edge, two-hop query."
LastUpdated: 2026-11-19T22:00:59.088533745-05:00
WhatFor: ""
WhenToUse: ""
---
# A fixed-budget proof for guarded Editor text reads

Editor stores UTF-16 code units behind a 32-bit length or capacity header. A read verifies the index with an unsigned comparison before loading the 16-bit unit. The staged typed-read experiment preserves that operation at the compiler boundary. This study fixes its direct-read backend as the control and tests when the check can be omitted.

## Source and hypotheses

The real preview function `editorPreviewAppend` copies units from a text span to the display row ring. Its loop tests `i < end`. The caller normally supplies a nonnegative, contained span. The language gives the compiler neither of those invariants. Prepare one common Editor source for all three lanes with an outer `end <= text.length` guard and a loop condition `0 <= i && i < end`. Preserve the original checked loop as a fallback for the invalid domain. Keep the buffer write check and statement order. A second qualified span gives the direct policy a positive control, and focused fixtures establish the same distinctions independently of the app edit.

A current-lowering build performs every text-read check. A direct analysis uses explicit lower and upper guards. A bounded analysis asks whether those terms can connect through one intermediate. A successful bounds proof requires `0 <= i` and `i < len(text)`. The upper path may combine `i < end` with `end <= len(text)`. At least one edge of the upper path must be strict. Freeze the search at eight edge inspections per attempt and cap live facts at 24. Retain the check on budget exhaustion.

## Compiler and semantic contract

A local value and a receiver length each have identity derived from a function-local version. Assignment to a scalar or a text binding starts a fresh version. A length is tied to its receiver version. Record writes and all calls discard facts because a foreign argument or a view may alias the length header. A true conjunct can be used while compiling the right operand of `&&`. An if-only join intersects facts from the entering and completed paths and gives changed versions fresh identities. A loop begins with fresh versions for mutable locals. Preserve invariant outer length relations only when a bounded lexical preview of the structured loop finds no possible calls or header writes. Facts re-established by the loop condition are available in its body and disappear after the backedge. Decline proofs for arithmetic expressions, disjunction, unsupported entities and ambiguous mutation.

Feed a proven text read into the existing direct lowerer with its check disabled by an explicit operand. Lower unproven reads exactly as in the direct-read variant. Keep ordinary Wasm generation as a semantic oracle. This experiment uses the signed comparisons already present in Editor instead of adding an unsigned language type. The proof gives a nonnegative index strictly smaller than the signed runtime length, which also satisfies the unsigned check.

## Evidence

Measure native image size and static read checks for the common source. Run safe and trapping fixtures covering negative, empty and upper-edge cases, disjunction, control joins, a changed index, a changed receiver, a call or aliasing header write, and the loop backedge. Match native return, trap and memory effects against Wasm.

Execute the pre-existing 64 KiB Editor preview replay through the native loader and count executed check branches using a dedicated instrumentation build. Compare rendered frames and full semantic outputs. Keep instrumented timing separate from clean-code timing. On the P4 compare cold compile latency and peak QuickJS heap with the same compiler inputs, guard source and reactor, then run a physical native guest comparison. A separately measured screen replay and the guest count should state their exact input and measurement boundaries.

Review the prior bounds and Opus High designs alongside the working implementation. A two-hop result is useful only when it proves the expected access, preserves fallback behavior and has a measured compile or guest trade-off.
