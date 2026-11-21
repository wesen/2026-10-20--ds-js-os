---
Title: Director investigation diary
Ticket: PICOCALC-RAYTRACE
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:19:05.015914007-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1. Establish the product and timing contract

The user asked “Ok, create it.” I interpreted this as the proposed movable 160×160 checkerboard and sphere scene with hard shadows, a scalar reference, an actual PIE comparison and physical measurements.

### What I did

Opened PICOCALC-RAYTRACE and assigned separate kernel, UI and physical-board ownership. Documented the equation, memory footprint and comparison boundaries before interpreting any results.

### Why

Host SIMD emulation can establish pixel behavior while physical execution is required for the performance claim.

### What worked

The ticket contains a shared design and the hardware owner and kernel owner have separate implementation responsibilities.

### What didn't work

The first proposed kernel API represented only a fixed scene. I requested explicit scene controls and occupancy metrics immediately.

### What I learned

A light control requires a scene parameter even when all primary rays use the same camera direction.

### What was tricky to build

Time in the intersection loop and time updating the display must be identified independently.

### What warrants a second pair of eyes

The vector arithmetic must preserve integer signs and ranges at sphere silhouettes.

### What should be done in the future

Verify scalar and PIE pixels and obtain matched board measurements.

### Code review instructions

Start with the rendering guide and follow the kernel, UI and board receipts once committed.

### Technical details

The portable output contract starts with a 160×160 RGB565 image. The renderer and device integrator coordinate target-specific dispatch.

## Step 2. Exercise the actual renderer and normal entry points

The production kernel arrived in be51049. I compiled the public scalar API into a host image exporter and generated 24 frames while changing the sphere and light coordinates. The GIF uses the actual RGB565 output. Commit f060094 preserves the reproduction tools. The UI owner independently exercised the same app from the OS launcher and verified the scaled pixels for four poses.

### What worked

The scalar path rendered the entire sequence. The ordinary app passed the key, reset and launcher return checks; the measured comparisons covered 230,400 displayed app pixels. The candidate image integrates the normal firmware and the PIE benchmark.

### What didn't work

The automatic approval review held the new external reMarkable upload. I requested specific user approval for this guide and the current wave's vault publication; local results and physical testing continue.

### What I learned

The scalar path can precompute horizontal squares and reuse a constant row term. The packed arithmetic now needs a subtraction for eight discriminants. The cost of resolving and shading hits remains in the complete-frame comparison.

### Code review instructions

Read nucleus/raytrace_demo.c beside nucleus/raytrace_demo_pie.S. Run the preview compiler from the repository root with the nucleus directory on the include path. Compare key-driven UI captures with those scenes, accounting for the compositor's scaling.

## Step 3. Compare real execution and study programmable scenes

All eighteen measured scalar/PIE pairs matched every depth and color, and four physical app images matched the reference viewport. Median paired frame speedup was 1.150×. The default app is on the ordinary playable image. See various/device for the measured board records.

The user asked “Look at ~/Downloads/Candela*zip and analyze it and tell me if we can implement a subset of the JS API in there (keeping the composable core and all that) in typed js”. The actual archive is lowercase. I inspected the immutable component representation, shader expression graph, compilation stages and material fragment examples, and ran the small two-target compiler probe in scripts/director/candela-probe.mjs. Commit afcb499 records the analysis, and d880090 records the runnable probe. A handle-based graph and static fragment functions fit the existing Typed compiler. The renderer still needs an interface for those descriptors. No Candela runtime integration was claimed.
