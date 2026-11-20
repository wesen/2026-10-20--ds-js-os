---
Title: Bounded screen snapshots and compiled layouts for the PicoCalc compositor
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:30:49.210549412-05:00
WhatFor: ""
WhenToUse: ""
---

# Bounded screen snapshots and compiled layouts for the PicoCalc compositor

This ticket is the research program for representation, partial evaluation, layout and painting on the PicoCalc. Its control is the qualified playable compositor. The native Chess painter now accepts counted PSIX snapshots, Snake uses semantic JSON and changed-cell paint, and the released Chess camera runs through completed SPI. Eight of the fourteen original roadmap tasks have reached a supported disposition. Six remain open at the broader scope of the original designs.

## Start here

1. [From producer to panel](design-doc/01-a-bounded-screen-renderer-from-producer-to-panel.md) introduces the running system, invariants, candidate APIs and implementation sequence.
2. [Lab phases and decision gates](design-doc/02-lab-phases-independent-studies-and-device-qualification.md) assigns the work, names controls and workloads, and says when an experiment should stop.
3. [Research families and promotion criteria](design-doc/03-research-families-primary-sources-and-promotion-criteria.md) organizes the literature by the four decisions.
4. [Independent Astra review](analysis/01-independent-astra-review.md) identifies the raw-message boundary, restart hazard, feedback loop in System measurements and the two different held-out tests.
5. [Sending a typed view program to the compositor](design-doc/04-sending-a-typed-view-program-to-the-compositor.md) extends P2 with Chess. It compares a resident view, a delivered module and source compiled on the receiving device, with measured host baselines.
6. [Department briefs and dispatch order](design-doc/05-department-briefs-for-bounded-rendering-and-typed-view-programs.md) is the handout for the director, Opus, Astra, the implementation researchers and the board operator. It scopes the first authorization and the evidence required for later studies.

See [tasks](tasks.md) for executable study milestones and [the director diary](reference/01-director-investigation-diary.md) for authorship, review decisions, and delivery evidence. Consult the [earlier physical incident](../PICOCALC-COMPOSITOR-FAULT--system-monitor-frame-faults-in-the-native-picocalc-compositor/index.md) for the original fault and verified correction.

## Remaining work by topic and approach

Each row below corresponds to one unchecked stable ID in [the original task list](tasks.md). The unit is the original program-wide deliverable. A positive result on a particular application or a negative isolated timing can settle an experiment without establishing the same behavior throughout the operating system.

| Topic and approach | Open task | What is already measured | Remaining experiment and completion test |
| --- | --- | --- | --- |
| Measurement infrastructure · instrument the entire event | **M0/M1** `whd8` | Frozen frame sequences reproduced 453 drawing-command observations and 44 held-out Editor images. An actual Chess cursor has a key-to-final-SPI trace. | Freeze matching System selection and Chess cursor blocks, run the same playable control twice across boots with tracing on/off, and reconcile per-stage CPU, wait, commits and SPI completion with observer overhead. [Independent replay](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/various/independent-host-replay.json) · [Actual control measurements](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/various/live-control.json) |
| Measurement infrastructure · bound all simultaneously live storage | **M2/M3** `01ax` | Keys and typed Editor have distinct holdout roles. Four publishers, a pinned draw and an incoming candidate reached six live slots. Token records plus encoded-byte caps allow 288 KiB in that host model. | Measure retained, candidate, queued and pinned storage by owner in the live system, including VM strings, framebuffer storage, concurrent subscribers and restart. Provide cap, boundary fixture and failure result per allocation class. [Retention model](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/various/retention.json) · [Frozen Editor outcomes](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/various/editor-pixels.json) |
| Representation · exercise admission at the real receiver | **R2** `fglw` | The host model rejects six classes and preserves A after a rejected update and restart. The actual Chess kernel/SDK checks authenticated source, both epochs, counted bytes and the last valid candidate. | Exercise generic widget schemas at real retention **before replacement**, at exactly each cap and one over. Run valid A, bad B, restart with producer idle, then valid C with the old generation pinned and competing publication; compare A/C pixels and producer-attributed rejection. [Generic executable model](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/scripts/16-retained-admission.cjs) · [Native Chess controls](../PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/analysis/03-transport.md) |
| Compiler and templates · price a deployed build | **T2/T3** `q63o` | Frozen source rules ran independently on Keys. The manual System representation won in isolated P4 stages and the automatic one lost. Host extraction cost 1.844 ms for System and 0.478 ms for Keys. Source assets and catalogs were counted. | Measure linked firmware delta and cold integrated build/installation, including catalog and dispatch glue, and replay an idle receiver from the real catalog plus retained values. Run matched live control/candidate only if advancing the manual or revised automatic treatment. [Size, timing and disposition](../PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/analysis/01-what-stays-on-the-other-side-of-a-system-screen.md) |
| Raster · compare clipped tiles to the fast full renderer | **D0/D1** `nxzv` | Snake ships cell repair. In 3D Chess, single-rectangle replay matched all 2,601 ordered scene pairs. Physical cursor-up took 3.29 ms against 17.89 ms for stock full; fast full under a different protocol took about 3.89 ms. | Instrument the generic draw and transferred areas on scroll, removal, overlays and app switch. If the ceiling merits it, compare clipped tile repair with the same fast full painter, identical predecessor and real framebuffer ownership. Test failed flush, restart and idle resynchronization. Report the cost of camera/full fallback. [Snake verification](../PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/analysis/03-snake-rendering-correctness.md) · [Chess damage and its limits](../PICOCALC-RASTER-PIE--measure-incremental-edges-and-pie-span-stores-on-the-picocalc-chess-raster/analysis/03-retained-chess-repaint.md) |
| Independent qualification · cross the surviving treatments | **P4** `hixo` | Editor's 44 host reference images matched. Four-app binary qualification compared 427 RGB565 frames, including Editor; representative native and QuickJS runs gave different rankings. Real Snake and Chess have separate application dispositions. | For promoted candidates, run control, X only, Y only and both on held-out typed Editor, with interaction cost and uncertainty. Check live 80 ms/768 KiB compositor limits, whole-device peak, key/focus progress, cold replay, rejection and SPI completion across boots. Publish a decision at that scope. [Binary results](../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/analysis/01-what-an-index-on-the-wire-buys-a-picocalc-renderer.md) · [Qualification design](design-doc/02-lab-phases-independent-studies-and-device-qualification.md) |

## Decisions supported by the completed studies

| Original task | Evidence and disposition |
| --- | --- |
| Owner decision | The owner authorized the initial multi-application program and researcher staffing, and one operator coordinated the hardware. [Authorization and direct request](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/reference/01-director-investigation-diary.md) |
| R0 · ownership design | A runnable single-lane design authenticates a publisher/epoch, validates privately, replaces the current generation, coalesces notifications, pins and releases a deferred draw, and handles teardown and replay. [Admission model](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/scripts/16-retained-admission.cjs) |
| R1 · bounded indexed JSON | Shared QuickJS scanner controls compared direct access and full materialization. The index lost to built-in parsing by 4.50–5.88× on three P4 workloads. Archive this reader for interactive use. [Reader results](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/analysis/01-what-a-bounded-screen-reader-retains.md) |
| R3 · counted comparison | The secondary encoding was PSIX v1. Four matched native producer/receiver comparisons and QuickJS controls exposed the cost of the access interface. Chess then exercised a counted kernel path; PSIX specialization separately measured writer costs. [Binary comparisons](../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/analysis/01-what-an-index-on-the-wire-buys-a-picocalc-renderer.md) · [Physical native handoff](../PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/analysis/04-device.md) · [Specialization results](../PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/analysis/01-compiling-the-screen-writer-on-a-handheld.md) |
| T0 · manual template | System compared generic full snapshots with complete versioned values plus a resident template across 100 states and matched physical stages. [System study](../PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/analysis/01-what-stays-on-the-other-side-of-a-system-screen.md) |
| T1 · automatic extraction | An Acorn pass identified closed constructor structure, residual values used the byte-factoring path, and unsupported cases used the generic result. The study counted fallback, preserved effects and reported only 19.95% recovery of the manual saving against generic System. Revise the automatic method. [Extractor and matched controls](../PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/analysis/01-what-stays-on-the-other-side-of-a-system-screen.md) |
| T4 · Chess program placement | Resident, delivered-module and on-device source installation ran the identical 8,641-byte Wasm view on the P4, around 17.0, 21.7 and 377.7 ms respectively. Later RV32 Chess demonstrates a separate complete app-to-panel implementation with pinned source and asynchronous installation. [Three-arm comparison](../PICOCALC-RENDER-CHESS--measuring-semantic-chess-screens-and-portable-typed-views/analysis/01-what-crosses-the-screen-boundary-when-a-chess-cursor-moves.md) · [RV32 integration](../PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/analysis/01-from-a-delivered-program-to-a-painted-chess-position.md) |
| L0/L1 · frame-local geometry | Bounded 96-entry cache trials counted 48 repeat hits in 192 Keys calls and zero on System, Snake, Chess and Editor. Even Keys had no lower host median. Defer broader geometry caching under the original opportunity gate. [Measured layout reuse](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/analysis/01-what-a-bounded-screen-reader-retains.md) |

## Results from the first five research groups

The [director’s research report](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/analysis/02-where-a-picocalc-should-build-its-screen.md) compares measured outcomes across both design documents and the separate binary study. The [binary format and application handoff](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/reference/03-how-application-researchers-can-evaluate-the-binary-screen-api.md) identifies which results transfer to System, Snake and Chess and how to measure the proposed integration.

## Deriving the binary producer from application types

The [PSIX specialization experiment](../PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/analysis/01-compiling-the-screen-writer-on-a-handheld.md) ran the existing compiler on the ESP32-P4 and compared generated Chess writers, compact layout tables and guarded packet copying. Its [research index](../PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/index.md) links the independent studies, physical controls and intern guide.

## Integrating the Snake result

The production [Snake integration](../PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/index.md) follows a complete game position through native publication, compositor validation, changed-cell painting and the display driver. Its independent correctness and device reports distinguish serialized size, CPU time and display transfer. The game uses semantic JSON.

## Delivering a Chess painter to the running compositor

The [mobile painter study](../PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/index.md) follows the app-sent Typed source, counted PSIX snapshots, runtime RV32 compilation, validated draw commands and physical display observations. It includes the compiler-service design and the differences between host and hardware verification.

The [three-dimensional Chess study](../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/index.md) extends the receiving compositor with validated triangles. A scalar reference and a separate [PIE lowering study](../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/index.md) let the lab distinguish geometry cost, instruction selection and actual presentation.

The [raster comparison](../PICOCALC-RASTER-PIE--measure-incremental-edges-and-pie-span-stores-on-the-picocalc-chess-raster/index.md) times stepped triangle edges, prevalidated spans, packed matte stores and retained damage on the ESP32-P4. The [playable camera guide](../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/design-doc/05-orbit-controls-and-solid-piece-models-in-the-native-chess-painter.md) takes the cheaper full redraw into a rotating Chess scene.
