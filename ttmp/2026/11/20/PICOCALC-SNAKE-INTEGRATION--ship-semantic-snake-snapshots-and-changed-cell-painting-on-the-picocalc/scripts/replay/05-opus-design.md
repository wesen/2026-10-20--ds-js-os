# Qualification Experiment: Snake Renderer, Canvas Producer → Semantic JSON Producer

No results have been supplied, so nothing below reports an outcome. It is a plan with stated pass and fail conditions. I assume a 20×20 grid of 16 px cells and give each constant as a parameter.

## 1. Two oracles, kept apart

| Oracle | Question | Observation point |
|---|---|---|
| **Pixel** | Is the committed back buffer the correct image? | Hash of the back buffer after commit and before flush, compared with an independent reference render |
| **Transport** | Did the panel receive that image? | Front buffer rebuilt from the flushed rectangles plus a byte capture at the driver shim, compared with the back buffer |

Every failure falls into one of four cells:

- **Back correct, front wrong:** transport fault (damage tracking, flush order, RGB565 byte swap).
- **Back wrong, front equals back:** pixel fault.
- **Both wrong:** report the pixel fault first.
- **Both correct:** pass.

## 2. Joining old and new without shared view logic

- **Join key:** `(trace_id, tick)`. Each trace is produced from a recorded seed and input log, so both producers can be replayed deterministically.
- **Semantic lift:**
  - Parse the old canvas scene back into `{body, food, score, best, alive, automatic}` using only geometry from the spec.
  - Compare that with the new JSON field by field. This tests the producers' agreement before any rendering happens.
- **Three renders:**
  - P_old: the old path.
  - P_new: the new path.
  - P_ref: a reference renderer written from the spec document alone, in another language. It shares no palette, layout, or font module. Only the spec's constant table is common.
- **Verdict table:**

| P_old vs P_new | P_new vs P_ref | Verdict |
|---|---|---|
| equal | equal | pass |
| differ | equal | old defect, or an intended change that must be documented |
| differ | P_old equals P_ref | new defect |
| any | all three differ | spec ambiguity; stop and fix the spec |

## 3. Corpus

1. **Real traffic:** all captured traces, every tick.
2. **Constructed lengths:** boundary values L ∈ {1, 2, 255, 256, 398, 399} on a serpentine fill. The 255/256 pair targets 8-bit counters.
3. **Changed-cell roles:** each transition among empty, head, body, tail and food appears at least once. Two cases are mandatory:
   - **Tail chase:** the head enters the cell the tail vacates in the same tick (tail → head).
   - **Eat:** the tail stays put and the food relocates.
4. **Overlays:**
   - Score digit-width changes (9→10, 99→100).
   - A new best record.
   - `alive=false` game-over drawn over the body.
   - `automatic` badge toggled on and off.
   - An overlay rectangle intersecting a changed cell.
5. **Retained snapshots:**
   - Duplicate tick.
   - Stale version or tick.
   - The producer mutates a buffer after emitting it (aliasing test).
   - Reconnect, then replay.
6. **Malformed input:**
   - Truncated JSON, duplicate keys, wrong types.
   - Unknown `type` or `version`.
   - Coordinates outside the grid.
   - Duplicate or non-adjacent segments.
   - Food on the body.
   - Body length above the cell count.
   - `score > best` when the rule forbids it.
   - Expected result in every case: reject, no commit, zero flushes, last frame retained.

## 4. Pass criteria

- Zero pixel-oracle mismatches on every committed frame.
- **Damage soundness:** every changed pixel lies inside the union of flushed rectangles. Damage efficiency is reported separately and is not a correctness criterion.
- Malformed and stale inputs produce zero side effects.
- A snapshot that has been retained hashes the same as it did when it was committed.

## 5. Discriminating failures

| Symptom | Distinguishes |
|---|---|
| A ghost tail on non-eating ticks only | Missing damage for the vacated cell, versus wrong diff roles |
| A ghost only when back is correct | Transport fault, not renderer fault |
| Tail-chase cell keeps body color | Role diff keyed on "occupied" instead of role |
| "100" leaves a stale digit after "99" | Overlay damage sized to the new text only |
| Retained hash changes after the producer mutates | Snapshot aliasing |
| Fails at exactly L=256 | Counter width |
| Malformed frame produces a partial flush | Validation happens after commit begins |
| Uniform color error only in the driver capture | Byte order at the driver boundary |

## 6. Worked mental example (compiler-pass view)

Treat the pipeline as compiler passes: **parse → type-check → lower to IR (cell grid) → diff (dataflow) → codegen (rectangles)**. To keep the arithmetic small, use a 4×4 grid with 80 px cells.

**t0** `{"type":"snake","version":2,"body":[[1,1],[0,1]],"food":[3,1],"score":0,"best":0,"alive":true,"automatic":false}`

The IR for row 1 is: `(0,1)=tail`, `(1,1)=head`, `(3,1)=food`.

**t1** has body `[[2,1],[1,1]]`. The diff produces:

- `(2,1)` empty → head
- `(1,1)` head → body
- `(0,1)` tail → empty

The resulting rectangles are x∈[0,240), y∈[80,160).

**Injected bug A:** the renderer damages only the new head.

- The back buffer is fully redrawn and correct.
- The flush covers only `(2,1)`.
- The rebuilt front buffer still shows head color at `(1,1)` and the tail at `(0,1)`.
- Verdict: **transport fault**.

**Injected bug B:** the renderer draws only the head into the back buffer.

- Now the back buffer itself differs from P_ref.
- Verdict: **pixel fault**.

The same symptom on screen gets two different diagnoses. That separation is the point of keeping two oracles.

**t2 (eat)** has head `[3,1]` and body length 3.

- The tail does not move.
- The score changes from 0 to 1, which adds overlay damage.
- The food relocates, which adds a second changed cell elsewhere.

**t3 (malformed)** has body `[[3,1],[3,1],[2,1]]`.

- The type-checker rejects it because of the duplicate segment.
- The hashes of both buffers equal t2, and the flush list is empty.

## 7. Research diary (circumscribed)

**2026-11-20.**

*Done:*
- Wrote the plan.
- Fixed the oracles, join key, corpus classes and pass criteria.

*Results:* none. Nothing has been run.

*Assumptions:*
- A 20×20 grid.
- A deterministic replay is available.
- The driver shim can capture flush bytes.

*Not claimed:*
- That the 4×4 example's geometry matches production.
- That P_ref is correct. P_ref is a third opinion that must be reviewed against the spec.
- Panel-level fidelity beyond the shim. Confirming it needs a one-time comparison against a logic-analyzer or GRAM readback on a sample.
- Anything about performance or tearing.

*Next:*
1. Freeze the spec constant table.
2. Write P_ref.
3. Build the semantic lift for the old scenes.
4. Generate the constructed corpus.
5. Run real traffic first, then constructed lengths, then malformed inputs.
6. Log every mismatch under its row in the verdict table.

*Stop rule:* if any "spec ambiguity" verdict appears, pause the comparison until the spec is amended.
