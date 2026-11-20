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
