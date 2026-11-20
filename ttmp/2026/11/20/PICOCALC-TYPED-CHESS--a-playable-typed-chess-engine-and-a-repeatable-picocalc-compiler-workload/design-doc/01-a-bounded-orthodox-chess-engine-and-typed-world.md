---
Title: A bounded orthodox chess engine and typed world
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:33:56.201519862-05:00
WhatFor: ""
WhenToUse: ""
---

# A bounded orthodox chess engine and typed world

Chess runs as a typed PicoCalc world using the existing shared Wasm and RV32 reactors. The reactor supplies counted UTF-16 buffers, key delivery, screen publication and timers. Position rules, move generation, engine search and controls stay in typed source. Chess is a fourth compiler workload because it exercises arithmetic, record and buffer access, conditional control, and a large call graph, while the resulting world can be played.

## Position and legal moves

Store a 128-cell mailbox in a reactor buffer. A square uses its file in the lower half of each 16-cell row. On-board tests require a nonnegative index below 128 and a remainder below 8. A sliding piece increments the square by a fixed offset. Crossing an empty row boundary therefore stops movement without eight distinct coordinate checks. Values 1–6 are white pieces and 9–14 are black pieces. Extra words record side to move, four castling rights, the en passant target, both king positions, and clocks.

Pack a move in one 16-bit word with equal-width source and destination indexes in a dense 0–63 space and one of four promotion codes. Generate pseudo-legal moves by piece geometry, then apply and test whether the mover's king is attacked. Applying a move saves only the original piece, captured square and piece, position metadata and clocks. Undo restores the exact position. A castling candidate also checks empty intervening squares, rook and king location, original and transit attack state and final king safety. En passant removes the pawn from its actual square before testing safety. Promotion offers queen, rook, bishop and knight.

A typed perft function counts legal leaf positions using an explicit stack and the same make/unmake code as search. Validate the initial position and specialty cases that exercise castling, pinned en passant, underpromotion and check evasions. FIDE move rules and published perft fixtures provide outside checks. [FIDE Laws of Chess](https://handbook.fide.com/chapter/e012023) · [Independent perft fixture implementation](https://github.com/gflohr/Chess-Plisco/blob/main/t/05perft.t)

## A bounded engine

Search iterates through increasing depths with negamax and alpha-beta pruning. Negamax expresses value from the side to move and negates the child's result. Alpha and beta bound the useful score for a search. Child calls become frames in the search buffer because typed functions cannot be recursive. Each frame holds remaining depth, window, best move, move cursor, and the move to undo on return. Iterations preserve the best move of the last completed depth. The root prioritizes that move next. Captures are ordered by victim value and attacker cost; promotions are also ordered before quiet moves. Equal priorities preserve the initial generation order.

At the nominal depth limit, quiescence considers captures and promotions so that a hanging capture followed by a recapture receives a meaningful score. A checked side searches evasions, including quiet ones, and cannot use a static evaluation as a legal option. At the hard quiescence depth cap it evaluates each legal evasion directly. An empty legal set gives mate or stalemate as appropriate. Material with modest piece-activity terms guides ordinary leaf scoring. Prefer a bounded and measured search over a transposition table initially. A table would require a position key, collision checks and extra state; a smaller node count would have to repay those costs on the guest.

The search board lives in a second reactor buffer. The UI board remains valid while a search frame has an applied move. Each timer turn processes a fixed slice and re-arms while the node budget remains. A reset invalidates the outstanding token. Make the first legal root move the emergency fallback when the node budget or timer ends before the first iteration. The app adjudicates checkmate, stalemate and a documented basic dead-material subset. Repetition, adjudication of the 50/75-move rules, competitive clocks and persistence across app reloads are outside the initial game scope.

## Controls and delivery

A person plays White. Arrows move the cursor, Enter selects and moves, and Escape clears a selection. The board labels files and ranks and shows a different highlight for the selected square. Promotion waits for a Q, R, B or N choice before applying the move. A new game can be started while the engine is thinking.

Use the production typed linkers and generic reactor for both targets. Keep functional validation, source compilation, engine search and screen rendering in distinct clocks. Compare deterministic root decisions, centipawn scores and node visits across both engines. Record the simple material-only baseline and tactical fixtures. Leave physical board operations to the supervisor and provide reproducible firmware and run instructions.
