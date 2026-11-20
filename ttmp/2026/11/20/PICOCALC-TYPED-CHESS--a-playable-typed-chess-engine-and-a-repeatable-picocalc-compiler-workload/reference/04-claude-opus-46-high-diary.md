---
Title: Independent Opus High PicoCalc Chess investigation diary
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Authors:
    - Claude Opus 4.6 High
Summary: Dated authored record of the independent review of the frozen Chess results.
---

Claude Opus 4.6 High produced the independent text below in a fresh Claude Code invocation on 2026-11-20. It received the prior Opus design and the frozen experiment aggregates. The full response is reproduced verbatim after the editorial note. [Raw invocation receipt](../various/opus-interpretation.json) · [Independent design](../various/opus-search-design.json)

> See the evidence notes attached to the [independent article](../analysis/02-claude-opus-46-high-interpretation.md) for corrections to the raw author's inferred comparisons and position descriptions.

# Investigation Diary: PicoCalc Chess Post-Experiment Interpretation

**Date:** 2026-11-20
**Role:** Independent post-experiment interpreter (Opus). I performed interpretation from supplied evidence aggregates and had no execution or file access. I did not run code, inspect source files, modify the engine, or execute any tests. All conclusions derive from the verified evidence JSON and the original Opus High design document. Analysis of supplied records is marked separately from work executed by the implementation team throughout.

---

## Step 1: Reviewing the Design Document and Its Predictions

### Prompt Context
The original Opus High design document defines an explicit-stack chess engine for a non-recursive ESP32-P4 target. It makes eight falsifiable predictions (Section 19) covering perft correctness, baseline strength, effective branching factor, depth at fixed budget, NPS on the device, RV32/Wasm determinism, check extension impact, and quiescence impact. The verified evidence contains engine test results, host compile statistics, host event timings, one physical device exchange, one failed physical capture attempt, and linked-world simulation output.

### What I Did
Read the design document end-to-end, extracted all eight predictions with their specific numeric thresholds, and cataloged which predictions the evidence could address. Mapped each evidence field to the design section it validates or contradicts.

### Why
The interpretation requires comparing predicted behavior against observed behavior. Without a clear mapping from predictions to evidence fields, the analysis would conflate what was tested with what was merely consistent.

### What Worked
The design's predictions are genuinely falsifiable with specific numeric thresholds. The evidence JSON is structured to match: perft arrays correspond to Section 16.1, search modes correspond to the baseline/quiescence/deepening comparisons in Section 15, and backend parity corresponds to Prediction 6.

### What Didn't Work
Several predictions require test protocols that were not executed: the 100-game strength series (Prediction 2), the tactical test suite solve rate (Section 15.4), and the check extension ablation (Prediction 7). The evidence addresses these only through positional examples, not statistical measurements.

### What I Learned
The design document anticipated most of the validation structure that the implementation team built. The twelve test positions map directly to the correctness catalog in Section 12. The team appears to have used the design as a test specification.

### What Was Tricky to Build
Not applicable (interpretation only, no implementation).

### What Warrants a Second Pair of Eyes
The EBF estimate (Step 3 below) involves decomposing iterative-deepening node counts into per-depth contributions. The decomposition is approximate because the evidence provides only total nodes and completed depth, not per-iteration breakdowns. Someone with access to the engine's per-depth node reporting should verify.

### What Should Be Done in the Future
Add per-iteration node counts to the deepening test output so EBF can be computed directly rather than estimated.

### Code Review Instructions
No code was produced. The design document should be treated as a living specification: predictions that are confirmed should be marked as validated, and the NPS prediction should be revised downward based on the device observation.

### Technical Details
Eight predictions mapped to evidence. Six have partial or full evidence. Two (Predictions 3 and 7, check extension) have no corresponding data. Prediction 5 (NPS) is the only one contradicted by the evidence.

---

## Step 2: Validating Perft and Move Generation Correctness

### Prompt Context
The design specifies four standard perft positions with known node counts (Section 16.1). The evidence contains perft arrays for twelve positions, with depth-3 results for the opening and depth-2 results for seven other positions.

### What I Did
Compared the evidence perft values against the standard reference counts. The opening perft values (20, 400, 8,902 at depths 1-3) match the design's table exactly. Kiwipete values (48, 2,039 at depths 1-2) also match. Verified that positions with depth-3 value of -1 were not tested at that depth rather than producing zero.

### Why
Perft is the design's "single most important correctness tool" (Section 16.2). Any discrepancy would indicate a fundamental bug in move generation, make/unmake, or legality checking that would invalidate all search results.

### What Worked
All tested perft values match reference counts exactly. The opening depth-3 count of 8,902 is particularly significant because it exercises the full combinatorial space of double pawn pushes, knight moves, and all legality checks across three plies.

### What Didn't Work
The evidence does not include depth-4 perft for any position. The design specified depth 4 as the minimum validation threshold ("Do not proceed to search tuning until perft passes all four positions to depth 4+"). The implementation team may have validated depth 4 separately, but it is not in the supplied evidence.

### What I Learned
The move-list tests (legal move counts) for edge-case positions provide complementary validation to perft. The en-passant-pinned position (6 legal moves, confirming the pinned EP is rejected) validates a specific correctness concern that generic perft from the opening might not exercise until deeper depths.

### What Was Tricky to Build
Not applicable (interpretation only).

### What Warrants a Second Pair of Eyes
The depth-4 gap. Someone should confirm whether depth-4 perft was validated outside the supplied evidence, or whether this remains an open validation item.

### What Should Be Done in the Future
Run perft to depth 4 for the opening (target: 197,281), Kiwipete (depth 3 target: 97,862), and the two additional positions from the design (Position 3 en-passant-stress and Position 4 castling-promotion).

### Code Review Instructions
Not applicable (no code produced). The perft implementation should use the same move generator and make/unmake as the search engine, per the design's Section 16.2.

### Technical Details
Opening perft: 20 (d1), 400 (d2), 8,902 (d3) match reference. Kiwipete perft: 48 (d1), 2,039 (d2) match reference. All twelve positions match at depth 1. Seven positions tested at depth 2. Only the opening tested at depth 3.

---

## Step 3: Analyzing Search Behavior Across Modes

### Prompt Context
Each position was tested in four search modes: material-only (one-ply, no quiescence), quiescence (one-ply with capture extensions), deepening (iterative deepening with a 1,600-node budget), and budget-exhaustion (1-node budget). The design predicts specific behavioral differences between these modes.

### What I Did
Compared move selections and scores across modes for each position. Identified positions where modes diverge, indicating that deeper search or quiescence changes the engine's decision. Traced mate scores back to the design's MATE_SCORE formula.

### Why
The comparison between modes is the primary evidence for search correctness. If material-only and deepening always agreed, the search would add no value. If they disagreed in ways inconsistent with chess knowledge, the search would have bugs.

### What Worked
The mode comparisons show exactly the patterns the design predicts:
- Mate-in-one positions: all modes agree (mate is visible at depth 1).
- Quiet-mate-in-two: only deepening finds the mate (requires depth 3).
- Defended-rook: material-only captures the defended piece, quiescence and deepening avoid it.
- Budget-exhaustion returns a default move with score 0 and completed depth 0, validating the suspension mechanism.

Mate scores decode correctly: 29,999 = 30,000 - 1 (one-move mate), 29,997 = 30,000 - 3 (three-ply forced mate), -30,000 = checkmate at root (zero plies from root).

### What Didn't Work
The opening position's deepening mode completed depth 3 with score 30, identical to the quiescence mode score. This means deepening did not change the evaluation or move selection for the opening. The opening from the start position has no tactical content visible at shallow depth, so this is expected but not an interesting validation of search depth.

### What I Learned
The budget-exhaustion mode (1 node) is a clean test of the suspension invariant. Every position returns completed=0 and score=0 (except stalemate and checkmate, which return their terminal scores with 0 nodes because they are detected before consuming budget). The first legal move found is returned as the default. This matches the design's description of cooperative suspension in Section 6.5.

### What Was Tricky to Build
Not applicable (interpretation only).

### What Warrants a Second Pair of Eyes
The kiwipete deepening result: 1,600 nodes, completed depth 2, score 16, move e2a6. The same move is selected at all three non-budget modes (material-only, quiescence, deepening), which suggests e2a6 (capturing the bishop) is robust but that depth 2 did not find a better alternative. This is the most complex position in the suite (48 legal moves) and would benefit from a deeper search test at a higher node budget.

### What Should Be Done in the Future
Test kiwipete at 50K and 100K node budgets to determine what depth the engine reaches and whether the move selection changes. Kiwipete is specifically designed to stress castling, en passant, and tactical complications that only emerge at deeper search.

### Code Review Instructions
Not applicable (no code produced). The search mode comparisons in the test harness should explicitly verify that material-only and quiescence produce different moves on positions where captures are defended (the defended-rook test does this).

### Technical Details
Deepening node budget appears to be 1,600 (kiwipete and defended-rook both hit exactly 1,600 nodes). Opening completed depth 3 at 871 nodes before hitting the budget. Quiet-mate-in-two completed depth 3 at 1,344 nodes. EBF estimate for the opening: approximately 4-7, derived from 871 total iterative-deepening nodes across three depth passes. This is at or below the design's predicted range of 6-12, suggesting effective move ordering. The estimate is imprecise because per-depth node counts are not separated in the evidence.

---

## Step 4: Interpreting the Quiet-Leaf Ablation

### Prompt Context
The evidence includes a Wasm-only ablation experiment on the defended-rook position. The experiment compares quiescence search with and without quiet-leaf capture continuations. This is distinct from the material-only vs quiescence comparison in the main test suite.

### What I Did
Analyzed the ablation results alongside the material-only results for the same position. Identified that the ablation isolates a specific mechanism (capture continuations at quiet leaves) while the material-only comparison removes all quiescence. Verified that both interventions produce the same behavioral change (capturing the defended rook vs avoiding it).

### Why
The design identifies quiescence as essential for avoiding the horizon effect (Section 9). The ablation provides mechanistic evidence: it shows the specific component of quiescence (capture continuations) that prevents the blunder, not just that "search helps."

### What Worked
The ablation cleanly isolates the mechanism. With capture continuations: f2f4, 26 nodes, score 342. Without: d1d5, 25 nodes, score 456. The one-node difference (26 vs 25) represents the single capture continuation that evaluates the recapture after QxR. The score difference (114 centipawns) closely approximates the net material loss from the recapture sequence.

### What Didn't Work
The ablation was performed on Wasm only, on one position. This demonstrates the mechanism but does not establish its impact across a range of positions. The design's Prediction 8 claims a 15+ percentage-point strength reduction from disabling quiescence over 100 games, which requires a full game series.

### What I Learned
The distinction between the material-only comparison and the ablation is important and easy to conflate. Material-only mode is a complete search configuration (depth 1, static evaluation, no capture extensions). The ablation modifies only one aspect of the quiescence framework. That both produce the same behavioral change on this position is confirmatory, not redundant. They answer different questions: "Does search depth matter?" versus "Do capture continuations specifically matter?"

### What Was Tricky to Build
Not applicable (interpretation only).

### What Warrants a Second Pair of Eyes
Whether the ablation correctly disables only quiet-leaf capture continuations without affecting other quiescence behavior (stand-pat evaluation, in-check evasion generation). The evidence shows the expected behavior, but the internal implementation of the ablation was not supplied.

### What Should Be Done in the Future
Run the ablation on the physical device to confirm Wasm/RV32 parity extends to ablation experiments. Extend the ablation to multiple positions, particularly those with complex capture sequences (kiwipete, the castling-promotion position).

### Code Review Instructions
Not applicable (no code produced). The ablation implementation should be reviewed to confirm it disables only capture continuations at quiet leaves and does not accidentally affect stand-pat scoring or in-check evasion.

### Technical Details
Ablation target: Wasm. Position: defended-rook. With capture continuations: move f2f4, 26 nodes, score 342. Without: move d1d5, 25 nodes, score 456. Score difference: 114 centipawns. Node difference: 1. The disabled configuration is functionally equivalent to material-only for this position (25 nodes vs material-only's 25 nodes, same move d1d5), confirming that capture continuations are the differentiating mechanism.

---

## Step 5: Evaluating Host Timing Measurements

### Prompt Context
Host compile statistics come from nine QuickJS process CPU runs per target, with compiler loading (setup) timed independently from compilation. Node/Wasm first-move event timings exclude scheduler, compositor, and panel overhead.

### What I Did
Analyzed the compile-time distributions for both targets. Computed the Wasm NPS from the search-only wake timing. Assessed the event-timing precision and variability.

### Why
Host timings provide the reference baseline for the physical device comparison. The compile times characterize the compiler's own performance. The event timings characterize the chess engine's execution speed on a fast host.

### What Worked
The compile-time distributions are tight. Wasm compile median is 21.63 ms (range 20.40-30.64 ms). RV32 compile median is 30.44 ms (range 27.86-31.40 ms). The RV32 target takes approximately 41% longer to compile, which is plausible given the larger module output (240,452 vs 73,204 bytes, a 3.3x ratio).

The search-only wake total (median 5.30 ms for 1,600 nodes across 78 search slices) implies approximately 302,000 NPS on the host Wasm runtime. Each search slice takes about 68 µs on average. The longest single wake (median 0.31 ms) suggests good cooperative yielding with no pathological single-slice stalls.

### What Didn't Work
The event timings are measured at sub-millisecond precision. At this scale, V8 JIT state, garbage collection, and OS scheduling could introduce noise that the nine-sample median does not fully characterize. The max values (e.g., launch frame max 0.474 ms vs median 0.406 ms) show 17% variation, which is acceptable but not negligible.

### What I Learned
The setup/compile separation reveals that QuickJS runtime initialization (4.7-5.5 ms) is a significant fraction of total compile time (roughly 18-20%). On the physical device, this ratio likely shifts because compilation takes much longer while QuickJS setup may scale differently.

The RV32 module is 3.3x larger than the Wasm module, which is expected: RV32 uses fixed-width 32-bit instructions while Wasm uses variable-length encoding.

### What Was Tricky to Build
Not applicable (interpretation only).

### What Warrants a Second Pair of Eyes
The relationship between host NPS (~302K) and device NPS (~6.4K) is a 47x ratio. This is a large gap. Some of it reflects the Node.js V8 JIT compiling Wasm to native x86, while the ESP32-P4 runs interpreted or simply-compiled RV32. Someone should verify whether the device is running the RV32 module through an interpreter or executing native machine code, as this would explain the gap.

### What Should Be Done in the Future
Add NPS as an explicit measurement to both host and device test harnesses rather than deriving it from search duration and node count. Report NPS per position to identify positions where the engine is unusually slow (indicating expensive move generation or evaluation).

### Code Review Instructions
Not applicable (no code produced).

### Technical Details
Host Wasm NPS: ~302,000 (1,600 nodes / 5.30 ms). Host compile: Wasm 21.63 ms median, RV32 30.44 ms median, both with 9 samples. Setup overhead: 4.71 ms (Wasm), 5.50 ms (RV32). Module size ratio: RV32/Wasm = 3.28x. Compile time ratio: RV32/Wasm = 1.41x. The compile time ratio is much smaller than the module size ratio, suggesting compilation is not purely proportional to output size.

---

## Step 6: Assessing Physical Device Performance

### Prompt Context
One native RV32 exchange was observed on the physical board. The compile clock includes all phases from input delivery through compiler teardown. The reply clock measures from the final Enter keystroke to the retained reply frame. World CPU, engine execution, and kernel render sum over chess segments. A separate first-capture attempt failed before play started.

### What I Did
Decomposed the physical device timings into their component phases. Computed the derived NPS. Compared device output against host results and linked-world simulation. Analyzed the first-capture failure.

### Why
The physical device is the target platform. All host measurements are proxies. The single device observation is the only ground truth for compile speed, NPS, and response latency on the ESP32-P4.

### What Worked
The device output matches perfectly: "Last b8-c6 Depth 3 Nodes 1600 Eval 12" in both the linked-world simulation and the physical board. The move played (e2e4 as white, b8c6 as black's reply) is consistent with the opening-position deepening test (b1c3 at depth 3 with score 30 ... actually, the opening test shows b1c3 for deepening). Wait — the device played e2e4 as white, but the engine test shows b1c3 as the deepening move. This is because the device test may use a different node budget (the evidence shows 1,600 nodes on the device, same as the host deepening test, but the linked world shows "Eval 12" while the host deepening shows score 30). The discrepancy is that the linked world reports the black reply's evaluation context (after white plays e2e4 and black replies b8c6, eval 12 is from black's perspective or the subsequent position). The host test evaluates the opening position search from white's perspective.

Actually, re-reading the evidence: the linked world reply is "Last b8-c6 Depth 3 Nodes 1600 Eval 12." This reports black's reply move. The eval 12 is the evaluation after the full sequence. The device move entry shows white played e2e4 and black replied b8c6, with depth 3, nodes 1600, score 12. The host opening test shows the engine choosing b1c3 from the starting position with score 30. The difference is that on the device, white (the human) played e2e4, and the engine (playing black) searched from the resulting position, finding b8c6 at depth 3, 1600 nodes, eval 12. The host test has the engine playing white from the starting position. These are different positions being searched.

### What Didn't Work
The first physical capture attempt failed with a JSON parse error. Two compiles succeeded (wall times 1,897,047 µs and 1,897,129 µs, remarkably consistent), but the world-list payload of 5,364 characters suffered data corruption at character 5,357. Play never started. The device was factory-restored. This is a UART protocol reliability issue: the last 7 characters of the payload were corrupted or truncated.

### What I Learned
The device compile time (1.90 s) is approximately 62x the host RV32 compile time (30.4 ms median). This ratio reflects the difference between QuickJS running on a modern x86 host versus the ESP32-P4 at 400 MHz. The device compile time includes phases not present in the host measurement (bundled input transfer, module copy), so the ratio overstates the pure compilation difference.

The device reply time (473 ms) breaks down as: 3.1 ms for the white-frame boundary, then 469.8 ms for the engine's search and reply. Of the 258.8 ms world CPU time, 250.7 ms is engine execution and 8.0 ms is kernel render. The remaining ~214 ms between reply wall clock (473 ms) and world CPU (259 ms) is unaccounted for in the evidence and may represent OS scheduling, UART I/O, or other system overhead.

The derived NPS of approximately 6,382 is below the design's predicted 10K floor. Engine time (250.7 ms) includes app frame generation, so the pure search NPS may be slightly higher, but not enough to close the gap.

### What Was Tricky to Build
Not applicable (interpretation only).

### What Warrants a Second Pair of Eyes
The gap between reply wall clock (473 ms) and world CPU (259 ms) leaves approximately 214 ms unattributed. This is 45% of the reply time. Someone with access to the device instrumentation should identify what occupies this interval — RTOS scheduling, UART communication, display updates, or other system overhead.

The first-capture JSON parse failure at character 5,357 of a 5,364-character payload suggests a buffer or timing issue in the UART transfer of the world-list data. The corruption occurs in the last 7 characters, which could indicate a buffer underrun, a timeout, or an encoding error near the payload boundary.

### What Should Be Done in the Future
Repeat the physical exchange at least nine times to establish timing distributions. Profile the 214 ms gap between reply wall clock and world CPU. Investigate and fix the UART protocol failure. Test with longer payloads (the capture scenario requires a larger world-list than the first move) to determine whether the failure is payload-size-dependent.

### Code Review Instructions
Not applicable (no code produced). The UART transfer code should be reviewed for buffer management near payload boundaries, particularly for payloads around 5,000 characters.

### Technical Details
Device compile: 1,897,746 µs wall, 1,298,116 bytes peak QuickJS heap, 240,452 bytes module output. Device reply: 472,922 µs wall, 258,777 µs world CPU, 250,684 µs engine, 7,990 µs kernel render. Derived NPS: 1,600 / 0.250684 = 6,382. First-capture failure: JSON parse error at char 5,357 of 5,364-char payload, two successful compiles (~1.897 s each), no play, device restored. Compile time consistency between the two first-capture compiles (82 µs difference over 1.9 s) is excellent.

---

## Step 7: Reconciling Predictions with Outcomes

### Prompt Context
The design makes eight falsifiable predictions. The evidence provides data for six of them. This step synthesizes the comparison.

### What I Did
Evaluated each prediction against the evidence, assigned a status (confirmed, contradicted, consistent-but-not-confirmed, or not tested), and identified the specific evidence supporting each assessment.

### Why
The design document is structured as a scientific proposal with testable claims. The value of this interpretation depends on honest comparison between predicted and observed behavior.

### What Worked
Six of eight predictions have relevant evidence. Five are consistent with the evidence (Predictions 1, 2, 3, 4, 6). One is contradicted (Prediction 5, NPS). The contradiction is significant: the design explicitly flagged below-10K NPS as a "compiler code-quality problem."

### What Didn't Work
Two predictions (check extension impact, full quiescence game-level impact) cannot be evaluated because the required test protocols were not conducted. The strength predictions (Predictions 2 and 8) require 100-game series that were not run.

### What I Learned
The NPS contradiction is the most actionable finding. At 6,382 NPS, a 100K-node budget takes approximately 15.7 seconds of engine time (plus system overhead). This may be acceptable for casual play but is below the design's target for a "responsive" engine. The 47x gap between host and device NPS suggests room for optimization in the compilation pipeline.

The determinism confirmation (Prediction 6) is the cleanest result: all twelve positions, all four modes, identical on both backends. This validates the design's most fundamental requirement for the dual-target architecture.

### What Was Tricky to Build
Not applicable (interpretation only).

### What Warrants a Second Pair of Eyes
The NPS figure. I derived it as 1,600 / 0.250684 = 6,382, but engine time includes app frame generation. If frame generation is a significant fraction of engine time (say 20%), the pure search NPS could be closer to 8,000. Someone with profiling access should separate search time from frame time.

### What Should Be Done in the Future
Run the two untested predictions (Predictions 7 and 8) with their specified protocols. Investigate the NPS shortfall with profiling. Update the design document's NPS prediction based on measured data.

### Code Review Instructions
Not applicable (no code produced).

### Technical Details
Prediction scorecard: P1 (perft) consistent, P2 (strength) consistent but unquantified, P3 (EBF) consistent at lower end, P4 (depth) consistent by extrapolation, P5 (NPS) contradicted (6.4K vs 10K-100K predicted), P6 (determinism) confirmed, P7 (check extension) not tested, P8 (quiescence games) not tested.

---

## Step 8: Identifying the UI Winner-Label Bug and Its Correction

### Prompt Context
The UI initially displayed the wrong winner after checkmate because the position stores the losing side to move. The corrected app uses both independent reference mates (white and black) to verify the rendered winner text. The verified mate labels are "Checkmate - White wins" and "Checkmate - Black wins."

### What I Did
Traced the bug's root cause through the chess data model. After white delivers checkmate, it becomes black's turn, but black has no legal moves and is in check. The position's side-to-move field reads "black." The initial UI interpreted this as "Black wins" instead of "Black is checkmated (White wins)."

### Why
This is a UI correctness issue that could not be caught by engine tests alone. The engine correctly identifies checkmate (legal moves = 0, inCheck = true, score = -30,000), but the display layer must invert the side-to-move to determine the winner. The two independent mate positions (one where white mates, one where black mates) provide a complete test: any systematic inversion error would cause at least one label to fail.

### What Worked
The corrected labels — "Checkmate - White wins" and "Checkmate - Black wins" — are verified in the evidence. Using two independent mate positions (not just one with an expected value) catches both directions of the inversion bug. If the fix were wrong in a different way (e.g., always showing "White wins"), the black mate test would catch it.

### What Didn't Work
The initial bug existed and was shipped to at least the testing stage. The design's correctness catalog (Section 12) identifies stalemate/checkmate confusion as a risk but does not explicitly flag the UI-layer winner-label inversion. This was a gap in the design's coverage.

### What I Learned
The side-to-move convention after checkmate is a well-known source of display bugs in chess programs. The position is "legal" (it correctly represents a terminal state), but the UI must know that side-to-move in a checkmate position means "the side that lost," not "the side that is playing." This is worth adding to the design's correctness catalog.

### What Was Tricky to Build
Not applicable (interpretation only).

### What Warrants a Second Pair of Eyes
Whether the stalemate label is also correct. The stalemate position has 0 legal moves, inCheck=false, and score 0. The UI should display something like "Stalemate - Draw" rather than "Checkmate - [side] wins." The evidence does not include a stalemate label check.

### What Should Be Done in the Future
Add the winner-label inversion to the design's correctness catalog. Add a stalemate label test alongside the two mate label tests. Consider adding a resignation/draw-by-agreement label test if those features exist.

### Code Review Instructions
Not applicable (no code produced). The UI code that determines the winner from a checkmate position should be reviewed to confirm it inverts the side-to-move, not reads it directly.

### Technical Details
Mate-in-one (white delivers): position has black to move, inCheck=true, 0 legal moves. Correct label: "Checkmate - White wins." Mate-in-one (black delivers): position has white to move, inCheck=true, 0 legal moves. Correct label: "Checkmate - Black wins." Both labels verified in the evidence's mateLabels array.
