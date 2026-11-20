---
Title: Compile typed await into static PicoCalc continuations
Ticket: PICOCALC-CONTINUATION-G
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Production lowering for typed async worlds and dual-target host qualification.
LastUpdated: 2026-11-20T00:02:22.044522305-05:00
WhatFor: Understand and verify how typed awaits become static WorldState frames.
WhenToUse: Changing typed async syntax, liveness, dispatch, or native continuation compilation.
---

# Compile typed await into static PicoCalc continuations

Editor can express reactor file reads and timer continuations in typed source. The compiler finds scalar values needed after each wait, reserves their fields in WorldState and emits both the resumable steps and the shared event dispatcher.

- [Intern design](design-doc/01-typed-await-and-the-lifetime-of-a-picocalc-continuation.md) explains the persistent state contract and compiler boundaries.
- [Investigation diary](reference/01-continuation-compiler-investigation-diary.md) records implementation decisions, failures and evidence.
- [Host fixture](scripts/14-check-async-layout.mjs) delivers 29 events to each target, checks errors and optionally proves byte identity against an extracted Git baseline.
- [QuickJS benchmark](scripts/15-benchmark-quickjs.c) measures time and allocation on an assembled source. Its raw results are [initial versus span](various/01-span-allocation-quickjs.jsonl) and [span versus token reuse](various/02-typed-token-reuse-quickjs.jsonl).

See [tasks](tasks.md) and [changelog](changelog.md) for project bookkeeping.

The [published technical report](https://github.com/go-go-golems/go-go-parc/blob/000fa2a/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20How%20PicoCalc%20Compiles%20Await%20into%20Static%20Continuations.md) follows one await from the typed source to the event handler, then presents the host and compiler allocation results.
