---
Title: Derive a repaint region from two delivered Chess command streams
Ticket: PICOCALC-RASTER-PIE
DocType: design-doc
Status: complete
Topics: [picocalc, chess, rendering, performance]
---

# Derive a repaint region from two delivered Chess command streams

An isolated 3D Chess body occupies 320 × 280 RGB565 pixels beneath 22 rows of compositor chrome. A cursor change can affect only a small part of this body. Can the rasterizer reproduce a fresh draw by clearing and repainting one rectangle, including faces that occlude the cursor?

## Falsification protocol

Freeze the 51 previously qualified complete lists. Verify each command digest before generating any new references. Render with the previous independent pixel-center edge-equation oracle, check its body plus rendered-hints hash against the frozen receipt, and individually compare the existing C full renderer. Obtain 2,601 candidate inputs by applying each new list to each prior pixel image. Also chain the 51 lists in sequence so that mistakes cannot be hidden by reseeding an intermediate image. Compare every body pixel and protect the reserved top and bottom chrome with sentinels. Compute the ideal pixel difference only after the replay decision, in the test process. Verify each real change falls within the chosen rectangle and a marked physical 16-row band. Keep hint-only changes even when the body is equal.

Begin with a complete background fill and a known screen owner. Reject partial replay if prior pixels were lost, the lip/camera or matte changed, or the accepted command list contains a drawing command outside the supported subset. The service must validate a candidate before replacing its last accepted list. The retained baseline is the list whose pixels were actually painted. This distinction matters when a compositor skips a view or another task temporarily covers it.

Strip the longest common prefix and suffix of eight-word face or single-glyph records. Include the old and new bounding boxes of each differing record and any unmatched suffix of the middle segment. Conservatively expand to include every overlapping current glyph in its entirety until stable. Clear that box to the current matte, then replay every intersecting new record in its existing order. Clip triangle spans to the box and let the standard alpha glyph routine paint each overlapping glyph. The body excludes hint metadata. Integrators must drive hint updates and invalidate body ownership independently.

## Instrument contract

The hardware operator receives one standalone benchmark callable after the primary four-arm suite. Stage the same validated stock renderer used on the host. Place old/new lists and the aligned RGB565 destination in PSRAM. Alternate full and retained rendering over seven pairs per transition, restore identical previous pixels before each timed call and exclude copies, checksums, display commit and logging. Record hashes and body-mode decisions along with raw counter samples. A camera change exercises genuine full fallthrough with its guard cost.

Independently check the sibling edge recurrence by comparing its actual C state to a row-wise 64-bit signed rational oracle across every validated slope. Check all RGB565 alignments and span lengths with protected prefix and suffix words and a group-store model that requires a 16-byte destination, a two-byte broadcast operand and a nonzero count. Reserve execution claims for the linked image and physical operator records.
