---
Title: Director diary for the Chess raster and retained redraw experiments
Ticket: PICOCALC-RASTER-PIE
Status: active
Topics:
    - picocalc
    - esp32-p4
    - performance
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:40:23.065795479-05:00
WhatFor: ""
WhenToUse: ""
---

# Director diary for the Chess raster and retained redraw experiments

## Step 1: Attribute the opening frame before assigning a vector optimization

The measured 3D app spent roughly 18 ms in scalar rasterization. The actual projected vertex experiment saved roughly ten microseconds in the native painter. I separated the two questions and asked one researcher to improve full triangle scan conversion and a second to examine retained damage and independently verify the first researcher's math.

### Prompt Context

**User prompt (verbatim):** “how can we make 3d rendering faster? can we PIE the rasterization?” **Assistant interpretation:** Implement and measure real opportunities in the raster. **Inferred user intent:** Improve a complete handheld Chess frame and distinguish a measurable SIMD contribution from other effects.

### What I did

Counted pixels, span widths and candidate packed stores in the frozen scene. Assigned stepped edges, span stores and whole-list timing to Sol, with independent retained-damage experiments and a source review by Astra. Assigned serial ownership to one operator and preserved the ordinary image for readback. The separate 3D scene then used the board to demonstrate a full human/engine exchange before handoff.

### Why

The full-body matte, repeated edge divisions, small spans, draw metadata, display transfer, and drawing unchanged geometry incur different costs. Timing a tight store loop alone would overstate the opportunities in a 320-pixel board made of small triangles.

### What worked

The [opening work census](../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/various/raster-work.json) counts 5,580 spans and 33,150 triangle writes. The independent host reviewer covered 2,601 ordered image pairs and explicitly detected camera invalidation. The full-raster lane tested 51 complete scenes and separated the existing matte from triangle fills.

### What didn't work

The first hardware configuration selected 20 MHz external RAM and size optimization. The researcher caught the discrepancy before claiming device timings and rebuilt with the production 200 MHz memory and speed optimization settings.

### What I learned

A 16-pixel minimum span sends the large matte to PIE and sends none of the tested scene's triangle spans through PIE. A vector timing improvement on that configuration is evidence about a clear. The normal compositor also clears its framebuffer before calling the native painter, which must be addressed before shipping any partial replay.

### What was tricky to build

A local cursor change can alter command count, so index-by-index drawing can turn a tiny edit into extensive damage. Validity also depends on overlays, viewport, painter and framebuffer ownership, and correct replay order. The reviewer checked the entire reserved chrome as well as game pixels.

### What warrants a second pair of eyes

Review compiler settings, the end of the timed interval, PSRAM cache conditions, clipped old and new geometry, and whether all display writes were completed in any screen-level claim.

### What should be done in the future

Record the direct board timings and the integration decision in the director article and publish all reports.

### Code review instructions

Start with the two designs and the raw host/raster/damage results. The earlier full-frame timing and independent pixel diffs reside in PICOCALC-CHESS-3D.

### Technical details

Each RGB565 pixel takes two bytes and one P4 128-bit store fills eight pixels. The matte covers 320 × 280 pixels; the physical app and hints extend to 298 rows. Each timed scope must state whether it includes the larger compositor clear, SPI transfers or retention.

## Step 2: Compare complete body draws and publish the three studies

The original opening now has a physical four-arm comparison and a second, independent retained-body study. The scalar prevalidated arm captures most of the full-render improvement. I selected stepped edges and direct scalar writes for the live rotating scene and retained the ordinary matte fill in that integration. Its eventual measurements belong to the new scene.

### Prompt Context

See Step 1 for the original request. The subsequent camera and gameplay GIF requests are recorded in the 3D Chess director diary.

### What I did

Read all raw timings and both research reports. Derived a plot with distinct panels for the two protocols in scripts/director/01-frame-costs.py. Wrote the director article, verified links, published three articles and a figure, and delivered the designs and articles to reMarkable.

### Why

An unchanged scene, a cursor, a pawn move and a whole camera turn invalidate different numbers of pixels. Reporting only the cursor would imply that retention will make rotating the board equally fast. The two native comparisons have separate controls.

### What worked

Sol commits a6d7205 and 9a11e21 qualify the four drawing arms; Astra commits 060b481 and 3db329d qualify retention and independent arithmetic. Eleven opening samples per full-draw arm give median 17.589, 16.025, 4.301 and 3.897 ms. Camera fallback in the retained trial adds 0.146 ms. All 51 device CRC and metadata checks and ten damage cases passed. The remote vault is verified at c0e9efed7b16c78ffcf017a0248d0f0cb901a5b0. The reMarkable cloud reported the upload in various/publication.json.

### What didn't work

The first publication dry run failed with FileNotFoundError on the scalar paper's sibling-ticket link. Its target used ../PICOCALC-CHESS-3D from an analysis directory. Changing that prefix to ../../PICOCALC-CHESS-3D resolved the actual file and all three articles passed the publication check.

### What I learned

The packed raster threshold routed every historical triangle to scalar and every full matte to PIE. The independent old/new body comparison established exact rendering, yet the compositor's unconditional clear still prevents direct adoption of partial replay.

### What was tricky to build

The chart uses actual medians for each independent control. The 18 ms control in the retained experiment and the 17.59 ms control in the four-arm benchmark require separate denominators.

### What warrants a second pair of eyes

Review real application capture timing before predicting input-to-panel speed from either standalone table.

### What should be done in the future

Measure the rotating models' actual receiver and display times under their normal app workflow. Keep the frozen figures for future threshold and buffering studies.

### Code review instructions

Review analysis/02, various/physical.json, scripts/damage/board.json, and various/publication.json. Run scripts/director/01-frame-costs.py to reproduce its chart.

### Technical details

At 360 MHz, divide cycles by 360,000 to obtain milliseconds. Read each median at its stated scope. The tests also confirm restoration of the ordinary native image and partition before later Chess work took the board.
