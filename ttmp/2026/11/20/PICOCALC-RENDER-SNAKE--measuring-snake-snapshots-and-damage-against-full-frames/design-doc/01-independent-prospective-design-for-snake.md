---
Title: Independent prospective design for Snake
Ticket: PICOCALC-RENDER-SNAKE
Status: active
Topics:
    - picocalc
    - rendering
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:08:08.018742764-05:00
WhatFor: ""
WhenToUse: ""
---

# Handheld Rendering Study: Pre-Registered Design and Predictions

*Status: proposal. Every number below is either a geometric fact derived from the spec or a labelled prediction. None is a measurement.*

## 1. Fixed facts and assumptions

- **Panel:** 320×320 RGB565, so a full frame is 204,800 bytes.
- **Playfield:** 22×18 cells of 13 px, which is 286×234 px and 133,848 bytes. One cell is 338 bytes.
- **Assumed layout** (to be confirmed): status line in rows 0–19 (12,800 bytes). Playfield origin at (17, 43), so cell (c, r) maps to pixel (17+13c, 43+13r).
- **Snake:** length ≥4, at most 396 segments (the whole grid).
- **Food:** a ring with a center dot, drawn inside one cell.

## 2. Conditions compared

| ID | Strategy | What crosses the link each tick |
|----|----------|---------------------------------|
| J | Full semantic snapshot, existing JSON UI tree | Whole tree of drawing primitives |
| B | Full semantic snapshot, compact binary (same tree, tagged fields, u16 coords, RGB565 colors) | Whole tree, smaller |
| T | Resident manual template: the device owns layout, the host sends state only | Segment cell indices (u16), food cell, score, flags |
| D | Conservative dirty geometry, applied on top of J, B, or T | Same payload. The device diffs the previous and current primitive lists and flushes the union of old and new bounding boxes, rounded out to cell or line boundaries |

"Conservative" means D may over-redraw but must never under-redraw. Any pixel mismatch against a full redraw counts as a failure.

## 3. Bounded records and refusal tests

Every decoder enforces these hard limits before allocating anything:

- At most 400 segments, 64 primitives outside the snake, and tree depth ≤8.
- Strings ≤64 bytes. Total record ≤32 KiB for J, ≤4 KiB for B and T.
- Coordinates inside the panel, cell indices <396, enums inside their declared range.
- Monotonic 32-bit sequence number. Explicit length prefix (B and T) and CRC32.

**Refusal suite.** Each case must be rejected with a specific error code, must leave the framebuffer unchanged, and must allocate nothing beyond a fixed scratch buffer:

1. Truncated record, one byte short.
2. Length prefix larger than the actual payload.
3. 401 segments.
4. Duplicate or non-adjacent segments (T only; reject or flag, decide before running).
5. Out-of-range color enum.
6. Coordinate at x = 320.
7. Nesting depth of 9.
8. Sequence number equal to or lower than the last applied one.
9. Bad CRC.
10. JSON with duplicate keys, NaN, or a 10 MB string.

## 4. Adversarial replay, transfer skip, and repair

Record traces with a fixed RNG seed, then replay them through each condition:

- **Replay:** inject the same record twice, swap records N and N+1, and splice in a record from another session. Expected result: sequence-number refusal and no visual change.
- **Skip:** drop 1, 2, or 10 consecutive records, at random positions and at the adversarial positions (food eaten, collision, restart).
  - J and B are self-contained snapshots, so they should heal on the next record.
  - T and any delta-based D cannot. The device must detect the gap from the sequence number and request a keyframe.
- **Repair:** measure ticks-to-convergence, defined as the framebuffer hash matching the oracle again. Also count bytes spent on repair.
  - Fallback design: the host sends a keyframe every K ticks (K = 32 proposed) and also sends one on request.
- **Focus/blur:**
  - While blurred, the timer stops, the score is frozen, and zero records are sent.
  - On refocus, the first record is a keyframe.
  - Test 100 rapid blur/focus toggles for timer drift (expected 0 ticks).

## 5. Worked movement example

The snake occupies cells (10,9), (9,9), (8,9), (7,9) and moves right. No food is eaten.

- The new head is (11,9) at pixel (160, 160). The tail (7,9) at pixel (108, 160) is vacated.
- If the head is styled differently from the body, (10,9) also changes.
- **D dirty set:** 3 cells, which is 3 × 338 = 1,014 bytes flushed. That is 0.76% of the playfield and 0.50% of the panel.
- If the timer second rolls over in the same tick, the status line adds 12,800 bytes, for a total of 13,814 bytes.

The four payloads (record contents only, before measuring):

- **T:** about 4 segments × 2 bytes plus a header of about 12 bytes, so about 20 bytes.
- **B:** about 6 primitives × about 9 bytes plus header, so about 70 bytes.
- **J:** about 6 primitives × about 55 bytes plus tree overhead, so roughly 500 bytes.

## 6. Predictions (falsifiable)

- **P1. Payload ratio.** At length 4, J:B is between 5× and 10×. At length 300, B:T is between 3× and 6×. *Falsified if outside these ranges.*
- **P2. Flush dominates without D.** With full redraw, panel flush is the largest stage for B and T in more than 90% of ticks. *Falsified if parse or raster exceeds flush in the median tick.*
- **P3. D on ordinary moves.** Pixels written fall by ≥95% versus full redraw. Median end-to-end tick time falls by ≥5× for B and T. *Falsified if the reduction is below 3×.*
- **P4. JSON parse.** J's device parse time grows roughly linearly with snake length and exceeds B's by ≥4× at length ≥100.
- **P5. Correctness.** D produces zero mismatched pixels against the oracle across all traces. *A single mismatch is a defect, not noise.*
- **P6. Repair.** J and B converge within 1 tick after a drop. T converges within 1 RTT plus 1 tick, or within K ticks without a backchannel.
- **P7. Refusals.** 100% of refusal cases are rejected, with the framebuffer hash unchanged.

## 7. Likely negative results (report them, don't bury them)

- **Overlay frames:** collision and restart overlays dirty nearly the full panel, so D gains approximately nothing and adds diff overhead.
- **Fast link:** if the link is fast relative to SPI flush, B versus J may show no meaningful end-to-end difference. In that case binary is only justified on memory or parse grounds.
- **Template vs. B+D:** T's savings over B+D may be within noise once flush is minimized.
- **Diff cost:** diff bookkeeping may cost more than it saves when the scene is tiny.
- **Autopilot bias:** autopilot traces are smoother than human play, which may bias D favorably. Collect human traces too.

## 8. What to measure, and where

Use monotonic timestamps at each stage boundary. Stage costs are reported as the difference between consecutive timestamps.

| Point | Location | Metric |
|-------|----------|--------|
| t0–t1 | Host | Build state and encode. Output size in bytes |
| t1–t2 | Link | Transfer and bytes on wire, including framing |
| t2–t3 | Device | Validate and parse. Allocations, peak heap |
| t3–t4 | Device | Diff (D only). Rect count, dirty pixel count |
| t4–t5 | Device | Raster |
| t5–t6 | Panel sim | Flush. Modeled with a configurable SPI clock |
| — | Oracle | Per-frame CRC of the framebuffer against a full redraw from the same state |

**Reporting:**

- Report the median, p95, and maximum per condition, split by event class: move, eat, timer rollover, overlay, restart, and repair.
- Run at least 20 seeds × 2,000 ticks per condition.
- Discard the first 50 ticks as warm-up and disclose this.

## 9. Validity limits

- The panel is simulated. Real SPI DMA, tearing, and bus contention are absent, so flush times come from a model.
- Host and device may share a CPU in simulation, so stage timings interfere with each other.
- A single game is studied. Results may not transfer to UIs with text reflow or anti-aliased geometry.
- The JSON encoder and parser choice strongly affects J. Name the library and version.

## 10. Adoption gates (fixed before data collection)

- **Adopt B over J** if P7 holds, the oracle shows zero mismatch, and either median tick time or peak device heap improves by ≥25%.
- **Adopt D** if P5 holds on every replay, skip, and refusal trace, the median move-tick improves by ≥3×, and overlay frames regress by ≤10%.
- **Adopt T** only if it beats B+D by ≥25% on p95 and the repair protocol passes P6. Otherwise, the cost of maintaining a separate resident template isn't justified.
- **Any refusal-suite failure blocks adoption** of the affected condition, regardless of performance.
