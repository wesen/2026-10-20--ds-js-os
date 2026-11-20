---
Title: Compile typed await into static PicoCalc continuations
Ticket: PICOCALC-CONTINUATION-G
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Production lowering for typed async worlds and dual-target host qualification.
LastUpdated: 2026-11-19T23:29:27.46402697-05:00
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
