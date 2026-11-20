---
Title: Implement and qualify the scalar 3D Chess scene
Ticket: PICOCALC-CHESS-3D
DocType: design-doc
Status: active
Topics:
  - picocalc
  - compiler
---

# Implement and qualify the scalar 3D Chess scene

Chess sends the receiving compositor two kinds of data. The first delivery is the Typed painter source, which describes how to construct a picture. Each position arrives as a PSIX packet, a compact indexed encoding of the cells that supply that picture. The 3D experiment uses the existing position encoding and changes the source to draw six piece shapes and a raised board.

The experiment stays in this ticket. [stage.py](../scripts/scene/stage.py) substitutes the source, adds one validated drawing operation, and raises a command limit in a private copy of the firmware. There is no position-schema migration.

## Geometry and ordering

The fixed camera projects a world position to integer body coordinates `u = 160 + x - z` and `v = 42 + (x + z) * pitch / 8 - y`. The board lies at `y = 0`. Raising a vertex changes its vertical screen coordinate. The experiment uses pitch 5 on the handheld, with pitches 3 and 7 available through the host fixture runner. Each square starts with four corners spaced 16 world units along the x and z axes.

The Typed entry `paintChess(buffer, buffer): i32` walks the board twice. The first pass emits two faces for each top tile and uses field cells for selected, cursor and last-move locations. It reads the eight legal masks for legal-destination highlights. The second pass emits each piece from far to near by increasing its grid diagonal `file + rank`. Both near sides of a tapered base have flat color. The upper silhouette uses a point for a pawn or bishop, an extended muzzle for a knight, a crown for a rook or queen, and a cross for a king. Each piece also gets a small type glyph. The screen-space ordering is deterministic for the restricted camera and meshes. Inside a shared diagonal, the projected centers are 32 pixels apart and each piece lies within 12 horizontal pixels of its center. This approach relies on that separation and on pieces remaining within their cells. It uses no general depth buffer.

The projector encodes `(u,v)` as `v * 512 + u` so a helper can return one i32. The command emitter separates horizontal and vertical coordinates by remainder and division. Visible vertices for the three sampled pitches lie within the 320×280 app body. At pitch 7 the board's lowest outside edge is y=271, and the piece vertices have sufficient margin above the far edge. The host also checks the complete vertex command stream before drawing.

## Triangle command and limits

Opcode 5 uses eight 16-bit words. After the opcode it stores `ax, ay, bx, by, cx, cy, RGB565`. The receiver validates all three vertices, the command count and the full stream before replacing a retained drawing. At each horizontal pixel-center row the rasterizer intersects triangle edges. It paints the span including the left edge and excluding the right edge to avoid gaps or duplicate pixels on the diagonal shared by neighboring tiles. It skips rows with fewer than two distinct crossings and draws through the port's existing RGB565 fill primitive. [Triangle scan conversion](../scripts/scene/triangle.inc)

The opening uses 406 commands and 3,281 words. A legal position can have at most 32 pieces, including promoted pieces. A fill, four side-wall triangles, 128 tile triangles, at most ten commands per piece and a terminal hint give a bound of 454 commands. The corresponding longest valid scene uses at most 3,665 words, including the ordinary hint. The 4,096-word output allocation and the 16,384-byte executable reservation already suffice. The PSIX decoder also accepts syntactically canonical tuples beyond the legal Chess occupancy limit. The bounds on writes and the resulting list validation can reject an oversized result from such a tuple before it replaces the retained drawing.

## What to reproduce

1. Generate normalized state fixtures with the [2D replay fixture generator](../../PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/scripts/transport/replay-fixtures.mjs). Feed its `fixtures.bin` to `node scripts/scene/poses.mjs FIXTURES WORK/poses`. This compiles the Typed source to WebAssembly to produce the reference command lists and compiles stock RV32 to check native size.
2. Run `python3 -B scripts/scene/raster.py WORK/poses WORK/raster various`. This compares product-derived scan conversion with a Python pixel-center reference, tests malformed triangle records and generates independent RGB565 body-plus-hint fixtures for the handheld. Both renderers use the same shipped font data.
3. Run `scripts/scene/build.sh WORK/build-root DEPENDENCIES_LOCK` with the known P4 ELF dependencies lock. This builds an isolated image with the normal native worlds, the experimental source, the SPI completion observer and the target-enabled compiler. The mobile linker aborts if its PIE diagnostics list contains any successful lowering. Run `node scripts/scene/linked.mjs REPO scripts/scene/isometric.typed WORK/build-root/build/esp-idf/main/mobile-painter-slot.elf WORK/scalar.elf` with the stock checkout to generate the reference linked image.
4. After taking ownership of the port, run `python3 -B scripts/scene/device.py WORK/observed ORDINARY_BUILD WORK/build-root/build WORK/raster scripts/scene/isometric.typed WORK/scalar.elf`. The runner verifies the ordinary image, modifies only the app partition, opens Chess via the usual key route with an instrumented key-status register, and reads back completed SPI pixels. It restores the ordinary image and verifies both the application and partition table on its way out.

The two native output identity checks cover complementary points. The host compiler can compare exact raw code bytes with the PIE option off and on. The device logs the byte count and a diagnostic FNV-1a digest of the actual linked ELF it compiled from the approved delivered source. That digest can be checked against the host scalar linked ELF. The ELF includes a fixed-size slot, so equal ELF sizes alone convey no information about the bytes generated into it.
