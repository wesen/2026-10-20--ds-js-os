---
Title: Where vector stores help the Chess raster
Ticket: PICOCALC-RASTER-PIE
Status: active
Topics: [picocalc, esp32-p4, performance, native]
DocType: analysis
Intent: long-term
---

# Where vector stores help the Chess raster

A Chess painter emits a display list. The list describes the background, triangles, piece glyphs and hints. Rendering executes those commands against a framebuffer. For the 3D experiment on PicoCalc, generating the commands took roughly half a millisecond and executing the body raster took roughly 18 milliseconds. The projection study optimized a small part of command generation. The next opportunity lies in the work that starts after all the projected coordinates are known. [3D packed scene study](../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/analysis/03-packed-scene.md)

## From three vertices to a row of pixels

The app body is 320 by 280 pixels, starting at row 22 of a 320 by 320 RGB565 framebuffer. The renderer accepts three vertices per triangle, all inside the body. It samples each integer row at its pixel center, halfway between the row's upper and lower boundaries. A triangle covers one interval on that row. Two edges give the bounds of that interval. The first covered column is included and the first column beyond the interval is excluded. This convention lets two neighboring triangles partition a shared edge without both assigning the same pixel center to their interiors.

The existing C scanner visits all three edges on each candidate row and tests which two intersect that row's centers. Their x coordinates are fractions. The renderer converts those fractions to the first columns satisfying the half-open rule, using integer division. It then calls `gfx_fill` for that row's nonempty span. That generic primitive clips, writes, marks dirty bands and charges virtual time. Each action belongs to the renderer, even when a list already passed validation.

For a concrete edge from (8,2) to (15,7), the pixel-center intersection moves by 7/5 columns each row. The first column numbers across the five active rows are 9, 10, 11, 13 and 14. The integer state tracks a quotient, which is the selected column, and a remainder that records the fraction within that column. Every new row adds a quotient step of 1 and a remainder step of 2/5. When the remainder reaches one whole column, it carries into the quotient. A negative slope uses the same update after normalizing its remainder to a nonnegative value.

The optimized traversal orders the three vertices once by height. A long edge spans the triangle, and each half of the triangle pairs it with one short edge. Initial division computes the state of each edge. Subsequent rows use the additions and carry test. This changes the operation sequence while retaining the exact integer definition of the first column. The included setup and stepping code supports flat tops, flat bottoms, either winding, and degenerate triangles. [Scan conversion design and equations](../design-doc/01-scan-convert-a-validated-chess-display-list.md)

## What the list validator lets the renderer skip

Every point in the accepted body is on the framebuffer. An interpolated edge intersection cannot lie outside the x interval between its endpoints. Taking the first column at or beyond the pixel center leaves the resulting span inside the panel bounds. The optimized renderer can store each span directly using a row pointer without another clipping attempt. This relies on the fixed RGB565 display dimensions, the same validator and a list that remains immutable during replay. Other operations such as alpha text continue through existing gfx functions.

A direct span still needs to mark its 16-row dirty band. The optimized loop accumulates the exact bands that received nonempty spans. It merges the mask with the framebuffer's existing bits. A flat matte touches many rows, and its width equals the framebuffer stride. Its rows form one contiguous region, so a single fill can walk that memory without computing a new row start for every scanline.

The virtual clock adds a separate charge rounded to integral microseconds. At the device profile of 2.5 ns per pixel, a span needs 400 pixels to accrue one virtual microsecond and a scanline contains at most 320. The optimized loop preserves this result by adding zero on that common profile. For another profile it performs each span's original rounding. A matte charges once for the whole fill in both versions, so its charge is computed from its entire pixel count.

## Where PIE helps

A uniform RGB565 span has no per-pixel arithmetic. The work is repeating a 16-bit color across consecutive memory. One ESP32-P4 PIE vector register holds eight 16-bit colors. The writer first fills up to seven halfwords in scalar code so the destination reaches a 16-byte boundary. The vector path then broadcasts the color into q0 and stores complete groups. The original scalar writer fills any remainder. Horizontal edge stepping remains scalar because the state of the next row depends on whether the current fractional state carries. [ESP32-P4 Technical Reference Manual, chapter 4](https://documentation.espressif.com/esp32-p4_technical_reference_manual_en.pdf)

The full-width 320 by 280 matte contains 89,600 pixels. It supplies 11,200 complete eight-pixel groups when aligned. Most individual triangle spans are shorter, and a 128-bit store has little opportunity in a span that cannot supply a complete aligned group. The prototype starts the vector writer at 16 accumulated pixels. For a short span it retains scalar stores. This threshold is an experimental value, and the same guarded scalar work still runs before the vector write.

The four arms identify the contribution of each design change. Stock uses the original row scanning and `gfx_fill`. The edges arm only changes the scan geometry. The scalar arm adds prevalidated spans, a contiguous fill and exact common-profile accounting. The PIE arm changes the stores in that last version. All four use the same command decoder. Tests compared all RGB565 bytes, dirty bands and virtual charges in 51 complete scenes. The same scenes also agreed with an independent edge-function and font implementation. Another 172 triangle windings with and without the matte and 256 span alignment and length combinations checked the conditions that complete scenes could conceal. [Host comparison](../various/host.json)
