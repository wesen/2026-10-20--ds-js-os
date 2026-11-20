---
Title: Opus research on receiver-compiled view programs
Ticket: PICOCALC-RENDER-NEXT
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T10:47:03.897068652-05:00
WhatFor: ""
WhenToUse: ""
---

# Independent Opus assessment of receiver-compiled views

This commissioned memo uses a generic architecture brief and public literature. The director’s accompanying design contains verified project APIs and host measurements.

**Editorial disposition.** The historical survey is a map of related work. Several entries came from abstracts or search summaries. The [director’s design](../design-doc/04-sending-a-typed-view-program-to-the-compositor.md) uses primary sources and the measured Chess producer for project conclusions. Its four experimental arms supersede the factorial proposal below.

Three statements in this independent memo need qualification. Retained generic trees already permit repaint with an idle producer. Receiving typed source can enable local editing even without specialization, and portable modules or IR can also be specialized. Finally, absence of imports restricts external calls but does not guarantee deterministic replay, bounded raster work or the absence of mutable state. A shipped closure's treatment of captured locations depends on its language and serialization contract. Preserve these distinctions when reading the original recommendations below.

# Memo: Should the display server run the game's view code?

**To:** Technical intern · **Date:** 2026-11-20 · **Basis:** reasoning from first principles plus public literature. No device measurements were taken.

## Bottom line

Reuse the application's existing view *source*, but don't call the running application from the paint path. Closure-convert the view into a closed procedure over three by-value inputs: the position, the receiver's environment and a small UI state. Admit that procedure once, then run it on the receiver under structural budgets.

For a chess-like view, compilation will rarely pay for itself. Positions change at human speed, and laying out 64 squares is probably small next to the pixel work (this should be measured). The payoff that holds up is availability: repainting after a cold restart or an environment change without waking an idle producer. It has to beat a cheaper baseline the system already has, which is persisting and replaying the last complete tree.

## What prior work settles

**Code in the display server.** NeWS let clients download PostScript into the window server, so interaction ran there instead of through X-style event round trips. It was also slower than X, and its low-level C interface pushed whole programs into PostScript [1,2]. Display PostScript used pswrap to turn PostScript fragments into C procedures that were sent per call, and left windowing to the host system [3]. The lesson has two parts. Code running in the server buys latency and consistency, but the server's responsiveness becomes hostage to client code. A second language also splits the program. A single typed language that compiles to both Wasm and RV32 fixes the second problem but not the first. Thin clients mark the two extremes: VNC sends rectangles of pixels [4], and THINC intercepts low-level display commands [5]. Our complete screen trees sit between them, and sending positions pushes further toward semantics.

**Install once, update cheaply.** Active messages are the clearest model. Each message names a handler that is already present at the receiver and carries its arguments, and handlers run briefly to completion [6]. Publishing a position is the same thing: an argument tuple for a handler that was admitted earlier.

**Where code runs.** Remote evaluation sends a procedure to wherever the resource lives [7]. Carzaniga, Picco and Vigna classify mobile-code designs by where the know-how, the resources and the execution sit [8]. Here the app owns the know-how (how a position looks), and the display server owns the resources (pixels, frame timing, environment).

**The trap: distributed lexical scope.** Obliq keeps the free variables of a shipped closure bound at the site where it was created [9]. Kali Scheme transmits closures and continuations [10]. Either way, a closure over live mutable state is not a value, because every dereference becomes a live call back to the producer. Go function literals share their captured variables with the enclosing function [11]. A Go-style event-handler closure inside a screen tree is therefore a tangled pointer into the producer's heap.

Three techniques turn closures into data:
- Closure conversion makes the environment an explicit record paired with closed code [12].
- Cloud Haskell ships exactly that pair (a static code reference plus a serializable environment) and refuses closures over resources that can't be serialized [13].
- Defunctionalization turns each lambda into a tagged tuple of its free values [14].

Tuples are what belong on the wire: positions act as environments, and UI events become tagged messages, as in Elm's `view : Model -> Html Msg` [15].

**Staging** is the only strong argument for shipping source. When a program's inputs split into early ones and late ones, the program can be specialized to the early inputs [16]. The receiver knows the environment (geometry, theme, glyph metrics), not the producer, so compiling on the receiver could specialize to it. A pre-built module can't.

**Portable, bounded execution** is mature:
- Wasm validation is a compact type system [17].
- Software fault isolation (SFI) [18], proof-carrying code [19] and the eBPF verifier's limits [20] all bound untrusted code.
- Microcontroller runtimes include WAMR [21], WARDuino on ESP32 [22], Femto-Containers [23] and treVM [24].
- Native translation at load time on sensor nodes [25] and full Wasm ahead-of-time (AOT) compilation on a microcontroller, reported at 9.8–24.2× faster than WAMR's interpreter on that study's benchmarks [26], show that compiling on the device is feasible. Feasible does not mean profitable.

## One dependency cut

The view becomes a pure function, `view(P, E, U) → Tree`.

**P: the position.** Owned by the producer, complete, passed by value. It holds:
- the board, side to move, castling and en-passant rights, and the move counters (FEN's one-line, six-field format is prior art for this [27]);
- the last move and the check or game status;
- the legal targets for each square.

Precomputing the legal targets is deliberate. Derived *data* goes into P, so the rules *code*, and the authority to decide what is legal, stay with the producer.

**E: the environment.** Owned by the receiver. It holds geometry, orientation, theme, locale, and glyph metrics as opaque ids. A frame time is included only if clocks are drawn, and then as a value, never as a capability.

**U: the UI state.** Owned by the receiver and kept tiny: the selected square, the drag offset, the promotion chooser. A second pure function, `step(P, U, input) → (U′, Msg?)`, gives touch feedback locally.
- `Msg` is a defunctionalized tuple such as `Move(from, to, promo)`. It is the only thing that wakes the producer, and the producer re-checks it.
- Whenever a new P arrives, U is reconciled with it. For example, a selection that is no longer legal is dropped.

**Effects and authority.** The module imports nothing. It writes a serialized tree into its own linear memory, and the server copies it out and validates it. With no clock, randomness, I/O or callbacks, the module has no authority by construction. Its output is a deterministic function of (module hash, P, E, U).

**Admission.** The server validates the module and requires:
- zero imports;
- export signatures keyed to P's schema hash;
- caps on code size and maximum memory;
- a passing smoke run on a sample P supplied by the producer, under budget.

When source is shipped instead, the receiver's compiler also checks that the view has no free variables after closure conversion. If the existing view reads globals or captures closures, it fails this check. Until it is refactored, a live call is the honest design.

**Cold restart with the producer idle.** The server persists:
- the module bytes;
- the compiled artifact, keyed by module hash × compiler version × specialization key;
- the last P.

On restart it renders `view(P, E, U₀)` without waking the producer. Fallbacks:
- **Stale artifact:** interpret the module while it recompiles in the background.
- **Missing module, E unchanged:** show the persisted last tree.
- **Missing module, E changed:** show a placeholder and wake the producer.

## Protocol, atomicity and bounded draws

The protocol has two messages: `INSTALL(hash, bytes, schema, budgets) → ADMITTED | REJECTED` and `PUBLISH(seq, schema, module, P)`.

- **Publishes are idempotent.** Because every P is complete, the highest sequence number wins. A lost publish costs freshness, not consistency.
- **Upgrades are two-phase.** Version 2 is admitted alongside version 1, and the first publish tagged v2 switches over atomically, much as Wayland applies double-buffered surface state at commit [28].
- **Rendering is all-or-nothing.** The server builds the tree in scratch space, validates it, then swaps it in. On a trap, a budget overrun or a malformed tree, it keeps the last good tree and reports the fault. It may also switch that app back to producer-published trees.

**Why VM fuel isn't enough.** Fuel counts instructions, not their consequences. A handful of instructions can emit a tree that overdraws the screen many times, dirties every band or asks for enormous text. Memory growth and wall-clock time under contention are separate costs again. Even dedicated metering projects leave the pricing of host calls as an open question [29].

So each draw needs all of these bounds:
- fuel;
- a tree budget: nodes, depth, glyphs, and painted area as a multiple of the screen area;
- a paint-cost model checked before painting;
- a memory cap;
- a watchdog.

Having zero imports helps here. No host call can hide cost during execution, so all the cost shows up in output the server can inspect.

## Three distinctions

**Compilation the receiver schedules vs. compilation that blocks a UI event.** The receiver may choose when to compile: at admission, during idle time, or on the core that isn't painting. No frame or touch may wait for compilation. Interpretation or the last tree covers the gap.

**A direct live call vs. a pure procedure on the receiver.** Calling the running app's view reuses its state and costs nothing to install. But it inherits partial failure [30]: the producer may be suspended, evicted or slow, so the paint path needs a timeout and a fallback. A local procedure removes that dependency and pays for admission and version-skew risk instead.

**Installation vs. each update.** Installation pays for transfer, validation, compilation and persistence once per artifact. Each update pays for transferring P, running the view, validating the tree and painting. Band suppression sits downstream of both and works the same either way, so neither option can take credit for it.

## When compilation pays

If the app's build already emits the view as a separate Wasm module, installing it means validating it, not compiling it. In that case, shipping source has to justify itself through specialization alone.

Compiling beats interpreting when n·(d_i − d_c) > I_c − I_i:
- **n** is the number of runs over the artifact's lifetime;
- **d_i and d_c** are the per-run costs interpreted and compiled;
- **I_i and I_c** are the install costs for each.

A specialized artifact's n resets at every environment change, so specialization pays only when E stays stable relative to how often the view draws. Cold starts (compile now) and warm starts (load a cached artifact) are separate terms. If artifacts are persisted in flash, the cold cost recurs once per module or compiler version, not once per boot.

Running the view locally instead of making a live call saves, per event, the producer's wake-up, render and publish minus the local render. That saving only applies to events with no new data: rotation, theme changes, restarts and touch feedback. A move wakes the producer anyway.

The adaptive-compilation and baseline-compiler literature [31–34] and the per-method offload decisions in MAUI [35] give the form of this calculation, not our numbers. I found no published measurements of these terms on the ESP32-P4. The chip is dual-core RISC-V with a pixel-processing accelerator (PPA), 2D-DMA and MIPI-DSI, and its clock rate depends on the chip revision [36]. Generated code needs executable memory and instruction-cache maintenance, which I did not verify for this chip. WAMR's usual AOT flow compiles off the device with an LLVM-based tool [37], which is a different cost structure from compiling locally.

## Separating value from format, and how to falsify the proposal

The value claim is that the receiver holds both program and data, so it can render without the producer. That claim doesn't depend on the delivery format. Several other changes come along with it and would confound a simple comparison:
- persisting the tree;
- smaller messages;
- the producer no longer building trees;
- compiled vs. interpreted code;
- which core does the work;
- specialization.

Research on data shipping vs. query shipping found that neither pure policy wins everywhere, and that hybrid plans are sensitive to load and cache state [38]. Expect the same here.

**Proposed experiment:** a factorial design.
- **Factors:** location {producer, receiver} × format {interpreted module, AOT module, locally compiled source, specialized} × persistence {on, off}.
- **Workloads:** a move, a rotation or theme change, a cold restart with the producer idle, and a touch.
- **Measurements:** time to the first correct pixel, missed frames, producer wake-ups, energy per event, and peak RAM and flash use.

**Any one of these results falsifies the proposal:**
- Persisted trees plus parameterized layout cover every environment change actually observed.
- The producer wakes and publishes within the frame deadline, and its memory is never reclaimed.
- Interpreted view time is negligible next to painting, and the energy difference is within noise.
- The measured n falls below break-even.
- An injected fault (infinite loop, huge tree, memory blow-up) causes any missed server frame.
- The existing view fails the closure check without a substantial rewrite.

## Established prior art vs. the open question

The following is established: code running in the display server, pre-installed handlers, code-mobility patterns, serializable closures, staging, sandboxed portable code, baseline compilers, microcontroller Wasm runtimes and atomic commit.

What looks plausibly open is this: on a single chip with one toolchain, where complete replayable trees and band suppression already exist, does a closure-converted view running on the receiver improve availability and energy enough to pay for admission? And does environment specialization ever justify shipping source rather than a module? My searches found no measurement of either.

## Sources

1. [NeWS (Wikipedia)](https://en.wikipedia.org/wiki/NeWS)
2. [Gosling, Rosenthal, Arden, *The NeWS Book* (1989)](https://ftp.mirrorservice.org/sites/www.bitsavers.org/pdf/sun/NeWS/The_NeWS_Book_1989.pdf)
3. [Display PostScript (Wikipedia)](https://en.wikipedia.org/wiki/Display_PostScript); [Solaris DPS guide](https://docs.oracle.com/cd/E19253-01/816-0279/dps-1/index.html)
4. [Richardson et al., Virtual Network Computing (1998)](https://www.cl.cam.ac.uk/research/dtg/attarchive/pub/docs/ORL/tr.98.1.pdf)
5. [Baratto, Kim, Nieh, THINC, SOSP 2005](https://www.cs.columbia.edu/~nieh/pubs/sosp2005_fordist.pdf)
6. [von Eicken et al., Active Messages, ISCA 1992](https://www.cs.cmu.edu/~seth/papers/isca92.pdf)
7. [Stamos, Remote Evaluation (MIT thesis; TOPLAS 12(4), 1990)](https://dspace.mit.edu/handle/1721.1/149622)
8. [Carzaniga, Picco, Vigna, ICSE 1997](https://www.inf.usi.ch/faculty/carzaniga/papers/icse97.pdf)
9. [Cardelli, Obliq, SRC RR-122](https://softwarepreservation.computerhistory.org/modula3/doc/SRC-RR-122.pdf)
10. [Cejtin, Jagannathan, Kelsey, Higher-Order Distributed Objects, TOPLAS 1995](https://scilit.net/publications/63660aaffff8a6ab6e3a018872116847)
11. [Go closures share variables (secondary; see Go spec, "Function literals")](https://yourbasic.org/golang/anonymous-function-literal-lambda-closure/)
12. [Minamide, Morrisett, Harper, Typed Closure Conversion, POPL 1996](https://www.cs.cmu.edu/~rwh/papers/closures/popl96.pdf)
13. [Epstein, Black, Peyton Jones, Towards Haskell in the Cloud](https://www.microsoft.com/en-us/research/publication/towards-haskell-cloud/)
14. [Danvy, Nielsen, Defunctionalization at Work](https://www.brics.dk/RS/01/23/index.html)
15. [The Elm Architecture](https://guide.elm-lang.org/architecture)
16. [Taha, Multi-Stage Programming (thesis)](https://www.cs.tufts.edu/~nr/cs257/archive/walid-taha/thesis.pdf)
17. [Haas et al., WebAssembly, PLDI 2017](https://research.google/pubs/bringing-the-web-up-to-speed-with-webassembly/)
18. [Wahbe et al., SFI, SOSP 1993](https://homes.cs.washington.edu/~tom/pubs/sfi.pdf)
19. [Necula, Proof-Carrying Code, POPL 1997](https://www.cs.cmu.edu/~fox/foxnet/papers/necula-popl97.abstract)
20. [eBPF verifier](https://docs.ebpf.io/linux/concepts/verifier/)
21. [WAMR ESP component](https://components.espressif.com/components/espressif/wasm-micro-runtime)
22. [WARDuino, MPLR 2019](https://conf.researchr.org/details/mplr-2019/mplr-2019-papers/3/WARDuino-A-Dynamic-WebAssembly-Virtual-Machine-for-Programming-Microcontrollers)
23. [Femto-Containers](https://arxiv.org/pdf/2210.03432)
24. [treVM](https://arxiv.org/abs/2604.27570)
25. [Reijers, Shih, AOT JVM bytecode on constrained devices](https://arxiv.org/abs/1712.05590v2)
26. [Bologna thesis, on-MCU Wasm AOT](https://amslaurea.unibo.it/id/eprint/39078/1/thesis.pdf)
27. [FEN](https://chessprogramming.org/FEN); [PGN standard](https://opensource.apple.com/source/Chess/Chess-105.0.14/Documentation/PGN-Standard.txt.auto.html)
28. [Wayland content updates](https://wayland.freedesktop.org/docs/book/Content_Updates.html)
29. [finite-wasm runtime spec](https://docs.rs/crate/finite-wasm/0.6.1/source/spec/runtime.mkd)
30. [Waldo et al., A Note on Distributed Computing](https://waldo.scholars.harvard.edu/publications/note-distributed-computing)
31. [Hölzle, Adaptive Optimization for Self](https://bibliography.selflanguage.org/urs-thesis.html)
32. [V8 Liftoff](https://v8.dev/blog/liftoff)
33. [Titzer, Whose Baseline Compiler Is It Anyway?](https://arxiv.org/pdf/2305.13241)
34. [Xu, Kjolstad, Copy-and-Patch](https://arxiv.org/abs/2011.13127)
35. [Cuervo et al., MAUI, MobiSys 2010](https://www.microsoft.com/en-us/research/?p=159073)
36. [ESP32-P4 product page](https://www.espressif.com/en/products/socs/esp32-p4); [datasheet](https://documentation.espressif.com/esp32-p4_datasheet_en.html); [rev 1.3 datasheet](https://documentation.espressif.com/esp32-p4-chip-revision-v1.3_datasheet_en.html)
37. [WAMR RISC-V AOT discussion](https://bytecodealliance.github.io/zulip-archive/stream/290350-wamr/topic/wamr.20on.20RISC-V.html)
38. [Franklin, Jónsson, Kossmann, SIGMOD 1996](https://db.in.tum.de/research/publications/conferences/sigmod96.pdf)

## Researcher’s work record

**2026-11-20, research diary**

- **Searches:** 33 public web searches in standard mode, run in batches. Queries used only generic terms (paper titles, author names, technology names). Nothing identifying the commissioner or the project was sent. There were no other network actions, no file access and no device experiments.
- **Depth of reading:** Most sources were read only at the level of search snippets or abstracts, not full text. This applies especially to Stamos & Gifford (TOPLAS), Cejtin et al., Cloud Haskell, Waldo et al., MAUI, Titzer and the treVM paper.
- **Secondary sources:**
  - The Go closure semantics come from secondary pages; I did not retrieve the language spec itself.
  - The NeWS claims come from Wikipedia and the scanned book. I dropped a second-hand claim about race conditions.
- **Numbers:** The only performance figure imported is the 9.8–24.2× reported in the Bologna thesis, taken from a search summary. Every other cost appears as a symbol, and I invented no timings.
- **Hardware conflict:** The ESP32-P4 clock rate differs between datasheet revisions (400 MHz in v0.7; 360 MHz default with 400 on request in v1.2/1.3), so the memo doesn't state a figure.
- **Not verified, so omitted or flagged:** the P4's executable-memory map and instruction-cache rules; which architectures WAMR's Fast JIT supports; the current WAMR AOT tooling (the only source is a 2023 forum thread).
- **Not cited:** Jones, Gomard and Sestoft (1993) was mentioned only in passing, because the search returned no direct URL for it.
- **Length:** I estimate the memo body at about 1,650 words, excluding the sources list. That was counted by hand, not with a tool.
