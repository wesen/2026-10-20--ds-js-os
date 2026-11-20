---
Title: Raster PIE investigation diary
Ticket: PICOCALC-RASTER-PIE
Status: active
Topics: [picocalc, esp32-p4, performance]
DocType: reference
Intent: long-term
---

# Raster PIE investigation diary

## Step 1 — Freeze the renderer and choose measurement arms

The earlier 3D result spent much more time rendering the body than generating its drawing commands. I read the actual triangle scanner, command validator, scalar fill, and buffer lifetime before choosing where to reduce work.

### Prompt Context

**User request** — The director relayed “how can we make 3d rendering faster? can we PIE the rasterization?” and “continue”.

**Assistant interpretation** — Keep actual Chess appearance and the framebuffer contract, then compare a faster scalar raster with a PIE-assisted fill.

**Inferred user intent** — Determine which part of the visible rendering pipeline would benefit from vector instructions.

### What I did

- Inspected the scanner and gfx implementation, the independent Python reference, and the physical buffer allocation.
- Wrote the [scan conversion design](../design-doc/01-scan-convert-a-validated-chess-display-list.md) before implementation.

### Why

Removing row divisions and using wider stores are distinct changes. A comparison that only times a hot fill would miss setup, text, and remaining arithmetic.

### What worked

The stock scanner's adjusted numerator is nonnegative within a bounded active row. Quotient/remainder stepping can preserve its ceil result under both edge slopes.

### What didn't work

No implementation had run at this checkpoint.

### What I learned

The product allocates its framebuffers in PSRAM. Both dirty bits and per-span virtual-time rounding are observable results of rendering.

### What was tricky to build

A half-open scan range cannot be replaced by a coarse band mark if some spans are empty. A negative x slope needs a normalized remainder for the carry rule.

### What warrants a second pair of eyes

Review the once-per-edge quotient proof and exact equality of virtual time and full dirty masks.

### What should be done in the future

Implement the four arms, compare known display lists and pathological triangles, then sample the ESP32-P4.

### Code review instructions

Start with `painter_triangle` in the 3D ticket, `gfx_fill` in the nucleus, and the arm table in the design.

### Technical details

The frame is 320 by 320. The command body is rows 22 through 301. The dirty mask uses 16-row bands.

## Step 2 — Compare all frames and their observable metadata

The four C arms share the validated display-list layout and existing text renderer. An independent oracle supplied expected body pixels. The C host test also checked each full framebuffer, untouched chrome, both buffer canaries, dirty bands, and virtual charge against stock.

### Prompt Context

**Previous prompt** — See Step 1.

**Commit** — `a6d7205` Compare stepped edges and packed RGB565 spans against the Chess raster.

### What I did

- Added quotient/remainder edge stepping, scalar validated span writes and an ESP32-P4 broadcast-store writer.
- Ran 51 real lists, 172 triangle cases at both full and sparse coverage, 256 alignment and tail combinations and four malformed command lists.
- Used an alternative 199.75 ns fill profile on the synthetic cases to make per-row truncation observable.
- Applied an independent oracle to count eligible spans and writes across the corpus.

### Why

A matte touches the same dirty bands in all arms, so full scenes alone cannot expose sparse marking errors. A separate non-matte pass forces the host test to compare the bands reached by individual triangles. A large alternative fill coefficient exposes incorrect accumulation that the production profile could conceal.

### What worked

All byte, metadata and independent-oracle checks passed. Across 51 scenes, the maximum accepted triangle span was 15 pixels. Under the tested 16-pixel threshold, PIE handles only the matte. The opening scene includes 5,580 triangle spans and 33,150 triangle pixel writes.

### What didn't work

No host comparison failed. The first standalone build command attempted to copy `picocalc-os/nucleus/port.h`, and cp returned `cannot stat .../port.h: No such file or directory`. That header is unnecessary for the staged renderer and was removed from the copy list.

### What I learned

The normalized edge state can carry color-independent control for one row without invoking per-pixel comparisons. The 16-pixel span threshold excludes all fixture triangles, so display-list traffic analysis is necessary to interpret the vector speedup.

### What was tricky to build

At 2.5 ns per pixel, a whole RGB565 row is shorter than one virtual microsecond. The optimized common-profile path removes a floating-point operation only after proving its value is zero. Other profiles retain the original round-per-span expression.

### What warrants a second pair of eyes

Review the color peeling and the two boundary cases where an edge's slope becomes negative or an intersection lands exactly on a pixel center.

### What should be done in the future

A separate test can vary the vector threshold and the minimum span length, especially if a new camera yields longer scanlines.

### Code review instructions

Read `scripts/edges.inc` and run the reproduction in the design guide. `scripts/06-traffic.py` counts aligned groups from the independent oracle.

### Technical details

The frame seed is 0xa5 including chrome and outer canaries. Its dirty bits start with a set bit outside the framebuffer's rows to check that existing bookkeeping survives.

## Step 3 — Time the complete raster and restore the normal image

I measured the stock and experimental arm on the real P4 with the frame and display lists in PSRAM. The same board pass collected the independent damage comparison. The runner owned serial under the shared lock and wrote only the factory application.

### Prompt Context

**Previous prompt** — See Step 1. The director asked for the whole renderer rather than a fill-only microbenchmark, plus restoration of the current playable release.

### What I did

- Preflighted the benchmark and release digests, whose partition tables were identical.
- Timed draws with validation excluded and included for seven scenes, with 11 two-draw samples for every arm and timing boundary.
- Captured all 51 complete frame correctness rows and ten damage comparisons.
- Restored the ordinary playable app, verified app and partition readback, and watched the expected worlds and painter become healthy.

### Why

The display renderer includes time spent clearing, stepping edges, drawing glyphs and updating metadata. A single in-memory store benchmark would miss that work and its interaction with PSRAM.

### What worked

Every physical case and the independent damage series passed. At e2 the medians were 17.589, 16.025, 4.301 and 3.897 ms respectively for stock, stepped edges, prevalidated scalar and PIE. The validation-inclusive comparison was 17.650 ms versus 3.963 ms. The paired RISC-V disassembly contains `esp.vldbc.16.ip` and `esp.vst.128.ip`. The restore runner exited zero, returned the same image and partition, and observed eight healthy native worlds and the normal painter installed again.

### What didn't work

The initial SDK build silently selected 20 MHz PSRAM, despite a 200 MHz requested default. The active Kconfig makes 200 MHz depend on `IDF_EXPERIMENTAL_FEATURES`. I checked the product settings, selected both the gate and performance optimization, and rebuilt before any flash. The measured image boot confirmed 360 MHz CPU and 200 MHz PSRAM.

### What I learned

The biggest reduction came in the grouped scalar transformation, between the stepped-edge arm and the direct validated spans. PIE improved uniform clear and contributed another 0.404 ms at e2. The measured damage arm has a different caching and scene lifetime contract.

### What was tricky to build

The board microbenchmark needs the same physical memory placement as the compositor and valid application partition geometry. Command lists and 64-byte-aligned back buffers are in PSRAM. Text and fill are both timed. The benchmark sets the device's fill coefficient and leaves other virtual profile coefficients zero. Each fixture glyph would charge zero under the standard 6 ns text coefficient as well, although zero can change the soft floating-point instruction cost. The measured whole-renderer comparison uses the same profile for all arms.

### What warrants a second pair of eyes

Confirm that the 4.51× e2 improvement compares like calls and that the much smaller vector-only reduction is reported independently. Keep display commit, SPI and key-to-panel latency outside that claim.

### What should be done in the future

Retest the scalar fast path and damage replay within the integrated compositor. Run a combined comparison before choosing when a large damage region is more expensive than a full optimized draw.

### Code review instructions

Use `various/physical.json` with `various/uart-evidence.txt` to verify the data and restoration. Use `various/pie-disassembly.txt` to corroborate the hardware instructions.

### Technical details

Measured vector assembly used q0 with the OS's lazy PIE context handling, CPU0 at 360 MHz, 200 MHz external RAM and flash-mapped kernel instructions. The benchmark keeps validation, command rendering and downstream display presentation as distinct timing boundaries.
