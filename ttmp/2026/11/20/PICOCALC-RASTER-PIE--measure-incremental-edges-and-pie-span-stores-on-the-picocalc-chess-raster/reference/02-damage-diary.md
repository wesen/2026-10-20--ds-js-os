---
Title: Independent damage-repaint investigation diary
Ticket: PICOCALC-RASTER-PIE
DocType: reference
Status: complete
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

## Step 4. Cross-examine the incremental edge and packed-store implementation

After checkpoint 060b481 I included the sibling's actual edges.inc in an independent UBSan harness. I enumerated all 639 horizontal displacements and all 279 positive vertical displacements at both extreme edge placements. The direct 64-bit reference computes a signed quotient and increases it only for positive remainder. Every stepped x and Euclidean residual matched across 49,918,680 active rows from 356,562 starts. For each of eight RGB565 pointer residues and lengths zero through 320 inclusive, the real C dispatcher used a modeled group routine that checked source/destination alignment and positive count and wrote all lanes. All 2,568 whole-array sentinel comparisons passed, encompassing 49,105 modeled group stores.

I inspected the linked ESP32-P4 .elf. GNU objdump decoded the five-instruction group routine as broadcast into q0, post-increment a0 by 16 after store, decrement a1, repeat while nonzero, then return. The digest of the .bin passed to the board operator starts 1413d0fe. The configured IDF 5.4.2 port covers q0 in its context save/restore. The host group model establishes alignment and memory extent but cannot establish instruction execution on a physical core.

I added four supplementary host controls. A changed triangle makes glyph A overlap the cleared box, and glyph B overlaps A, forcing the rectangle to expand a second time. Independent full replay agrees. A changed matte, a valid complete program containing a rectangle, and missing history each use the full draw. The UBSan run retains exactly the same frozen corpus matrix hash. The prototype's guaranteed unit is a complete matte-first Chess scene. A general application may legitimately submit a transparent overlay, which needs a background supplied by its compositor before a fresh draw.

## Step 5. Verify the physical capture and close the review

The sole hardware operator staged the checked damage files in the same image as the four full-render arms. I read the operator's capture on disk and independently parsed the 32 DAMAGE lines. All ten on-board body hashes matched host-regenerated expected FNV values. Every reported rectangle, mode and count of replayed primitives agreed with the 2,601-pair native host matrix. All 140 timed calls passed their body-hash and reserved-region checks.

Commands under scripts/damage:

```sh
python3 -B edge-review.py
python3 -B board-review.py /tmp/pie-raster-physical/uart.log board.json
python3 -B board-review.py board-uart.txt /tmp/damage-board-replay.json
```

Cursor-up improved from 6,441,220 to 1,185,270 median cycles. Ordinary e2e4 was much weaker at 6,439,702 versus 5,563,928. The camera fallback added 52,501 median paired cycles. Nine cases won seven pairs apiece, and the camera case lost seven pairs. I sent the director the full timing receipt, explained that fastest full-PIE comparisons occurred under a different timing protocol, and highlighted the prerequisite for reliable body retention. The article is analysis/03-retained-chess-repaint.md. The raw board-only rows are scripts/damage/board-uart.txt. The normalized receipt and copied rows share the digest recorded by board-review.py.

The primary operator reports restoration of the playable image with digest prefix 75c94df7. Its post-restore painter service had one compilation, one installed source, one accepted packet and zero rejects. This independent lane neither opened the serial device nor flashed an image. The stock validation, native compiler, production renderer, compositor and panel path were outside its edit scope.

## Delegated prompt as received

> User asked for faster raster/PIE then 'continue': please act as independent Astra reviewer plus damage-repaint researcher in new ticket PICOCALC-RASTER-PIE being created by /root/pie_lowering. Own design-doc/02*, reference/02* (detailed diary), scripts/damage/, analysis/02* (long vault-ready textbook project report). Scope test actual rendered new 3D cursor and game changes with partial scene replay preserving overlap/order. Use explicit full-redraw fallback on camera/invalidating state; test arbitrary move/capture/castling via real frozen command corpus. Distinguish ideal pixel difference vs actual invalidation algorithm; derive dirty region from records/semantic coordinates without reading a reference framebuffer at runtime. Host differential to independent previously frozen pixel oracle; verify guards/header/hints, bounds. Aim actual physical P4 compare vs full renderer where feasible, coordinate one hardware benchmark suite with Sol but do not touch serial independently. Document meaningful negative result. Additionally cross-review scalar edge math and alignment assumptions for PIE. All code and scripts in own ticket dirs, no production edits. Commit increments. Director handles vault. Don't use Opus. Tell me when ticket path exists and plan.

The director subsequently reserved analysis/02 for the combined study and requested analysis/03 for this paper. The implementation checkpoint is 060b481. The file names in the reproduction instructions and the physical capture are stable across clones.
