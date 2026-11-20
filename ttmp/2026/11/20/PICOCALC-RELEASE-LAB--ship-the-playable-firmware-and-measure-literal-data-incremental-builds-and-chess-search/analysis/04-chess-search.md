---
Title: A Chess search as a compiler benchmark on the PicoCalc
Ticket: PICOCALC-RELEASE-LAB
DocType: analysis
Status: active
Topics:
  - picocalc
  - compiler
  - performance
Author: Claude Opus High
---

# A Chess Search as a Compiler Benchmark on the PicoCalc

Start from the position after 1.e4, ask the maintained PicoCalc Chess engine for depth four, and cap the search at 1600 nodes. On the handheld's ESP32-P4 it returns the move b8c6 with a score of 12, a completed depth of three, exactly 1600 nodes and 78 slices. The median search takes 239.311 ms over three runs. A laptop runs the same engine source, compiled to WebAssembly, and returns the same five numbers in a median of 2.887 ms. The suite has 17 cases and 51 board repetitions. Every board record matched the host record and the instruction-model record in all five fields.

This agreement is why the engine works as a compiler workload. Chess search is deterministic and branchy. It indexes small arrays constantly, and it produces a short answer that can be checked exactly. A change in the record exposes a regression in the observable search result. Timings compare each matched case across the two tested environments.

## The root position

Every search starts from a root position. Chess positions are usually written in Forsyth–Edwards Notation (FEN), a single line with six fields. The fields record piece placement, the side to move, castling rights, the en-passant target square, the halfmove clock for the fifty-move rule, and the fullmove number. The textbook starting position is

```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

and in textbook form the position after 1.e4 reads

```
rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1
```

The benchmark checks the FEN fixture by applying e2–e4 to the starting position through the engine's maintained `chessMake` routine. All 135 cells of that result match the parsed fixture. This ties the input to the code being measured.

Inside the engine the board is a 0x88 mailbox. That is a 128-entry array where a square's index is 16 × rank + file. Half of the entries lie off the board. The first eight slots per row are on the board. The maintained bounds check requires an index between zero and 127 and a remainder modulo 16 of less than eight. The engine also stores both king squares directly, so check detection never has to search for them.

Scores are from the point of view of the side to move, and a pawn is worth 100. After 1.e4 it is Black's turn, so a score of 12 means the engine rates the position about twelve hundredths of a pawn better for Black at that depth. Mate scores sit near 30000.

Two perft counts gate the build before any timing. Perft counts every leaf of the full legal-move tree down to a fixed depth. The opening gives 8902 at depth three and the Kiwipete position gives 2039 at depth two, matching the standard reference values. These are sanity checks on move generation. They do not establish that the engine covers all the rules.

## Plies, nodes and slices

Each record uses three units, and each one counts something different.

A ply is one move by one side. A depth-four search looks four plies ahead, which is two moves for each side.

The engine counts a node every time it enters a search position. This includes positions in quiescence search, the extension that keeps following captures past the nominal depth so the evaluation does not land in the middle of an exchange. The node count grows with depth, with tactical complexity and with the quality of move ordering.

A slice is one call to `chessSearchSlice`. Each call advances the engine's explicit state machine by at most 48 steps and then returns. Between slices the caller can give other work a turn. The longest observed slice measures one uninterrupted search call in this standalone driver. The aggregate also records a slice-invariance check at 1, 48 and 4096 steps per slice. The number of nodes per slice depends on the position. The capped opening search fits 30000 nodes into 1604 slices, and Kiwipete needs 2072 slices for the same count.

## Alpha-beta and iterative deepening

Minimax search assumes that both sides always choose their own best move. Alpha-beta pruning tracks a window of scores. Alpha is the score the side to move is already guaranteed, and beta is the most the opponent will allow. When one move proves that a line is worse for a side than an alternative it already has, the remaining moves at that node cannot change the result, and the search skips them. The pruned tree returns the same root score as full minimax. How much it prunes depends heavily on trying good moves first.

Iterative deepening runs a depth-one search, then depth two, then depth three, and continues up to the requested depth. Every completed iteration leaves a full answer, and many engines also use the earlier iterations to improve move ordering. In this engine the node counter accumulates across iterations, so a depth-four row includes the work of depths one through three on the way to depth four.

## Why the deepest completed iteration gives the answer

A node budget can stop the search partway through an iteration. At that point only some root moves have been searched to the new depth, and under alpha-beta many of their scores are bounds and not exact values. Picking a move from that partial set would weigh a few deep, partly bounded scores against moves that have not been searched at all. So the engine reports the move and score from the deepest iteration that finished.

The 1600-node fixture shows this happening. With an effectively unlimited budget, a depth-three request after 1.e4 finishes in 1458 nodes and returns b8c6 at 12. A depth-four request under a 1600-node cap follows the same first three iterations, spends its remaining 142 nodes inside depth four, and stops. It reports completed depth three, b8c6 and 12. Those 142 extra nodes cost 8 more slices (78 against 70) and 22.383 ms more board time (239.311 against 216.928 ms), and the answer is unchanged. With the full 30000-node budget, depth four finishes at 14868 nodes, and the score changes to −18 while the move stays b8c6.

When an iteration does not finish, its work is thrown away. In the opening position, depth four finishes at 4438 nodes. The search then spends 25562 nodes on depth five before the 30000 cap stops it, and it reports the depth-four result.

## How the measurement was taken

The three test environments use one engine source, SHA-256 `dd0acd95…`.

- **Host.** A 10623-byte Wasm module ran on an 11th Gen Intel Core i7-1165G7 under Node v24.18.0 (V8 13.6.233.17-node.50), with seven warmed repetitions per row. The process was not pinned to a core, and V8 was not forced into a particular tier.
- **Instruction model.** The CJI RV32 emulator ran the RV32 build and counted modeled instructions.
- **Board.** The ESP32-P4 ran the 26580-byte RV32 image (SHA-256 `d576c3fd…`) from a single boot, with three repetitions per row. The clock measured 360 MHz at runtime. The search ran on core 0 with the board buffer in internal DRAM and the RV32 text flash-mapped as a standalone image. ([Host receipt](../various/chess/host.json), [Physical receipt](../various/chess/physical.json), [Instruction model receipt](../various/chess/modeled.json))

A record holds five integers, which are the move code, score, completed depth, nodes and slices. The canonical digest `f204dc1a…` covers five signed little-endian 32-bit integers per case in a fixed case order, so one comparison confirms the whole suite. The full root state of the board is checked after every trial. That catches a search that returns the right answer but leaves the position corrupted.

The timed interval is kept narrow on purpose.

```
 excluded   FEN parse, init, memory setup, compile, flash, boot
               │
 t0 ────────►  chessStartSearch
 timed         │ slice │ time query │ slice │ ... │ last chessSearchSlice
 t1 ◄────────  returns
               │
 excluded   root-state check, serial report, UI, renderer, timer gaps
```

The interval includes the time queries and the loop overhead between slices. These board timings cover isolated search and its driver. The interactive release adds input delivery, timer scheduling, rendering and display transfers even when it uses the same 1600-node schedule. The benchmark ran as a temporary app under the shared serial lock. Restoring the original release app and partition was checked as a separate step. ([Design and reproduction guide](../design-doc/04-chess-search-benchmark.md))

The CJI model counts executed RV32 instructions, including the thin freestanding driver. A P4 hardware counter would measure a different boundary.

## Representative measurements

All times are medians, and the budget is 30000 nodes unless the row says otherwise.

| Position | Request | Stop | Move | Score | Done | Nodes | Slices | Host ms | P4 ms | Model instr/node |
|---|---|---|---|---|---|---|---|---|---|---|
| opening | d3 | depth | b1c3 | 30 | 3 | 871 | 41 | 1.384 | 121.233 | 36,568 |
| opening | d5 | budget | b1c3 | 0 | 4 | 30000 | 1604 | 50.623 | 4321.864 | 37,766 |
| after e2–e4 | d3 | depth | b8c6 | 12 | 3 | 1458 | 70 | 2.506 | 216.928 | 39,152 |
| after e2–e4 | d4, 1600 cap | budget | b8c6 | 12 | 3 | 1600 | 78 | 2.887 | 239.311 | 39,320 |
| after e2–e4 | d4 | depth | b8c6 | −18 | 4 | 14868 | 835 | 27.233 | 2290.074 | 40,313 |
| Kiwipete | d4 | budget | e2a6 | 149 | 3 | 30000 | 2072 | 67.541 | 5682.902 | 50,127 |
| Kiwipete | d5 | budget | e2a6 | 149 | 3 | 30000 | 2072 | 73.045 | 5683.202 | 50,127 |
| rook ending | d5 | budget | a1a7 | −5 | 4 | 30000 | 1680 | 35.912 | 3034.556 | 27,001 |
| pawn ending | d5 | depth | e3d4 | 141 | 5 | 1729 | 91 | 1.733 | 142.179 | 22,236 |
| mate in one | d5 | mate | e1e8 | 29999 | 1 | 21 | 2 | 0.028 | 1.873 | 23,618 |

The board repeats very closely. The pawn-ending depth-five row ranges from 142179 to 142183 µs. Among the rows above, the opening at depth three has the widest board spread, from 121232 to 122561 µs, and the first run of a row can include cold instruction caches. The host varies more. The e2–e4 depth-five row runs from 52.226 to 71.656 ms around a 54.531 ms median, which is typical for an unpinned laptop process.

Each case can be compared with itself across the two machines. Over the 17 rows, the board's median is between about 67 times the host's (for the smallest searches) and about 88 times. The two Kiwipete rows do identical work and still give ratios of 84.1 and 77.8, because host noise shifts the ratio. For this reason the article reports paired times per case and does not reduce them to a single suite slowdown figure. ([Aggregate results](../various/chess/summary.json))

## What the scopes imply

The Stop column records which condition ends each search.

A depth row finished every iteration it asked for. Its time includes the nodes the engine explored after pruning. The pawn ending at depth five is the cleanest case. It finishes depth five in 1729 nodes and 91 slices and returns e3d4 at 141. It takes 142.179 ms on the board, 1.733 ms on the host and 38,445,538 modeled instructions. Its longest board slice was 1821 µs.

A budget row used its fixed number of node entries and reports the deepest iteration completed within that limit. Its time is the cost of 30000 nodes in that position, so comparing it with a depth row from the same position compares two different quantities. The two Kiwipete rows show why the scope matters. Depth four never finished within 30000 nodes, so asking for depth five changed nothing. Both runs completed depth three, returned e2a6 at 149, used 30000 nodes and 2072 slices, and executed exactly 1,503,799,725 modeled instructions. Their board medians are 5,682,902 and 5,683,202 µs, which is 300 µs apart. Their host medians differ by 5.5 ms despite agreement on every recorded output and the instruction count. Kiwipete also has the longest slice in the suite, 4416 µs.

A mate row stopped early because the search proved a mate. The mate-in-one case asked for depth five, completed depth one in 21 nodes and returned e1e8 at 29999. It got nowhere near the budget, so its time shows how quickly the proof arrived.

The same node count can carry very different costs. At 30000 nodes, the board takes 3.035 s for the rook ending, 4.322 s for the opening and 5.683 s for Kiwipete. Modeled instructions per node range from about 22,000 in the pawn ending to about 50,000 in Kiwipete. That pattern fits move generation and ordering doing more work in positions with more legal moves. Board time per node follows the same order, from 81.4 to 189.4 µs. In every row, modeled instructions divided by board time stays between about 262 and 271 per microsecond. That consistency suggests the model tracks board cost well for this workload. It does not give an exact CPI, because the model includes the driver and does not count retired instructions.

The rook ending shows how the benchmark checks a change in the engine's decision with depth. At depth three it plays f2f4 at 6, and at depth four it switches to a1a7 at −5. Every target computes both results. Playing strength would require separate game outcomes.

## Limits of the evidence

The three targets produced the same five-field records for this deterministic implementation. The records cover outcomes and counts. A per-node visitation comparison would require a separate trace. Both perft checks exercise move generation for the selected positions and depths. The timing results describe one isolated board boot and a warmed laptop process. ([Investigative diary](../reference/04-chess-search-diary.md))
