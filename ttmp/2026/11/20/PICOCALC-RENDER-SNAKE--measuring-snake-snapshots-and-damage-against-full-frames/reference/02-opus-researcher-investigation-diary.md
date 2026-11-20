---
Title: Opus researcher investigation diary
Ticket: PICOCALC-RENDER-SNAKE
Status: active
Topics:
    - picocalc
    - ui
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:08:08.825864048-05:00
WhatFor: ""
WhenToUse: ""
---

# Researcher Investigation Diary: Opus High Rendering Study

This diary records my design and interpretation as the external Opus High researcher. Terminal actions, captures and file edits belong to the local operator and appear here only as operator-provided outcomes. I claim no hardware measurement and no vault work.

## Step 1. Design and prospective freeze

I received a generic commission and independently proposed a rendering study comparing generic UI JSON against a compact semantic state record. I wrote my predictions before any implementation existed.

The design came from the authenticated CLI invocation `claude -p --model opus --effort high --tools ""`, which returned `claude-opus-5-5`. The operator froze the design at commit `72555fb`.

### Prompt Context
The user's verbatim prompt is recorded in Step 1 of the separate Operator investigation diary. I did not receive it. I worked only from the generic commission.

### What I did
I predicted an initial generic JSON of about 500 bytes, a compact complete state near 20 bytes, 3 cells touched per ordinary move, possibly 1014 bytes flushed, a frame origin at (17,43), a possible need for keyframes in a templated path, and a 5–10x shrink from full generic binary encoding. I also suggested 20 seeds of 2000 ticks.

### Why
Numbers written in advance let later outcomes falsify them cleanly.

### What worked
The freeze held. Before implementation the operator fixed the actual comparison and the accessible host scope in `04-protocol.md`.

### What didn't work
No technical failure occurred in this step. The 20 seeds × 2000 suggestion was never run, so no conclusion rests on it.

### What I learned
The operator's scope in `04-protocol.md` determines which of my predictions can be tested at all.

### What was tricky to build
Phrasing each prediction so it maps to one measurable quantity.

### What warrants a second pair of eyes
Whether `04-protocol.md` departs from my design in ways that change which predictions remain testable.

### What should be done in the future
Place seed counts in the protocol itself rather than in suggestions.

### Code review instructions
Read `04-protocol.md` against the design frozen at `72555fb`.

### Technical details
Planned stage timings on the target device are a separate track and are not part of these results.

## Step 2. State capture and encoding

The operator ran the real prelude plus a scripted Snake source with its RNG, observing 234 states, 222 publications and 200 real autopilot ticks. Score reached 170 with a maximum real length of 21. Constructed controls used lengths 300 and 395.

I interpret these outcomes against my Step 1 predictions and keep the operator's tooling failures apart from predictions that turned out wrong.

### Prompt Context
Same generic commission. The operator supplied outcomes, not new instructions.

### What I did
I compared the operator's immutable body snapshot, with fields alive, auto, score, best, food and ordered cells, against my compact-state prediction.

### Why
A complete state record should let any receiver rebuild the frame without history.

### What worked
Seed 5172 produced first food at (7,8), a rejected reverse, a legal entry into the vacated tail at length four, wall collision, a timer pause on blur, and an Enter reset that cleared score while best persisted. The deterministic path down, left and then up drove the snake into its own body, and this self-collision is distinct from the legal tail entry that occurs later in the length-four run. The p key toggled autopilot. All 236 regular and constructed controls and independent templated full frames were byte-equal across two independent captures plus the template.

### What didn't work
Two technical failures were operator-reported. The initial importer raised `AttributeError: 'list' object has no attribute 'get'` and was fixed by reading the last result event and the compact public receipt. The Node oracle under sandbox reported `spawnSync git EPERM` and then ran with approved local subprocess access. Neither is a falsified prediction.

### What I learned
My 500-byte prediction held near the real 489 bytes. My 20-byte prediction held only at launch, where T is 18. Raw size is T = 10 + 2n and grows with length.

### What was tricky to build
The validator checks overlap and adjacency, covers 15 malformed cases and enforces an 800-byte cap.

### What warrants a second pair of eyes
My proposed special binary primitive protocol was replaced by a host-only V8 general binary control. The two cannot be equated, so my 5–10x prediction remains untested.

### What should be done in the future
Test the special binary protocol directly if the director wants that question answered.

### Code review instructions
Compare `05-replay.mjs` and `06-semantic.mjs` against the receipts.

### Technical details
Warm totals over 222 envelopes were 173461 bytes for generic JSON, 41155 for complete semantic JSON and 26790 for base64 complete semantic. Host medians on Node v24.18, excluding rendering, were 4.137/3.599 µs producer/receive for generic, 0.428/0.741 for semantic JSON and 0.457/0.706 for packed.

## Step 3. Damage, raster and loss

The operator measured production RGB565 raster and commit code with fixed chrome. Production graphics helpers were unchanged.

Several of my geometry predictions were falsified here, and I treat that as a finding rather than a fault.

### Prompt Context
Same generic commission. Target-device timing stays on its separate track.

### What I did
I checked true changed pixels per move, loss recovery and full-versus-partial paint against my predictions.

### Why
Payload size alone does not show repaint and transfer cost.

### What worked
Ordinary movement touched 3 cells × 11² = 363 true changed pixels, confirming the 3-cell prediction. After ten consecutive lost state records the next record rendered correctly. A cold store starting from one snapshot 75 frames in also rendered correctly, so no keyframe was required.

### What didn't work
My frame origin was wrong. Production uses (17,52), not (17,43). My 1014-byte flush guess was wrong in kind, since the current band differ transferred 1512 pixels in one example, not 3 × 338 bytes. These are falsified predictions, not technical failures.

### What I learned
An explicit simulated panel driver drop at growth, motion, collision or restart required a full 102400-pixel repair on the next explicitly requested draw, even with the game unchanged. That repair follows the request. I do not read it as a scheduler guarantee.

### What was tricky to build
Keeping the simulated panel copy separate from the two native 204800-byte planes shared by both paths.

### What warrants a second pair of eyes
Whether the band differ's 1512-pixel transfer is intended.

### What should be done in the future
The physical resident comparison and any broader production integration are pending and owned by the director.

### Code review instructions
Compare `07-measure.mjs`, `09-damage.c`, `11-run.sh`, `various/summary.json` and the receipts. Rerun from the repository root using `11-run.sh` with a fresh output directory.

### Technical details
C mode median of 12 run medians across 196 changed moves was 34.642 vs 0.388 µs paint and 19.697 vs 5.995 µs production commit plus simulated copy. Transfer median stayed 385 px in both arms. The 24 changed full-fallback medians were about 35 µs in both. Occupancy used two 396-byte arrays. There is no end-to-end P4 panel time, no runtime heap high water and no recommendation to ship.

After this diary closed, the operator supplied later evidence from an isolated x86-64 allocator meter that reported only complete-VM high-water marks. Across 12 states run in five fresh processes per arm, median high-water excess was 12864 bytes for J, 3888 bytes for SJ and 3888 bytes for T. This evidence postdates the diary's findings, and no arm was adopted on the strength of it.

2026-11-20 correction. An earlier entry claimed that every changed movement draw in the warm native C raster benchmark changed 363 pixels. Rereading the original source data shows that 195 of 196 eligible draws, excluding forced drop and idle, changed and partially rewrote 363 pixels, and one draw at legal tail entry changed and rewrote 242 because the head entered the former tail cell and no cell was erased to white. The band commit proposed one 264-pixel rectangle for that frame, and full and partial transfer areas remain identical across the cohort at median 385, p95 2136 and maximum 4008 pixels. The data never changed, and the error came from reading summaries that conceal the single low observation.
