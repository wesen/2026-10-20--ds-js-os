---
Title: How much of a three-dimensional Chess board must the PicoCalc repaint?
Ticket: PICOCALC-RASTER-PIE
DocType: analysis
Status: complete
Topics: [picocalc, chess, rendering, esp32-p4, performance]
---

# How much of a three-dimensional Chess board must the PicoCalc repaint?

Moving the cursor from e2 to e3 changed 328 of the 89,600 application pixels. On the ESP32-P4, replaying the entire validated display list took 17.89 ms. Comparing two command lists and repainting a 54 × 50 rectangle took 3.29 ms. An ordinary pawn move proved much less favorable. Moving the pawn from e2 to e4 changed 760 pixels, yet the same algorithm reconstructed 30,400 and took 15.46 ms. Both results came from real Chess commands rendered into external RAM. They describe the raster portion of an isolated frame. [Physical samples](../scripts/damage/board.json) · [Host examples](../scripts/damage/host.json)

The display list provides enough information to skip most of a cursor repaint. The size of the visible change alone predicts little about the cost of finding and reconstructing it. A second result determines the integration choice. A separate full-render experiment on the same P4 drew the e3 frame in about 3.89 ms using incremental edges, direct spans and packed stores. That implementation can draw the body starting with arbitrary contents. A retained repaint requires ownership of the previous pixels. The production compositor currently clears those pixels immediately before calling the painter. [Full-render study](01-where-vector-stores-help-the-chess-raster.md) · [Compositor paint entry](../../../../../../picocalc-os/js/system/compositor.js)

## The picture a display list describes

The screen is 320 pixels wide and 320 high. The compositor owns the top 22 rows and bottom 18. The painter receives body coordinates from (0, 0) through (319, 279). An RGB565 value occupies two bytes. A complete body therefore occupies 179,200 bytes. On the board both framebuffer allocations were 64-byte-aligned PSRAM buffers.

The opening scene contains 406 commands. It begins by filling the entire body with a matte color. Four triangles describe the visible board lip. Faces for squares and pieces, and one-character labels, follow in painter order. The last command supplies the current hint string. A triangle record occupies eight 16-bit words including its opcode, six coordinates and color. A small single-glyph record happens to occupy eight words as well. A hint contributes no body pixels. These properties let the experiment compare command records without regenerating meshes or invoking the Typed painter. [Frozen scene design and limits](../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/analysis/02-scene.md)

A square outline can lie behind the visible side of a piece. Erasing its old color and drawing its new color can cover the piece. Font coverage introduces a second constraint. A partly transparent glyph recomputes each covered color by blending its foreground with the existing background pixel. Redrawing a glyph twice against its old result can darken an edge. Correct partial replay must reconstruct the ordered composition in every pixel it claims to own. The previous full-frame oracle evaluates coverage by pixel-center edge equations and blends the actual font's four-bit alpha samples. [Previous independent raster oracle](../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/scripts/scene/oracle.py)

## Deriving the region without reading pixels

Let A denote the records of the scene currently present in the framebuffer and B the records of the requested scene. The method first checks both complete lists for a compatible matte, lip geometry, triangle commands and supported one-glyph commands. It skips equal records from the front and back. Within the remaining middle sequences it compares records at corresponding positions. An unequal pair contributes the bounding box of both records. An unmatched record contributes its own box. A single rectangle encloses the union.

For an integer-coordinate triangle, the bounding box uses half-open x and y intervals. Coverage is tested at pixel centers, so the largest integer vertex coordinate is already an exclusive upper bound. A small glyph occupies a conservative 6 × 12 rectangle. Suppose the initial damage box ends at x=21 and overlaps a glyph extending to x=26. The code widens the rectangle to include that entire glyph. A second glyph beginning at x=25 can extend it again. The implementation repeats the scan until every intersecting current glyph fits. This fixed point keeps each call to the original font renderer inside the cleared region. [Candidate implementation](../scripts/damage/damage.c)

The actual draw then performs three operations.

1. Fill the final rectangle with the new matte.
2. Visit every current face and glyph in its original command order. Skip primitives whose bounding boxes do not intersect the rectangle.
3. Clip each triangle scanline to the rectangle. Paint intersecting glyphs once through the existing text routine. Keep hint metadata available to the compositor on every path.

Why does skipping the rest work? Choose a pixel outside the final rectangle. Every record removed from A, inserted into B, or paired with a different record has a footprint excluding that pixel. Deleting all such records leaves an identical ordered sequence of surviving inputs at the pixel, beginning with the same matte. Inside the rectangle, the old image is discarded and every contributing new primitive runs in the original order. The two arguments cover the whole body. The proof depends on accurate bounds, a self-contained matte-first scene, unchanged draw semantics, and a prior body whose contents actually correspond to A.

The experiment uses no reference framebuffer to locate damage. In an ideal pixel comparison, one could read the old and new completed images and count the different samples. Generating the second complete image is the work we are trying to avoid. In this experiment only the test runner can read both references. The board also holds a second buffer to reseed successive timing trials fairly. A retained raster implementation needs the old command list and its pixel-ownership record, plus the existing framebuffer.

## Which scenes actually exercise the guarantee?

The tests freeze the 51 complete streams already qualified for the delivered 3D painter. Each stream is rechecked against its previous SHA-256 command digest. The independent Python rasterizer must produce the previously recorded body-plus-hint image hash. A native host executable builds the frozen stock renderer, validates each stream with its real command validator, and checks every stock body pixel against Python. Only then does it measure partial replay. [Corpus and oracle generator](../scripts/damage/prepare.py) · [Host build and checks](../scripts/damage/host.py)

For every ordered pair, the runner supplies the old body as the candidate's starting memory and verifies the complete new body. It checks all 12,800 reserved header and hint pixels for writes. Each truly changed body pixel must lie inside the reported rectangle and inside a marked physical 16-row band. A separate run applies 50 consecutive updates without reseeding the old raster. Corrupted and truncated lists are rejected by the original validator. A poisoned previously displayed body recovers through explicit invalidation. A synthetic face and two overlapping glyphs exercise the fixed point. A changed matte, a valid complete list using a rectangle, and missing history exercise full replay. [Executable checks](../scripts/damage/host.c)

Of 2,601 directed pairs, 2,288 used partial replay, 198 used full replay and 115 left the body untouched. In eight of those 115 cases the hint changed. The no-op result on the body remains correct while the compositor updates its hint strip. Across all partial pairs, the selected area ranged from 875 to 43,400 pixels, with median 38,688. Arbitrary pairs include dissimilar positions from separate games. That median describes coverage of this finite cross-product and cannot estimate a user's typical sequence of moves.

| Actual transition | Pixels differing | Area of smallest box around differing pixels | Area selected from records | Current records replayed |
| --- | ---: | ---: | ---: | ---: |
| Cursor e2 → e3 | 328 | 972 | 2,700 | 96 |
| Cursor e3 → f3 | 604 | 1,260 | 3,348 | 93 |
| Opening position repeated | 0 | 0 | 0 | 0 |
| Pawn e2 → e4 | 760 | 2,080 | 30,400 | 375 |
| Engine knight move | 1,256 | 8,107 | 17,316 | 259 |
| Promotion | 778 | 1,892 | 1,936 | 16 |
| Short castling | 2,905 | 7,169 | 7,236 | 58 |
| Long castling | 3,181 | 10,947 | 22,568 | 142 |
| En passant capture | 1,162 | 2,537 | 2,640 | 36 |
| Camera change to low | 24,074 | 45,568 | 89,600 | Full list |

The pawn example exposes the cost of aligning records by sequence position. Moving an object within the painter's order shifts nearby records. Two displaced sequences can compare unequal for many positions even when their constituent faces eventually draw the same pixels. The single rectangle also encloses empty space between distant footprints. A scene format carrying stable square or mesh identities could give a tighter union. Those identities and the cost of maintaining them were outside the measured implementation. [Per-transition rectangles, oracle areas and counts](../scripts/damage/host.json)

## What the handheld measured

The CPU ran at 360 MHz on core 0. The board first drew the old list into a seed buffer. Before each timed call it copied those pixels to the target and cleared the target's dirty mask. The full arm ran the original native renderer on the new list. The partial arm included both list scans, region calculation, glyph closure and replay. Each case ran seven paired observations with arm order alternating between observations. Both lists had already passed validation. Allocation, reseeding, checksums, delays, panel commit and logging were outside the measured interval. [Hardware harness](../scripts/damage/board.c)

For every timed draw, the harness checked the FNV-1a hash of all 179,200 body bytes and compared both reserved bands against the seed. On the host, the review script regenerated the references from the frozen command bytes, checked the physical hash for each case and checked the reported rectangle and replay count against the independently verified host run. The on-board number is a 32-bit checksum. The host matrix provides the stronger byte-for-byte comparison. The table uses per-arm medians for milliseconds, and the median of the seven within-pair ratios for the percentage. [Raw cycles and verified results](../scripts/damage/board.json) · [Capture checker](../scripts/damage/board-review.py)

| Actual transition | Stock full, ms | Retained, ms | Retained / full | Pairs with fewer retained cycles |
| --- | ---: | ---: | ---: | ---: |
| Cursor e2 → e3 | 17.89 | 3.29 | 18.4% | 7/7 |
| Cursor e3 → f3 | 17.89 | 3.49 | 19.5% | 7/7 |
| Opening position repeated | 17.92 | 0.22 | 1.2% | 7/7 |
| Pawn e2 → e4 | 17.89 | 15.46 | 86.4% | 7/7 |
| Engine knight move | 17.89 | 10.54 | 58.9% | 7/7 |
| Promotion | 11.18 | 0.85 | 7.6% | 7/7 |
| Short castling | 12.00 | 3.00 | 25.0% | 7/7 |
| Long castling | 11.99 | 7.61 | 63.5% | 7/7 |
| En passant capture | 11.12 | 1.44 | 12.9% | 7/7 |
| Camera change to low | 13.79 | 13.93 | 101.1% | 0/7 |

The full-fallback case is a measured loss. Checking both command formats and discovering a camera change added a median paired 52,501 cycles, or 0.146 ms, before essentially the original draw. An explicit caller-provided camera invalidation could skip those scans. A repeated frame also has a visible fixed cost of about 0.22 ms for validation of the supported shape and comparison of the two lists. A trusted, last-painted generation identifier could eliminate the scan for an unchanged delivered list.

The other full-render experiment used warm repeated draws, rotated four arms and compared each to stock. It recorded approximately 3.89 ms for full e3 and 3.90 ms for full f3 with PIE. The retained stock-primitive values of 3.29 and 3.49 ms leave a much smaller margin against that implementation than against 17.89 ms. The protocols differ in cache preparation, repetition and input history. Combining their medians would give an unpaired estimate. This study therefore does not assign an incremental speedup to a hypothetical combined fast-span-and-damage pipeline. [Full-render measurements](01-where-vector-stores-help-the-chess-raster.md)

## Independent check on edge stepping and packed writes

Both the slow baseline and the new partial renderer sample at pixel centers. Let an ascending edge start at (a, b), let its horizontal displacement be dx and its positive vertical displacement be h. At body row b + r the first covered column on the edge is the ceiling of

```text
(2*a*h + (2*r+1)*dx - h) / (2*h)
```

The optimized full renderer adds 2h − 1 to the numerator and divides once. This is safe under C's truncation rule in the validated coordinate domain. The unshifted intersection x is a convex combination of the two nonnegative endpoint x coordinates. After subtracting one half pixel the numerator is at least −h. The biased numerator is therefore at least h − 1. The quantities fit in signed 32-bit arithmetic at the validated 320 × 280 bounds. The algorithm advances the quotient and a Euclidean residual each row. Negative dx requires reducing the step quotient and increasing its remainder if the C remainder is negative. An edge moving left by one pixel over several rows directly exercises this correction.

An independent harness includes the actual candidate edge functions, then recomputes a signed 64-bit ceiling directly on every row. It enumerates all 639 horizontal displacements and all 279 positive vertical displacements, at the smallest and largest legal horizontal translations and with the top or bottom endpoint on the screen boundary. It matched every x and checked the residual range on 49,918,680 row steps from 356,562 starts. A horizontal edge has zero active rows and is omitted before constructing a divisor. [Arithmetic harness](../scripts/damage/edge-review.c) · [Run counts](../scripts/damage/edge-review.json)

RGB565 gives eight pixels per 128-bit store. Starting from a naturally two-byte-aligned destination, between zero and seven scalar pixels bring the pointer to a 16-byte boundary. The candidate calls the packed routine only for initial spans of at least 16 pixels. Even after the largest alignment prefix, at least one complete group remains. A group model checked the actual C dispatcher with lengths 0 through 320 and all eight pointer residues, including surrounding protected words. All 2,568 cases matched, with 49,105 modeled group stores. The linked ELF contains a 16-bit broadcast into q0 and a 128-bit post-increment store. This SDK's FreeRTOS save/restore covers q0. The companion study's span census found the genuine Chess triangle spans all shorter than the dispatch threshold. For these scenes the packed stores accelerate the large matte fill. [Candidate span assembly](../scripts/span.S) · [Span traffic](../various/span-traffic.json)

## Conditions for putting this into the compositor

The production paint entry already implements a retained shortcut for certain Snake moves. Its generic path fills the entire screen with paper, paints a status bar, calls the application painter and then draws banners and hints. Calling damage replay immediately after that full-screen fill would leave the untouched portion of the board blank. The prerequisite is an explicit contract over what remains in the back buffer. [Compositor paint path](../../../../../../picocalc-os/js/system/compositor.js)

Track the framebuffer identity and dimensions, view and painter generation, camera, last **painted** command list, and whether another operation altered the body. A delivered-but-skipped list cannot establish the prior picture. The native service alternates current and scratch buffers when a validated candidate arrives. If it accepts several candidates before the next display paint, its scratch buffer can overwrite the last painted list. A compositor can pin that list, or invalidate the prior body before its storage is reused. Reinitializing the framebuffer, switching apps or painter versions, replacing the camera, or showing and removing a banner calls for a full body repaint. Reserve the header and hints for their compositor paths. The public validator also accepts lists without an opaque full-body matte. A general transparent application must obtain its background from the compositor before a fresh render. [Native service buffer ownership](../../../../../../picocalc-os/port/esp32p4/main/painter_service.c)

Finally, a write to the back buffer marks a 16-row band dirty. The existing commit already compares front and back in marked bands. Sending a smaller repaint region to the CPU does not by itself prove fewer panel bytes or lower key-to-screen latency. The next paired integration measurement would retain the full fast renderer as fallback and compare it directly to retained replay with the same span writer, using actual compositor decisions. Include validation, hints, overlays and commit in that measurement. The current evidence supports the simpler fast full renderer for ordinary use and a retained specialization for cursor or repeated frames when body ownership is known. [Framebuffer commit](../../../../../../picocalc-os/nucleus/gfx.c)

## Reproduction

From this ticket's scripts/damage directory, regenerate the host decision matrix and review the sibling's exact edge and span functions. To check the physical data, run the last command with an existing raw operator capture from the combined benchmark.

```sh
python3 -B host.py --sanitize --output /tmp/damage-host.json --matrix /tmp/damage-matrix.csv
python3 -B edge-review.py
python3 -B board-review.py /path/to/uart.log /tmp/damage-board.json
```

The corpus digest begins f5c820bf. The complete directed host matrix digest begins 72e31e10. The experimental board image digest begins 1413d0fe. No native renderer, compiler or compositor installation was changed by the independent host experiment. [Investigation diary](../reference/02-damage-diary.md)
