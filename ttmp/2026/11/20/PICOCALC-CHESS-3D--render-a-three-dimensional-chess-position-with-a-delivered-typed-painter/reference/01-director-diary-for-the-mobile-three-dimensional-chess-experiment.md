---
Title: Director diary for the mobile three-dimensional Chess experiment
Ticket: PICOCALC-CHESS-3D
Status: active
Topics:
    - picocalc
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:08:00.740753045-05:00
WhatFor: ""
WhenToUse: ""
---

# Director diary for the mobile three-dimensional Chess experiment

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

# Director diary for the mobile three-dimensional Chess experiment

## Step 1: Tie the geometry study to two independent prerequisites

The user proposed delivering a 3D painter once the previous research came back. The 2D mobile painter completed its opening and two cursor observations in an initial healthy boot. The independent compiler candidate was also ready for falsification. I opened a separate ticket for rendering, so a successful SIMD microbenchmark cannot accidentally be reported as a 3D application speedup.

### Prompt Context

**User prompt (verbatim):**

> Ok, send out another researcher to do this. And I guess once the other research comes back, we could start experimenting with sending a 3d rendering painter over to the compositor?

The user requested Sol Medium and independent Astra supervision with diaries and textbook reports. I interpreted this as an initial downstream experiment on the same bootable Chess game.

### What I did

Created PICOCALC-CHESS-3D, the intern guide, this diary, and two acceptance tasks. Traced the existing state cells, drawing vocabulary, code slot and measured renderer path. Proposed a single triangle record and a source-owned mesh.

### Why

Keeping the position unchanged lets us attribute differences in rendering to the program. A second view gives us evidence that the geometry is three-dimensional and defines a useful later performance comparison.

### What worked

The preceding 2D physical run observed one compiled entry reused through e2, e3, and f3. The P4 compiler and PSIX route can already carry a different pinned program in a research image. The independent PIE team supplied a testable projected-vertex kernel.

### What didn't work

An earlier two-core background build overran a launcher draw deadline. That result belongs to mobile-painter qualification and informs how a larger source is scheduled. The current production drawing vocabulary cannot express filled triangles in one record.

### What I learned

The normal painter owns two buffers with a four-byte capacity header, and its native image must fit the code slot. A candidate vertex loop with six array arguments needs a specific buffer layout and a way to acquire scratch; its isolated result does not automatically extend the full painter.

### What was tricky to build

Define a workload that fits the existing output, keeps squares identifiable, makes piece height observable and permits independent pixel checks. Separate the 2D oracle from the geometry reference for the new appearance.

### What warrants a second pair of eyes

Coordinate range, edge coverage, face order, buffer bounds, and evidence of native execution versus host rendering.

### What should be done in the future

Execute the design and record exactly which portions ran through the actual display.

### Code review instructions

Read the design guide first, then the 2D painter contract in nucleus/mobile_painter.h and the implementation research in the PICOCALC-TYPED-PIE ticket.

### Technical details

The app body is 320 by 280 pixels. A 3D experiment can use the same 90-cell state, 4,096-word output buffer and compiled entry signature. One triangle record as proposed consumes eight 16-bit words. The old 2D cursor fixture describes different geometry and needs its own new expectation.
