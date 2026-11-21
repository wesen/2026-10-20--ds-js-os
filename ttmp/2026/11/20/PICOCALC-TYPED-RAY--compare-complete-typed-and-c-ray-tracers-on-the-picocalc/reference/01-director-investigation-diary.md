---
Title: Director investigation diary
Ticket: PICOCALC-TYPED-RAY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:51:27.413194279-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1. Separate the renderer experiment from scene authoring

The commission says “My first milestone would be one complete all-Typed scalar frame on the board, before adding any language feature.” I established a separate ticket and a single hardware queue behind the ongoing Candela trial.

### Prompt Context

The user asked to launch another research lab comparing the C implementation with Typed and exploring compiler improvements. The expected output is a complete renderer and measured physical comparison, with individual research diaries and published reports.

### What I did

Defined equal-work gates, memory ownership, four comparison classes and exact intermediate and final image checks.

### Why

Changing both the algorithm and compiler would make a difference in elapsed time hard to attribute.

### What worked

The preceding trials supply reproducible C scalar and C+PIE controls and a checked Typed material evaluator.

### What didn't work

There is no physical all-Typed timing at ticket creation.

### What I learned

The signed discriminant requires an explicit representation whenever it crosses the buffer boundary.

### What was tricky to build

The physical board is shared with an already-running experiment, so host implementation and code-generation studies start independently.

### What warrants a second pair of eyes

Check geometry, shading and rounding independently of the final RGB565 image.

### What should be done in the future

Execute the research matrix and preserve each arm's behavior and costs.

### Code review instructions

Start with the frame contract and the original ray tracer's C and assembly code.

### Technical details

The render target is 160×160 RGB565. The UI/enlargement/display transfer stays outside the timed frame.
