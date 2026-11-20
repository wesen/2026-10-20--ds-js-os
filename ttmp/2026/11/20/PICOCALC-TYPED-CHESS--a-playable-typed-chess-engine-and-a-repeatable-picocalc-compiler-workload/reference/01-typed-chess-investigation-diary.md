---
Title: Typed Chess investigation diary
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:33:58.010034231-05:00
WhatFor: ""
WhenToUse: ""
---

# Typed Chess investigation diary


## Step 1: Match the chess design to the shared typed-world reactor

The compiler requires an acyclic typed call graph. An explicit frame stack therefore represents the search independently of the representation of ordinary typed calls. Two existing shared reactor buffers can keep the visible position separate from the board that currently has a speculative search move applied.

### Prompt Context

The supervisor assigned a playable typed orthodox chess world with a bounded, nontrivial engine, dual-target validation, measurement, a newcomer design and publication. The user emphasized that the engine should not be entirely naive.

### What I did

- Read the shared typed-world ABI, buffer capacities, C slot linker and Editor event idioms.
- Designed an explicit-stack iterative deepening engine, legal rule path and timer-driven UI.
- Confirmed the source can use the shared generic reactor on both targets.

### Why

Using the same application ABI as Editor lets the compiler qualification treat Chess as another real source workload. The game requires no C move generator or C search code.

### What worked

The shared reactor offers two 65,536-unit buffers, key-event text, JSON screen transport and an SDK yield timer. The function signatures match the app wrapper and source assembly conventions.

### What didn't work

The local Python interpreter initially reported `ModuleNotFoundError: No module named 'chess'`. Published independent perft vectors supply a reference, and a separate optional oracle can be installed only if needed.

### What I learned

Typed source uses one-word buffer accesses and arithmetic rather than a general object heap. Dense packed moves and a mailbox suit the representation.

### What was tricky to build

Castling safety and en passant expose attacks that depend on temporarily changing the board. One make/unmake implementation should serve perft, UI legality and engine search.

### What warrants a second pair of eyes

Check the search caps and exact in-check quiescence behavior, snapshot restoration, and the draw rules admitted by the UI.

### What should be done in the future

Calibrate the timer slice on the physical board after host qualification.

### Code review instructions

Open the intern design, then trace a move from its encoded word through the reversible position update.

### Technical details

The engine uses source functions in `picocalc-os/worlds/chess` and the generic `typedWorldMeta` and `typedWorldEvent` entry points.

## Step 2: Build reversible rule handling and the explicit search stack

The six Chess files in commit **4e49fe9** share one move generator and one reversible position representation. An independently generated fixture suite and a separate Opus 4.6 High design were available before this host gate.

### Prompt Context

See Step 1 for the supervisor's summary of the user request. The follow-up assigned fixed-budget tactical search, preserving correctness at checked quiescence leaves and keeping engine code inside the typed subset. The exact original user text is unavailable in this implementation thread.

### What I did

- Implemented the mailbox and compact moves in position.typed and moves.typed, search in search.typed, and event/UI code in chess.typed and view.typed.
- Reviewed the independent [Opus High discussion](../various/opus-search-design.json) about stand pat, interrupted deepening, and an optional transposition table.
- Read the pinned Python fixtures and added Kiwipete as a separate published perft vector.
- Ran **node scripts/03-engine-oracle.mjs GCC EMULATOR** from the repo root with the linked paths in the [reproduction guide](03-reproduce-chess.md).

### Why

The compiler rejects recursive functions, so the frame needs an explicit move cursor, window and pending child. Position undo allows the app to store one search board instead of a board copy per child. A node budget gives a reproducible comparison across compiled targets.

### What worked

The engine matched 6,981 returned words across Wasm and streamed RV32. Initial perft was 20/400/8,902. Kiwipete was 48/2,039. The complete legality lists included castling through check, pinned en passant, legal en passant, all four promotion siblings, and both checkmate and stalemate. The poisoned pawn changes from d1d5 at depth-one material to f2f4 after activity and quiescence. The quiet mate in two is d6c7 at depth 3 with +29,997 and 1,344 visits. Both mates in one scored +29,999, and exhausted one-node budgets retained legal fallbacks. [Exact engine oracle](../various/engine-oracle.json)

### What didn't work

No failing legal-count or tactical assertion remained. Earlier initial-position depth-four debug perft returned 197,281 under Wasm. The committed dual-target suites use depth three for the opening and bounded specialty depths to keep the emulator run short.

### What I learned

At a quiet leaf, first establish that one legal move exists before considering stand pat. This detects stalemate. For checked leaves, all legal evasions remain available. At their hard quiescence cap the engine evaluates the resulting position directly after each legal evasion.

### What was tricky to build

The buffer stores unsigned 16-bit words. Scores are biased by 32,768, and the full search window fits within stored values. The root records only finished iterations. When the budget stops a child traversal, the pending move at each parent must be undone before returning control.

### What warrants a second pair of eyes

Read the draw-scope paragraph in the article alongside chessOutcome. Review behavior at the hard quiescence cap and the use of deterministic tie breaks in ordered move lists.

### What should be done in the future

The targeted fixture comparison establishes concrete tactical behavior. A stronger comparative claim would need a broader independently scored puzzle set or separately measured match series with the same time and memory limits.

### Code review instructions

Trace chessMake and chessUnmake first. Then read chessPrepareNode, chessSearchStep and chessCompleteNode in that order. Run the engine oracle and compare its JSON to the frozen evidence.

### Technical details

Application search allows up to four full plies and 1,600 counted node starts. The perft and search oracle exercise the same buffer paths, verify exact restoration of all 135 position words, and compare streaming and buffered RV32 compiled bytes.

## Step 3: Cross the real reactor boundary and arm the physical replay

The linked SDK replay exercises the actual typed reactor in each target. The P4 production integration is opt-in and follows the existing bundle and shared linker path. The board clock and timing observer live in an isolated firmware build under /tmp.

### Prompt Context

See Step 1. The supervisor requested one short board script covering launch, a human move, deterministic reply, counters, separate timing boundaries, and restoration under the existing flock. Production firmware integration and first host receipts are in **a08f71f**.

### What I did

- Added both firmware selectors, a Chess manifest entry, and the small generic compiler caller in chess_p4.c.
- Ran the WAMR launcher replay, inspected the reply image, and used cmp to confirm the reset and opening captures were identical.
- Ran the linked replay against actual Wasm and the P4 shared module loaded in the CJI emulator.
- Staged an observer with **python3 -B scripts/10-stage-board-chess.py --output /tmp/picocalc-chess-board-rv32 --idf-export /home/manuel/esp/esp-idf-5.4.2/export.sh --target rv32**, then validated the result with the no-port preflight.

### Why

The raw instruction test cannot catch event or SDK integration errors. The shared reactor proof includes text input, frame output and timers. The physical observer times only the key event through the final retained frame, and serial screenshot traffic starts after that boundary.

### What worked

The linked targets matched all 98 events and 18 retained screen payloads. After e2e4 both produced b8c6, depth 3, score +12, 1,600 nodes and 78 timer settlements. Stale reset tokens were ignored, and a failed timer preserved legal play. The uninstrumented Wasm launcher displayed the same reply and reset its app to the original screenshot. Firmware staging compiled 4,179,168 bytes and the preflight verified the image and original app backup digests, as well as the partition table.

### What didn't work

The first linked replay passed the shared object to the CJI emulator as chess.elf. It reported **not an rv32 relocatable object**. This emulator selects its ET_DYN module loader only for the .so suffix, so the same bytes worked as chess.so.

The first host keys script ended with **worlds** and the host script runner said **line 14: unknown command worlds**. Removed the board-only command and reran the launcher replay.

The first ESP-IDF staging clone tried to load ignored **sdkconfig.agent-elf** from the copied tracked files. It reported **FileNotFoundError: [Errno 2] No such file or directory**. Added the explicit SDK config parameter with the existing checkout config as the default, used a new build directory, and reran.

### What I learned

The bounds on node starts and frame steps serve distinct purposes. The linked trace gives 78 real wake events for this opening reply because a visit may require several frame steps.

### What was tricky to build

Writing to synchronous UART inside search would shift wall time and compete with display capture. The observer stores counters after the white frame, tracks total world time, then emits one record only after the last measured segment. The kernel rendering time records retained frame handling, while app frame encoding stays part of engine time.

### What warrants a second pair of eyes

Check that portrait display capture and the app-partition restoration stay outside the observed Chess window, and that the native renderer frame payload retains the score exactly.

### What should be done in the future

The board replay is scheduled with the supervisor. Record observed timings and the hash-verified restoration in the article once the run completes.

### Code review instructions

Start at typedWorldEvent, then take the deterministic event record from the linked replay and the disjoint boundaries documented in [the repro guide](03-reproduce-chess.md). Compare the staged manifest's Chess engine selector and source path.

### Technical details

The packaged image is /tmp/picocalc-chess-board-rv32/image/picocalc-os-p4.bin and its SHA-256 is **525f997b926b5fccd7da276a189e1d8bcc6b21e083490217e79c097e0c5aa529**. The original 8 MiB app partition hash is **6b0e3ba4a2d4546b5eeae3a608c82b3b0df06034afc5afedcc1e3e264d0b883f**.

## Step 4: Measure the compiler and event handler on separate host clocks

The timing harness uses one QuickJS process per compilation and a fresh Node/Wasm reactor per event series. Compile script setup now follows the device loader's order and only loads RV32 emission in the RV32 lane.

### Prompt Context

See Step 1. The measurement request distinguishes compiling the typed source from running the engine and creating frames.

### What I did

- Ran **bash scripts/13-measure-host.sh REACTOR_ELF /tmp/picocalc-chess-host-final-measurements.json** at compiler checkout **d3e7c7d**. The driver times compileTypedWorld and compileTypedWorldRv32 and captures the linked module sizes.
- Recorded nine fresh QuickJS CPU samples per target and nine Node event timing series.
- Rendered the figure from the raw data using scripts/14-plot-host.py.

### Why

Compiler setup is relevant to cold application starts and search work is relevant each turn. Separate clocks also expose how the final search wake includes encoding the engine reply frame.

### What worked

Median source-to-module CPU times were 30.74 ms for Wasm and 41.05 ms for RV32. Setup medians were 6.38 and 7.24 ms. Their artifact sizes were 73,204 and 240,452 bytes. In Wasm the first board frame took a median 0.54 ms, the white move and frame took 0.24 ms, and the 77 search-only wakes totaled a median 7.33 ms. [Raw host samples](../various/host-measurements.json)

### What didn't work

A preliminary driver loaded the RV32 script in both QuickJS lanes and used the legacy prepass loading order. Changed the staged driver to mirror the production runtime and reran all samples. The earlier numbers are superseded.

### What I learned

The linked RV32 file includes the entire shared ELF slot. Its length answers a packaging question. The image size cannot directly answer how many instructions Chess itself emits.

### What was tricky to build

Node reports wall time for the guest event and SDK work, while QuickJS process CPU excludes time unavailable to the process. Both capture different operations. Keep compositor and panel terms outside the Node clocks.

### What warrants a second pair of eyes

The nine samples describe this host at this revision. Cross-reference the hardware scope and source digests before comparing them with other runs.

### What should be done in the future

Chess should use the exact same source, replay and score when added to a broader compiler experiment. Compare compiler variants within the same host or hardware lane.

### Code review instructions

Open scripts/13-measure-host.sh and trace the two separate clocks to scripts/13-compile-chess.js and the timing-only path in scripts/07-chess-world-oracle.mjs. The analysis figure is produced from the saved JSON.

### Technical details

The compiler clock includes source parse, code emission and linked-module construction. Setup covers loading the compiler source into an already created QuickJS runtime. The linked Wasm event clock starts after marshalling the event buffer and stops when the reactor returns.

The follow-up source overlay in the engine oracle changes only the quiet-leaf capture extension. The activity-aware control takes the defended pawn d1d5 at +456 with 25 visits. Restoring the extension chooses f2f4 at +342 with 26 visits. Ordering and checked evasions are held constant. A separate exploratory Wasm comparison used Python chess 1.11.2 with seed 20261120, 24 random legal playouts capped at 90 plies, and samples at ply indexes congruent to 4 modulo 5. Move lists were sorted by UCI before selection. The 432 sampled positions matched every legal UCI and all 415,182 depth-two leaves. The committed executable oracle remains the 13-position dual-target qualification.
