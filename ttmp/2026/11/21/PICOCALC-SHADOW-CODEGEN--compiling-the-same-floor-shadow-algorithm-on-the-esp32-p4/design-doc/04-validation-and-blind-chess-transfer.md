---
Title: Validating compiler effects on an unchanged chess evaluator
Ticket: PICOCALC-SHADOW-CODEGEN
Status: active
Topics: [compiler, performance, picocalc]
DocType: design-doc
Intent: long-term
---
# Validating compiler effects on an unchanged chess evaluator

The floor shadow experiment changes native code generation. An independent input is needed to determine whether the same implementation also helps a different piece of software. This protocol freezes six unchanged functions from the shipped Chess world at project commit `57b2d9f` before measuring a candidate. The primary entry is `chessEvaluate(board,advanced)`. The transitive dependencies are `chessSquare`, `chessSide`, `chessValue`, `chessCenter` and `chessAbs`. The test compiles the six function definitions together and preserves their production bodies. The measured program excludes the chess search scheduler and UI. [Fixture extraction and independent evaluator](../scripts/validation/holdout.mjs)

A Chess position uses two bytes per cell and sixteen storage slots per rank. Eight of those slots denote playable files. A read takes a dense square index, recovers file and rank, and accesses its board cell. A nonempty square receives a material score. Under advanced evaluation, piece kind, position, and game phase also affect that score. For a knight the location bonus is five times the center score, computed by calling a signed-magnitude helper twice. The opening, a position after five half moves, and an endgame with five remaining pieces give three different numbers of helper invocations and three read patterns. Each board runs with advanced evaluation on and off. A separate language-independent evaluator visits ranks and files explicitly and calculates the expected signed result.

The P4 timing harness must evaluate each board repeatedly, pair baseline and candidate within six blocks, alternate order, check the returned score, and compare the input after the timed loop. Report cycles per evaluation, machine-image identity, paired percentage saved and sign count; report each fixture separately. Distinguish the helper that the optimizer changes from the whole evaluator that invokes it. A faster leaf does not establish a faster game or deeper search.

Adverse controls include signed minimum wraparound, zero, positive and negative arguments; a side effect before a failing argument; a skipped short-circuit arm; distinct mutable buffers; and a helper with an almost identical name but different behavior. Compare native and Wasm results, observed trap and all caller-visible bytes. Probe the image to ensure the intended instruction or call changed. If valid equivalence fails, withdraw the timing candidate until corrected; preserve evidence of the failure.
