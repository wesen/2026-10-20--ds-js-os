---
Title: Choosing SIMD packet boundaries in the Typed compiler on ESP32-P4
Ticket: PICOCALC-SIMD-LAB
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Six physical and compiler experiments on packet boundaries, legality, layout and held-out prediction."
LastUpdated: 2026-11-21T16:31:19.984888317-05:00
WhatFor: ""
WhenToUse: ""
---

# Choosing SIMD packet boundaries in the Typed compiler on ESP32-P4

For the project result and the experiments behind it, start with [Where an eight-lane compiler should return to scalar code](analysis/01-where-an-eight-lane-compiler-should-return-to-scalar-code.md). It explains the supported compiler mode, complete frame results, checks against C and Wasm, the physics prototype, and the negative result for a predictor on an unseen collision workload.

## Study map

| Investigation | Start here |
|---|---|
| Approach, APIs and research protocol | [Intern implementation guide](design-doc/01-choosing-the-scalar-boundary-of-a-packed-loop-on-a-handheld.md) · [Frozen held-out experiment](design-doc/05-frozen-held-out-protocol.md) |
| Hand scheduling, packet classes and narrowing | [Ray design and proof](design-doc/02-ray-schedule-and-exact-narrowing.md) · [Hardware row data](various/ray/ceiling-summary.json) · [Isolated packets](various/ray/packet-classes-summary.json) |
| Inspect a decision at a real machine address | [Evidence design](design-doc/03-verifying-image-addresses-and-packet-evidence.md) · [Research article](analysis/03-joining-simd-decisions-to-executed-instructions.md) |
| Particle layout, recognized code and contact order | [Physics design](design-doc/04-fixed-point-particle-layout-and-contact-order.md) · [Research article](analysis/04-fixed-point-particle-layouts-and-contact-scheduling-on-the-esp32-p4.md) |
| Whole frames and selection on unseen inputs | [Device frame results](various/director/frame-result.json) · [Blind result](various/director/selector-result.json) · [Length dispatch follow-up](various/director/gate-result.json) |
| Verify or extend the measurements | [Open a research session](scripts/director/09-open-lab-session.py) · [Executable JS cells](scripts/director/10-lab-workbook.js) · [Verified live worksheet](various/director/final-live-workbook.json) |

The [independent results review](analysis/05-independent-review-of-the-compiler-measurements.md) and the [Astra examiner’s separate replay](analysis/06-independent-replication.md) distinguish the application results from source-level correctness, evidence identity and code-placement effects.

Each department's guide is in [design-doc](design-doc), the articles are in [analysis](analysis), each diary is under [reference](reference), and source, compiler fixtures and physical replay programs are in [scripts](scripts). [Task completion](tasks.md) · [Changelog](changelog.md).
