---
Title: Operator protocol for Snake replay and measurement
Ticket: PICOCALC-RENDER-SNAKE
Status: active
Topics:
    - picocalc
    - ui
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:08:08.018742764-05:00
WhatFor: ""
WhenToUse: ""
---

# Operator freeze before measurements

The independent design was recorded first. The work below uses release-real controls inside an isolated host model. We will evaluate the design's predictions against these specific treatments.

* **J** is the unmodified prelude's rendered frame (tree and hints). Its enveloped bytes include app and title. **B** uses the same frame object and Node's built-in binary serializer as a host-only general-purpose binary control. We explicitly do not call it an MCU format or a packed dictionary of drawing commands.
* **SJ** sends a complete semantic object as JSON. **T** sends a complete binary semantic record with schema/version, flags (alive and auto), 16-bit segment count, 16-bit food, 16-bit score, 16-bit best and 16-bit cells head first. State is renderable after lost publications without a previous message. No sequence, sender or checksum fields are priced into the raw 10-byte header. The JSON wrapper variant prices base64, schema, app and title. Domain limits 4..395 segments with disjoint food. Refuse impossible coordinates, overlapping/disconnected segments, missing/extra bytes, unknown flags or version, impossible scores; JSON's structural generality has no separate admission treatment in this study.
* **D** is independent of encoding. Keep the previously painted visual occupancy, compare it with the new visual occupancy, recolor the changing cell interiors on a retained back buffer. Full paint on an overlay or chrome/score/hint change. A deliberately skipped display flush invalidates panel history and forces the complete next transfer, even if the game is idle. Keep transfer-banding rules separate from this saving in paint. We also test a deliberately skipped input and restart from only one snapshot.
* Replays comprise scripted real input, two body-collision/wall paths including a legal tail entry, a 200-tick deterministic autopilot trajectory, focus-off ticks, score growth, restart; constructed long (300) and near-cap (395) states are reported separately. Keep all input and sampled screen identities. No human or twenty-seed endurance run in this bounded pilot. Independent design's larger, physical qualification gates remain open.
* Compare exact 320×320 RGB565 full images, predicate generated damage and independently executed incremental RGB565 fills; require zero differences with complete production paint, A/A and recovery. Record true changed pixels and successful transfer area. Compare bytes and host CPU using warm blocked interleaved variant order. Use measured per-session raw sample blocks, split producer and receiver stages; do not claim hardware latency, heap high water, or absolute panel work from them. Retained encoded bytes and deterministic fixed storage can be accounted exactly. Promote to a board trial only after equality and a material host saving; no host-only adoption.
