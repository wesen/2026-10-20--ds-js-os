---
Title: Measure incremental edges and PIE span stores on the PicoCalc Chess raster
Ticket: PICOCALC-RASTER-PIE
Status: complete
Topics:
    - picocalc
    - esp32-p4
    - performance
    - native
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Physical comparison of full RGB565 draw optimizations and retained dirty-region repaint.
LastUpdated: 2026-11-20T17:00:02.011028258-05:00
WhatFor: ""
WhenToUse: ""
---

# Measure incremental edges and PIE span stores on the PicoCalc Chess raster

On the opening 3D Chess frame, prevalidated scalar rendering reduced the body draw from 17.589 ms to 4.301 ms. PIE stores for the uniform matte reduced it further to 3.897 ms. Fifty-one board frames matched the stock bytes, dirty bands and virtual fill charge.

- [Research synthesis](analysis/02-where-the-picocalc-spends-a-chess-frame-and-what-incremental-rasterization-buys.md)
- [Incremental edge and PIE span experiment](analysis/01-where-vector-stores-help-the-chess-raster.md)
- [Independent retained repaint experiment](analysis/03-retained-chess-repaint.md)
- [Design and reproduction](design-doc/01-scan-convert-a-validated-chess-display-list.md)
- [Host evidence](various/host.json), [span traffic](various/span-traffic.json), and [board receipt](various/physical.json)
- [Raster investigation diary](reference/01-raster-pie-investigation-diary.md) and [damage diary](reference/02-damage-diary.md)
- [Tasks](tasks.md) and [changelog](changelog.md)
