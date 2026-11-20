---
Title: Research families, primary sources and promotion criteria
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:35:18.952997315-05:00
WhatFor: ""
WhenToUse: ""
---

# Four research questions and their algorithm families

A screen update has several representations during its lifetime. In a System Worlds update, the row names begin as fields in an app's state. The app encodes a table, the kernel publishes it, the compositor computes rectangles, and a driver transfers pixels. An optimization earns its place by identifying which representation, lifetime or traversal it changes. This rule lets the lab consult a broad literature while running a small number of decisive experiments.

## 1. How much of a snapshot has to become objects?

A token index stores the type and location of each value in an immutable JSON document. A field such as the label of a table column then occupies one input slice and one index entry. A caller-supplied token array is established practice in small systems. A scanner also needs to establish valid widget shapes and handle escaping and scalar conversion before a renderer can rely on that index. P1 compares an indexed renderer against the materializing control on identical input. Include token-heavy tiny values and a single long escaped string: they stress different budgets. [jsmn design and API](https://zserge.com/jsmn/)

Sequential on-demand traversal can spend less time converting fields the renderer never reads. Forward traversal can also spend more time seeking when measure and draw revisit a subtree. Record the fraction of fields touched and the number of repeated visits before adding that comparator. Definite-length CBOR provides explicit container counts and compact numeric encodings. Knowing a container's item count does not give the byte offset of its end for variable-length children. FlatBuffers offers another design point with relative offsets and schema-known field access. Choose one encoding comparator if text scanning is still costly, and time validation, producer construction and reader work together. Desktop parsing throughput is not a P4 estimate. [On-Demand JSON](https://arxiv.org/abs/2312.17149) · [RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html) · [FlatBuffers internals](https://flatbuffers.dev/internals/)

## 2. Which work can the compiler run once?

Partial evaluation specializes a program given the portion of its input known in advance. In this project a screen constructor has static inputs such as column headings and alignment, and dynamic inputs such as CPU measurements. A template can store the static portion in flash and prescribe how to read the complete dynamic values. If list length depends on state, the loop can remain in the residual program. A conditional with an unknown predicate can retain a tagged choice or use the generic path. Either way the compiler must preserve when and how often dynamic expressions run. [Jones, Gomard and Sestoft, *Partial Evaluation and Automatic Program Generation*](https://raspi.itu.dk/people/sestoft/pebook/pebook.html)

The hypothesis is that conservative extraction from ordinary UI constructors captures much of the advantage of an expert-written template. Start with a manual upper-bound comparison for the chosen representation, then freeze the extractor before testing a second constructor-based app. Charge generated flash, fallback sites and build cost. An entire compiler for a replacement UI language would answer a different question, and is deferred. A template must resolve by identity and version on a fresh compositor instance with no previous frame.

## 3. Which measurements survive another visit?

Available width and font metrics flow from parent to child. Wrapped text height flows back up and influences where subsequent children fit. These are dependencies: a cached height is valid only under the conditions that produced it. A fixed, frame-local geometry table removes redundant visits while keeping invalidation simple. Count actual repeated measurements before building it. For example, changing a font or column width can move every later row even if the strings are identical. [Android measure and layout](https://developer.android.com/guide/topics/ui/how-android-draws)

Incremental attribute evaluation studies how to update values on a tree after changes. It offers a principled route to cross-frame caching if frame-local reuse leaves an appreciable, repeatable cost. It also introduces persistent identity, invalidation and memory-eviction costs. Keep the first comparison within one frame. If repeated layout across frames proves costly, promote one bounded cache with exact dependency verification and an eviction policy; compare the extra time and storage against recomputation on an ordinary cursor update and a large rewrap. [Reps, Teitelbaum and Demers, *Incremental Context-Dependent Analysis for Language-Based Editors*](https://research.cs.wisc.edu/wpis/abstracts/toplas83.abs.html)

## 4. Which pixels need to be repainted?

A damage region is a conservative set of pixels whose final appearance may differ. A moving highlight dirties both its previous and its new rectangle. Removing a notification also exposes lower layers. Drawing only the new foreground object can leave stale pixels behind. Region protocols provide useful vocabulary for expressing a set of affected rectangles. The study must compare against PicoCalc's existing **full paint plus band-based difference**, with both arms using the same display driver. The CPU operation to avoid occurs upstream of the existing SPI optimization. [Khronos damage specification](https://registry.khronos.org/EGL/extensions/EXT/EGL_EXT_swap_buffers_with_damage.txt)

A fixed tile mask puts a known bound on the representation of damage. It does not bound the cost of discovering damage, maintaining previous geometry, or looking up objects in paint order. Charge all three. Compare one tile-mask candidate with full paint. Reserve spatial indices, exact rectangle unions and hardware acceleration for a demonstrated residual cost. A change in panel traffic is distinct from a change in CPU raster time.

## Promotion ledger

| Family | First comparison | Evidence that can open a reserve option | Stop condition |
|---|---|---|---|
| Representation | Object materialization vs bounded indexed JSON | Text syntax or unused converted fields dominate in stage traces | Budget proof fails, or admission loses the last valid screen |
| Specialization | Ordinary constructors vs manual and automatic templates | Repeated dynamic structure remains and manual extraction saves appreciable device work | Frozen rules have poor coverage or change effects on the holdout |
| Layout | Same full paint, repeated measure vs frame-local reuse | Stable measurements repeat across frames after the local pass | Checking and storing measurements costs as much as doing them |
| Damage | Full paint vs mask-guided clipped paint | Damage discovery or rasterization still dominates when output area is small | First incorrect pixel after any action, or full paint consistently wins |

An alternative may replace a candidate or serve as its diagnostic control. It does not get a new project by appearing in a paper. The survey memo is retained as a research artifact; the director's phase plan defines the comparators used on this device.
