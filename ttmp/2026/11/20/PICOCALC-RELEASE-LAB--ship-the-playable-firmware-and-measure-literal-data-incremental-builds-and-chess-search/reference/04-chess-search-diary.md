---
Title: Computational Chess benchmark investigation diary
Ticket: PICOCALC-RELEASE-LAB
DocType: reference
Status: active
Topics:
  - picocalc
  - compiler
  - performance
---

# Computational Chess benchmark investigation diary

## Step 1. Define a deterministic search before using the serial port

The released game gives the lab a real computation that can run through both compiler targets. I scoped the benchmark to the engine call that starts iterative deepening and the continuation calls that settle it. Installation, timer scheduling, painting and key delivery have separate experimental boundaries. This made each reported clock tie to the same engine work on the host and handheld.

### Prompt context

The director delegated the computational Chess lane in PICOCALC-RELEASE-LAB. The lane calls for representative positions around depths three to five, a reproducible native/host comparison, preservation of the installed firmware, and a separate Opus-authored article. The user's request approving project materials for Anthropic was relayed by the director. I sent the design and aggregate results with tools disabled. Raw UART and credentials stayed local.

### What I did

I asked Claude Opus High to critique the initial design with `claude -p --model opus --effort high --tools ''`. The design review stressed distinct reasons for stopping, matched buffer layouts and target scope. I used maintained `state.typed`, `position.typed`, `moves.typed` and `search.typed`, joined in their normal order. I made the host generate the board's complete configuration and expected result vectors. The C board driver calls the native aliases emitted into its assembly segment.

### Why

One score and move can agree while the targets do different work. Matching the completed depth, cumulative nodes, and number of continuation slices makes that harder. The engine restores the complete root position when it finishes, but its continuation must be able to pause with a child position active. I checked all 135 source board cells at completion.

### What worked

The host checked opening perft at depth three against 8,902 leaves and Kiwipete at depth two against 2,039. The real make-move path applied e2–e4 from the initial board and matched the reply fixture's 135 cells, including its en-passant target. The useful search fields were identical at slice lengths one, 48 and 4,096 for every case. The common 48-step slice width let the board also agree on slice calls. [Live-position gate](../various/chess/live-fixture-gate.json)

### What didn't work

The first command `node scripts/chess/prepare.mjs /tmp/release-lab-chess-work/main` exited with `ENOENT .../ttmp/picocalc-os/compiler/typed-wasm.js`. The script climbed one directory too few from its ticket's scripts/chess directory. After correcting the root path the host ran all cases.

The initial matrix had no completed depth-five search under a 30,000-node ceiling. The opening, post-e2–e4, congested Kiwipete and rook ending all hit the cap, which is an informative budget result. I added a tractable king-and-pawn ending without dropping the harder controls.

### What I learned

A fixed node budget gives deterministic partial work, and requested depth is a separate parameter. Kiwipete at requests four and five yielded the same retained depth-three decision, 30,000 nodes, and 2,072 slices. A trivial terminal result can also retire early, but it has a different cause. The mate fixture returned after one iteration with score 29,999 and just 21 nodes.

### What was tricky to build

The maintained `WorldState` record changes as the application grows. The host exports the relevant Wasm layout offsets to the C driver and sets the state size from the declared records. Every native result and scratch buffer begins aligned and follows the u32 capacity plus u16 cells ABI.

### What warrants a second pair of eyes

The same root cells should be verified after stopping on depth, budget and mate independently. Perft is a limited independent check on move generation. One matching output tuple provides evidence about the emitted result and accounted work. The harness does not trace the identity of every visited node.

### What should be done in the future

A separate depth-six experiment can profile engine changes, with a time budget based on node counts from the host. That is a distinct question from the cost of the unmodified engine in this release.

### Code review instructions

Read the maintained `chessStartSearch`, `chessSearchSlice` and `chessCompleteNode`. Inspect the data in `scripts/chess/fixtures.json` and the generated ABI constants in the private main folder. Compare the host output's five fields to the board's row parser.

### Technical details

The final suite has 17 cases and 189,951 visited positions per complete pass. The host labels evaluation from the root side's perspective and represents mate separately through scores near 30,000. [Design review by Opus](../various/chess/opus-design.md)

## Step 2. Validate machine work independently of time

I linked the same raw RV32 bytes into a freestanding CJI interpreter runner and counted its executed instructions. This gives a second correctness checker and a deterministic operation metric. The instruction count is useful when two positions use the same node budget but different work inside each node.

### Prompt context

See Step 1. The same compiler unit needed a host-native model alongside the physical measurement. Neither the V8 timer nor the CJI interpreter wall clock stands in for the ESP32-P4.

### What I did

I retained the exact raw RV32 image and Wasm output identities. I added `model.c` and `model.sh`, which use the CJI instruction counter immediately before start and after the last slice. I asked Opus High for critique using only aggregate host results. Its critique prompted explicit stop categories, per-row spreads, and separating duplicate budget-limited workload outcomes from scaling claims.

### Why

A node can perform different amounts of legal move generation, evaluation and tactical continuation. Counting the generated RV32 operations helps expose workload differences without conflating the instruction interpreter's overhead with real P4 execution.

### What worked

The model matched all 17 host results, including unchanged root position cells. It counted about 1.133 billion instructions for capped opening depth five and about 1.504 billion for capped Kiwipete with the same 30,000 nodes. That is roughly 37,766 and 50,127 modeled instructions per node. The rook ending at that budget used about 810 million, roughly 27,001 per node. The scope includes the freestanding loop and small accounting wrappers. [Instruction model receipt](../various/chess/modeled.json)

### What didn't work

An early design prompt assumed 400 MHz. Local release configuration and the eventual measured board header established 360 MHz. The final article and machine reports use the measured value. The host-only pilot kept the raw stop fields. Opus's critique flagged that completed depth alone cannot distinguish a mate from a cap. The aggregate now checks mate score first after confirming a completed depth, then checks equality with the node budget.

### What I learned

The count does not estimate physical retired instructions exactly. The ESP-IDF timing loop has different wrappers and hardware interrupts. The comparison nevertheless exposes the raw engine workload that the native compiler must execute.

### What was tricky to build

The freestanding model reads the CJI instruction counter through its own emulator syscall, combines the low and high RV32 results, and compares signed scores separately from the unsigned count. I used one packed little-endian record per ordered case for exact equality.

### What warrants a second pair of eyes

Confirm model instructions and physical times never get presented as measured hardware instructions per cycle. Compare timing per distinct case and avoid counting the two identical capped Kiwipete workloads as independent depth increments.

### What should be done in the future

Compare instruction counts after a meaningful compiler or engine change under the same search contract. Keep target machine placement and firmware loader behavior fixed when attributing changes to a compiler.

### Code review instructions

Run `scripts/chess/model.sh WORK RV32_GCC` against a generated build. The output digest and RV32 SHA must equal the ones reported by the physical run. Inspect the model receipt's scope field before using its counts.

### Technical details

The emitted raw RV32 image contains 26,580 bytes with SHA-256 `d576c3fd4a8ba1846e01345a6b8597f9ee058895a4a1bc2f59bb6ea2473d5fa4`. The host Wasm module contains 10,623 bytes. These are sizes of different representations, both of the same four-unit search harness. [Opus critique](../various/chess/opus-critique.md)

## Step 3. Time the native search on the board and restore the release

I ran a private standalone ESP-IDF application with the matched native bytes. It allocates the board in internal RAM and runs on core 0 at the clock it reports as 360 MHz. The timed region begins before search start and ends after the last continuation. No app event, rendering, timer pacing or serial print enters that region.

### What I did

After the keypad operator handed off the shared serial lock, I verified the release and partition, installed only the temporary app at `0x10000`, and collected three passes of 17 searches. The runner validates each emitted row against the host configuration. It restores only the app and verifies the app and partition again. The raw serial stream remains in the private working directory.

### What worked

All 51 board observations matched Wasm and the instruction model on the canonical five fields. The normalized observation digest was `f204dc1ad6f54df3b72cc7ac61871b73ac75db6c412d870d52cd44bd77bfd860`. The 1,600-node reply case returned b8–c6 with score 12 and completed depth three across 78 slices. The median compute interval was 239.311 ms. The pawn ending finished depth five with 1,729 nodes and 142.179 ms median; capped opening and Kiwipete searches both reached 30,000 nodes but took 4.322 s and 5.683 s in the matched median depth-five cases. The released app and partition both passed digest verification after restoration. All eight native worlds came back and the painter installed with one compile and zero rejects. I handed the serial lock to the literal lane after the runner exited successfully. [Aggregate](../various/chess/summary.json) · [Restore verification](../various/chess/release-restore-verified.log)

### What didn't work

There was no failure in the physical matrix. The one-boot approach measures repeatability within a boot, so the reported sample ranges do not establish repeatability across device starts or clock modes.

### What I learned

The board's 48-step slice is a unit of cooperative progress, not a fixed number of nodes. For the 1,600-node reply, 78 calls cover root work and variable node processing. Host and board clocks together describe two whole execution paths. The interactive player wait includes scheduling, rendering, and SPI beyond this benchmark.

### What was tricky to build

The lab image uses the same partition geometry while omitting the ordinary runtime. That makes SRAM, code placement, and timer pacing differ from the released game. The test scripts pin both images and guard restoration with the shared lock. I selected a 20-second standalone task-watchdog threshold because a continuous capped Kiwipete case can exceed the standard five-second window. The modified timeout lives only in the lab image.

### What warrants a second pair of eyes

Review the aggregate order and stop labels, then line up all three artifact digests. Review the board readback and world health before releasing the next lab lane. Keep only aggregate values in the final Opus writing prompt.

### What should be done in the future

Repeat cold starts if the desired result is a distribution over boots. Use interactive key and frame timestamps for a player-facing latency measurement.

### Code review instructions

Read `scripts/chess/device.py` alongside the [physical receipt](../various/chess/physical.json). The receipt lists all 51 signed records and the exact restore status. Compare warm host timing spreads, three P4 observations, and model work per node in `summary.json`.

### Technical details

The board input uses the same checked 17 FEN/configuration cases. I checked the four maintained source units against the source commit named by the release receipt, a079a3e113e8cce5a0e7be166e7cd87c40db0e92. They matched byte for byte. The host had seven measured repeats per row after one warm-up. The P4 measured three repeats in one boot. The first physical sample can include an instruction-cache warm-up.

## Step 4. Review the Opus-authored article against the experiment

Claude Opus High wrote the standalone article from the aggregate JSON and the defined timing boundary. I checked the entire manuscript against the engine and the receipts, and corrected the precise board-bound predicate from the generic 0x88 bit test to this engine's range and remainder test. I also clarified that the FEN was validated through the real move path, and that the longest one-slice timer covers a driver call rather than keyboard latency. I checked every table row against the aggregate and every local evidence link. [Opus invocation provenance](../various/chess/opus-provenance.json)

## Step 5. Deliver the study designs

I bundled the frozen literal-pool, incremental-build and Chess-search design guides in that order. The reMarkable cloud accepted the PDF.

`OK: uploaded PicoCalc Firmware Compiler Lab - Study Designs.pdf -> /ai/2026/11/20/PICOCALC-RELEASE-LAB`
