---
Title: Lab phases, independent studies and device qualification
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: Layout and pixel production
    - Path: repo://picocalc-os/nucleus/gfx.c
      Note: Band comparison and display-image lifecycle
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: Admission and retention before fanout and replay
    - Path: repo://picocalc-os/worlds/editor/document-view.typed
      Note: Independent typed producer holdout
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:30:49.959977473-05:00
WhatFor: ""
WhenToUse: ""
---

# Lab phases and decision gates

**Proposed decision.** Fund a common measurement harness, then two independent experiments: a bounded reader for complete snapshots and a compiler that extracts static screen structure. Measure the opportunity for layout reuse and partial repaint during the same baseline. Open those implementation studies when their measured ceilings justify the work. One physical board and one stable oracle serve all four questions.

This is a research roadmap awaiting project-owner validation. An approved study should receive its own child ticket, design, diary and reproducible scripts. The phase IDs below remain stable even when a candidate is rejected. The existing playable image and the corrected System monitor form the production control.

## P0. Establish what a screen costs

The experimentalist owns capture, observability and reproducibility. Start at the current screen-producing source and name the revision of the full firmware that is actually on the board. Freeze fonts, clock/notification inputs for deterministic replay, corpus order and build settings. Record board state and produce both snapshots and sequences. A single isolated snapshot is sufficient for decoding; damage requires the actual predecessor and old pixels. The qualification images from the fault ticket are framebuffer evidence; they do not contain the serialized input trees.

| Task | Deliverable | Pass condition |
|---|---|---|
| M0. Capture input | Raw producer screen, trusted sender and envelope metadata, ordered actions, dimensions, a frozen clock separate from measured timestamps, expected full framebuffer after each action | Replay an unchanged control twice. State-dependent trees and every reference pixel agree. |
| M1. Instrument stages | Encode, compare/retain/publish, delivery wait, ingress/decode, layout, raster, gfx commit, display settlement; current/peak bytes and owner at allocation and release | Enabled versus disabled traces quantify observer overhead. Stage clocks reconcile with turn boundaries; waiting is separate from CPU. |
| M2. Freeze corpus | System all tabs, isolated cursor movement, live refresh, bottom row; transitions, overlay removal, failed flush/restart; held-out ordinary-JS Keys; separately held-out typed Editor text/selection/wrap/preview sequences | Public tuning/held-out split and digests precede the optimization. Keep realistic short and large frames as separate strata. |
| M3. Size budgets | Max encoded bytes, token/node count, depth, cell/graph counts, decoded text and transient scratch. Sum retained/in-flight/pinned storage across worlds | Each cap has a unit, owner, failure result and a boundary fixture. Count the larger live combination during replacement, backpressure and restart fan-out. |

A first physical sample is a feasibility run. For comparisons use the same input sequence and fixed app state, rotate the order of candidate/control images across independent boot blocks, and report absolute values plus paired percentage differences. Run enough blocks to separate the candidate effect from control-to-control variation. Report the count of frames and independent blocks alongside medians, upper tails and worst observed values. Pooling thousands of adjacent events from one boot does not yield thousands of independent replications. A latency distribution is a measurement; a hard byte bound requires accounting for every permitted allocation path.

## P1. Read a complete snapshot within a budget

**Owner:** representation researcher. Start with the corrected JSON payload. Compare the current CJI object reader against an indexed JSON view that can reach a table cell by following offsets into owned bytes. Allocate index and traversal scratch from checked, bounded storage. Run the same traversal and painting policy. If the prototype moves code to C, add a same-engine/same-boundary object or materializing control so we can distinguish a representation win from a language-runtime win. A prototype which still goes through the unconditional object decoder cannot answer this question.

- **R0 – Ownership.** Specify who admits and retains a new generation. Validate before replacing the publisher's durable last-good screen. Bound the number of immutable generations in flight; specify queue-full behavior, sender checks, publisher teardown, deferred delivery and release after paint or transfer completion. Deliver an identified rejection to the producer through a specified result or diagnostic path.
- **R1 – Index.** Scan a length-delimited immutable span using a bounded cursor stack. Store start, end, kind and a next-subtree index as needed. Validate container grammar, field types and counts; define access to escaped text, Unicode and numbers. Keep key lookup and traversal work bounded. Reserve resources before publishing a new valid view.
- **R2 – Equivalence.** Reject a candidate one byte, token or depth over its budget; compare a valid frame immediately followed by the rejected one, compositor restart, replay and a subsequent valid frame. The last-good screen and its pixels must survive. Check normal idle, concurrent publishers, a disappearing producer and a queued draw retaining the old generation.
- **R3 – Optional encoding comparison.** If indexed JSON still spends material time scanning syntax or key names, compare a definite-length, schema-tagged CBOR encoding through a real span-based transport. Include producer encoding cost, slot size and binary receiver validation. Keep the representation under test independent from the layout algorithm.

**Gate:** Demonstrate the byte bound at the declared scope, pixel equivalence, restart and rejection behavior. Measure stage time and headroom at the device's actual limits. A slower reader with a reliable bounded mode can still be valuable; describe that trade explicitly. No throughput or peak-memory percentage is promised at planning time.

## P2. Compile the stable part of a screen

**Owner:** compiler researcher. Begin on host in parallel with P1 after M0. Build a hand-authored template of the Worlds tab to measure the attainable benefit for this screen, then freeze the rules for an automatic extractor. No requirement for app authors to adopt another UI language.

- **T0 – Matched controls.** Emit one dynamic snapshot and one immutable template with a complete vector of values; construct both by hand from the same application state. Charge lookup, numeric/text conversion, encoding, catalog size in flash and compilation as well as delivery. Include template identity/version in replay.
- **T1 – Automatic extraction.** Specialize pure, recognized UI constructors over constants. Leave counters, selected rows and strings dynamic; retain conditional and list semantics. Preserve evaluation order and side effects in residual computations. Unsupported sites use the general snapshot path. Track constructor sites covered, slots per frame, code size, and how much of the manual benefit automation recovers.
- **T2 – Generalization.** Freeze rules before an independent researcher runs Keys. Score all eligible sites, including fallbacks. Test empty lists, conditional branches and template-version mismatches. Run Editor as a separate transport/layout holdout. Its producer currently writes its own screen bytes, so absence of an extractable UI constructor there is a real applicability boundary.
- **T3 – Physical comparison.** Keep the reader and paint pipeline fixed between manual and automatic template arms where possible. Measure cold build time and flash size independently of warm screen updates. A restart must resolve the template and draw using only that catalog entry and the retained values.

**Gate:** Retain automation when it preserves pixels and effects, works on the held-out source shape, and offers a worthwhile device or authoring benefit after catalog/build cost. A successful hand-coded example alone qualifies the representation, not the extractor.

## P3. Reduce work after receipt

**Owner:** renderer researcher. During P1 and P2, measure visits to measure/stack, wrap calls, primitive count, pixels touched and dirty-band comparisons on unchanged production behavior. Use these data to choose the next isolated change.

| Task | Controlled comparison | Decision |
|---|---|---|
| L0. Layout opportunity | Count repeated measurement of the same node with the same width and font metrics. Include nested and shallow screens. | If the repeated portion is small relative to control variance or the lab's device target, publish the ceiling and defer implementation. |
| L1. Frame-local geometry | Full paint with bounded geometry records versus full paint through existing recursive layout, on identical snapshots | Compare coordinates, wrapping, clipping, peak scratch and elapsed time. Reuse across frames is a separate hypothesis with invalidation and eviction costs. |
| D0. Damage opportunity | Count area actually changed, area redrawn and area sent for cursor, scroll, overlay, app switch and complete update | Promote partial paint only for workloads with avoidable raster cost. Existing gfx_commit already filters SPI traffic. |
| D1. Early invalidation | Keep layout fixed. Conservatively union old/new bounds; repaint intersecting items in original paint order, clipped to dirty region, with full-paint fallback | Compare final RGB565 pixels after every event, including removal, overlap, global chrome, scroll, panel invalidation and restart. Report work where full repaint wins. |

For a 320 by 320 display, a 16 by 16 tile grid uses 20 by 20 bits, or 50 bytes packed, before auxiliary state. Fixed bitset storage alone says little about the cost of computing old/new bounds or the number of drawing operations that intersect a dirty tile. Measure each. A drawing-call equality oracle suits two full renderers with the same drawing order. A partial renderer intentionally issues different calls; full pixel equality and display resynchronization are the appropriate oracles there.

## P4. Independent replay and adoption

**Owner:** director and independent experimentalist. Qualify each winner alone on the P4 before combining candidates. For two winners X and Y use four arms: control, X only, Y only, and X+Y. The interaction for a cost metric is cost(X+Y) − cost(X) − cost(Y) + cost(control). State the sign, units and uncertainty. For example, a template might remove so much parsing that a faster JSON scanner has little end-to-end effect. Publishing that result prevents counting the same benefit twice.

Keep the 80 ms and 768 KiB compositor controls for the first qualification. Compare per-app quotas and whole-device high-water separately; if a variation moves work to the producer, include that time and memory in the result. Require correct pixels on the corpus, same focus/key behavior, active progress, no unexpected restarts, deterministic oversize rejection and successful cold replay. Use a physical panel observation separately if claiming key-to-photon latency; a serial framebuffer screenshot proves different endpoints.

The director returns one result table per workload and one disposition per candidate: adopt, revise, or archive. Include negative findings, failed tests, firmware identity, source hashes, corpus, scripts and independent replay. A measured confidence interval that spans the control noise calls for further sampling or a qualified inconclusive result. Leave the latest qualified playable firmware on the board after approved experiments.

## Staffing and scope control

The lab has three independent technical assignments (representation, compiler, rendering) and one experimentalist who owns the board and the oracle. Give each technical researcher the same baseline and freeze predictions before sharing outcomes. A reviewer checks the interfaces and the claims. During the initial wave, the renderer researcher instruments the control rather than developing a second representation. The director schedules board runs in comparable blocks.

Each lane may survey freely, but maintains one table of **mechanism, closest baseline, observation needed, and disposition**. Select one primary candidate per question. Adding a candidate to a live comparison requires identifying what existing measurement it will explain and which work it displaces. The optional CBOR encoding, inter-frame cache and more elaborate damage detection stay in reserve until their respective measurements warrant promotion.

## Changes adopted after independent review

Astra traced the published message further than the ordinary JavaScript handler. The general CJI path converts UTF-8 to a managed string, parses it, and can walk the resulting tree again for wire values. R1 must replace or bypass that path before ordinary handler dispatch, and own the bytes past kernel free_msg. The optional binary arm needs counted spans at every link where C-string operations are currently used.

Three review findings change the measurement design:

1. **The monitor measures itself.** A faster renderer changes the real CPU and bus numbers that System displays. Use frozen counter samples, focus, clock, banner and ordered actions for pixel comparisons even on hardware. Use live System separately to establish usability, progress and faults. Do not require two live runs to display identical CPU percentages.
2. **Damage tracking needs a panel oracle.** Commit updates the framebuffer's front image before display completion. Applying each flush to a simulated panel, including a skipped transfer followed by an otherwise unchanged frame, tests the repair protocol. In the physical trial record the final matching SPI completion and the no-pixel/no-flush cases. Host virtual gfx_commit charges full-panel diff cost even when only a few bands are visited, so host virtual time cannot establish this speedup.
3. **Match the research claim to the producer.** Keys has an ordinary UI-builder AST. Typed Editor already serializes a buffer. Use Keys to test whether automatic extraction generalizes and Editor to test a distinct receiver workload. Freeze the cases, evaluation criteria and minimum worthwhile effect before unlocking either.

Astra's other proposed controls are in the independent review: authenticate replay by publisher epoch as well as name, compare escaped and literal Unicode, charge every simultaneously live owner, and exercise draw operations whose work depends on coordinate magnitude. The first JSON study stands on its own if the binary transport is deferred. Likewise damage can use freshly computed geometry even when layout caching loses.

### Initial staffing decision

Approve M0–M3 as the first shared milestone, with R0 and T0 design work in parallel. Release R1/R2 and T1 once the control replays. A successful validity/ownership proof can justify a bounded reader even when its time result is neutral. For layout and damage, the gate is empirical: compute the *optimistic ceiling* by removing the entire targeted stage from the paired control. If even this ideal exceeds neither the observed noise floor nor the minimum worthwhile latency change, defer the implementation. Lock that minimum with the director before looking at candidate measurements. Expand only when an unanswered question could change an adoption decision.

### How to interpret the byte ledger

Use two ledgers. The renderer-owned ledger includes the accepted view, the candidate view and scratch. The system ledger groups backing allocations by their actual owner and adds independent storage for pending wrappers, queues and pixel buffers. If two views point to one immutable snapshot, its backing appears once in the system sum. If publication copies the envelope for two subscribers, both copies appear. The proposed proof counts capacity at each simultaneous lifetime state; the measurement uses correlated timestamps to capture what actually happened.

For a sanity check, at the current maximum of 32 worlds, reserving 16 KiB of backing per world would alone reserve 512 KiB. The two RGB565 buffers for 320 × 320 pixels account for another 409,600 bytes. They have a different owner. Neither number is a proposed cap or an observed compositor heap peak. Break the design if its “hard bound” excludes the previous generation while a draw holds it, or if arbitrary producer-side work silently gets counted as bounded by a receiver limit.
