---
Title: Source span reuse and indexed prepass investigation diary
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/15-check-span-reuse.mjs
      Note: Artifact and diagnostic parity
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/18-run-span-history.sh
      Note: Archived execution suites
ExternalSources: []
Summary: "Investigation notes for source spans, indexed source call discovery, and the composed experiment."
LastUpdated: 2026-11-20T00:55:28.988484806-05:00
WhatFor: ""
WhenToUse: ""
---

# Source span reuse and indexed prepass investigation diary

## Step 1: Adapt signature reuse and build the emission plan

I started from 2e4fee1 and staged stock, header-reuse and source-span variants. The modified writer represents copied text with its original offsets. The emitter materializes modified bodies and an appended generated suffix. The complete rewrite becomes a lazy output.

### Prompt context

The parent assigned the source-span study parked at 98bfd9a, then asked for a cheaper indexed task prepass. The assignment calls for host measurements and exact parity. The parent owns physical testing.

### What I did

- Traced the writer, emitter, old signature experiment and native linker callbacks.
- Added scripts/13-stage-span-reuse.py. It reuses validated declarations and signatures, appends frame fields to the record layout, and scans the generated suffix for new function headers.
- Kept virtual function offsets in descriptors and used the real segment offset only during emission.
- Kept a canonical full-text error replay without backend callbacks and used a getter trap to detect unintended whole-source materialization.

### Why

An untouched synchronous function does not need a second copy of its text. Its original offsets already identify the complete input to the existing emitter.

### What worked

The three initial lanes emitted the same 89,168 raw RV32 bytes, 81,233 generated source units and 70 state fields.

### What did not work

The first staging command failed with “ValueError: expected a single anchor: return writer.result(program.prefix, allocation.layout);”. The older signature experiment predates generated start guard metadata. The adapted stage preserves startFields from frozen 2e4fee1.

### What I learned

One logical function can have a virtual offset for metadata and a separate actual offset for parsing. They must agree on source coordinates only when the lexer reads the complete rewritten string.

### What was tricky to build

The writer does not necessarily copy the rest of a function when it processes the last replacement. The plan calculates the virtual range end from current output offset and the original text still to be copied.

### What warrants a second pair of eyes

Check canonical diagnostic order around records and callbacks. The second pass through an invalid module must avoid replaying backend side effects.

### What should be done in the future

Combine this plan with a native lexical index retained across ordinary emission.

### Code review instructions

Start at scripts/13-stage-span-reuse.py and use scripts/15-check-span-reuse.mjs to compare its output.

### Technical details

All plan offsets are UTF-16 code units. Function order, export descriptions and import base arithmetic follow the stock emitter.

## Step 2: Replace ordinary regex scans where native rows prove the same result

The P4 trace places substantial time in readProgram and scanOperations. The staged index prepass examines native token rows to identify real task syntax and source-order direct call edges.

### Prompt context

See Step 1. The parent asked for global diagnostic order, call graph order and deliberately malformed syntax cases.

### What I did

- Added scripts/14-indexed-prepass-overlay.mjs. It checks the native opening and closing rows against each signature extent and classifies watched identifiers per symbol ordinal.
- Recorded ordinary call offsets for the existing phase to consume. Bodies with actual task operations or ambiguous numeric adjacency use the legacy scan.
- Kept existing parameter type arrays for ordinary signatures. The pass allocates binding descriptors for async bodies.
- Retained the original index in the composed arm and built additional indices only for changed bodies and the generated suffix.

### Why

The old async pass can tokenize a body solely because a comment mentions await. An index can establish that the body has no matching syntax without discarding real call edges.

### What worked

All seven lanes matched six positives, five exact graph traces and 35 other inputs. The oracle rejected 34 inputs in the last group with identical messages. The composed G4 requests the original index once and 18,498 additional indexed units. Full E, G and Editor receipts were identical for spans, indexed prepass and the composed arm.

### What did not work

Initial raw timing observations from separate processes varied too much for a meaningful absolute comparison. I used the alternating tracked batch for estimates.

### What I learned

A malformed number immediately followed by an identifier can make the regex word boundary disagree with lexer token adjacency. Such a body needs the original scanner selection and error order.

### What was tricky to build

Index inspection precedes the semantic phase. Raising a direct async call error there would move it ahead of earlier source errors. The body inspector returns call offsets and leaves existing semantic diagnosis in scanOperations.

### What warrants a second pair of eyes

Review numeric adjacency fallback and contextual task keywords, then check the retained record and graph ordering tests.

### What should be done in the future

Run the frozen composed lane against the index-only and pre-G images on the same board.

### Code review instructions

Read indexedBodies in staged typed-async.js and the file-scope, adjacency and mixed-cycle cases in scripts/15-check-span-reuse.mjs.

### Technical details

Edges use zero-based signature ordinals with original source locations. The native index ABI is unchanged.

## Step 3: Compare linked CPU and tracked allocation

The timing launcher reuses the existing C index harness and allocator ledger. Every invocation has a fresh QuickJS runtime, the same SDK reactor and a 4 MiB allocation cap. Module load and compiler call have separate times.

### Prompt context

The parent requested host estimates and the exact compatible board staging recipe.

### What I did

- Ran nine samples per lane in alternating order on CPU 6. Ran five additional phase samples per indexed lane.
- Archived linked timing, phase and behavior receipts under various/span-studies.
- Sent the exact four-overlay composition and full ELF identity to the device owner.

### Why

Indices remain live through different stages in the span prototype. Both compiler time and allocation matter even when final output bytes are identical.

### What worked

Median CPU was 169.852 ms for indexed and borrowed, 158.068 ms with the prepass and 154.838 ms with spans and prepass. The composed peak was 3,371,520 bytes versus 3,496,512 bytes for the indexed control. scanOperations fell from 10.749 ms to 1.227 ms in the phase probe. Full linked hashes remained fixed.

### What did not work

Standalone span emission took 214.785 ms compared with 211.706 ms for reused headers. It used less peak memory. The stronger CPU result came when the smaller source segments also reduced native indexing.

### What I learned

The two changes affect different compiler costs. The prepass removes repeated scanning and descriptors. The span arm reduces how much rewritten text must be materialized and scanned.

### What was tricky to build

Host ratios and the earlier physical phase trace involve different CPUs and memory allocation behavior. The paired physical outcome remains the timing gate.

### What warrants a second pair of eyes

The board stage must apply lexical-index overlays 02 and 10 before the span study overlays 13 and 14. This preserves the original index through emission.

### What should be done in the future

Use device receipts to determine whether the cold compile meets the ten-percent target.

### Code review instructions

Run scripts/16-run-span-studies.sh with the shared reactor ELF. Use scripts/18-run-span-history.sh for the archived E/G and Editor execution checks.

### Technical details

The G4 input SHA-256 is ea6354bd16ac788862b4f4d8a7362273dcb0d5d5c1b11f29248af388200632b0. The shared reactor SHA-256 is 16660a8ab3fb07d5e5d388c21d81868b3f71e325d3a9737dcefc095f7554feff. The tracked host harness SHA-256 is 3609d3e53410f5dcc90780861755a50fdda8aedda76d0d78e52ac10d36623a0b.
