---
Title: Bounded runtime specialization for PSIX screen shapes
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/runtime/01-observed-shapes.js
      Note: Shape compiler, complete guard, bounded cache and writer
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/runtime/02-replay.js
      Note: Control arms and exact packet comparison
ExternalSources: []
Summary: A host prototype compiles guarded structural plans and compares them with a fixed prefix-trained bank and the original PSIX v1 encoder.
LastUpdated: 2026-11-20T12:18:00-05:00
WhatFor: Specify validation, cache lifetime and cost boundaries for observed PSIX writer specialization.
WhenToUse: When deciding whether a recurring screen layout can justify a guarded runtime writer.
---

# Bounded runtime specialization for PSIX screen shapes

The existing PSIX writer walks a complete JavaScript screen, collects a sorted table of its distinct strings, then emits the screen as records. On the World's tab in System, a selection moves through a table and a graph while many of the JavaScript objects keep the same fields. A specialized writer can reuse work on those fields if it verifies that the next screen has the same shape. The specialized writer still reads the current selection, graph samples, title and every other scalar.

This experiment builds such a writer over the existing PSIX v1 contract. It keeps the original encoder as both the comparison arm and the fallback. The comparison separates prefix-trained plans from plans installed during ordinary encoding. Both use the same compiler, guard and writer. Their distinction is when observed evidence becomes available. The separate typed compiler experiment starts from declarations, which may supply invariants without observation. [Original indexed format](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/design-doc/01-a-binary-snapshot-with-direct-indexed-access.md) · [Runtime prototype](../scripts/runtime/01-observed-shapes.js)

## What the plan remembers

A shape records the container kind and size, the exact ordered enumerable own keys of each object, and the encoding class of each scalar. These classes are null, Boolean, string, inline integer and finite float. PSIX uses an inline signed 20-bit slot for integers in `[-524288, 524287]`. It writes other finite numbers in an eight-byte body record. In particular, `[1, 2.5, false]` and `[2, 3.5, true]` share a shape. Changing the first value to `524288` requires a different layout because the first value now needs a body record. Reordering the enumerable keys also causes a miss under the chosen guard. The generic writer's canonical output for reordered keys can still be identical.

The compiler traverses the observed input once. It records a preorder program and static key UTF-8 bytes. For each node, the program holds the tag, the position of its reference and the offset of any record within the binary body. For an object it also holds key indexes in incoming order and the permutation that emits them in lexicographic UTF-8 order. The program holds primitive field names and layout information. Its separately allocated integer program and key byte buffers own no object from the input frame.

The wire starts with a dictionary of all field names and string values. Its size changes when strings change. Its lexicographic order assigns string IDs for this packet. The compiler therefore uses offsets **relative to the body** and local key indexes. During emission the writer converts local indexes to current packet IDs and adds the current body start to relative offsets. A changing title may alter IDs for keys anywhere in the packet. [Binding analysis and worked packet](../analysis/04-staging-and-binding.md)

## Encoding a frame

1. Read the length of `frame.tree.kids` as a coarse discriminator, with a separate value for payloads without that array. A candidate with the same discriminator can have a different root or deeply nested shape.
2. Within that route, test at most four plans. The guard checks the complete layout while gathering current scalars in the order required by the writer. Array length, key count and key order are checked before advancing through child slots. Finite float validation occurs here.
3. On a hit, construct the current dictionary using the cached field-name bytes and the live string values. Check the PSIX string and total packet limits. Emit a fresh buffer using the plan, the dictionary and the collected scalars.
4. If every guard fails or the writer declines a dynamic bound, call the original encoder. In the adaptive arm, a successful generic encoding after a shape miss permits an attempted compile and installation. A budget or shape limit can decline plan construction. A generic exception propagates before any compile on that miss. The next frame can use the new plan. A dynamic writer rejection uses fallback without installing another copy of the same shape.

The input contract is an inert JSON-materialized value, including the parsed application traces used here. Synchronous traversal gives the guard and writer a consistent view. Objects with getters, proxies, host objects or other effects would require an explicit input boundary before applying this shortcut. Even a correct plan is never a substitute for decoder admission when a PSIX packet is delivered. [Replay and edge cases](../scripts/runtime/02-replay.js)

## Three policies on one wire format

| Policy | Evidence available before a timed suffix | Behavior after a shape miss |
| --- | --- | --- |
| Generic | None | Encode with the original PSIX code |
| Fixed prefix bank | Exact shapes of the training prefix, ranked by frequency | Encode generically |
| Adaptive cold | Empty plan cache | Encode generically and attempt to compile |
| Adaptive prefix | An adaptive traversal of the chronological prefix | Encode generically and attempt to compile |

In the offline arm, a tie goes to the plan first encountered. The evaluated bank and the adaptive cache share the same limits. The prototype caps normal retention at eight entries, 98,304 charged bytes in total, 49,152 charged bytes per plan and four entries per route. Adaptive replacement removes the least recently used entry on a full route and then the least recently used entries overall until the new plan fits. The retained-size charge includes the integer program, UTF-16 key lengths, key bytes and fixed accounting for the plan and key entries. It is a portable ledger rather than a bound on the JavaScript allocator. Temporary compiler structures, JS heap overhead and the cache object are additional costs. The fresh-process host meter measured 323,712 additional live bytes after holding the encoder and its cache through GC, compared with releasing the encoder after the same sequence. Its final logical charge was 33,559 bytes. A hard device heap budget would need a packed arena or cooperation from the allocator.

Offline training keeps one plan for each observed distinct shape it can compile in the finite prefix. Its temporary working set can exceed the installed bank. A production workflow could train off-device or enforce a separate training-memory policy. Online capacity bounds retention and candidate count. An adaptive miss can still perform a compilation on every frame. The churn control deliberately tests that cost.

## Qualifying the design

Train on the first 55 System frames and evaluate frames 56–100 in order. The suffix includes refreshes, selection changes, unrelated-state updates, title changes and tab switches. Use separate chronological prefixes for Chess, Snake and Editor, plus a round-robin mixed suffix. Evaluate the Keys screen with the System prefix as an independent transfer trial. The underlying fixtures are outputs from production screen logic replayed with deterministic state and actions. They contain app transitions and rendered tree data. Pixel-send timing records from the physical device do not carry equivalent payloads.

Compare every result with the unchanged encoder byte for byte. Probe ordered-key changes, inline integer boundaries, runtime string collisions, non-ASCII key ordering, invalid UTF-16, string limits, packet limits and refused plan budgets. The positive control preserves one structural layout with changing values. The churn control cycles through twelve layouts routed to the same discriminator. Vary the number of cache entries while holding the route limit and byte budget fixed.

The timed window begins with the input payload already available and ends after a complete PSIX buffer is returned. Count dispatch, guards, dynamic dictionaries, all fallback work and adaptive compilation. Time fixed training and adaptive prefix setup separately. Repeat the streams on V8 and the vendored QuickJS engine on the host with rotated arm order. The production compiler's companion board harness also ran a smaller version of the same study on the ESP32-P4. Both clocks cover the complete encoder call. Transport, decoding and event-to-LCD latency are outside the producer boundary. [Run and measurement controls](../scripts/runtime/README.md)

## Integration implications

An encoder exposed at a trusted internal screen boundary could accept a declared schema or a shape plan. A declared schema can bind object access from the program contract. A shape observed at runtime requires its guard even if it succeeded repeatedly. The two routes may share offset and dictionary-writing primitives. A useful implementation seam is the transition from a checked body layout to current packet binding. This seam leaves version checks, receiving-side bounds and application semantics at their existing boundaries.

The choice to admit every successful shape miss intentionally exposes worst-case churn. A follow-on can test repeated-observation admission, caps on compile work per session, route signals already provided by a producer or compiler-generated tags on trusted values. Those changes affect cost and evidence and need independent comparison. In particular, a recovered hit rate must still repay guards, dynamic dictionary binding and memory on the deployment engine. The host experiment supplies a reference and a counterexample before any integration decision.
