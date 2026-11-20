---
Title: Compiling programs and measuring Chess search on a handheld
Ticket: PICOCALC-RELEASE-LAB
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T17:55:32.256209539-05:00
WhatFor: ""
WhenToUse: ""
---

# What a handheld spends on compiling and running Chess

The playable PicoCalc firmware carries two Typed programs for Chess. One implements the game, including legal moves, search and handling a player's inputs. The other projects a board and pieces into a three-dimensional scene. At startup the game sends the painter's source to the compositor. The receiver compiles it for RV32 and invokes it on subsequent position updates. This division lets the app specify its own appearance while the compositor owns display access. It also creates an unusual compiler workload. One program must be able to reproduce another program's source exactly.

A user can encounter at least three delays. Opening the app may require compiling its source. Editing one function may require rebuilding a module that also contains many unchanged functions. Requesting a move runs the code that the compiler has already produced. This study uses separate experiments for each interval. Each begins with an observable input and ends with an observable product, such as a callable module or a verified chess move.

## Why one function occupies most of the shipped game

We reconstructed the ordinary firmware's Chess source from the ordered source list and the shipping painter embedder. The resulting 61,022 bytes matched the SHA-256 digest recorded when the on-device release was qualified. We then compiled it twice on the host using the release compiler, first streaming functions into the backend and then buffering them. The two compilations agreed on every returned field, including the machine instructions, entry addresses, type layouts and relocations. That agreement allows a static census of the code actually discussed here. Wall time and peak heap can still differ between the two compilation strategies. [Census script](../scripts/director/03-shipped-code-census.mjs) · [Results](../various/shipped-code-census.json)

| Role in the installed Chess world | RV32 code bytes | Share |
|---|---:|---:|
| Produce the source that will be sent to the compositor | 197,544 | 77.0% |
| Handle positions, generate moves and search | 26,580 | 10.4% |
| Handle app events and implement the two views | 32,276 | 12.6% |
| Total emitted game code | 256,400 | 100.0% |

The generated source writer consumes over seven times the code used by position handling, move generation and search combined. Its input is 16,316 ASCII bytes. The build-tool script divides that input into pieces because a single Typed buffer literal can contain at most 1,022 UTF-16 code units. The generated function issues one write per piece. The release compiler lowers the destination-capacity checks and a sequence of operations that reconstruct the literal. At runtime the writer supplies source text to another compiler. Its large size tells us how the game delivers the painter. The receiver's native drawing program, measured separately at 23,848 code bytes, performs the actual painting. The shipped game's 256 KiB slot has 261,996 bytes available after its entry and import metadata, leaving 5,596 bytes free. [Release slot measurements](../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/various/camera/native-slot-ordinary.json)

We isolated the expansion in an experiment with one, two or four leaf functions. Every function copies the same string of repeated ASCII x characters into a destination buffer. Each compiled Wasm export returned the expected length, wrote the expected code units and preserved an adjacent sentinel. The accompanying RV32 image increased from 148 bytes for one code unit to 12,400 bytes for 1,022. On this input that is exactly twelve additional native bytes per additional unit. Four copies produced four times as much code. Those numbers apply to these functions and character values. For the deployed painter we used the function census because its text, offsets and call sequence differ from the synthetic workload.

![Release compiler output across literal lengths and repetitions](../various/release-literal-growth.png)

A literal-data optimization can encode the character sequence as data and use a short copying operation. Evaluating that change requires counting all storage. If a candidate moves the payload into another section, its size includes that section, alignment and any new support code. If the firmware still reserves the original 256 KiB slot, unused slot space makes room for future code. Recovering that space for the running system requires a separate slot change and a device test.

### Accounting for the candidate's 88,172 bytes

The halfword-copy candidate emits 54,320 bytes of RV32 instructions and 33,852 bytes of literal data for the Chess app. All 33 eligible literals are distinct, so deduplicating identical pool entries makes no difference to this app. The 16,316-character painter source accounts for 32,632 bytes of that data because the destination stores UTF-16 code units. The other pooled literals account for 1,220 bytes. The compositor separately compiles the painter into 21,920 bytes under the same option. Those bytes belong to another image.

| Contents of the candidate game image | Bytes | Share |
|---|---:|---:|
| Game position, move generation and search instructions | 26,580 | 30.1% |
| Game event handlers and view instructions | 25,348 | 28.7% |
| Instructions for delivering the painter source | 2,392 | 2.7% |
| Complete painter source encoded as UTF-16 data | 32,632 | 37.0% |
| Other pooled literal data | 1,220 | 1.4% |
| **Total** | **88,172** | **100%** |

The pieces are largely constructed from parameters. A pawn consists of stacked tapered sections. Rooks add four battlements. The knight's head, bishop's mitre and king's cross are extruded outlines containing nine, eight and twelve points respectively. The build tool triangulates the caps and emits lookup functions in Typed source. The generated section including its identifying comment is 1,111 ASCII characters. It occupies 2,222 bytes in the copy of the source carried by the app, or 2.5% of the candidate image. This measurement counts source text spelling out two tables. Other painter routines still perform geometry work at runtime. [Painter](../../../../../../picocalc-os/worlds/chess/painter-3d.typed) · [Mesh generator](../../../../../../picocalc-os/tools/generate-chess-meshes.py)

## What survives an edit

The RV32 frontend collects declarations so that a function can call another function defined later in the same source. As each function compiles, its local instruction stream can be generated before all final addresses are known. The backend eventually knows the lengths of all functions, assigns entry addresses, fixes call targets and copies instruction words into the final image. This ordering explains why comparing only unchanged source substrings is insufficient. A function can keep its text while the offset of a record field it reads changes. It can keep its complete meaning while a call target moves because an earlier function grew.

A fragment cache must therefore distinguish semantic dependencies from addresses assigned during final assembly. Saving relocatable instructions permits the final assembler to repair calls when addresses move. Validating the types and layouts used during compilation determines whether those saved instructions mean the same thing after an edit. The reference comparison is a fresh compile of the exact edited source with the same imports. That comparison covers machine bytes, entry addresses and metadata for valid programs and diagnostics for invalid ones. The practical latency begins when the edit becomes available. A persisted-cache measurement includes reading and validating the saved data needed to serve that edit. A retained-memory measurement describes a different session lifetime.

## Why deeper search is a useful compiler workload

The engine represents a move search as resumable state. It first searches to depth one, records the best completed move, and starts the next iteration with that result available for move ordering. At a new node it generates moves, inspects check status and may evaluate the position or examine tactical continuations. A node budget bounds work even if the requested depth would be expensive. The engine also limits the number of state transitions in one call so the app can yield to other worlds. One transition can start a node, try a move, or propagate a result to its parent. The transition count and the node count consequently measure different work. [Search implementation](../../../../../../picocalc-os/worlds/chess/search.typed)

Two compilers can appear to run this algorithm at different speeds because one run searched fewer nodes, stopped at a different iteration or returned a different move. The experiment fixes the position, side to move, castling rights, en passant information, depth, budget and steps per slice. For each trial it checks the returned move, score, last completed depth, visited nodes and the restored position. Only after this check does it make sense to compare elapsed time. A depth-five request that exhausts its budget after depth three is valuable evidence about work to the budget. It does not supply a time to complete depth five.

## Checking a reused function whose target moves

We wrote a second small program to test an error that could escape a speed benchmark. Its first function, `head`, calls its third function, `leaf`. The middle function, `spacer`, initially returns its argument. We grew only that middle body. The new machine image placed `leaf` at byte 144, up from byte 84. The fragment compiler reused both unchanged functions. Its complete image, entries and metadata matched a clean compile, demonstrating that it repaired the displacement in the reused caller.

Then we edited `leaf` to call `head`. Typed rejects recursive call cycles. Detecting this new cycle requires a call edge from the cached caller as well as the newly compiled reverse edge. The prototype and the fresh compiler reported the same cycle, including its path. Reverting the invalid change reused all three previously valid fragments and reproduced the successful output. Finally, changing declaration order caused all three functions to rebuild. A global declaration guard makes this last case relatively expensive but easy to reason about. These checks give concrete meanings to three requirements for cache reuse: repairing addresses, preserving program-wide checks, and committing a new cache generation only after compilation succeeds. [Experiment](../scripts/director/04-fragment-correctness.mjs) · [Observed outcomes](../various/fragment-correctness.json)

## Where search spends its generated instructions

After `e2e4`, the physical P4 completed three plies and returned `b8c6` at the game's 1,600-node budget. The median search occupied 239.311 ms across three native runs. The isolated runner kept the board buffer in internal memory, executed on core zero at 360 MHz and measured from search initialization to the final slice. That interval includes the timing harness between slices. A player waiting for the displayed reply may also wait for scheduling, drawing and display transfer. Those intervals lie outside this benchmark.

The board also completed depth five in a pawn ending in 142.179 ms. In the opening position, 30,000 nodes bought four full iterations and part of a fifth in 4.322 s. A tactical Kiwipete trial spent approximately 5.683 s on the same 30,000-node allowance. Position-dependent move generation, ordering, check evasion and tactical continuations make a node a variable unit of work. [Chess study](04-chess-search.md) · [Physical measurements](../various/chess/summary.json)

![Hardware time and modeled instructions per search node at depth three](../various/search-cost-per-node.png)

We assigned a function symbol to every entry in the exact 26,580-byte native engine and ran four selected positions under the repository's RV32 instruction-counting emulator. Adding symbols changes the host profiler's ability to interpret addresses and leaves the emitted engine bytes untouched. Each replay reproduced its move, score, completed depth, node count and slice count. The instruction totals spanning each measured search differed by at most one instruction from the independent multi-case harness. Function percentages use instructions executed inside Typed functions as their denominator. They count how often machine instructions execute. Physical elapsed time depends additionally on instruction latency and the memory system. [Function profile and harness](../scripts/director/06-profile-search-functions.py) · [Complete profile](../various/search-function-profile.json)

| Position and request | Most frequently executed function by instructions | Share | Combined share of two coordinate helpers |
|---|---|---:|---:|
| Opening, depth 4 | Static evaluation | 10.9% | 15.1% |
| Kiwipete, depth 4 with 30,000-node cap | Non-pawn piece move generation | 10.3% | 14.7% |
| Pawn ending, depth 5 | Detecting an attacked square | 16.0% | 22.5% |
| After e2e4, interactive budget | Static evaluation | 11.9% | 15.4% |

The two coordinate helpers are short. `chessOnBoard` tests whether an index lands on one of the eight real files of an internally sixteen-cell-wide rank. `chessSquare` expands a dense 0–63 index into that internal numbering. In the interactive workload the engine entered the two functions 253,568 and 221,900 times respectively. The latter always consumed eighteen modeled instructions per call. A selective leaf-function inlining experiment has a measurable target here. It could eliminate call and frame overhead and expose constant divisions to instruction selection. A valid comparison must count any extra code at call sites, verify signed arithmetic, reproduce the same nodes and time the physical P4. The 15.4% share is the cost of executing both complete helpers. Some of that work must still happen after inlining.

The literal-pool experiment provides a control on the interpretation of these results. Across separate literal storage, deduplicated halfword copying and guarded word copying, the search engine's native image is byte-for-byte identical to the one timed on the P4. None of its functions contains a qualifying literal. The released game includes a large generated source writer and benefits substantially in size. The same compiler change consequently has a large effect on building Chess and no direct instruction-selection effect on its isolated search. [Cross-study image identities](../various/cross-study-images.json)

### How well can the host model predict physical search time?

We calibrated two one-parameter timing estimates on the opening at depth four. The board median was 638,433 µs for 4,438 nodes and 167,379,205 modeled RV32 instructions. The first estimate multiplies nodes in the new case by the opening's measured µs per node. The second multiplies modeled instructions by the opening's measured µs per instruction. Both pay for one board observation. The second also has to execute the new case in the host emulator.

We evaluated the estimates on thirteen different workloads from the other five positions. We counted identical budget-limited Kiwipete searches only once and gave each remaining workload one vote. Absolute percentage error is the absolute difference between forecast and observed time divided by the observed time. The node-based estimate had **40.6% median absolute error** and a 76.7% worst error. The instruction-based estimate had **1.0% median absolute error** and a 3.3% worst error. This is a retrospective test with a designated calibration position. It shows that even a simple instruction-count model can help prioritize experiments on this engine, memory placement and clock configuration. A new compiler pass that changes the instruction mix or moves the board buffer to external RAM would need fresh physical validation. [Calculation](../scripts/director/07-predict-search-time.py) · [Per-workload errors](../various/search-time-prediction.json)

## Building with a literal pool on the P4

The board operator compiled each full app five times per arm, rotating the stock, halfword and guarded word implementations. Each compile used a fresh QuickJS runtime. Source text and a fixed-size reactor were already available to the caller. A reactor is the existing executable module that reserves a slot and supplies the SDK entry points for the generated program. Compiling and linking into it produces a loadable application. The reported peak measures the compiler's QuickJS allocation. Other live operating-system allocations sit outside that measurement. [Literal study](02-literal-data.md) · [Physical samples](../various/literal/physical.json)

| Outcome | Chess, stock | Chess, halfword | Editor, stock | Editor, halfword |
|---|---:|---:|---:|---:|
| Median fresh compile and link | 5.255 s | 2.659 s | 4.532 s | 4.333 s |
| Median peak QuickJS bytes | 3,181,936 | 1,681,944 | 2,567,084 | 2,536,560 |
| Emitted code and literal data | 256,400 B | 88,172 B | 89,168 B | 77,732 B |
| Linked module | 274,892 B | 274,892 B | 242,124 B | 242,124 B |

On Chess the halfword pool reduced fresh build time **49.4%**, measured peak compiler allocation **47.1%**, and generated image size **65.6%**. Editor gained **4.4%** in time and **12.8%** in image size. The compiler produces fewer operations for long literal writes. Chess exercises that translation extensively because it carries another program. Editor supplies a valuable second workload with fewer eligible literals.

The guarded word-copy variant adds an alignment check and copies more than one code unit per iteration when possible. It compiled Chess in **2.677 s**, produced an **89,084-byte** image, and reproduced the writer's expected output. In a separate native experiment the source and instructions were flash-mapped and the destination was in PSRAM. Median cycles per complete painter-source reconstruction fell from 6,465,714 for the stock writer to 94,909 for halfword copies and 42,300 for guarded word copies. Those medians cover eleven samples of eight calls per sample. Code placement, the instruction cache and memory access dominate this endpoint. The comparison does not tell us how many milliseconds a player saves when the ordinary native loader installs the program. A smaller reserved game slot and a measured first playable frame are the appropriate next integration tests.

The release remains identifiable independently of this research. Its published application and partition match the prior physical readback. A later clean build reproduced the SDK configuration, Chess source, checked component executables and linked Chess and painter identities. Its complete firmware binary had a different hash. The release tag therefore retains the original verified download. [Release receipt](../various/release.json) · [Clean rebuild comparison](../various/release-clean-rebuild.json)

## Rebuilding an edited program on the P4

A separate trial ran the released compiler and the private fragment compiler inside a standalone QuickJS benchmark on the P4. Both arms in each pair received the same edited app source and reactor. The retained arm started with the immediately preceding valid fragment generation already in memory. The clean arm reconstructed the complete module. Three repeated blocks compared the resulting ELF checksum against the reference. The host qualification also compared the complete ELF content and async metadata across the specified edits and examined invalid programs. A fresh host compile and a fragment build also produced the same complete ELF under Node/V8. These paired device times belong to the incremental harness. Its runtime lifetime and instrumentation differ from the fresh-runtime literal trials. [Physical edit and checkpoint measurements](../scripts/incremental/summary.json)

| App and edit | Clean median | Retained median | Change in time |
|---|---:|---:|---:|
| Editor, single function body | 2.232 s | 0.878 s | −60.6% |
| Editor, signature and its call sites | 2.243 s | 2.428 s | +8.2% |
| Editor, shared record layout | 2.247 s | 2.431 s | +8.2% |
| Chess, single function body | 3.236 s | 0.591 s | −81.7% |
| Chess, signature and its call sites | 3.232 s | 3.368 s | +4.2% |
| Chess, shared record layout | 3.241 s | 3.377 s | +4.2% |

The local changes reused 118 of 119 Editor functions and 81 of 82 Chess functions. Every listed structural edit invalidated the global declaration descriptor, so the prototype rebuilt every function and also paid for cache bookkeeping. Seeding the cache is visible too. In fresh QuickJS processes, building Editor and retaining its fragments took 2.768 s compared with 2.552 s clean. For Chess those single observations were 3.717 s and 3.577 s. The measurements favor retaining fragments across a sequence of edits to a live app. They give little reason to pay the seeding cost on every ordinary boot.

A different experiment serialized the predecessor generation, created a temporary file, wrote and synchronized it, read and validated it, then built the edited program. It used the board's wear-levelled SPI flash FAT partition. The file occupied 292,438 bytes for Editor and 681,313 bytes for Chess. The full routes took 4.622 s and 9.003 s respectively. Writing accounted for 3.151 s and 7.432 s. These were single observations per app. If an earlier session already paid for the checkpoint, adding the measured read, decode and child compilation gives approximately 1.10 s for Editor and 1.06 s for Chess. Whether persistence pays in an actual editing workflow depends on how many future sessions reuse the checkpoint and when the earlier write is charged. SD-card latency would need its own trial.

## What to take into firmware integration

The first candidate I would integrate is literal pooling for sufficiently long writes. The narrow change preserves the existing language and capacity checks, gives Chess a 2.6-second cold-build improvement and makes the machine image small enough to test a smaller reserved slot. Start with the simpler halfword arm. The guarded word arm deserves a direct loaded-module comparison if source reconstruction is material to first playable frame. Both require the same byte-for-byte painter and buffer boundary checks.

For a live editing session I would trial retained fragments on body edits. Preserve the clean path for global declaration changes and make the cost of retaining a generation explicit. Before combining the two optimizations, extend fragment serialization to cover references to immutable literal data. A cached instruction that addresses a pooled string needs a symbolic data reference when the new module lays out its pool. A useful test edits an early literal, leaves a later writer unchanged, changes the pool order, then compares every byte of the freshly linked and incrementally linked programs.

For running search, preserve these fixtures and start the next compiler experiment with the high-frequency coordinate helpers. Compare at the same source, move, score and completed work, record image growth, and time the resulting binary on the board. These are three separate integration decisions. We measured no combined speedup, and the published ordinary firmware is the hardware-qualified release that preceded these experimental compilers.
