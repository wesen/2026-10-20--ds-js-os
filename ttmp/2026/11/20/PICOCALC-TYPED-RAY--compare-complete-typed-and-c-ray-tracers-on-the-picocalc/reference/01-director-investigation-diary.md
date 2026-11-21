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

## Step 2. Allocate independent researchers and test the intersection domain

I commissioned three separate Opus High studies through the authenticated CLI with tools disabled. The prompts cover differential correctness, code generation and matched physical experiments. The three existing local researchers own integration and the audit trail in those lanes. I tested a fourth question independently. How many scalar iterations does the geometry actually require?

### Prompt Context

See Step 1. The requested milestone compares the complete existing algorithm in both languages. A different iteration domain constitutes a separate optimization arm.

### What I did

I compiled a standalone C experiment that calls the production row kernel and compares every depth and winning sphere with a candidate loop. The candidate uses the integer square root of the row discriminant to restrict the x interval. The experiment also checks the rendered colors and includes an exact depth tie with distinguishable materials.

### Why

A compiler improvement and a change in the underlying algorithm answer different questions. A broad scalar-versus-SIMD comparison could hide a cheaper way to avoid testing empty space.

### What worked

All 102,400 pixel comparisons passed across four scenes, including changed positions, lights, an equal-depth tie and a radius-one sphere. Each of the three ordinary scenes took 6,983 sphere/pixel visits under exact spans, compared with 76,800 for a full scan. This is a 90.91% reduction in candidate pairs. The kernel still clears 160 depth rows and shades all 25,600 pixels.

### What didn't work

An unprivileged shell lookup of the serial port returned `zsh:1: no matches found: /dev/ttyACM*`. The physical owner confirmed access through the approved host context and retained the board reservation for Candela.

### What I learned

For integer coordinates, the condition dx² ≤ r² − dy² can be converted to an inclusive interval using the same root table that computes hit depth. Exactly 165 sphere/row pairs have a nonempty interval in an ordinary frame. The number of visits equals all front-surface intersections, including those later occluded by another sphere.

### What was tricky to build

The C renderer leaves the winning object byte unspecified on a miss. The differential checks the depth first and compares IDs only when a winner exists. Equal depths keep the earlier sphere because the replacement comparison is strict. Color uses the winning sphere under the existing lighting code.

### What warrants a second pair of eyes

These counts describe work, not elapsed time. Sphere scene limits and the root-table maximum matter. A camera model with perspective projection would require a different derivation.

### What should be done in the future

Time exact spans separately from a like-for-like scalar port. Inspect whether the emitted Typed code benefits from fewer loop iterations or is dominated by lighting.

### Code review instructions

From the project root, compile `scripts/director/row-domain.c` inside this ticket with `cc -std=c11 -Wall -Wextra -Werror -O2 -fsanitize=undefined -fno-sanitize-recover=undefined -Ipicocalc-os/nucleus`. Run the resulting binary and compare its JSON with `various/director/row-domain.json`.

### Technical details

For row y and sphere center (cx, cy), let h = r² − (y − cy)². Skip negative h. For nonnegative h iterate from cx − floor(sqrt(h)) through cx + floor(sqrt(h)), clipped to the frame. Keep sphere order, strict depth ordering and integer rounding. The experiment includes the production implementation in the test translation unit so private routines stay private.
