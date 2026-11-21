---
Title: Complete frame contract and compiler experiment matrix
Ticket: PICOCALC-TYPED-RAY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:51:26.674130042-05:00
WhatFor: ""
WhenToUse: ""
---

# Complete frame contract and compiler experiment matrix

The first gate is a full 160×160 frame computed from one Typed entry invocation using today's checked buffers, RV32 backend and caller-provided scratch. A native wrapper allocates storage, loads code, invokes the entry and presents the resulting buffer. Keep primary tests, depth selection, hit material IDs, occlusion, diffuse lighting, material evaluation and RGB565 packing in Typed. Compare 25,600 depth values, material IDs and pixels to independent C output. Exercise ordinary and changed poses, fixed and matching programmable materials, explicit stride, canaries and scratch reuse. Separate preparation from timing. No board accesses until the Candela physical owner releases it.

After the scalar milestone compare an explicit packed intrinsic, inferred row-loop lowering and scalar fallback under signed i16, unsigned u16 and i32 indexing. Isolate compiler effects with matched scalar C and Typed, then measure PIE within each implementation. Inspect emitted instructions and use observed phase times to choose additional passes. Record equal graphs and positions, compilation, primary work, lighting/shadows, material evaluation, frame latency and memory. Negative results are deliverables. Each researcher maintains a separate detailed diary, design, evidence scripts and newcomer article, and the director publishes a synthesis and the individual articles together.
