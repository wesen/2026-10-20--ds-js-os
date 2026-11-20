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
