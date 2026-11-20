# Benchmark plan review: typed chess engine on Wasm (x86 Node/V8) and RV32IM (ESP32-P4)

I did not read the engine source or ABI. Function names below are placeholders. No results are given. Every number is either a well-known chess fact or a blank for you to fill in.

## 1. Pin the question first

The plan compares two different systems. One is V8's Wasm tiers on an x86 core. The other is the lab's RV32 backend on a 400 MHz in-order core. A single "device is N× slower" ratio can't tell you whether the gap comes from the compiler or the hardware. State the question so it can be answered:

> For identical searches (same nodes, same result), what does one node cost on the handheld compared with the host? How much of that cost comes from instructions executed and how much from the time each instruction takes?

That means you need an instruction-count comparator, not just wall time (§6).

## 2. Critique of the plan

| Plan item | Verdict | Change |
|---|---|---|
| Reuse exact engine source and ABI | Keep | Also hash the source, the `.wasm`, the RV32 image, the compiler commit and the ABI version. Put all of them in every result record. |
| Opening, post-e2e4, congested middlegame, tactical/endgame FENs | Keep | Use the exact FEN the game produced, not a hand-typed one (§3). Also add a perft gate. A wrong move generator can still agree with itself on both targets. |
| Depths 3–5 | Partly | Search cost grows fast with depth, and quiescence makes the growth uneven between positions. A uniform "d3–5 on every fixture" will either be too short to time well on the host or too long for the board. Choose depth per fixture from host node counts (§7). Use the same depth on both targets. |
| Fixed node budget **and** fixed depth | Problem | These two mix. If the budget cuts a search off, the "completed depth" depends on where it was cut. Use two separate modes (§4). |
| Continuation slices | Keep, test it | The search result must not depend on slice size. Measure that directly. Slices must be counted in **nodes**, never in time. Otherwise the slice count is nondeterministic and can't be compared exactly. |
| Verify move/depth/score/nodes/slices + unchanged board | Keep, tighten | "Unchanged board" must cover all incremental state, not just the 64 squares (§5). |
| Comparable timing boundaries | Underspecified | V8 tiering (Liftoff → TurboFan) and device placement (where code and data live in memory, plus caches) affect timing more than anything else in this study. Define the boundaries explicitly (§6). |
| Preserve installed firmware | Keep | Make it a scripted, checked step with a readback (§8). |

## 3. Fixtures

| ID | Position | Source | Extra check |
|---|---|---|---|
| F1 | Start: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` | standard | perft(1..4) = 20, 400, 8 902, 197 281 |
| F2 | After 1.e4: `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1` | **use the string your game log wrote** | Some FEN writers emit `-` instead of `e3`. Both must parse to the same state. |
| F3 | Congested middlegame | Take it from a recorded lab game. Don't compose it. | Many captures available, so quiescence work is high. |
| F4 | Tactical or endgame with a known answer | Take it from a recorded game, or use a forced mate or win of material that you have checked independently | The expected best move or mate score is stated before the run. |
| P | Kiwipete `r3k2r/p1ppqpb1/bn2pnp1/3P4/1p2P3/2N2N2/PPPBBPPP/R3K2R w KQkq - 0 1` | perft only | perft(1..3) = 48, 2 039, 97 862. This exercises castling, en passant and promotion paths. |

Commit the fixtures as a file. Each entry should hold the FEN, its source (game ID and ply), the chosen depth and the expected oracle values.

## 4. Two search modes. Don't mix them.

- **Mode A: fixed depth (for timing).** Set the node budget as a safety ceiling well above the expected count. Assert that the budget was **not** reached. If it was, the run is invalid for timing.
- **Mode B: budget-bound (for slice and continuation behaviour).** Set the budget below the cost of a complete search. Record the completed depth, the best move found so far and the node count. The cut-off point is deterministic because the budget is in nodes, so these values must also match exactly across targets.

**Slice-invariance test:** run each Mode A fixture with slice size = ∞ (one slice), a medium size and a small size. Everything except `slices` must match exactly. This is the cheapest strong test of continuation correctness.

## 5. Result record and equality comparator

One canonical record per run, compared field by field:

```
fixture, mode, depth_req, depth_done, move (UCI), score, nodes_total,
nodes_per_iter[1..d], qnodes, slices, slice_size, budget_hit,
board_hash_before, board_hash_after, source_hash, artifact_hash, abi_version
```

- **Correctness comparator:** host-Wasm and device-RV32 records must match on every field except timing. Where the slice size is the same, `slices` must match too. Any difference in `nodes` is a **compiler bug**, not a performance result. Stop and debug before you time anything.
- **Board-unchanged check:** hash the full state, not just the squares. That means squares, side to move, castling rights, en passant square, halfmove and fullmove counters, plus any incremental eval, piece lists, king squares and Zobrist key if the engine has them. Hash it before the search, after every slice (cheap, and it catches make/unmake leaks at the point they happen) and after the final slice.
- **Integer semantics:** Wasm `i32` and RV32IM agree on wraparound. Check that the lab's RV32 lowering matches Wasm on signed division and remainder, shift amounts ≥ 32 and comparison signedness. Engines that use `x / 2` on negative scores or shifts for packed moves are exactly where these two targets can quietly disagree.

## 6. Timing boundaries and comparators

### Boundaries

| Interval | Host (Node/V8) | Device (ESP32-P4) |
|---|---|---|
| `T_load` | Wasm compile and instantiate. Report it, but separately. | Image load or on-device compile. Separate column, since the lab's compiler studies already cover it. |
| `T_setup` | FEN parse, board init. Excluded. | Same. Excluded. |
| `T_search` | From the first `search_start` call to the return of the final slice. `process.hrtime.bigint()`. | Same boundary. `esp_cpu_get_cycle_count()` or `esp_timer_get_time()`. Convert after the run. |
| `T_slice_sum` vs `T_wall` | Sum of the time inside slices, compared with total wall time including gaps between slices | Same. On the device the gap includes painter, scheduler and watchdog feeding. Report both. |
| Output | Excluded | **No UART output inside the timed region.** Buffer the records and print them afterwards. |

### Host controls

- Record CPU model, governor, Node and V8 versions. Pin with `taskset`.
- V8 compiles Wasm with Liftoff first and tiers up to TurboFan during the run, so a first run measures a mix. Report three columns:
  - **cold**: fresh process, first run
  - **warm**: same process, run after warm-up, median of n runs
  - **forced-tier**: `--liftoff --no-wasm-tier-up` and `--no-liftoff`
- With all three, the Wasm number refers to a specific tier rather than whatever tier V8 happened to reach.

### Device controls

- Read the actual CPU frequency from the running firmware. Don't assume 400 MHz.
- Record where the code and the board/search state live: internal SRAM, PSRAM or flash-mapped. This can matter as much as the compiler.
- Pin the benchmark task to one core. During timed runs, stop or quiesce Wi-Fi, the display painter and the key poller. Otherwise record them as known interference.
- Report the first run after load (cold caches) separately from the warm-run median.

### Performance comparators (in order of usefulness)

1. **ns/node per target**, valid only when node counts are identical (guaranteed by §5). Report the device/host ratio for each fixture, not just an average.
2. **RV32 instructions/node.** Run the same RV32 image in a deterministic simulator (Spike or QEMU with instruction counting) to get retired instructions. If the P4 core exposes `minstret`, read it on the board as well. Then `cycles/node ÷ instructions/node = CPI` splits the gap into compiler cost (instruction count) and hardware cost (CPI).
3. **Plain JS on Node.** Run the same typed source as ordinary JavaScript under V8's JIT. This compares the typed-subset → Wasm path against "just run JS" on the host.
4. **Not recommended:** a C or Stockfish-class reference engine. It runs a different algorithm with a different node count, so there is no exact comparison.

**Statistics:** n ≥ 5 warm runs per cell. Report the median plus min and max. Device spread should be small. If it isn't, that points to interference, so investigate rather than averaging it away.

## 7. Bounded board runtime

Node counts are deterministic, so the host can predict the device workload exactly before anything is flashed.

1. **Host pilot.** For each fixture, run d3, d4 and d5. Record `nodes_total`.
2. **Device calibration.** One run: F1 at d3, warm. This gives device ns/node.
3. **Choose depths.** Keep (fixture, depth) pairs whose predicted device `T_search` falls between a floor and a ceiling, for example 0.5 s and 20 s. The floor keeps timer resolution and per-slice overhead from dominating. The ceiling keeps the session short. Use the same depth on the host.
4. **Hard caps.**
   - The node budget is the per-run ceiling. Set it to about 2× the expected nodes so a runaway search stops.
   - The session plan must fit a fixed total, for example ≤ 15 min of board time including flash and restore. Compute it as Σ(cells × reps × predicted time) before flashing.
   - If the plan doesn't fit, drop d5 cells first.
5. Keep slices short enough that the watchdog can never fire. Record the maximum time of any single slice.

## 8. Firmware preservation

1. Before starting, record the installed image's version string and hash over UART.
2. Build the benchmark as a **separate profile or image**. Never modify the playable profile. If the lab's loader can run the engine as a storage-loaded world, use that and skip reflashing altogether.
3. After the session, reflash the current playable build using `ttmp/2026/11/20/PICOCALC-TYPED-CHESS--…/reference/03-reproduce-chess.md`. Read the version back and confirm it matches step 1. Run a smoke test: boot, open Chess, make one move.
4. The restore step is part of the script, not something to remember. A failed restore fails the session.

## 9. Teaching example: F2 (after 1.e4), Mode A, d3, slice size ∞ vs small

This one example shows every idea in the study:

```
fixture F2  depth 3  mode A
            slice=∞            slice=small
move        ____               ____        ← must be equal
score       ____               ____        ← must be equal
nodes       ____               ____        ← must be equal; also equal on host
slices      1                  ____        ← the only field allowed to differ
hash before ____ = after ____
host  T_search warm median ____ ns  → ____ ns/node
P4    T_search warm median ____ cyc → ____ cyc/node,  minstret ____ → CPI ____
```

- **Correctness** comes first: equal records across targets and slice sizes.
- **Comparability** follows from equal node counts. Only then does ns/node mean anything.
- **Attribution** comes from splitting cycles/node into instructions/node and CPI.

It uses a real position from a played game, it is small enough to step through by hand, and Black's 20 legal replies match the perft(1) check.

## 10. Deliverables checklist

- [ ] Fixture file with sources and oracle values
- [ ] Perft gate passes on both targets
- [ ] Slice-invariance passes for every Mode A cell
- [ ] Records match exactly across targets (diff output saved)
- [ ] Timing tables: host cold, warm and forced-tier; device cold and warm; slice sum vs wall
- [ ] Instructions/node and CPI, or a stated reason why they're unavailable
- [ ] Board-time budget planned vs used
- [ ] Firmware readback before and after, matching
