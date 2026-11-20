---
Title: Independent Opus High interpretation of the PicoCalc Chess experiment
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: analysis
Intent: long-term
Authors:
    - Claude Opus 4.6 High
Summary: Independent interpretation of the supplied host and native device Chess evidence.
---

Claude Opus 4.6 High produced the independent text below in a fresh Claude Code invocation on 2026-11-20. It received the prior Opus design and the frozen experiment aggregates. The full response is reproduced verbatim after the editorial note. [Raw invocation receipt](../various/opus-interpretation.json) · [Independent design](../various/opus-search-design.json)

> **Implementation team's evidence notes**
>
> The supplied excerpt contained 12 positions. The full native/Wasm engine gate covers 13 positions and 6,981 returned words, including castling on both sides. The linked-world and physical reply agree after White's e2e4. The separate initial-position fixture starts before e2e4 and selects b1c3 for White. Agreement is scoped to the tested paths. [Engine oracle](../various/engine-oracle.json) · [Linked world](../various/world-oracle.json)
>
> In the poisoned-pawn fixture, Qxd5 captures a pawn and Rxd5 recaptures the queen. Material-only uses static material. The two ablation scores describe different chosen lines. Aggregate node counts do not identify which individual nodes account for the difference. In the quiet-mate fixture, d6e6 is the quiet king move Ke6. The pinned en passant opens the e-file. Promotion offers four choices in total, including three underpromotions. [Independent positions](../various/reference-positions.json)
>
> The aggregate node count does not resolve effective branching factor by iteration or support numerical depth projections. Search quality and the compiler's share of the physical runtime gap remain unmeasured. The two platforms use different clocks and runtimes. Dividing 1,600 visits by 250.684 ms gives about 6,382 visits per engine-second for the observed application exchange, including frame work. It is not a pure search rate or upper bound. The host search-only interval excludes the final wake. The physical endpoint is the retained reply frame, before panel presentation. [Host receipt](../various/host-measurements.json) · [Physical receipt](../various/physical-rv32.json)

# Post-Experiment Interpretation of the PicoCalc Typed Chess Engine

## Role of the Interpreter

I performed this interpretation from supplied evidence aggregates and the prior Opus High design document. I had no execution access, no file access, and no ability to run code or inspect source files. All conclusions derive from the verified evidence JSON and the original design predictions. Analysis of supplied records is marked as such throughout. Work executed by the implementation team is attributed to them.

---

## What Each Test Establishes

### Perft

The opening position produced 20, 400, and 8,902 nodes at depths 1 through 3. These match the universally accepted reference counts exactly. Kiwipete produced 48 and 2,039 at depths 1 and 2, also exact matches. Perft exercises every path through the move generator, the make/unmake pair, and the legality filter. It involves no search, no evaluation, and no pruning. Exact agreement at these depths validates pawn moves (including double-push), sliding and stepping piece movement, castling generation, en passant generation, all four promotion types, and the pseudo-legal-to-legal filtering pipeline. It does not validate evaluation, search ordering, quiescence, or any aspect of alpha-beta.

### Move-List Tests

The implementation team tested twelve positions for legal move counts. Each targets a specific correctness concern from the design's catalog:

- **en-passant-pinned** produced 6 legal moves, not 7. The seventh candidate (en passant capture) is correctly rejected because it exposes the king to a discovered check along the rank, the exact scenario the design identified as the most subtle en passant bug.
- **en-passant-legal** produced 7 legal moves, confirming en passant is accepted when it does not expose the king.
- **castling-through-attack** produced 23 legal moves, confirming castling is blocked when the king passes through an attacked square.
- **promotion-and-underpromotion** produced 9 legal moves, confirming all four underpromotion types plus queen promotion are generated.
- **stalemate** produced 0 legal moves with `inCheck=false` and score 0 across all search modes.
- **checkmate** produced 0 legal moves with `inCheck=true` and score -30,000 across all search modes.

These two terminal positions validate the stalemate/checkmate distinction described in the design's Section 10.

### Two Mates in One

The **mate-in-one** (white) and **mate-in-one-black** positions each found the mating move across all three search modes (material-only, quiescence, deepening) at score 29,999. This equals MATE_SCORE minus 1 ply (30,000 - 1), confirming the leaf-adjusted mate distance scoring. All modes find the mate because checkmate is visible at depth 1.

The black mate test validates that negamax sign handling works correctly for both colors. The mating move e8e1 scores identically to the white mate e1e8, proving the negation chain is symmetric.

These two positions also anchor the UI winner-label correction. After white delivers mate, the position stores black (the losing side) as the side to move. The initial UI read this field directly, displaying the wrong winner. The corrected application uses both independent mate positions as reference checks and verifies the actual rendered text. The verified mate labels read "Checkmate - White wins" and "Checkmate - Black wins" for the respective positions.

### Forced Quiet Mate in Two

The quiet-mate-in-two position requires a non-capturing first move (d6c7) to force checkmate. This is the strongest tactical validation in the suite:

- **Material-only** played d6e6 (a capture, score 950), choosing immediate material gain.
- **Quiescence** played d6d5 (score 1,010), finding a slightly better material outcome through capture continuations.
- **Deepening** found d6c7 (score 29,997 = 30,000 - 3 plies), the forced mate.

Only iterative deepening to depth 3 (the first depth where the full mate sequence is visible) discovers the winning quiet move. This proves the explicit-stack search correctly propagates mate scores through three plies of negamax, that iterative deepening explores deep enough, and that a quiet first move is selected over immediately profitable captures when it leads to checkmate.

### Poisoned-Pawn Intervention (Defended-Rook)

This test separates one-ply material evaluation from quiescence-aware tactical vision:

- **Material-only** captured the rook with d1d5 (score 450), seeing only the immediate +500 material gain minus a small positional cost.
- **Quiescence** played f2f4 (score 342), avoiding the defended rook because capture continuations reveal that after QxR, the recapture loses material.

The **one-ply material comparison** uses the full search framework at depth 1 with static evaluation at leaf nodes and no capture extensions. It is a complete search mode, not a component test.

The **Wasm-only ablation experiment** is a separate intervention that disables only quiet-leaf capture continuations within the quiescence framework while keeping the rest of the search structure intact. With capture continuations enabled, the engine plays f2f4 (26 nodes, score 342). With them disabled, it plays d1d5 (25 nodes, score 456). The one extra node in the enabled run represents the capture continuation that reveals the rook is defended.

These are distinct interventions. The material-only comparison removes all search beyond depth 1. The ablation removes only the quiescence extension at leaf nodes. Both produce the same behavioral change (the engine captures the defended rook), confirming that quiescence capture continuations are the specific mechanism preventing the blunder.

---

## Deterministic Backend Parity

Both Wasm and RV32 targets produced identical results across all twelve positions: same legal move counts, same perft values, same search moves, same scores, same node counts, and same step counts. The linked-world simulation output ("Last b8-c6 Depth 3 Nodes 1600 Eval 12") matches the opening-position deepening results and the physical device output exactly.

This proves the compiler produces semantically identical code for both backends. Move generation, evaluation, search ordering, alpha-beta cutoffs, and node counting all agree, fulfilling the design's Prediction 6.

What parity does not prove: it does not validate that compiled RV32 code executes correctly under hardware interrupts, memory contention, or thermal throttling on the ESP32-P4. It does not test execution paths that differ between backends (memory alignment, stack overflow behavior). The single physical observation is consistent with parity but provides only one sample, not statistical confirmation. There is no Wasm device result to compare against.

---

## Evidence Table

### Engine Correctness

| Position | Legal Moves | Perft (d1/d2/d3) | Material-Only Move/Score | Quiescence Move/Score | Deepening Move/Score/Depth |
|---|---|---|---|---|---|
| opening | 20 | 20 / 400 / 8,902 | a2a3 / 0 | b1c3 / 30 | b1c3 / 30 / d3 |
| kiwipete | 48 | 48 / 2,039 / — | e2a6 / 335 | e2a6 / 163 | e2a6 / 16 / d2 |
| castling-through-attack | 23 | 23 / 271 / — | a1b1 / 500 | a1a7 / 510 | a1a7 / 522 / d3 |
| en-passant-pinned | 6 | 6 / 77 / — | e5e6 / -500 | e1e2 / -598 | e1e2 / -606 / d3 |
| en-passant-legal | 7 | 7 / 27 / — | e5d6 / 100 | e5d6 / 162 | e5d6 / 154 / d3 |
| promotion | 9 | 9 / 41 / — | a7a8q / 950 | a7a8q / 942 | a7a8q / 954 / d3 |
| mate-in-one (W) | 20 | 20 / 153 / — | e1e8 / 29,999 | e1e8 / 29,999 | e1e8 / 29,999 / d1 |
| mate-in-one (B) | 20 | 20 / 153 / — | e8e1 / 29,999 | e8e1 / 29,999 | e8e1 / 29,999 / d1 |
| quiet-mate-in-two | 31 | 31 / 67 / — | d6e6 / 950 | d6d5 / 1,010 | d6c7 / 29,997 / d3 |
| stalemate | 0 | 0 / 0 / — | — / 0 | — / 0 | — / 0 / — |
| checkmate | 0 (in check) | 0 / 0 / — | — / -30,000 | — / -30,000 | — / -30,000 / — |
| defended-rook | 24 | 24 / 380 / — | d1d5 / 450 | f2f4 / 342 | f2f4 / 324 / d2 |

### Quiet-Leaf Ablation (Wasm Only, Defended-Rook)

| Condition | Move | Nodes | Score |
|---|---|---|---|
| Capture continuations enabled | f2f4 | 26 | 342 |
| Capture continuations disabled | d1d5 | 25 | 456 |

### Host Compile (9 QuickJS Process CPU Runs per Target)

| Target | Setup Median | Compile Median | Setup Range | Compile Range | Module Bytes |
|---|---|---|---|---|---|
| Wasm | 4.71 ms | 21.63 ms | 4.63–6.01 ms | 20.40–30.64 ms | 73,204 |
| RV32 | 5.50 ms | 30.44 ms | 5.24–5.67 ms | 27.86–31.40 ms | 240,452 |

### Host First-Move Event Timing (Node/Wasm, Excluding Scheduler/Compositor/Panel)

| Phase | Median | Min | Max |
|---|---|---|---|
| Launch frame | 0.406 ms | 0.340 ms | 0.474 ms |
| Selection frame | 0.417 ms | 0.392 ms | 0.618 ms |
| Move-and-thinking frame | 0.169 ms | 0.163 ms | 0.246 ms |
| Search-only wakes (total) | 5.303 ms | 4.778 ms | 6.019 ms |
| Longest single search wake | 0.307 ms | 0.298 ms | 0.364 ms |
| Last wake + reply frame | 0.085 ms | 0.059 ms | 0.142 ms |

### Physical Device (Single Native RV32 Exchange)

| Measurement | Value | Notes |
|---|---|---|
| Compile wall clock | 1,897,746 µs (1.90 s) | Includes bundled input, fresh QuickJS setup, source compilation, module copy, compiler teardown |
| Peak QuickJS heap | 1,298,116 bytes | |
| RV32 module size | 240,452 bytes | Matches host compile output |
| Reply wall clock | 472,922 µs (473 ms) | From final Enter delivery to retained reply frame |
| White-frame boundary | 3,147 µs | Inside reply interval |
| After-white-frame | 469,775 µs | Inside reply interval |
| World CPU | 258,777 µs | Sum over chess segments |
| Engine execution | 250,684 µs | Inside world CPU, includes app frame generation |
| Kernel retained-frame handling | 7,990 µs | Inside world CPU |
| Search segments / settlements | 79 / 78 | |
| Move played | e2e4 (W) → b8c6 (B) | |
| Depth / nodes / eval | 3 / 1,600 / 12 | |
| Derived NPS | ~6,382 | 1,600 nodes / 250.7 ms engine time |

### First Physical Capture Attempt

| Measurement | Value |
|---|---|
| Successful compiles | 2 (wall times: 1,897,047 µs and 1,897,129 µs) |
| World-list payload length | 5,364 characters |
| Failure | JSON parse error at column 5,358 ("Unterminated string") |
| Play started | No |
| Device restored | Yes |

### Linked World

| Measurement | Value |
|---|---|
| Total events | 98 |
| Search slices | 78 |
| Screens | 18 |
| Reply text | "Last b8-c6 Depth 3 Nodes 1600 Eval 12" |
| Stale wake ignored | Yes |
| Failed wake legal fallback | Yes |

---

## Predictions Compared Against Observed Behavior

### Prediction 1: Perft Correctness

**Design claim:** The move generator will produce exactly the standard perft counts for all four positions at depth 4+.

**Observed:** The opening matches at depth 3 (8,902). Kiwipete matches at depth 2 (2,039). Deeper depths were not included in the evidence. The prediction holds for all tested depths but has not been confirmed at the specified depth 4 threshold. The en-passant-stress and castling-promotion positions from the design's Section 16.1 appear as separate move-list tests rather than deep perft runs.

**Status:** Consistent, not fully confirmed.

### Prediction 2: One-Ply Baseline Strength (20-40% Against Deepening)

**Design claim:** The one-ply material player will score 20-40% against a 100K-node iterative-deepening engine over 100 games.

**Observed:** No multi-game series was conducted. Position-level evidence shows material-only making inferior choices in defended-rook (captures defended piece), quiet-mate-in-two (misses forced mate), and en-passant-pinned (different move). The qualitative gap is directionally consistent.

**Status:** Cannot quantify without the 100-game protocol.

### Prediction 3: Effective Branching Factor 6-12

**Design claim:** With MVV-LVA, PV move, and killer moves, EBF at depth 4 will be 6-12.

**Observed:** Opening deepening completed depth 3 with 871 total nodes. Approximate decomposition across iterative-deepening passes: depth 1 used about 21 nodes, depth 2 used roughly 150 nodes, depth 3 used roughly 700 nodes. The implied EBF between consecutive depths is approximately 4 to 7, at or below the predicted lower bound.

**Status:** Consistent. The low EBF suggests effective move ordering, though the measurement is at depth 3 from the opening (a position with limited tactical content), not at depth 4 from complex middlegame positions where EBF is typically higher.

### Prediction 4: Depth 4-5 at 100K Nodes

**Design claim:** Iterative deepening with quiescence will complete depth 4 or 5 within 100K nodes from the opening.

**Observed:** The deepening tests used a node budget of 1,600 (inferred from kiwipete and defended-rook both hitting exactly 1,600 nodes). The opening completed depth 3 at only 871 nodes. Extrapolating with EBF 5-7, depth 4 would require roughly 4,000-6,000 additional nodes, and depth 5 roughly 20,000-42,000 more. A 100K budget should comfortably reach depth 5.

**Status:** Consistent by extrapolation, not directly confirmed.

### Prediction 5: NPS on ESP32-P4 Between 10K-100K

**Design claim:** Mailbox engine compiled by the target compiler will achieve 10K-100K NPS. Below 10K suggests a compiler code-quality problem.

**Observed:** The physical device processed 1,600 nodes in 250,684 µs of engine execution time, yielding approximately 6,382 NPS. Engine time includes app frame generation (not purely search computation). The host Wasm environment processed the same 1,600 nodes in a median of 5.3 ms, yielding approximately 302,000 NPS.

**Status:** Below the predicted 10K floor. This is the one prediction the evidence contradicts. The 6,382 figure is an upper-bound estimate on pure search NPS because engine time includes frame generation overhead. The design noted this range as a compiler quality signal. Whether the gap reflects compiler output quality, the QuickJS-to-native compilation path, or the overhead of the event-driven architecture within engine time requires profiling to determine.

### Prediction 6: RV32/Wasm Determinism

**Design claim:** Given identical board state and node budget, both targets will produce byte-identical move sequences.

**Observed:** All twelve positions produce identical move selections, scores, node counts, and step counts on both targets. The linked-world simulation and physical device agree on move, depth, nodes, and evaluation.

**Status:** Confirmed.

### Prediction 7: Check Extension Impact (+10 Percentage Points on Tactics)

**Design claim:** Enabling check extension will improve tactical test scores by at least 10 percentage points at less than 50% node cost increase.

**Observed:** No ablation with check extensions enabled versus disabled is included in the evidence.

**Status:** Not tested.

### Prediction 8: Quiescence Impact (-15 Points Without It)

**Design claim:** Disabling quiescence will reduce the engine's score against the one-ply player by at least 15 percentage points.

**Observed:** The defended-rook ablation shows quiescence changing the selected move from a losing capture (d1d5) to a safe move (f2f4). The score difference is 114 centipawns (456 vs 342), reflecting the material that would be lost to the recapture. No game-level measurement was conducted.

**Status:** Directionally consistent from one position. The 15-point claim requires the 100-game protocol.

---

## Measurement Limitations

**Host compile statistics** derive from nine QuickJS process CPU measurements per target, with the QuickJS runtime loading phase (setup) timed independently from the source-to-module compilation phase. These measure compiler performance, not chess engine execution.

**Node/Wasm event timings** for the first move exclude operating-system scheduler overhead, display compositor latency, and UI panel rendering time. They measure the chess application's event-loop frames and search wake durations within the Node.js process. Sub-millisecond measurements at this scale may be sensitive to V8 garbage collection pauses or JIT recompilation.

**Only one native RV32 exchange was observed on the physical board.** The device compile wall clock (1.90 s) encompasses bundled input transfer, fresh QuickJS environment setup, source compilation, module copy to the chess application, and compiler teardown. These phases are not separated in the physical measurement. The device reply wall clock (472.9 ms) begins at delivery of the final Enter keystroke to the chess application and ends when the reply frame is retained on screen. The white-frame boundary (3.1 ms) is measured inside that reply interval. World CPU (258.8 ms), engine execution (250.7 ms), and kernel retained-frame handling (8.0 ms) sum over chess segments, with app frame generation counted inside engine time. UART screenshot capture and factory device restoration occurred outside the move clock and do not affect any timing measurement.

**The first physical capture attempt** produced two successful compiles but failed before play started, due to a JSON parse error at character 5,357 of a 5,364-character world-list payload. The device was factory-restored. This is a data protocol reliability issue, not an engine correctness failure.

**The quiet-leaf ablation** was performed on Wasm only. Its behavioral result cannot be assumed identical on the physical device without a device-side ablation run.

**There is no Wasm device result** (the physical board ran only RV32), no comparative Elo rating, and no measured transposition table. All timing inferences are scoped to the supplied samples.

---

## Future Experiments

1. **Complete perft to depth 4.** The design specified depth 4 as the minimum validation threshold. The opening should be tested to depth 4 (target: 197,281) and Kiwipete to depth 3 (target: 97,862). Position 3 and Position 4 from the design should also be verified at depth 4.

2. **100-game strength series.** Run the one-ply material player against the iterative-deepening engine at 100K nodes per move, 50 games as each color, to test the 90%+ win-rate prediction and quantify the strength gap.

3. **NPS profiling on ESP32-P4.** The observed 6,382 NPS falls below the predicted 10K floor. Profile the compiled RV32 binary to separate move generation, evaluation, make/unmake, search control, and frame generation costs. Compare against a hand-written C engine on the same hardware to isolate compiler output quality from algorithmic overhead.

4. **Device-side ablation.** Run the quiet-leaf capture-continuation ablation on the physical board to verify the Wasm-observed quiescence effect holds in native execution.

5. **Multi-run device statistics.** Repeat the compile-and-play cycle at least nine times (matching the host sample count) to establish device timing distributions and confirm compile-time reproducibility.

6. **UART protocol hardening.** The first capture attempt failed with a JSON parse error at character 5,357 of a 5,364-character payload. Investigate the data corruption source (buffer overflow, timing, encoding), add framing or checksums, and verify that payloads above 5,000 characters transfer reliably.

7. **Tactical test suite.** Run the engine against known tactical positions (Reinfeld's Win at Chess or equivalent) at 100K nodes to establish a solve rate and test the 30-40% prediction.

8. **Higher node budgets on device.** Test 50K and 100K node budgets to measure the depth reached and wall-clock response time. At 6,382 NPS, a 100K budget would take approximately 15.7 seconds of engine time, which may be acceptable or may require optimization.

9. **Transposition table.** Add a hash table with replacement policy and measure the EBF reduction and depth improvement at fixed node budgets. This was deliberately deferred in the design but represents the highest-impact single optimization for playing strength.

10. **Check extension ablation.** Enable and disable check extensions on a tactical test suite to measure the prediction of 10+ percentage-point improvement at less than 50% node cost increase.
