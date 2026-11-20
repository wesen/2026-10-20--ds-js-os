---
Title: Scan-convert a validated Chess display list
Ticket: PICOCALC-RASTER-PIE
Status: active
Topics: [picocalc, esp32-p4, performance, native]
DocType: design-doc
Intent: long-term
---

# Scan-convert a validated Chess display list

The existing Chess experiment recorded approximately 18 ms in native body rasterization, while command generation ran in about half a millisecond. A validated list starts with an RGB565 matte fill, then includes flat triangles and alpha-blended text. This study compares four implementations with the same accepted lists and frame buffer contents. Each advances one stage of optimization.

| Arm | Edges and triangles | Span stores and fills |
| --- | --- | --- |
| Stock | Existing C scans three edges and divides at every row | Existing gfx fill |
| Edges | Step active intersections with integer quotient and remainder | Existing gfx fill |
| Scalar | Same stepped edges | Validated direct spans and contiguous full-width fills |
| PIE | Same stepped edges | Validated spans, scalar alignment prefix and remainder, and 128-bit packed stores |

## Walk through one triangle

Sort the vertices by increasing y. The long edge covers the whole triangle while two short edges cover the upper and lower halves. A horizontal half has no rows. For an edge from (ax,ay) to (bx,by), with `dy=by-ay>0`, the stock first column for row y is

```text
n = 2*ax*dy + (2*y+1-2*ay)*(bx-ax) - dy
first = floor((n + 2*dy - 1) / (2*dy))
```

The adjusted numerator is nonnegative for a validated edge and an active row. Initialize quotient and nonnegative remainder at the first row of each segment. The numerator increases by `2*(bx-ax)` per row. Divide that constant once. A negative slope uses Euclidean division, so the integer quotient can be negative and its remainder stays nonnegative. Each subsequent step adds the constant quotient, adds the remainder and carries once when the sum reaches the denominator.

At each row render from the smaller column through one before the larger. An exactly shared pixel center belongs to one side. The y range is half-open, so a repeated-y vertex and shared horizontal edge preserve the same ownership. Empty spans produce no dirty bits or virtual fill charge.

## Preserve existing behavior

The existing command validator checks geometry before any renderer runs. Use the same validator and command decoder in all arms. Restrict the direct stores to RGB565, a non-null 320×320 framebuffer and a valid list previously checked by that validator. Clear only the command's body rectangle. Keep unused system rows byte-identical. The existing text and outline paths stay in the C gfx implementation; their return values and metadata are part of every timed draw.

The public buffer records a dirty mask over 16-row bands. OR in every band that receives at least one pixel and preserve preexisting bits. Charge the virtual clock once per nonempty span as today, including per-span truncation. Full-width rectangles may use one contiguous write and one charge, as the old rectangle fill already charges once for the whole command.

For PIE, peel halfwords up to an aligned 16-byte address. Broadcast one RGB565 halfword and issue aligned 128-bit stores for complete eight-pixel groups. A scalar tail handles the remaining pixels. Test a minimum span length so short rows avoid paying the call and broadcast cost. Each span uses one vector register and no shift, rounding or configuration register. [ESP32-P4 PIE reference](https://documentation.espressif.com/esp32-p4_technical_reference_manual_en.pdf)

## Compare and measure

Compare every RGB565 byte, hint string, dirty mask and virtual-clock delta to the frozen real C implementation for all 51 fixture lists. Independently compare the body and hint results with the existing edge-function and font oracle. Test thin edges, degeneracy, both windings, interrupted y ranges, and prefix and tail lengths. Derive and qualify the bounds that permit direct memory access before physical execution.

The main P4 comparison uses a 64-byte-aligned PSRAM back buffer, as in the compositor, and command arrays in PSRAM. Measure validation plus complete command rendering, and rendering alone after validation. Allocate and seed buffers before timing. Measure all meaningful costs within the renderer, including the full matte, span accounting and text. Framebuffer allocation, display commit, DMA transfers and panel latency have separate boundaries. Record the actual target frequency and cycles, correction checks, and final restoration.

The usual device profile is exactly 2.5 ns per pixel. A scanline of at most 320 pixels truncates to zero virtual microseconds. The optimized arms specialize that case without dropping observable charge. If the profile differs, they retain the per-span floating-point operation and truncation. The full matte's combined charge uses integer division by 400 at the device profile.
