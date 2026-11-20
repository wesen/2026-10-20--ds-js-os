---
Title: Benchmark the maintained Chess search on the PicoCalc
Ticket: PICOCALC-RELEASE-LAB
DocType: design-doc
Status: active
Topics:
  - picocalc
  - compiler
  - performance
---

# Benchmark the maintained Chess search on the PicoCalc

Use the released search algorithm as a CPU workload. A trial starts from a specified board and asks its engine for an answer under a specified depth and node budget. Compare the complete engine result before comparing machine time. The same project can measure the wait seen during interactive Chess, which includes a different path through timers, rendering and the panel.

## Inputs and outputs

Compile the exact `state.typed`, `position.typed`, `moves.typed` and `search.typed` files. They contain the state layout, position and move routines, and search. The harness calls `chessStartSearch` once and `chessSearchSlice` repeatedly while the returned state reports `running`. A slice executes at most 48 search *steps*, which can enter a position, consider a move or return to a parent. The node counter increments when the engine enters a new search position. Expected totals include nodes in quiescence and repeated work from shallower iterations.

Encode the board and retained position metadata in the engine's 135 start cells. Positions are expressed in Forsyth–Edwards notation, or FEN, a text format that includes placement, side to move, castling permissions, en passant, and counters. The host verifies the recorded initial reply position by applying e2–e4 through the engine's own make-move function. It checks the opening and Kiwipete against known legal-tree counts as a move-generator sanity gate. The search does not use those counts as its search result.

| Fixture | Purpose |
| --- | --- |
| Initial position | Stable move ordering and widening search from a familiar position |
| After e2–e4 | Black reply with a direct comparison to the shipped depth 4, 1,600-node settings |
| Kiwipete | Congested legal move generation, castling and tactical search |
| Rook ending | Search across longer-range moves and a depth-dependent principal choice |
| Pawn ending | A tractable true depth-five case under the same ceiling |
| Mate in one | A requested depth-five search that ends after the first iteration with mate |

The five nonterminal positions each request depths three, four and five. They use a 30,000-node safety ceiling. A result that reaches that ceiling before finishing the requested iteration is an explicitly budget-limited sample. Its score and move come from its deepest complete iteration. The special app-shaped row uses the same 1,600-node budget as ordinary Chess. The mate row is an early terminal result. These outcome types belong in separate timing interpretations.

The host and device compare packed move, score, completed depth, cumulative nodes and slice calls in that order. Compare all five fields in every row as well as a canonical digest of signed little-endian 32-bit fields, ordered by fixture and requested depth. Confirm that each of the 135 root cells has its starting value after the final slice. The search's buffer contains continuation scratch, so a paused slice can legitimately leave a partial path on the board. Check slice independence on the host by repeating all cases at limits of 1 and 4,096 steps and comparing results except the number of calls.

## Timing boundaries

Node/V8 runs the Wasm engine after one unmeasured pass, then samples each case seven times with rotated order. An ESP32-P4 standalone app embeds the exact RV32 image as a linked text section, uses a static internal board buffer and reports its actual CPU clock. It measures each case three times in the same boot. Each region begins just before `chessStartSearch` and ends just after the final slice. Buffer clearing, FEN parsing, UART output, firmware image installation and keyboard input are outside the interval. Timestamp reads around the slices are inside the interval. A per-case maximum slice time refers to the observed calls in that run.

The CJI instruction model links the same RV32 bytes and counts instructions from search start to final slice, including its thin driver loop. This helps explain why a node in one fixture takes more work than a node in another. Its counts are not a P4 hardware performance counter. The ratio of host Wasm clock time to PicoCalc RV32 clock time combines code generation, processor, caches, and runtime. This procedure cannot isolate one backend or measure key-to-piece response.

## Run and restore

Build the private ESP-IDF app with `bash scripts/chess/build.sh /tmp/release-lab-chess-work`. The tool also runs the host qualification, emits the native bytes and creates the board's generated data. Run `bash scripts/chess/model.sh /tmp/release-lab-chess-work RV32_GCC` to check the same cases under the instruction model.

After explicit board handoff, use `python3 -B scripts/chess/device.py WORK/build RELEASE OUTPUT`. The runner pins both release hashes, verifies the existing flash contents, verifies the candidate partition layout, writes only the app partition, compares the emitted matrix and restores the release even if the benchmark fails. It verifies both app and partition after the restore and checks the eight native worlds and ordinary painter. The lab build and all generated outputs stay in a temporary tree.
