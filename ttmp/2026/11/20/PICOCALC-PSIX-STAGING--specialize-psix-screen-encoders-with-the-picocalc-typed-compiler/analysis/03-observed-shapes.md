---
Title: When a handheld screen repeats its shape
Ticket: PICOCALC-PSIX-STAGING
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/runtime/results/physical-summary.json
      Note: ESP32-P4 adaptive producer summaries
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/runtime/results/quickjs-host.json
      Note: QuickJS host stream, stage and capacity evidence
    - Path: repo://ttmp/2026/11/20/PICOCALC-PSIX-STAGING--specialize-psix-screen-encoders-with-the-picocalc-typed-compiler/scripts/runtime/results/resident-released.json
      Note: Paired released-encoder memory control
ExternalSources: []
Summary: An exact-byte host evaluation of prefix-trained and adaptive PSIX plans across System, Chess, Snake, Editor and independent Keys.
LastUpdated: 2026-11-20T12:24:00-05:00
WhatFor: Explain which encoder work a recurring screen shape can remove and how guards, misses and retained memory change the result.
WhenToUse: When evaluating runtime specialization of a binary producer on a handheld.
---

# When a handheld screen repeats its shape

Changing the selection in the PicoCalc System monitor can replace a few labels and table entries while the screen still has a header, a 48-sample graph and a table. A binary screen writer sees the complete JavaScript tree each time. It can reuse decisions about the old screen's structure when the new screen meets the same assumptions. This study tests how much that reuse saves once the writer pays to check the assumptions.

On the vendored QuickJS engine running on an x86-64 host, a bank of shapes learned from earlier System frames reduced the 45-frame holdout's median producer time from 636 to 474 microseconds per frame. An empty adaptive cache learned while encoding, reached 39 hits and finished at 519 microseconds per frame, including six runtime builds. The same adaptive policy lost on the independent Keys screen and on a combined application stream. It also kept 323,712 bytes of additional host QuickJS allocations alive after the complete System replay, measured against the same adaptive run with its cache released. Both the speedup and the memory expense matter to a handheld editor or monitor. [QuickJS timing receipt](../scripts/runtime/results/quickjs-host.json) · [Resident cache](../scripts/runtime/results/resident.json) · [Released-cache control](../scripts/runtime/results/resident-released.json)

## A screen can change without changing its record layout

Our input is a parsed screen payload with the application name, title, hints and a tree. The output is a PSIX v1 packet. PSIX keeps a dictionary of the packet's distinct field names and string values in UTF-8 byte order. Arrays and objects contain entries with short references. An array entry can store a small integer directly, index a dictionary string or point at a nested record. A larger or fractional number points at an eight-byte record containing a floating-point value. The generic writer discovers all this by inspecting the input. [Original writer and reader](../../PICOCALC-RENDER-BINARY--compile-complete-picocalc-screens-into-an-indexed-binary-representation/scripts/02-binary-screen.js)

Look at `select-0` and `title-4` from the World tab. Both have six top-level children, including a graph node with 48 values. The title changes from `"System"` to `"System 4"`. It needs a different number of UTF-8 bytes and can shift where every body record begins. The Bus tab's `refresh-35` has seven children and two graphs. Switching tabs changes the structure itself. Any writer that assumes six children would omit output or reference the wrong record unless it establishes a new plan. [System replay payloads](../../PICOCALC-RENDER-SYSTEM--extracting-stable-system-monitor-layouts-from-ordinary-javascript/various/sysmon-generic.ndjson)

The measured *shape* captures the exact hierarchy of containers, array lengths, object keys in input order and each leaf's encoding class. A declaration may tell the compiler that every graph sample is an inline integer. A runtime observation establishes that only for the current payload. If a number crosses from 524,287 to 524,288, its slot changes from an inline value to a pointer to an eight-byte record. The layout plan requires its own guard because it must work with screens arriving after the observation as well as the one that created it.

#### A small compiler produces an emission plan

The prototype walks the observed input in the order in which PSIX will emit records. The compiler records a tag, a relative reference position and a relative body position for each value. When it sees an object, it stores the field names and a permutation from JavaScript enumeration order to UTF-8 key order. A permutation is a list of positions. It enables later frames to visit fields in the required wire order without sorting the same field names again. The plan retains no tree object and no scalar value.

The shape can determine where a record begins within the body. The packet's live strings determine where the body begins within the packet. A freshly emitted title can also rank ahead of a known key in the dictionary, shifting that key's ID. The writer constructs the current dictionary, looks up its new IDs and adds its final length to the relative body positions. In the binding companion experiment, copying old key IDs after changing a value creates a packet that passes admission and decodes to the wrong fields. A syntactically valid packet can still be the wrong output. [Worked dictionary example](04-staging-and-binding.md)

At runtime, the guard starts with a route based on the top-level `kids` count. This is a quick way to find a small list of plausible candidates. It is possible to have two distinct shapes with six children. A candidate compares every object key, array length and leaf encoding class before it can emit a packet. It also gathers the current leaf values during that visit. The guard prevents the old plan from handling a change in numeric width or a new optional field. A dynamic writer check still enforces valid UTF-8 and the packet budget. The original writer handles failures at either step. [Plan compiler and guarded writer](../scripts/runtime/01-observed-shapes.js)

## What the experiment held constant

The generic arm used the original PSIX writer. Two arms used the same specialized writer with a different source of knowledge. The fixed arm compiled plans for the most frequent shapes seen in an earlier prefix. The online arm began empty, wrote the first occurrence of an unrecognized shape with the original encoder, then attempted to install a newly compiled plan. A fourth arm started the online cache by encoding the prefix before timing the suffix. On the same miss, a trained bank can only fall back, while the online cache can try to make a later frame faster. Its current frame pays both charges.

All four read the same JSON-materialized payload. The prototype writes JavaScript plan records and runs a guarded JavaScript interpreter for those records. The direct native typed encoder in the companion study binds its input from a declaration and has a different cost model. [Runtime design](../design-doc/03-observed-shapes.md) · [Executable comparison](../scripts/runtime/02-replay.js)

The original 427 inputs contain 100 System frames, 47 Chess frames, 236 Snake frames and 44 Editor frames. These are application-generated frames from deterministic replays of actions or injected System states. The System suffix starts at `refresh-35` and includes refreshes, selection changes, unrelated state updates, titles and tab switches. Of its 45 updates, 40 gave payloads absent from the first 55 inputs. The Chess suffix had 22 of 24 updates absent from its prefix, Snake 118 of 118 and Editor 2 of 22. The Editor split therefore gives limited evidence about new values. Keys contributed 26 further frames and received only System training. [Corpus hashes and split manifest](../scripts/runtime/results/node-host.json)

Validation compared each candidate buffer against an independently called original encoder, byte for byte. Across all 427 original frames the adaptive encoder reproduced 581,602 bytes, with a concatenated FNV-1a receipt of `c1df42ab` on both engines. The individual holdout tests exercise the fixed bank and the online cache against the same reference. Validation also checks behavior across reordered keys, UTF-8 ordering of non-ASCII keys, string collisions, numeric width changes, invalid surrogates and exceeded limits. For example, the shaped writer recognizes the structure of a screen containing an unpaired UTF-16 surrogate, declines when encoding the dynamic string, and falls back to the original UTF-8 rejection. A separate small-budget case refuses every plan and still produces the expected packets. [Edge cases and complete verification](../scripts/runtime/results/quickjs-host.json)

## Timing the producer from input to packet

The QuickJS numbers below are medians of seven chronological stream passes, divided by the number of frames. The timed interval includes each dispatch, guard, dictionary and byte write. It also includes generic fallback and plan construction for any timed miss. Training time and adaptive prefix playback have separate readings. The experiment begins after the application has created the screen payload and ends before transport, receiving-side validation or painting. The processor is the host running the vendored engine, so this table gives host producer time. [QuickJS raw timings](../scripts/runtime/results/quickjs-host.json)

| QuickJS host workload | Frames | Original µs/frame | Fixed bank | Online cold | Online after prefix | Hits fixed / cold / after prefix |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| System held out | 45 | 636 | 474 | 519 | 479 | 42 / 39 / 43 |
| Chess held out | 24 | 496 | 527 | 814 | 916 | 0 / 6 / 7 |
| Snake held out | 118 | 248 | 320 | 255 | 253 | 0 / 106 / 107 |
| Editor held out | 22 | 330 | 330 | 458 | 432 | 15 / 13 / 15 |
| All four interleaved | 209 | 386 | 400 | 433 | 426 | 42 / 157 / 161 |
| Independent Keys | 26 | 385 | 382 | 611 | 619 | 2 / 4 / 5 |
| One stable shape | 40 | 89 | 71 | 73 | 71 | 40 / 39 / 40 |
| Twelve cycling shapes | 72 | 80 | 98 | 195 | 186 | 24 / 0 / 0 |

On System, the fixed bank produced all but three packets through its guarded writer. That saved about 7.3 ms across the 45-frame suffix. The separate prefix-training pass took 8.5 ms on the host. If that cost is incurred just before a single suffix at the same rate, the two phases together exceed the original's cost. Training can move to an off-device build, although this particular test timed a bank already in memory and did not measure the cost of serializing or loading it. The online run from an empty cache saved about 9.5 ms across the entire 100-frame System tape, producing 83 hits while paying for 17 builds and nine evictions. These are two ways to amortize the same plan representation. [QuickJS System diagnostics](../scripts/runtime/results/quickjs-host.json)

To estimate how much reuse a build needs, the diagnostic pass compared the same inputs on both arms. The 39 cold online System hits collectively saved 5.74 ms against generic encoding, about 147 µs per hit. Six misses collectively cost an extra 1.68 ms, about 281 µs per miss, of which 1.61 ms was measured in compilation and installation. For that mix, the extra work would take about two future hits to repay. The diagnostic pass uses additional timing probes, so this is a scale estimate. A different shape can make a guard slower, make the dictionary more expensive or receive too few visits. A per-stream lead gives stronger evidence than assigning a universal threshold from this sample. [Matched-frame timings](../scripts/runtime/results/quickjs-host.json)

Hit rate alone mispredicts Snake. The online arm hit on 106 of 118 frames yet remained slightly slower on QuickJS. On V8 it ran at 19.1 µs/frame against the generic 20.8, with guard decisions identical in both engines. Keys was slower online in both engines. These observations put the source of a win in the amount and kind of work removed per frame, and in how the runtime executes the remaining code. [V8 host timings](../scripts/runtime/results/node-host.json)

## A short replay on the PicoCalc

The physical ESP32-P4 runner loaded the same QuickJS writer and nine held-out System frames selected from the host split. The eight-frame training subset contained World, Handle and Bus layouts from the prefix. Six selected Keys frames again supplied a transfer test with only System training. The runner started a new QuickJS runtime for each arm, with its own timer and a 6 MiB engine limit. Bundle reads, realm initialization, source evaluation and input parsing occurred before the policy setup and writer clocks. Inside each one-frame timing window, the candidate paid the whole producer cost. A digest was computed afterwards. [Board runner](../scripts/board/staging_trial.c) · [Selected payload manifest](../scripts/runtime/results/board-capsule.json)

Each application first passed complete byte comparisons for all three candidate policies. Five rotated blocks then produced 40 timing receipts. Every System pass produced 15,074 bytes and digest `3e515422`. Every Keys pass produced 5,797 bytes and digest `98452397`. The table reports median wall-clock milliseconds for an entire tape. The total column takes each run's setup plus encode time before computing the median. [Physical receipts](../various/physical.json) · [Adaptive summary](../scripts/runtime/results/physical-summary.json)

| P4 replay | Policy | Setup ms | Encode ms | Setup + encode ms | Hits |
| --- | --- | ---: | ---: | ---: | ---: |
| System, 9 frames | Original | 0.15 | 287.93 | 288.08 | — |
| | Fixed bank | 102.44 | 260.60 | 363.41 | 7 |
| | Online cold | 0.45 | 358.57 | 359.00 | 4 |
| | Online after prefix | 326.30 | 271.50 | 598.59 | 8 |
| Keys, 6 frames | Original | 0.14 | 121.42 | 121.56 | — |
| | Fixed bank | 101.79 | 124.06 | 225.67 | 0 |
| | Online cold | 0.45 | 179.96 | 180.41 | 1 |
| | Online after prefix | 327.95 | 176.62 | 505.22 | 1 |

On the nine System frames, the trained bank cut writer time by about 9.4 percent after setup, but lost once setup was included. At the same savings rate, its setup would need about 34 subsequent frames to break even. The actual useful lifetime depends on whether the selected shapes recur. Warm online found one more System hit than fixed and still spent more time on packet production, plus a separate 326 ms of earlier replay. The cold policy compiled five times and fell 24 percent behind the original in the median paired comparison. The short sequence gave it fewer chances to recover each build than the 45-frame host suffix. On Keys, the trained guard found zero candidates and the cold adaptive writer built five plans for one hit. It ran about 48 percent slower than the original.

These numbers capture producer work on the handheld. The board ran embedded replay payloads and an isolated QuickJS realm. They do not measure a live application or the delay to the LCD. The test used the readable 77,269-byte capsule generated by the board preparation script. A 50,925-byte esbuild variant also passed the same verifier on host QuickJS. [Raw capsule generator and replay instructions](../scripts/runtime/README.md) · [Minified host smoke](../scripts/runtime/results/board-capsule-host-smoke.json)

## Why churn changes the policy decision

The cache retains eight plans, and tests at most four entries for a given top-level route. The mixed stream sees 52 runtime builds and 47 evictions from an empty cache. An eviction can discard a plan just before the application needs it again. In the twelve-shape control the same four-plan route receives all twelve shapes in a fixed cycle. Every online frame misses. The eight-entry bank limit never helps because the route limit is already full. An always-compile admission rule spends time on each frame even if the application produces a recurring but larger set of shapes.

Increasing the cache from one entry to four took System from 25 to 38 hits out of 45; eight entries yielded 39. Increasing from eight to sixteen added no more System or mixed-stream hits with the same byte and route limits. The churn control remained at zero cold online hits at every tested capacity. A cache policy needs a way to decline speculative work as well as a way to evict it. Waiting for a second observation, limiting build work per interval or consulting a producer-owned schema are separate hypotheses to test. [Capacity sweep](../scripts/runtime/results/quickjs-host.json)

Memory supplies a second limit. The prototype charges storage for the plan's typed integer array, field names and byte buffers. Its final System cache charged 33,559 bytes for eight plans. A separate host process encoded the same 100 frames, then the allocator meter compared the live increment after GC with and without a reference to the encoder. Holding it live added 323,712 bytes. The retained encoder includes the JS objects that implement the plan, scratch state and metadata. A token ledger and the engine's physical allocation can differ by nearly an order of magnitude. QuickJS also observed lower transient high water for the adaptive workload than the original, 1.35 MB versus 3.79 MB above the preloaded fixture baseline. The measurements describe different lifetimes. If a device requires a strict retained-byte budget, a packed buffer with a fixed arena can make the budget enforceable in memory. [Retained and released QuickJS heaps](../scripts/runtime/results/resident.json) · [Generic memory control](../scripts/runtime/results/resident-generic.json) · [Release control](../scripts/runtime/results/resident-released.json)

## What the result means for a generated native writer

The cache is worth considering for a producer that emits many related frames and lacks a declared shape. Even there, the route must earn the cost of checking it, the build must repay its own first miss, and the working set must fit. A declared typed schema can remove a different set of costs. It can name fields and give static access paths without traversing a previous JavaScript frame. A static scalar class may also let the compiler omit a numeric-width decision. Some work still belongs to the current packet. Dynamic text can move dictionary ranks, and live array lengths can shift nested record offsets.

The reusable compiler boundary is a layout whose assumptions can be established either by the program's type or by a runtime guard. After that boundary, binding uses current strings and current values. Our runtime plan proves the boundary can preserve exact PSIX bytes and identifies conditions where repeated layouts save time. The full grow-and-evict policy is too expensive on the observed transfer and churn workloads. A follow-up can compare packed plans and a repeat-observation policy with a generated emitter while keeping the same wire oracle and charging acquisition time in all arms. [Runtime design](../design-doc/03-observed-shapes.md) · [Reproduction and board capsule](../scripts/runtime/README.md)
