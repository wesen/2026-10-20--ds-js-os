---
Title: A retained Chess view from a by-value position
Ticket: PICOCALC-RENDER-CHESS
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:23.754520278-05:00
WhatFor: ""
WhenToUse: ""
---

# Preregistration: Handheld Chess UI, Screen Tree vs. Semantic Position

**Status:** Design only. Nothing below has been implemented, run, or timed. Every number is a prediction with stated assumptions, written so it can be proven wrong.

## 1. What we compare

- **Arm T (tree):** A typed chess guest emits an ordinary JSON screen tree (squares, glyphs, highlights) on every update.
- **Arm S (semantic):** The guest emits a by-value semantic position: board, side to move, castling, en passant, clocks, selection, and hints. A pure view function on the receiver turns that into the picture.
- **Delivery (only if S passes resident tests):**
  - **S-bin:** Ship compiled, import-free WebAssembly bytes.
  - **S-src:** Ship portable typed source and compile it on the receiver.
  - The two must produce **byte-identical** artifacts.

## 2. Content and bounds

These are assumptions, fixed now.

| Item | Bound |
|---|---|
| Pieces | ≤ 32 |
| Squares | 64 |
| Legal moves in any position | ≤ 218 (the known maximum), so ≤ 218 hint markers |
| Semantic payload | ~40 B position + ≤ 2 B per hint ≈ **40–480 B** |
| Tree payload | 64 square nodes at ~60–120 B each, plus hints ≈ **4–10 KB raw**, worst case ~25 KB |
| View artifact | **20–80 KB** Wasm, ≤ 16 memory pages, fuel-limited |

**Prediction P1:** Tree updates will be 20–100× larger than semantic updates in typical positions.

## 3. Making equivalent ordered pictures and hints observable

Pixels are a poor oracle because anti-aliasing and scaling add noise. Both arms will render into a **canonical display list**: an ordered sequence of `(layer, square, glyph_id, style)` tuples.

- **Ordering:** Sort by layer (board → last-move → check → pieces → selection → hints), then by square index 0–63.
- **Hints:** Treat hints as a sorted set, never in emission order.
- **Per-frame record:** Emit the SHA-256 of the list plus a short text description (e.g. "white to move, e2 selected, hints e3 e4").
- **Pixel check:** Run a secondary comparison with a fixed reference renderer at a small tolerance, used only to catch renderer bugs.

"Equivalent" means the display-list hashes are equal **on every frame**, not only the final frame.

## 4. Input, replay, and retained state

- **Recording:** Inputs are a log of `(logical_tick, event)`, covering taps, drags, cancels, and orientation flips. Wall-clock time is excluded.
- **Replay:** Both arms replay the same log and must yield identical display-list hash sequences.
- **What the receiver may retain:** In S, only UI-local state such as animation phase and pending selection.
- **Validity rule:** Retained state must equal what a *fresh* receiver derives from (position, UI-local state) at the same tick.
- **How we test it:** Replay from start, and also from ≥ 20 random checkpoints per log, each into a brand-new receiver.
- **Invalid-state cases to provoke deliberately:**
  - Selection pointing at a square emptied by the opponent's move.
  - Hints surviving a move.
  - Input arriving mid-animation.

## 5. Workload and holdouts

- **Development set:** 200 positions from openings and middlegames, plus 50 recorded tap logs.
- **Sealed holdouts:** Generated from a seed committed in this document, and not opened until the code is frozen. They cover:
  - Both castles, en passant, and promotion including underpromotion.
  - Check, mate, and stalemate.
  - Threefold repetition and the 50-move rule.
  - A 218-move position.
  - A flipped board.
  - Illegal taps and rapid double taps.

## 6. Checks

1. **Same artifact:** `sha256(S-bin) == sha256(S-src output)`. No stripping of custom sections before hashing.
2. **Import-free:** The module's import section is empty.
3. **Purity:** The view is run twice on the same input and must produce the same output. It must also stay within fuel and memory limits.
4. **Guest validity:** Each semantic position is checked: exactly one king per side, and no pawns on ranks 1 or 8.

## 7. Valid measurements

- **Separation:** Cold and warm runs are measured separately. The first run is discarded.
- **Environment:** CPU governor pinned, monotonic clock, ≥ 1,000 frames per condition.
- **Reporting:** Median and p99.
- **Exclusions:** A run is invalid if thermal throttling is detected, or if its replay diverged. Timings from a divergent run do not count.

**Prediction P2.** Assuming a ~1.5 GHz handheld core and a 16.7 ms frame:

- Tree parse: 0.05–0.5 ms.
- Semantic view compute: 0.02–0.3 ms.
- Input-to-display-list p99: under 8 ms for both arms.

Latency should **not** separate the arms. Bytes and correctness should.

**Prediction P3:** S-src compile on the receiver will take 0.5–5 s and 5–50 MB peak memory.

## 8. Disqualifying outcomes

Any one of these rejects the candidate:

- Any display-list mismatch on a holdout (zero tolerance).
- Any retained-state divergence at a checkpoint.
- A non-identical artifact hash, or any import present.
- p99 > 16.7 ms.
- Compile time > 10 s, or peak memory above the device budget.
- If P1 fails (ratio < 5×), we report that semantic delivery offers no bandwidth case.

## 9. Cost crossover

**S vs. T:** S pays the artifact cost once. Let ΔB be the bytes saved per update and A the artifact size. Break-even comes after A / ΔB updates.

**S-bin vs. S-src:** S-src is worth it only if bytes saved, multiplied by per-byte link cost, exceed compile cost. On a handheld this is plausible only on very scarce links, or when the receiver *must* build from source for auditability.

### Worked example

| Input | Value |
|---|---|
| A (artifact) | 40 KB |
| T update | 6 KB |
| S update | 120 B |
| ΔB | ≈ 5.9 KB |
| Break-even | 40 / 5.9 ≈ **7 updates** |
| Updates per game | 80 plies × ~2.5 updates per ply (select, hint, move) ≈ 200 |

- **Per game:** T sends ~1.2 MB and S sends ~64 KB including the artifact. S wins within the first game.
- **S-src:** Suppose source is 25 KB, saving 15 KB of transfer. Compile costs ~2 s of CPU. On any link faster than roughly 8 KB/s, that trade loses.

## 10. The trap

**Replay that passes because of leftover state.** If you replay only from the start on one long-lived receiver, a bug like stale hints after a capture can be masked. The receiver's memoized state carries the correct answer forward from earlier frames, so the view *looks* pure without being pure. The test passes while a fresh receiver joining mid-game would draw ghost markers.

Two defenses: fresh-receiver checkpoints (§4), and hashing every frame (§3).

**The hash version of the same trap:** "normalizing" artifacts before comparing them, for example by stripping timestamps or paths. That hides exactly the non-reproducibility check 1 exists to catch.

## Design record

I chose the canonical ordered display list as the primary observable. I chose it over pixels because pixel diffs would push us toward loose tolerances that could hide real differences in hint order or highlighting. I froze the holdout seed and the zero-tolerance mismatch rule before writing any code, so that nobody, including me, can tune toward the holdouts.

I predict the arms will tie on latency. I expect semantic delivery to win on bytes within one game, and receiver-side compilation to lose on cost except in rare link conditions. I will treat any one of the §8 outcomes as a genuine rejection, not a reason to revise the bounds afterward.

## Operator's implementation contract, fixed before the candidate run

Opus received a generic brief and predicted several features absent in the actual guest. There is no board rotation, touch/drag input, repetition adjudication or half-move-clock display. Its review mentions a frozen seed without supplying a value. This study makes no sealed-random-holdout claim. It uses a fixed opening trace, initialized edge positions, and re-instantiation on every retained frame. Tree properties, drawing order, every operation and hints must agree exactly, without sorting, and the common pixel oracle additionally compares raw bytes. Gate the host delivery experiment on zero differences and at least a fivefold reduction in framed bytes. A host result cannot release a firmware integration.

A fixed 8×8 display lets the publisher compute one byte of legal destinations per rank. Selection, notice, terminal status, whether the statistics footer is visible and promotion hints come from the producer. Pin the complete renderer artifact digest in every packet. The receiver reconstructs only from the latest complete semantic record. For host timings report every sample and rotate arm order. The host cannot satisfy Opus's handheld clock, panel-latency and memory predictions. The delivery study validates only an allowlisted specimen. Unknown executables and unbounded source require a separate admission design.
