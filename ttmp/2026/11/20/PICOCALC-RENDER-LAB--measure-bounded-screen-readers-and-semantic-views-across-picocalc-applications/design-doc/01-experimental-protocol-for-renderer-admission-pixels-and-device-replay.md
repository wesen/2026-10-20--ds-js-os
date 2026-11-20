---
Title: Experimental protocol for renderer admission pixels and device replay
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:20.307195568-05:00
WhatFor: ""
WhenToUse: ""
---

# A common experiment for two renderer designs

A world owns application state. The kernel asks the focused world for a complete screen, compares its serialized output with the previous output, retains changed screens and publishes them. A new subscriber can request the most recent screen even if its producer is asleep. The compositor receives the frame, records its tree and schedules a draw. It measures and paints into a back buffer. The graphics library compares dirty 16-row bands with the front buffer. The display world submits changed rectangles to the panel. A missed display transfer requires invalidation and a subsequent repaint.

The bounded-renderer design changes how a complete snapshot is validated, retained and read. The portable-view design changes what a complete snapshot contains. A semantic Chess screen contains the board and enough derived state to reproduce legal move highlights. A separately installed view maps these values to graphics. Either contract must survive loss, restart and replacement. Packet reduction alone measures neither CPU time nor replacement memory.

## The causal comparisons

| Workload | Control | Treatments | Decision evidence |
|---|---|---|---|
| Existing application JSON | Native JSON.parse and the current painter | Shared scanner with deferred decoding, same scanner with materialization, indexed access during real paints | Whole command stream, exercised bounds, P4 construction plus scalar traversal, retained bytes |
| System | Ordinary ui constructors and identical deduplication | Manual templates and syntax-directed extraction frozen before Keys | Whole trace including zero-output events, timed producer and receiver, held-out costs |
| Snake | The same game states drawn as ordinary canvas trees | Complete semantic state and a board template, then independent dirty-cell repaint | Pixel equality, skipped flush recovery, cost of an ordinary move and longer snakes |
| Chess | Existing typed game and its full mutable engine state | Same game emitting board, legal destinations and status; closed view resident, delivered as bytes, compiled locally from source | Comparable producer/receiver stages, strict output check, cold install, warm calls, unrelated input service |
| Layout | Production measurement and full drawing | A per-paint cache capped at 96 node/width entries | Repeated identical requests, recording overhead, equivalent draws, opportunity on new screens |

## Interfaces and ownership

```text
world render → retained frame → kernel publication → receiver → deferred draw → graphics commit → display
                                      ↑                     ↑
                             compare ingress here       compare outputs here
```

In kernel.c inspect run_segment(), frame_message(), kernel_publish() and teardown. Today the kernel installs before receiver validation. Admission must precede publication if refusal is to preserve the last good state across receiver restart. In compositor.js inspect the frames and draw handlers, measure(node,width), stack() and paint(). In gfx.c, gfx_commit() bounds the rectangles sent to the display. The SPI worker in bus_p4.c drains queued pixel transactions before reporting completion. These stages can run at different times. Nested observations on the same thread must never be added as independent costs.

A bounded-reader record contains four unsigned 16-bit words. They hold start, end, the first token after this subtree, and container arity. Our research reader accepts already-decoded JavaScript strings, so source offsets are UTF-16 code units. It separately checks the UTF-8 **encoded** length. It authenticates no producer by itself. Its index occupies 32,768 bytes for 4,096 tokens. Text is capped at 16 KiB per input, depth at 40, decoded string at 8,192 units. Host accessors produce temporary views on demand and transparently support the production painter’s indexed reads and array iteration. The index size is bounded. Total QuickJS memory also includes its strings, wrappers and recursive calls.

```text
admit(owner, epoch, bytes):
    verify current publisher and acquire a private candidate slot
    validate within the byte, token, text and depth limits
    if validation fails: release candidate and preserve current
    atomically install candidate as current, replace pending notification
    release old generation after the last active draw releases it
on renderer restart: read the retained current generation
```

For portable views, compile one closed typed procedure and record the exact Wasm bytes. Run the same artifact and state in all installation arms. Use a bounded one-page instance with no imports, a turn fuel limit and bounded output. Compute legal destinations in the game before sending the semantic Chess record. Time reception and conversion, module loading, instantiation, initial memory reset, guest execution and verification. Source on an edit and module reuse on subsequent paints have different costs.

## Qualification

Freeze predictions before seeing treatments. For the representation comparison Opus proposed a minimum effect of max(5% of the control median, twice the control interquartile range). Small samples support descriptive results only. The shared oracle requires equal 320×320 RGB565 buffers, checks panel repair and rejects silent drawing exceptions. Validate equivalence before interpreting speed. The P4 runs fixed fixtures with predeclared checksums and interleaved orders. Record host, target runtime, unit, stage, sample count and all failures; a Swift, Node, WAMR, QuickJS or native CJI measurement applies only to its measured path.

The physical supervisor takes an exclusive bench lock, verifies the installed playable app and partition table, installs only a temporary measurement app, gathers traces and restores the verified original. Terminal screenshots are gathered outside timed windows. RAM-pinned tests and isolated Wasm measurements each need a separate product integration trial.

The implementation is under scripts. The four child investigations contain their own blind research records. Start with 03/04 for pixel verification, 07–09 for the disposable firmware, 10–12 for indexed decoding, and 13–14 for the trace boundaries and board session.
