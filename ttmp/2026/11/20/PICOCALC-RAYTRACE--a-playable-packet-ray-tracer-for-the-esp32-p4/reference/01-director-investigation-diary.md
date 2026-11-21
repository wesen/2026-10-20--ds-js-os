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
