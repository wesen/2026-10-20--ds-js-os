---
Title: Render the first Candela scenes on the PicoCalc and compare them with host goldens
Ticket: PICOCALC-CANDELA-FIRST-LIGHT
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - testing
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: integrate the Candela world, the firmware kernel and the bytecode sections; render tier T0 presets progressively at 80 x 80 and 160 x 160 on the PicoCalc; measure samples per second and compare 64-pass images with host goldens."
LastUpdated: 2026-11-21T23:02:33.088332885-05:00
WhatFor: "Scope, dependencies, risks and acceptance measurement of this follow-up of PICOCALC-CANDELA-P4"
WhenToUse: "Before starting implementation work on this ticket"
---

# Render the first Candela scenes on the PicoCalc and compare them with host goldens

## Goal

B-01 and R-01, written in Candela's API and loaded from storage, render on the PicoCalc's screen, progressively and interactively, with an image that matches a host golden.

## Context

The parent design (`ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md`, Sections 7 and 8) sets the first subset (tier T0, 28 presets) and the rendering policy: 160 x 160 progressive at one sample per pixel per pass (estimated 0.63-0.90 s per pass for B-01), 80 x 80 while the camera or a slider moves, accumulation in PSRAM, exposure and AgX per pass, denoise only when accumulation pauses, rendering on core 1 at low priority.

## Scope

- A render service in the firmware: pixel dispatch over the kernel, float accumulation, post, upscale to 320 x 320, frame events to the world.
- The Candela app world: scene picker over bundled T0 presets, camera orbit and dynamic-parameter sliders, progressive status (samples per pixel, samples per second).
- Host goldens: for each demo preset, the host build of the same C kernel at 64 spp and a digest of the packed buffers.
- A dual-core experiment measured against UI deadlines, after the single-core path works.

## Dependencies

- PICOCALC-CANDELA-CPU-KERNEL, PICOCALC-CANDELA-SECTIONS, PICOCALC-CANDELA-WORLD.
- The device; return it to the current playable firmware afterwards (AGENTS.md).

## Risks

- Device cycle cost may be worse than the model; the policy (resolutions, passes) must be re-derived from the measurement.
- Interaction latency: a build on the device takes most of a second; slider moves must use dynamic parameters (re-pack only), not rebuilds.
- PSRAM and cache contention with the UI.

## Acceptance measurement

- B-01 and R-01 on screen; measured samples per second at 80 x 80 and 160 x 160.
- 64-pass device images within 1% mean luminance of the host goldens; no NaN pixels.
- Slider and animation updates visible within one second at 80 x 80.
- Which of the 28 T0 presets render correctly, with the reason for each that does not.
