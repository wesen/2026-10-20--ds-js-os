# Supervisor's chess workload diary

## Step 1: Establish an independent rule and search oracle

A meaningful engine benchmark needs known positions and a separate judge. I commissioned the engine and UI, then generated the reference answers before the typed implementation was available.

### Prompt Context

**User prompt (verbatim).** “can you launch another one that is tasked of writing a small chess engine + chess app, in typed, so that we can have a more consequential app to benchmark and measure?” The user added “yeah, and the engine shouldn't entirely naive either”.

**Assistant interpretation.** Build a playable application with a bounded search that can see a recapture, then time the application on fixed, independently validated inputs.

**Inferred user intent.** Add an algorithmically demanding fourth compiler workload whose decisions can be checked independently of timing. The implementation researcher committed the design before coding in `2575189`.

### What I did

- Assigned a project researcher to the typed chess implementation and started an independent Opus 4.6 High chess review through an authenticated Claude Code session. Its self-contained brief is in `scripts/01-independent-search-design.py`.
- Installed `chess==1.11.2` in a temporary virtual environment. Ran `scripts/02-reference-positions.py` on twelve positions. Its fixture records every legal coordinate move, legal continuation counts and game-end status.
- Exhaustively checked mate within two moves in a king-and-queen ending. Only Kd6–c7 forces mate. Black has one legal reply, Ka8–a7, and then Qa1 or Qa5 mates. Capturing material cannot distinguish this quiet winning move.

### Why

Perft counts every legal move sequence at a specified depth. Perft can discover an incorrect king-safety rule but cannot tell us how well a legal-move generator selects among its moves. Immediate mates, a quiet forced mate and a poisoned-pawn fixture exercise distinct search decisions.

### What worked

The independent initial-position counts are 20, 400 and 8,902. The en passant pair differs by exactly the critical capture. The castling-through-attack reference excludes e1g1. The two mirrored mate-in-one positions each have one winning move.

### What didn't work

The supervised conversation had no unused worker slot. I reassigned the researcher who had completed the compiler phase probes and preserved the parked emitter study in its own committed design. The reference library was absent from the host Python. The sandboxed pip attempt failed with “No address associated with hostname”. The authorized pinned installation succeeded in `/tmp/picocalc-chess-reference-venv`.

### What I learned

A positional or tactical test can be decisive without borrowing a commercial engine evaluation. The quiet mate has a proof that can be checked using legal move enumeration alone.

### What was tricky to build

A forced mate requires an answer to every legal reply. A position with no legal replies must be classified as checkmate or stalemate before evaluating that condition. The oracle publishes actual mating continuations and excludes immediate game ends from the two-move proof.

### What warrants a second pair of eyes

Review the typed searcher's interrupted-iteration handling and how it orders moves on equal scores. Verify that a node-budget cutoff can never replace a fully evaluated root choice with a partially evaluated move.

### What should be done in the future

Replay the sealed positions on Wasm and RV32, record the actual moves and time against a one-ply material baseline, then schedule the identical suite on the ESP32-P4. Strength, nodes explored, elapsed time, and cold compilation are distinct outcomes.

### Code review instructions

Generate the JSON using `/tmp/picocalc-chess-reference-venv/bin/python scripts/02-reference-positions.py /tmp/chess-positions.json` from this ticket and compare it with `various/reference-positions.json`. Check that both mate moves in the ending are preserved after Black's only reply.

### Technical details

Promotion suffixes are part of UCI move identity. Board inputs use FEN to preserve side to move, castling rights and en passant state. These reference fixtures use an independent Python library only on the host. All search and interface code under study belongs to the typed app.
