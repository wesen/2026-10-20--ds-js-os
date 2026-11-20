# Critique of the chess search benchmark

I found nothing that invalidates the equivalence harness. Pinned sources, an exact image, the same FEN and state ABI, exact checks on five signed results, preserved root cells, slice-size invariance and an explicit node cap together pin the work well enough for two targets to be compared. The weaknesses are in what the current output can support. A few claims would be fatally wrong if anyone made them from this data.

## What I checked in the JSON

- **Move encoding is consistent.** Every `bestMove` decodes as `from*64 + to` on an a8=0 board, and every result matches its `uci` field. For example, e1e8 = 60·64 + 4 = 3844, and b8c6 = 1·64 + 18 = 82.
- **Node counts look cumulative across deepening iterations.** In the 1600-node row, depth 3 completed at 1,458 nodes, which is under the budget, and the cap then cut off depth 4.
- **Kiwipete depth 4 and depth 5 did identical work.** Both stop at 30,000 nodes, 2,072 slices, completed depth 3 and the same move. Their medians are 173.6 ms and 171.3 ms, about 1.3% apart. Because only medians are reported, this pair is the only replicate that shows host noise.

## Problems, most serious first

**1. Hardware timing is missing, so there is no cross-target result yet.** All 17 timed rows come from V8 on the i7. Right now the data supports two things: a host reference schedule, and evidence that the Wasm build is deterministic and slice-invariant. It does not support a speed ratio, a time per move on the handheld, or a statement about RV32 code quality.

**2. "Capped" is not recorded in the output, and the obvious substitute rule is wrong.**
- No row has a stop-reason field, so a reader has to infer capping.
- `completed < depth` does not mean capped. The mate-in-one row has completed 1 of depth 5 and stopped early at a terminal position, not at the cap. A script using that rule would mislabel it.
- `nodes == budget` is only a proxy for capping.
- **Fix:** have the engine emit `stop: complete | capped | terminal`.
- Under that scheme six rows are capped: opening d5, after-e2e4 d5, kiwipete d4 and d5, rook-ending d5, and the 1600-node row.

**3. A host-to-device ratio would not measure compiler quality.** The two timings differ in:
- the CPU microarchitecture and clock;
- the memory hierarchy;
- the code generator, since V8's TurboFan is a second optimizing compiler applied to your Wasm.

A ratio between them is a whole-stack slowdown. Calling it "our RV32 backend vs Wasm" would be a fatal framing error.

**4. Cost per node varies about 3.5× across rows.** These figures are derived from your numbers:

| Row | ns/node |
|---|---|
| pawn-ending d3 / d5 | 2,426 / 2,430 |
| rook-ending d4 / d5 (capped) | 3,188 / 3,045 |
| after-e2e4 d3 / d4 | 4,230 / 4,236 |
| after-e2e4 d5 (capped) | 7,540 |
| kiwipete d3 | 8,529 |

If the d5 run repeats the d4 run's first 14,868 nodes (an assumption), the nodes after after-e2e4's depth 4 cost about 10.8 µs each. The equivalent figures are about 5.9 µs for opening and about 3.0 µs for rook-ending.

So a "node" controls the search but is not a uniform amount of work. Consequences:
- nodes per second is not a portable metric;
- a capped row's time depends on where the cap happens to fall;
- the only meaningful cross-target comparison is per row.

The CJI instruction counts give you a test you can run before any hardware data. If instructions per node jump in the same rows, the variation comes from the program, for example uncounted quiescence work or move-ordering cost. If they don't, it is a host effect.

**5. A naive aggregate would be skewed.**
- The two kiwipete capped rows are the same work and would be counted twice.
- The six capped rows dominate any sum.
- The mate row (66 µs) and the sub-millisecond pawn rows are mostly call overhead.
- **Fix:** declare in advance which rows are distinct, and report per-row ratios or a geometric mean over that set. Don't total the wall times.

**6. The lab timing may not predict the shipped game.** Embedding the image by assembly can put code and state in different memory from where the shipped loader puts them: flash through the cache, PSRAM, or internal SRAM. On the P4 that placement can matter as much as code generation. Record where code and state live in both setups. Without a match, lab time is not shipped time.

## Limitations to state plainly

- **The device sample is small.** One boot and three repeats give no boot-to-boot variance, and the first repeat may run with cold caches. Exact results must be checked on every repeat, not just one, to rule out state carried between searches.
- **The host clock is uncontrolled.** A laptop with turbo boost and no recorded governor setting limits precision.
- **Only medians are reported.** Add min and max, or the interquartile range, for both targets.
- **Driver overhead is included but not measured.** The Wasm runs at slice sizes 1 and 4096 are checked for correctness only. Timing them would bound the per-slice cost.
- **The output is missing context.** Slice size, repeat count, target, FENs and per-row comparison status are not in the JSON. It is also unclear which artifact `digest` covers. Give the source SHA, the RV32 image and the Wasm module separate digests.
- **The two perft checks are shallow.** 8,902 is the start position at depth 3 and 2,039 is Kiwipete at depth 2. By the standard perft breakdowns, neither exercises promotion, and en passant appears about once. That doesn't affect the benchmark, which only needs identical work on both targets. It does limit any claim that the move generator is correct.
- **The code sizes can't be compared.** 26,580 RV32 bytes and 10,623 Wasm bytes are different representations, so the numbers say nothing about code density.
- **This is not user-perceived latency.** The OS, rendering and UART paths are excluded by design.
- **The suite is small.** Five positions plus a mate test cover one engine. Only depth 3 completes in all five positions, and depth 4 in four.

## How to frame it for teaching

**"The benchmark fixes the work, not the time."** The exact five-result check is what lets two very different machines be compared: they provably ran the same search. Then split the time with one identity:

> time = instructions × CPI ÷ 360 MHz

- **Instructions** come from the CJI interpreter count. This is the part the compiler controls, and it is deterministic and independent of hardware.
- **CPI** is derived from device time ÷ instructions × 360 MHz. It covers the machine and memory, including where code and state are placed.
- The **V8 time** is a reference schedule and a check on the oracle, not a competitor.

Keep two questions apart. Completed fixed-depth rows answer "what does depth *d* cost?" The 1600-node row answers "what does a player wait for?" Capped rows are valid comparisons of equal work across targets, but say nothing about how cost scales with depth.
