---
Title: Astra mobile renderer review
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Standalone import-free Wasm producer with a fixed memory page
    - Path: repo://firmware/nucleus/native_wasm.c
      Note: Present whole-world loader and instruction meter
    - Path: repo://firmware/port/esp32p4/main/typed_p4.c
      Note: Synchronous on-device compiler, allocator and time budget
    - Path: repo://apps/typed/chess/view.typed
      Note: Derives legal destinations, status, footer and canvas geometry from app state
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-NEXT--bounded-screen-snapshots-and-compiled-layouts-for-the-picocalc-compositor/various/chess-screen-baseline.json
      Note: Desktop Wasm Chess SDK boundary bytes and commands
ExternalSources: []
Summary: Independent feasibility and experiment design for transferring a closed Chess renderer with complete semantic state.
LastUpdated: 2026-11-20T10:48:34.011123302-05:00
WhatFor: ""
WhenToUse: ""
---

# Can the compositor run a renderer supplied by Chess?

**Yes, as a proposed receiver-local invocation.** Chess can publish a portable drawing procedure once, then publish complete small views of the board. On a draw, the receiver can invoke its own isolated copy of that procedure with the current values. Its result is an app-body display list. The compositor still owns the framebuffer, places the app body, draws trusted chrome and decides what to flush. Chess keeps its private board, its legal-move machinery, and its own event loop.

My first mobile candidate is a **precompiled, import-free Wasm renderer**, compared with the same renderer already resident on the receiver and with today's full-tree producer. The standalone typed compiler in this checkout can already generate an import-free Wasm module with a single fixed page of linear memory. Build that small rendering function separately from the whole-world reactor. A receiver that verifies, budgets and calls a paint entry would be new work. Only if this arrangement pays for its warm execution and memory should the lab compare installation from source with installation of portable bytes. Treat these as arms inside P2. [Standalone compiler, `compile`](../../../../../../picocalc-os/compiler/typed-wasm.js) · [Whole-world linkage](../../../../../../picocalc-os/compiler/typed-world.js) · [Director's phase plan](../design-doc/02-lab-phases-independent-studies-and-device-qualification.md)

## The actual Chess boundary

Follow a white pawn from e2 to e4. Selecting e2 may expose two legal destinations. A cursor movement changes which square is outlined. Committing e2–e4 changes the pieces, the highlighted last move, and the status to “Black is thinking.” After the engine finishes, a new frame includes the response and may include completed depth, nodes and evaluation. Ordinary search continuations do not all publish a new screen. Treat keys, publications and displayed frames as different denominators. [Event and continuation handling](../../../../../../picocalc-os/worlds/chess/chess.typed) · [Current view](../../../../../../picocalc-os/worlds/chess/view.typed)

| Where the present renderer gets its information | What crosses the proposed boundary |
| --- | --- |
| The 0x88 board places visible squares at offsets `row*16+file`. `chessAppendTile` projects each piece onto its square. | 64 piece codes in agreed display order. The app translates its internal square numbering for highlighted positions. |
| `chessMarkDestinations` writes the 128-entry marking area starting at offset 768. It calls `chessLegalMoves`, which generates candidates, makes and unmakes moves, tests check, and writes scratch lists. | A complete 64-bit legal-destination mask. Chess computes it under its own budget, measured in every arm. An unselected piece has an empty mask. |
| `chessAppendStatus` chooses an outcome, promotion, search or invalid-move message before consulting `chessInCheck`. | A status enum selected by Chess using the same precedence. The descriptor can own the constant strings and palette. |
| Tile color depends on selection and last move, with the cursor separately outlined. The footer is visible on a last move, with statistics only after a completed search that has stopped. Hints change on promotion. | Cursor, optional selection, optional last-move endpoints, footer mode, optional depth/nodes/signed score and hint mode. Reset absent fields explicitly when serializing. |
| `chessRender` ends by calling the stateful `typedSdkScreen`. | The isolated function returns commands into bounded output storage. Only its host validates and submits the list. |

The existing `chessRender(board,state,out,hints)` would bring along move generation and mutable scratch if copied verbatim. Closing the procedure over immutable drawing constants and pure helper functions leaves a much smaller semantic interface. A “closure by value” requires the complete transitive code dependencies, versioned immutable captures and an input schema. A function pointer, world memory address, current SDK buffer, scheduler token or mutable game object has no meaning in this representation. The proposed cut is a manual testable boundary. Automatic extraction of that cut would be another claim. [Move legality](../../../../../../picocalc-os/worlds/chess/moves.typed) · [Position, check and undo](../../../../../../picocalc-os/worlds/chess/position.typed) · [Scratch conventions](../../../../../../picocalc-os/worlds/chess/search.typed)

The director's host Wasm receipt measured 4,835 tree bytes, 41 hint bytes and 146 canvas operations at launch. Selecting e2 produced 4,897, 41 and 148. The response after the 78th wake produced 4,944, 41 and 146. These are calls at the typed SDK screen boundary, prior to mailbox wrapping and rasterization. The portable renderer's size, instruction count, output storage and execution latency still require measurement. The first 64 one-byte piece codes and eight mask bytes are a **layout illustration**, excluding all other slots, framing and validation. [Host screen receipt](../various/chess-screen-baseline.json)

## What “send a function” could mean

| Design | Where computation happens and comparison it enables |
| --- | --- |
| Resident renderer ID | Both ends know the renderer before the app starts. A semantic publication names it and carries complete values. This is the strongest simple control. A hand-coded native renderer also measures an implementation ceiling, but mixes language/backend differences into an end-to-end result. |
| By-value program and captures | The app supplies code plus immutable data once. The receiver validates, owns and pins the descriptor. Thereafter a locally invoked procedure takes the complete copied state on each draw. Replaying the tuple after resetting or relocating the instance must produce the same bytes. This is the general contract to test. |
| Precompiled portable module | Carry a small verified Wasm body for that contract. Install once through a counted-byte channel. For the decisive control, preinstall the **identical Wasm artifact** in the same runner and feed identical state. This isolates dynamic registration from interpretation, language choice and pixel work. |
| Receiver-initiated source compilation | Ship closed typed source fixing a particular paint ABI. A capped compiler job emits the same Wasm profile, and a separate loader validates it. Charge source transport, compile, verification and first usable frame. Warm code and semantic data can be identical to the precompiled arm. |
| RPC to the owner | The compositor asks Chess to generate geometry or a list. Chess executes in its own world, with its normal scheduling, memory and authority. This adds message/reply costs and dependence on a runnable owner. A new receiver cannot reconstruct a previously published frame from an unanswered RPC. If explored, retain a complete independently replayable result for recovery. |
| Downloadable display program | A small program over validated data loads, bounded repetition, conditions and a limited command vocabulary can express the 64 squares. This is executable specialization within P2. A predeclared template with no downloaded program tests a weaker representation. Keep the restricted display language in reserve if the measured Wasm working set makes Wasm untenable and a resident-only renderer lacks required extensibility. |

A generic `u-*` world has its own authority and lifecycle. Its program currently enters through the ordinary world ABI. Pointing a compositor callback at the producer's RV32 machine address would make its meaning depend on lifetime, address space, runtime context and privilege. The normal P4 ELF loader resolves firmware symbols and invokes trusted code with the calling world's context. Its elapsed-time check occurs after the function returns. The public storage spawn path accepts JavaScript or Wasm and excludes native machine code. These mechanisms do not provide a privileged service with a meter and a safe arbitrary callback entry. [Storage spawn and epochs](../../../../../../picocalc-os/nucleus/kernel.c) · [P4 ELF implementation](../../../../../../picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c)

## Install once, replay without Chess

```text
      descriptor bytes + ABI + immutable captures        complete view state
Chess ─────────────────────────► admission store ◄──────────────────── Chess
                                     |
                   retain {publisher epoch, descriptor, state generation}
                                     |
                               compositor draw
                                     |
                         metered local paint instance
                                     |
                         validate staged app-body list
                                     |
                      trusted paint, commit, display flush
```

The following is a **proposed interface**, including a counted-byte path. Existing native message dispatch obtains lengths with `strlen`. A binary payload needs explicit lengths throughout publication, queueing and replay, or a managed immutable blob handle with a specified lifetime; a raw module cannot be inserted into the JSON string API. An experiment that encodes bytes inside text must include the size, copy and decode cost of the envelope. [Native delivery](../../../../../../picocalc-os/nucleus/native.c)

```text
register(sender, publisher_epoch, source_or_module, ABI, capture_bytes):
    reserve bounded staging and admission budget for this owner
    validate package and installed representation, no app code on the UI lane
    publish a durable descriptor reference only on success

publishView(sender, epoch, descriptor, sequence, all_values):
    authenticate owner, match ABI and schema, check lengths, validate spans
    reserve state and a pin on the verified descriptor
    atomically install a complete recoverable generation under this owner

draw(generation, geometry, font_profile):
    use a clean instance with an instruction limit and private bounded memory
    invoke paint(state_copy, immutable_captures, geometry, private_output)
    validate the completed operation list and its total raster cost
    paint into the permitted app-body region, composite trusted overlays
```

Admission and first successful execution are separate events. A valid Wasm module can still exhaust fuel or produce invalid output for a particular state. To guarantee the last **drawable** generation across a restart, retain the previous drawable tuple (or bounded validated list) until the replacement has rendered successfully. A cold replay of the accepted generation needs the verified descriptor and every immutable dependency, complete semantic state, and the schema/font/geometry contract. A RAM-only cache surviving neither receiver reset nor eviction cannot be the authority. Pin descriptors reachable from current, fallback and in-flight generations. Release them when the last reference disappears, honor publisher teardown, and guard against late completion from a dead epoch. A same-name app after a restart must acquire a new owner generation. Count the peak where old/new code, states, in-flight output and compile or verify scratch coexist. [Present retained replay order](../../../../../../picocalc-os/nucleus/kernel.c)

A portable rendering instance needs a bounded module byte count, validation complexity, fixed private linear memory, call-stack and instruction budgets, explicit allowed imports and a defined reset policy. The proposed paint profile has **no host imports**; copy input and extract a staged result via the host-owned memory interface. Keep host entry limited to the declared paint signature even if the compiler exports internal helpers. Restrict initialization and verify the module before instantiation or running its start code. Treat exception, timeout, unavailable descriptor or malformed output as an owner-specific rejection. Exact color, font, primitive and geometry validation includes aggregate raster cost: one command asking for enormous work can exhaust the draw budget after a cheap Wasm return. Validate the list before it touches shared pixels. Clip host-side to the app's allotted region, preserve trusted title/hints ownership and test overlay removal or flush failure using the existing panel oracle.

## Receiver compilation and actual device budgets

Three functions give the intern a concrete starting point.

- `typedWasm.compile(source)` passes an empty import list, emits a module with one 64 KiB linear-memory page as both minimum and maximum, exports functions and memory, and emits their bodies. Its convenience `invoke` handles scalar arguments. A counted record/buffer ABI for paint and its output requires an embedding that initializes the memory explicitly. The full-world compiler instead expects reactor-linked `typedWorldMeta` and `typedWorldEvent`. [Compiler entry](../../../../../../picocalc-os/compiler/typed-wasm.js) · [World linker](../../../../../../picocalc-os/compiler/typed-world.js)
- `wasm_load` copies the module and checks its imports against the linked world functions, including a general nucleus syscall interface. It creates an instance and expects `nw_wasm_init`, `nw_wasm_buffer` and `nw_wasm_event`. The existing event path sets WAMR instruction fuel and checks wall time. Its memory counter estimates pages plus a 16 KiB stack. A paint-specific loader would reject imports, validate the new ABI, cap the entire loader/instance/output cost and attribute it to the publisher. One fixed page per *resident instance* can consume the available working set quickly; test one reusable active instance with immutable descriptors retained separately. Reset mutable linear memory and any permitted globals between calls and charge that cost. [WAMR world backend](../../../../../../picocalc-os/nucleus/native_wasm.c)
- On the P4, reading the specially named bundled Chess image calls `p4_chess_compile`. It reads source and the reactor, constructs a QuickJS runtime with a bounded allocator and deadline, evaluates compiler files, synchronously calls the linker, then copies the result into a separate allocation. Chess configures 4 MiB of compiler heap and a six-second deadline. The historical whole-world RV32 receipt is 40,767 source bytes, 1,897,746 µs compile time, 1,298,116 peak QuickJS bytes and 240,452 linked module bytes. Compiler heap excludes, for example, the final copied module and kernel source backing. The figures do not estimate a standalone paint module or establish that an interactive compiler service is scheduled cooperatively. [P4 file hook](../../../../../../picocalc-os/port/esp32p4/main/port_p4.c) · [Chess compiler configuration](../../../../../../picocalc-os/port/esp32p4/main/chess_p4.c) · [Compilation path](../../../../../../picocalc-os/port/esp32p4/main/typed_p4.c) · [Whole-world physical receipt](../../PICOCALC-TYPED-CHESS--a-playable-typed-chess-engine-and-a-repeatable-picocalc-compiler-workload/various/physical-rv32.json)

If source is tried, compile at explicit install/update time or in a separately budgeted service with a demonstrated ability to leave input and display service responsive. A dedicated world alone does not preempt a long synchronous compiler call on the shared lane. Measure worst keyboard/clock/display delay while compiling. Cap concurrent jobs, bytes per owner and aggregate live storage; deduplicate equal in-flight installations and preserve the last drawable view on compilation error. Include compiler build, emitter options, target, ABI, state schema, static captures and relevant rendering dependencies in the cache identity. Persist the verified result or an independently available source and validated path to rebuild. Declare a cold miss separately from a receiver restart with a verification/cache hit.

## One P2 decision, with a stop rule

1. **Freeze the inputs.** Use the existing Chess hosts' e2–e4 sequence, selection clear, capture, castling, en passant, promotion/cancel, finished-search footer, mate and stalemate. Include the inactive-producer/restarted-compositor case. Extract complete view records without changing gameplay. Check independent full-frame RGB565 output, simulated panel and game effects for every arm. Exercise one unknown descriptor, failed install, rejected state and failed invocation followed by a good one. Use an existing ordinary tree and cold-start display as fallback during research.
2. **Isolate semantic separation.** Compare the current full tree against the resident preinstalled procedure consuming the complete semantic state. Keep move legality and status calculation in Chess for both. Measure producer CPU, kernel wire and copies, coalesced frames, layout, raster, commit and final SPI. Also run the generic expanded operation list through the same final rasterizer. Stop if moving the cut produces no material end-to-end benefit and no worthwhile headroom or extensibility result.
3. **Isolate mobility.** Run the **same module bytes** in the same pure runner, first preinstalled, then installed dynamically once. Keep the same state and command ABI. Record module/capture bytes, translation and validation, peak memory of loader/instance and warm invocation; distinguish code storage from an instantiated page. Require exact pixels, bounded work, replay and recovery, and measure stalled work in other worlds. If registration overhead, page footprint or reset/validation cost outweighs the intended benefit, keep the resident representation.
4. **Isolate local compilation only after the portable arm qualifies.** Compile the same closed source once on the receiver and compare resultant module identity or semantic equivalence, installation peaks and UI stalls against the precompiled arm. Evaluate a changed renderer and a cache hit. A content hash addresses identity, while independent verification controls which code may run.
5. **Compare whole lifetimes.** If the extra one-time cost is `I` and the measured saving per delivered/presented update under the fixed trace mix is `S>0`, break-even for a strictly positive net benefit is the smallest integer `N` with `N*S>I`. Keep units matched. Use separate inequalities for byte traffic and time. With coalescing, use `publish_count × measured publication saving + draw_count × measured draw saving` and compare against the one-time charge. Include misses and reinstalls; reject amortization claims for sessions shorter than the observed threshold. A warm source-compiled module identical to a precompiled one has no inherent per-draw saving over that precompiled arm. Its case rests on install/update flexibility or avoided transport and storage costs.
6. **Preserve the existing staffing.** One representation/compiler researcher owns the new P2 arm, the existing independent experimentalist freezes state and runs paired traces, and the existing board operator qualifies it after authorization. Neither hold-out (Keys for extraction or typed Editor for consumer generalization) is needed to tune the Chess cut. Stop upon pixel discrepancy, escaped clip, stale descriptor, bad recovery, unbounded host raster work, failure to isolate execution, or quota/latency failure. Record the result at the tested compiler, loader and firmware revisions.

Three precedents shape this decision. NeWS clients could send executable PostScript to a display server. CSS Paint defines a host-invoked paint callback with selected properties, size, arguments and a restricted drawing surface. Android RemoteViews offers a contrasting restricted host-rendered hierarchy that may be reconstructed later. These establish that mobility and resident descriptions are distinct design choices. The handheld research question is what their registration, restart, memory and per-update costs are **for this Chess cut on this device**. [Sun NeWS programmer's guide](https://www.bitsavers.org/pdf/sun/NeWS/800-2379-10_NeWS_2.0_Programmers_Guide_Aug89.pdf) · [W3C CSS Painting API](https://www.w3.org/TR/css-paint-api-1/) · [Android RemoteViews](https://developer.android.com/reference/android/widget/RemoteViews)
