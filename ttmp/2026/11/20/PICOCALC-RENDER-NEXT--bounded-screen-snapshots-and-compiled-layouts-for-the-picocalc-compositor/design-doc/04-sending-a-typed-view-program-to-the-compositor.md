---
Title: Sending a typed view program to the compositor
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Standalone compiler and private memory
    - Path: repo://picocalc-os/nucleus/native_wasm.c
      Note: Existing WAMR world admission and execution
    - Path: repo://picocalc-os/port/esp32p4/main/typed_p4.c
      Note: Current synchronous compilation lifecycle
    - Path: repo://picocalc-os/worlds/chess/view.typed
      Note: Effectful current producer and pure view helpers
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:47:03.510097167-05:00
WhatFor: ""
WhenToUse: ""
---

# Sending a typed view program to the compositor

A Chess cursor moves one square. The app already knows the position, the pieces and the selection. Today it spells out the coordinates, colors and drawing operations for the entire board again. Suppose Chess could instead supply a function once, then publish a small complete position each time. A receiving renderer could reconstruct the same picture while Chess slept. The compiler question is where to divide that function from its environment, and how much repeated work disappears after paying for the division.

**Recommendation.** Extend P2 with one Chess experiment. First establish what semantic updates buy using a resident renderer. Then compare delivery of a portable module with delivery of typed source compiled once on the receiving device. Both delivery arms must reach the same runner and render the same complete state. Receiver-side source is a good authoring interface for edited apps. Its practical value depends on installation latency, cache lifetime and first-interaction responsiveness on the P4.

## What actually crosses the boundary today?

The screen bus in this study is the OS message channel. The display driver uses a separate SPI bus for pixels. Removing a kilobyte from a world message can remove copying, allocation and decoding. It does not directly remove a kilobyte of LCD traffic. Both arms produce the same pixels and use the same existing band comparison and display driver.

In Chess, `chessRender` writes a JSON tree with a heading, a canvas and an optional footer. It loops over 64 squares. `chessAppendTile` formats integers and strings for commands such as fills and text. The shared SDK converts the typed buffer to a screen message. On the receiving side the compositor decodes the tree and interprets the canvas operations while painting its own window chrome. [Chess view](../../../../../../picocalc-os/worlds/chess/view.typed) · [Typed SDK](../../../../../../picocalc-os/sdk/typed/world.c) · [Canvas painter](../../../../../../picocalc-os/js/system/compositor.js)

I ran the existing Chess program through the host Wasm backend, intercepted the SDK’s SCREEN call and counted its UTF-8 spans. The six rows describe one deterministic opening exchange. Each produced an additional 41 bytes of hints. These counts stop before the sender envelope, queue copies, compositor or SPI. They give a reproducible producer baseline and make no timing claim. [Measurement script](../scripts/08-measure-chess-screen.mjs) · [Exact counts and hashes](../various/chess-screen-baseline.json)

| Input or event | JSON tree bytes | Canvas operations |
|---|---:|---:|
| Launch at the starting position | 4,835 | 146 |
| Select e2 | 4,897 | 148 |
| Move cursor to e3 | 4,897 | 148 |
| Move cursor to e4 | 4,897 | 148 |
| Play e2–e4 | 4,913 | 146 |
| Engine reply after wake 78 | 4,944 | 146 |

## Which Chess code can travel?

A **closed function** gets everything it needs from its arguments, local computation and explicitly supplied immutable constants. A **closure** also carries the environment for names that it uses from outside its definition. Turning a procedure and its free variables into code and an explicit environment is called *closure conversion*. Mobility adds another decision. A captured reference might point into the original world’s heap. Copying its numerical address into the compositor does not copy its meaning. Here the environment is a bounded value snapshot owned by the receiver. [Shao and Appel, closure conversion](https://www.classes.cs.uchicago.edu/archive/2011/spring/22620-1/papers/closure-conversion.pdf) · [Cardelli, distributed lexical scope](https://www.classes.cs.uchicago.edu/archive/2007/spring/32102-1/papers/p286-cardelli.pdf)

Consider two actual functions. `chessPieceGlyph(piece)` returns a character code using arithmetic and constants. It is already closed. `chessRender(board, state, out, hints)` calls `chessMarkDestinations`, which runs legal move generation and writes markers back into board scratch. `chessAppendStatus` can call check detection. Finally the renderer invokes the screen syscall. Taking the transitive callees of this function would import game policy, writes and a system effect. Even a perfectly relocatable executable would preserve those unwanted dependencies. [View functions](../../../../../../picocalc-os/worlds/chess/view.typed) · [Move generation](../../../../../../picocalc-os/worlds/chess/moves.typed) · [World state](../../../../../../picocalc-os/worlds/chess/state.typed)

The proposed cut keeps move legality, the search, timers, outcome determination and transient search positions in Chess. At a publication boundary Chess copies **the visible position**, plus the decisions needed to display it. Piece glyphs, square colors, marker placement and text for a status enum can live in the view program. For example, an engine temporarily testing a position during a search must never accidentally publish that scratch position.

```text
Chess world                    retained by the kernel        receiver
legal position, search
       |
       +-- make visible state ----> (program ID, ABI,          read complete values
                                     schema, state)             |
app offers view source once                                     v
       +-------------------> install and compile ---------> isolated view program
                              validate and pin                 |
                                                              v
                                                     bounded drawing output
                                                              |
                                            compositor clips and adds chrome
```

A first design can make its prospective data size explicit. The following is a proposed packed **schema**, with a fixed byte order, a square mapping from the app’s 0x88 board indices to 0–63 and an absent-square sentinel. It covers the current view’s finite set of statuses and hints. A new free-text status would require a schema revision or a length-limited text field.

| Proposed input | Bytes | Meaning |
|---|---:|---|
| 64 one-byte pieces | 64 | Piece and side for each visible square in rank/file order |
| Legal destinations | 8 | One bit per square for the selected piece |
| Cursor, selection, last move from/to | 4 | Explicit absent-square encoding |
| Status, hint variant, footer mode, reserved | 4 | Preserves precedence of promotion, thinking, terminal result and notice, plus whether search statistics appear |
| Completed depth, nodes, signed score | 12 | Three 32-bit integers |
| **Total state** | **92** | Excludes program ID, generation, schema tag, message framing and installation |

The e4 cursor update carries 4,938 measured tree-and-hint bytes. The proposed 92-byte field layout is about 98.1% smaller at the application-body boundary. That percentage compares a **model** to a measured body. A binary-safe transport, actual headers, deduplication, packing cost and a reader remain to be measured. A JSON encoding of those same fields can test semantics on the existing transport first. The complete state must be correct even if every earlier update is dropped. The typed language’s current buffer primitives address UTF-16 code units; the compact byte counts assume a deliberate packing or transcoding boundary. Record both logical fields and actual wire bytes.

## What does “call Chess code” mean?

| Mechanism | Who executes and what must stay alive? | Use in this study |
|---|---|---|
| Ask Chess to render on demand | A message wakes the live owner, which reads its current state and sends a response. | Changes scheduling and replay semantics. A stopped Chess world cannot fulfill a repaint request. |
| Refer to an installed renderer by ID | The receiver owns code and a copy of the state. | Cheapest control for measuring the value of semantic updates. Requires a renderer already known to the image. |
| Send portable compiled bytes once | The receiver admits a closed module and invokes it on successive value copies. | First mobile-code comparison. Measures module transfer, validation, installation and cache hits. |
| Send typed source once | The receiver arranges compilation, validates the output and caches the same class of module. | Proposed author workflow. Measure the incremental cost and convenience of installing an edited renderer on the device. |
| Pass a native address in Chess’s running image | The address, module lifetime, machine ABI, globals and caller authority are coupled. | Cannot implement retained independent repaint by itself. A native trusted-path study would require separate evidence for a durable module and an enforceable execution boundary. |

“Relocatable” describes how code can be loaded at different addresses. A renderer additionally needs portable data layout, stable operations, a known calling convention, bounded execution and the right to draw only the app’s content. Typed source solves the address issue by recompiling. It does not itself establish any of those other properties.

## A receiver-side compiler with a small interface

The existing standalone `typedWasm.compile(source)` is an unusually close starting point. It compiles functions without imports, exports named functions and one linear memory, and emits a fixed one-page minimum and maximum. I took the existing source text of `chessPieceGlyph`, compiled it twice, loaded the first result into an empty-import host instance, and checked all 12 piece labels. The 339-byte source produced 156 bytes of Wasm, a 65,536-byte linear memory and the expected `PNBRQKpnbrqk`. The second compilation produced identical bytes. This validates one real leaf function under Node. The full view, metering and device installation remain experimental. [Standalone compiler](../../../../../../picocalc-os/compiler/typed-wasm.js) · [Probe](../scripts/09-probe-standalone-view-function.mjs) · [Host receipt](../various/standalone-glyph-host.json)

The P4 already compiles *whole worlds*. `p4_typed_compile` runs a synchronous QuickJS invocation, loads compiler files and a world reactor, and copies module bytes out. The Chess entry supplies a 4 MiB compiler heap limit and six-second deadline. An earlier board run compiled 40,767 source bytes in 1,897,746 µs with 1,298,116 peak compiler JS bytes. Those figures describe a complete RV32 Chess build, not the proposed view function. They establish why installation and painting require separate measurements. The existing WAMR backend expects world lifecycle exports and provides a world syscall interface. A standalone rendering module needs its own narrow invocation profile. [P4 compiler](../../../../../../picocalc-os/port/esp32p4/main/typed_p4.c) · [Chess entry](../../../../../../picocalc-os/port/esp32p4/main/chess_p4.c) · [Prior physical receipt](../../PICOCALC-TYPED-CHESS--a-playable-typed-chess-engine-and-a-repeatable-picocalc-compiler-workload/various/physical-rv32.json) · [WAMR integration](../../../../../../picocalc-os/nucleus/native_wasm.c)

**Proposed API.** The app offers source on install or edit. The receiver coordinates an installation job. The job bounds source size, compiler memory, work and output size. It keys the artifact by source content, compiler identity/options, target profile and renderer ABI. It validates admitted modules regardless of their origin. Each update supplies complete values by copy and references a known renderer. The temporary module instance runs without world syscalls or display handles.

```text
install(program_source, state_schema, render_abi) -> pending ticket
installed(ticket) -> immutable program ID or diagnostic
publish(program ID, schema, publisher generation, complete state) -> accepted | rejected

receive update:
    authenticate publisher and check schema, program availability and capacity
    evaluate view on a fresh logical instance with bounded state and scratch
    validate the complete private result for this state before exposing any pixels
    atomically retain the accepted program reference and state
    schedule compositor repaint; release the old generation after its last reader

paint:
    get or reconstruct the accepted drawing result
    apply clipped primitives inside the application content rectangle
    paint compositor-owned chrome and use the normal commit/flush path
```

The output could be bounded primitive records plus a counted text span. One possible Wasm ABI uses a `render(inputOffset, inputBytes, outputOffset, outputCapacity) -> writtenBytes` export. All offsets refer to the instance’s private page. The host checks lengths, operation kinds, coordinates, text bounds and a raster work budget before applying any commands. Oversized clipped lines, huge text and repeated overlapping fills can consume real host CPU even if a guest uses few instructions. Source types and guest fuel do not pay that bill. Restore the same initial memory state each time or prove which scratch is always initialized. Include wiping, copying, validating, buffering and any second execution on recovery in the comparison. [WebAssembly validation, imports and invocation](https://www.w3.org/TR/wasm-core/)

A previously admitted module may still fail on a new state. Keep the last-good pair until the candidate state and its output pass. Bind a retained state to its exact installed program and ABI. Pin the program while any durable snapshot or in-flight paint uses it. If the compositor restarts and Chess stays idle, replay resolves the retained pair. If firmware changes the ABI, retain a compatible known-good path or regenerate from a retained, validated source/state pair under explicit budgets before adoption. A missing or incompatible ID is a diagnostic; the previous good view survives. Content hashes identify artifacts, while sender identity and policy authorize installation. A physical display restart also needs the existing panel invalidation and flush repair.

**Scheduling is a design choice.** Submitting an asynchronous message to a worker on the same cooperative lane does not make synchronous compilation preemptible. Begin with explicit installation outside an interactive turn, e.g. during an app edit/install workflow. Qualifying interactive background installation requires a schedulable job with cancelation and measured interference with input/display work, or a compiler that yields between bounded steps. Measure first correct frame after editing and worst unrelated input delay while compilation is active. A cached warm frame cannot answer either question.

## The experiment that separates the two benefits

Use the same frozen positions and action sequence. Hold drawing primitives, style, clipping, band comparison, driver, target runtime, and semantic state schema fixed where applicable.

1. **G, generic screen.** Current Chess builds the complete tree and the compositor draws it. Measure encode, copy, decode, raster and flush separately.
2. **R, resident view.** Install a vetted renderer in the image and feed it the 92-byte proposed state or a measured equivalent. Prefer the same Wasm program and runner as the mobile arms. G versus R measures the benefit of moving presentation across the boundary. Include producer-side legal marker computation in both.
3. **M, delivered module.** Transfer the exact bytes used by R once and install them. Use the same warm update path. R versus M isolates installation and distribution.
4. **S, delivered typed source.** Compile on the receiving device and send the result through M’s admission path. Compare emitted bytes or explain any nondeterminism. M versus S isolates delivery format, compilation and first-use latency. For typed local edits record edit-to-first-correct-frame and ability to run without a host build.

A bounded manual template with the same repeated row/square shape is the existing P2 alternative. Try it as a comparator before attributing a win to arbitrary executable logic. A packed program may still generate many primitive records on every update. Eliding JSON on the bus can simply move a large intermediate allocation to the receiver.

Let C be extra one-time installation cost for a candidate relative to its control. Let S be net time saved per *actual update* in the chosen workload including all changed stages. When both are positive and stable, the first strictly faster total occurs after floor(C / S) + 1 updates. For a cache miss after an edit, charge C again. A break-even calculation for bytes uses transferred bytes in both numerator and denominator. If source and precompiled bytes lead to identical warm behavior, there is **no warm advantage of source over bytes to amortize**. Their difference is installation cost, deployability and ability to compile a local edit. When rates differ, compare installation cost against the number of publications times their measured per-publication saving plus the number of draws times their per-draw saving. A hidden app, a coalesced queue and an exposed screen can give very different counts.

**Conditions for moving forward.** Require equal pixels and equivalent hints/status for selection, movement, promotion, check, terminal outcomes, search statistics, app switching and restart with an idle sender. Observe panel recovery on a dropped flush. Record source/module/state bytes, simultaneous peak memory, install latency, cold/warm frame latency and competing app progress. If a resident semantic view provides little benefit over the current tree or the manual template, archive the richer mechanism unless local editability is a separately demonstrated benefit. An update that changes even one pixel incorrectly, preserves stale mutable state or blocks unrelated interactive work outside its contract fails qualification.

## The precedents and the open research question

- **NeWS** is the closest historical display system. A client could send a PostScript program to execute in the window server. The shared idea is moving drawing behavior close to display resources. The PicoCalc question adds typed specialization, a retained state contract and a very small device-side installation budget. [Gosling’s NeWS lecture](https://www.youtube.com/watch?v=4zG0uecYSMA) · [The NeWS Book](https://link.springer.com/book/10.1007/978-1-4612-3606-1)
- **A CSS Paint Worklet** supplies a closer modern API. A named paint function receives a drawing context, geometry and declared inputs. The PicoCalc equivalent needs an explicit code lifetime across compositor restarts and a bounded interface to the rasterizer. [W3C CSS Painting API](https://www.w3.org/TR/css-paint-api-1/)
- **Remote evaluation** treats a program as a request that the receiver executes. Stamos explicitly studied this model. Our protocol adapts it by installing once, pinning code across repeated updates and consuming the result at the display. Android RemoteViews supplies a useful resident alternative: the consumer understands a restricted view description and can rebuild it in another process. [Stamos, *Remote Evaluation*](https://dspace.mit.edu/entities/publication/2614477f-1dcd-45a7-9f38-d46fd6b231bd) · [Android RemoteViews](https://developer.android.com/reference/kotlin/android/widget/RemoteViews)
- **Active Messages** dispatches incoming data to a handler at the receiver. This describes the installed-ID fast path. Transporting the implementation and retaining a version for replay raises an additional installation problem. The code mobility literature distinguishes remote evaluation from code-on-demand according to who owns the work and where it executes. [von Eicken et al., *Active Messages*](https://www.cs.wm.edu/~qxlixx/teaching/cs664_07f/papers/eicken92active.pdf) · [Fuggetta, Picco and Vigna, *Understanding Code Mobility*](https://sites.cs.ucsb.edu/~vigna/publications/1998_fuggetta_picco_vigna_understanding.pdf)
- **Linda** explains how a produced value can outlive a particular sender or receive operation and be found by matching. **A Go function value** can be sent on a channel within a program and can still refer to shared captured variables. Neither operation specifies a portable by-value environment, which is the key extra contract for independently replaying Chess after its author stops. [Gelernter, *Generative Communication in Linda*](https://www.cs.tufts.edu/comp/150FP/archive/david-gelernter/generative-linda.pdf) · [Go specification, function literals](https://go.dev/ref/spec#Function_literals)

Sending programs to displays has clear prior art. A more specific research contribution would be to identify a presentation function’s serializable dependency boundary and predict whether compiling that function near the display pays over a session of real edits and repaints. Chess offers a difficult example because a drawing entry point hides legal-move computation. Establish the boundary manually first. Only after it works compare automatic code/data extraction on another producer against the manual split.

### What the two independent reviews changed

Opus emphasized a strong control: the current retained tree can already repaint after a compositor restart while Chess sleeps. Independent repaint is part of the baseline. To claim improved availability the proposal must handle a case that the existing tree cannot handle, at a measured cost. The immediate hypothesis is cheaper publication of a changed position. The literature also offers a concrete precedent for serializing closures as transmissible data. [Opus research memo and search limitations](../analysis/02-opus-research-on-receiver-compiled-view-programs.md) · [Epstein, Black and Peyton Jones, Cloud Haskell](https://www.microsoft.com/en-us/research/publication/towards-haskell-cloud/)

Astra found a narrower first implementation by tracing the portable compiler and its loader. The compiler already emits an isolated-function candidate. The missing piece is a dedicated consumer with a checked output contract. Astra also identified the legal-move scratch mutation hiding inside the existing drawing entry point. Together these findings replace a general “ship arbitrary closures” experiment with a small typed procedure and a testable by-value contract. [Independent Astra review](../reference/04-astra-mobile-renderer-review.md)

I kept Chess in charge of the cursor and promotion workflow. Opus proposed local interaction state and a selection handler as an alternative. That would change who owns input, expand the legal-move snapshot and introduce reconciliation after each move. It would measure a different feature. I would also keep receiver specialization of fonts or geometry in reserve. Specializing a portable representation can be possible as well as specializing source. Introduce a versioned specialization key and compare both forms only if enough device cost actually depends on that environment. A local typed edit remains a reason to accept source even without specialization. The initial comparison has four arms and one board schedule.

### How an automatic compiler could choose the boundary later

Represent the slice that computes the view as a dependency graph. Each node computes a value, and each directed edge carries that value to a consumer. Pin reads and writes of search scratch to Chess. Pin emission of clipped drawing commands to the isolated renderer. Pure arithmetic and formatting can have either placement. Each edge that crosses the boundary requires a serializable value. For example, cutting after legal-move generation transmits eight mask bytes. Moving legal-move generation across the cut would also require its inputs, scratch, time budget and persistence rules. It is disallowed by the chosen effect contract even if an optimistic byte model would choose it.

This formulation has concrete prior art. The Swift compiler used policy constraints and a max-flow formulation for client/server placement to reduce communication. Our first lab model could give each movable operation two measured execution costs and each crossed value a byte or time cost at its measured frequency. Solve the restricted two-location placement problem offline and compare its predicted boundary and break-even with the manually qualified Chess implementation. Count a value shared by several consumers once per transmitted packet. Installation, shared intermediates, coalescing and an instruction budget make the full objective more complex than a sum of independent edges. A useful negative result would be a simpler rule that predicts held-out behavior just as well. This is a later analysis inside T4, contingent on a measurable benefit from the manual cut. [Chong et al., automatic program partitioning](https://www.cs.cornell.edu/~qixin/papers/swift.pdf)
