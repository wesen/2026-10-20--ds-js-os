---
Title: Trial a counted PSIX snapshot with native Chess
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/native/02-native.inc
      Note: Validated native reader and ownership
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/producer/binary_producer.inc
      Note: Frozen native encoder and route
ExternalSources: []
Summary: Proposed first integration using the native PSIX producer and reader.
LastUpdated: 2026-11-20T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Trial a counted PSIX snapshot with native Chess

The measured native Chess route spent 16.915 ms per publication with cJSON and 2.027 ms with PSIX. Both arms begin with a complete tree already resident in the C sender. The timing ends after admission, one selected field and release. The existing QuickJS Chess snapshot trial spent 26.687 ms with built-in JSON and 134.457 ms with the PSIX encoder and Proxy painter. Keep the existing path in service and test a native Chess route that carries real bytes from the producer to a native reader. [Device summary](../various/device-summary.json), [native sender appendix](../scripts/producer/02-physical-appendix.md).

## What to hand over

- **Native encoding** takes a C tree in the measured prototype. It emits one allocated version-1 packet and its exact byte count. The [producer source](../scripts/producer/binary_producer.inc) is a starting implementation. Charge all conversion work if the Chess producer needs a new staging tree. Preserve the current complete snapshot semantics for every selection, promotion, undo, edited program state and restart.
- **Native admission** uses the same bounded format in the [reader source](../scripts/native/02-native.inc). Return a handle with no exposed mutable byte access after validation. A failed result carries a stable diagnostic. Length is part of every call. An implementation can count an owned span once if audited ownership makes a copy unnecessary. The studied receiver always copies.
- **Four representative specimens and four full traces** reproduce from the [host guide](../README.md). Start with the native Chess representative and check the exact frozen payload witnesses in the [capsule manifest](../various/capsule-manifest.json). There are 47 ordinary Chess cases. The existing typed Chess replay provides independent worker-side equality inputs beyond the four fixed timing specimens. [Typed Chess rendering study](../../PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/index.md).
- **Shared usage probes** already decoded the ordered tree at each group boundary. They passed 100 System views, 236 Snake views and 47 Chess module input checks. Application-specific message types have their own wire costs. Reuse the native publication trial in Chess first. [Semantic consumer experiment](../../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/various/semantic-binary-consumers.json).

## Trial boundary and lifetime

Add a counted buffer entry to the test build. Pass its bytes and length with the authenticated publisher and generation supplied by the kernel. The render producer builds exactly one complete next snapshot. The kernel verifies type, generation, structure and reservation before making the new buffer visible. Failed validation reports the reason against the sending world. Retention and replay continue to use the previous accepted buffer for the same live generation. A pending paint pins that buffer, so releasing the sender's old reference cannot invalidate a layout read. Authentication and generation metadata should come from the same supervisor state that authorizes sender identity, even though the payload itself also names the app. After restart, a full repaint can use only one retained snapshot.

In the trial, retain explicit owner receipts for producer output, live delivery, retained previous/current generations, subscriber views, and a pinned retired frame. Record the largest simultaneous total seen and a bound from the allowed copy counts. Charge encoder and validator temporary storage and report the framebuffer backing separately. Keep the transport raw. Base64 plus the modeled envelope made the Chess corpus 6.8% larger than the existing JSON.

The intended fast path calls native accessors from the drawing boundary. An adapter that makes every lookup a JavaScript Proxy call is a measured cost, so include it only if the real integration requires one and report its full drawing time. Time the same production geometry, drawing, commit and flush in the reference and candidate. Use the ordinary native JSON/production pipeline for the primary device reference while preserving the native cJSON component result as a diagnosis of sender/receiver cost.

## Qualification before widening the pilot

| Gate | Required evidence |
|---|---|
| Pixel and effect parity | Equal 320×320 RGB565 pixels for every frozen Chess input and actual visible panel after each successful flush. Compare selection, status and hints, and test a skipped flush followed by repair |
| Ownership | Verify correct sender/generation, rejected malformed and resource-limited candidate, old pinned draw, publisher restart, compositor replay and full repaint. Charge the simultaneous copies and inspect reclamation |
| Paired latency | Compare actual encode, admission, geometry, raster, commit and presented result on the same events interleaved with the existing path. Include cold and steady trials and the busiest normal app scenario |
| Resources | Report allocator peaks including staging and pinned generations on the device, and isolate incremental firmware flash from all its dependencies |
| Bounds | Validate widget-specific limits before production retention and observe exhausted caps without an unhandled paint failure or loss of last-good |

Carry the packet and test fixtures to the other groups as research tools. Use the Chess results to decide whether the runtime and byte-channel conditions justify any deployment or later app trial.
