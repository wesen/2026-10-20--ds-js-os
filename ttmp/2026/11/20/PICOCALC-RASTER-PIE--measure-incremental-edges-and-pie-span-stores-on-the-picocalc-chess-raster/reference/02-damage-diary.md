---
Title: Independent damage-repaint investigation diary
Ticket: PICOCALC-RASTER-PIE
DocType: reference
Status: active
Topics: [picocalc, chess, rendering, research-diary]
---

# Independent damage-repaint investigation diary

## Step 1. Establish the retained-pixel contract

The initiating user direction relayed by the director was “continue.” The director assigned this lane to investigate faster raster/PIE, 3D cursor and game-state changes with partial scene replay preserving overlap, explicit invalidation, host oracle checks, a shared physical benchmark, scalar-edge and PIE alignment review. The director owns vault publication. The board operator owns serial access.

I traced the rendered command ABI in the frozen Chess-3D stage, the nucleus glyph implementation, the generic command validator and the compositor call site. Body coordinates are relative to y=22. Text has alpha coverage and blends against existing pixels. A changed face may uncover board squares and pieces, so drawing only changed records gives the wrong result. The live compositor clears the back buffer before application painting. I notified the director that a valid retained-body epoch is a prerequisite for application use. Command equality alone does not establish framebuffer ownership.

## Step 2. Construct independent replay and pixel evidence

I packed each of the 51 frozen command streams, checking the original SHA-256 digest before adding a 16-bit length prefix. The former scene oracle computes triangle coverage with integer edge functions; this is structurally independent of the new clipped scanline code. The generator reproduced all previously frozen body-plus-hint digests. Only the compact command corpus is tracked. Native test inputs and oracle pixel files are generated in temporary directories.

I implemented a single body rectangle from changed records, a conservative closure for alpha glyphs, explicit epoch and camera fallback, and clipping to the body and replay box. An unrecognized validated program takes the original renderer. A hint-only change retains its independent metadata path. The test executable additionally poisons the entire body and forces a fresh draw with identical lists to check recovery from pixel ownership loss.

Commands run from scripts/damage:

```sh
python3 -B prepare.py --freeze /tmp/chess3d-silhouette-poses --oracle /tmp/raster-damage-oracle.bin --board /tmp/raster-damage-cases.inc
python3 -B host.py --output host.json --matrix /tmp/raster-damage-matrix.csv --sanitize
```

The first host compilation rejected initializer and indentation warnings in the frozen renderer/font under the harness's strict warning flags. I suppressed those pre-existing warning classes for this temporary build and retained undefined-behavior instrumentation. All 51 fresh renders, 50 successive renders and 2,601 ordered transitions then matched. The run yielded 2,288 partial, 198 full and 115 body-no-op decisions, including eight directed pairs with a changed hint and identical body. The exact CSV digest is recorded in host.json. The implementation and its receipt are under scripts/damage.

## Step 3. Prepare the shared hardware benchmark

I provided the primary researcher with the source for damage_benchmark, a generator for the ten board inputs and the symbol to call from the one temporary image. The generated header uses command words selected from real cursor navigation, ordinary play, promotion, both castlings, en passant, an unchanged frame and a camera change. Each case uses seven alternating full/damage pairs. Both arms start with a copy of the old full raster outside the clock. Checksums, reserved rows and scheduling delays stay outside the counter interval. The protocol excludes panel transfers and native painter invocation. Hardware results must come from the single designated operator.
