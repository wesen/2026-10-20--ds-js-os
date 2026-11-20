---
Title: Maintained 3D Chess geometry investigation diary
Ticket: PICOCALC-CHESS-3D
DocType: reference
Status: active
Topics:
  - picocalc
  - compiler
---

# Maintained 3D Chess geometry investigation diary

## Step 1. Replace the marked counters with six closed solids

After the fixed-view gameplay trial, the user requested a playable scene with recognizably different pieces and a rotating view. I designed six world-space forms and kept the frozen scalar painter as the opening-exchange control. The maintained source uses a piece's shape for its identity and keeps glyphs only for board coordinates and the status area.

### Prompt context

The director delegated the renderer under the user's production play request and then relayed the user's smooth-rotation request. The authored request that began the fixed-view research is in [the director diary](01-director-diary-for-the-mobile-three-dimensional-chess-experiment.md). I interpreted the production request as real projected intermediate geometry, six piece silhouettes, and a normal keyboard layout.

### What I did

I authored the pawn, rook and queen as frusta and smaller crown solids. I constructed the knight, bishop and king from pedestals with extruded profiles. Their head, notched mitre and cross respectively have thickness and separate cap geometry. Initially I generated all the visible triangles offline for each cardinal orientation. I packed each triangle's coordinates into seven character cells, then expanded them into the eight-cell record in the same output prefix.

### Why

The first packing scheme made the data compact in source and preserved the two-buffer ABI, including the untouched tail after the counted output. The same shape data could be transformed and painted without introducing pointers into the PSIX state.

### What worked

The generated shapes were closed assemblies, gave each kind a different silhouette, and compiled as straight-line writes without a third input buffer. The output layout left enough reserve for filling the triangle operations in place.

### What didn't work

I measured 70,136 RV32 bytes using `typedRv32.compile(source)`. A Typed buffer literal emits a checked store for each unit after its initial range check, so the small textual geometry table produced thousands of repeated instructions. The earlier source also used `1 << gameFile` for the legal mask and failed the Wasm compiler with `expected identifier` at the shift operator. I restored the division-based mask calculation.

### What I learned

An efficient source representation can still create a huge compiled program. The closed renderer needs a separate account of source bytes, machine bytes, and returned display words. For the pieces with many repeated vertices, compact geometry plus a little computation uses a much smaller code slot.

### What was tricky to build

The bishop and king have concave outlines. A fan from one vertex can draw through the notch or between the arms. I used an ear-clipping generator to produce triangles within the perimeter and preserved the original outline order for the side walls.

### What warrants a second pair of eyes

Review the outline input coordinates for self-intersection before changing them. Their winding determines the side faces, and the cap generator assumes a simple polygon.

### What should be done in the future

If model sizes grow, compare the startup and per-pose cost of a shared immutable mesh data representation against the current scalar computation.

### Code review instructions

Read `frustum`, `extrusion` and `paintPiece` in the maintained painter. Check `tools/generate-chess-meshes.py --check` after any profile change.

### Technical details

The branch moved from literal triangles to procedural frusta and two generated constant lookup tables. The cardinal version compiled to 21,164 native bytes before changing the camera.

## Step 2. Rotate vertices and qualify the same geometry at every phase

The user wanted a smooth transition instead of a brief jump between the four cardinal views. I changed the local camera field to phase 0–31, used the fixed-point quarter-wave table, and projected each world vertex at the requested phase. The first cardinal renderer's darker board treatment improved separation of the white pieces after a screenshot review.

### Prompt context

The director relayed the smooth-turn request and the input mapping. Phase 8 had to preserve the original cardinal convention. F3 and F4 request quarter turns in opposite directions, and hardware scheduling and capture belong to the director.

### What I did

I replaced the view-square permutation with a center-based vertex transform and used projected winding to select outward faces. I drew pieces in order of the scalar rotated depth key, with coincident keys settled by board index. I added a cursor border, projected coordinate labels, a fixed-screen turn status and a fixed-screen last-move caption. I changed the checkerboard to darker gray-blue shades and gave white surfaces distinct ivory and warm shadow values.

I ran `node scripts/scene/maintained-poses.mjs FIXTURES OUTPUT` and `python3 -B scripts/scene/maintained-raster.py OUTPUT EVIDENCE`. The first script checked every floor triangle against independently calculated projection, compared complete Wasm and modeled RV32 memory, and enumerated the per-piece bounds. The second compared output pixel identities across the phased series and built the six-model illustration. I froze the source hash before the firmware operator built the physical candidate.

### Why

Rotating the geometry answers whether a piece really includes views with a visible muzzle, notch or cross thickness. An endpoint-only replay could pass without establishing the intermediate projection. A signed depth ordering also needs to follow the newly rotated camera direction.

### What worked

The final renderer occupies 16,316 source bytes. Its 8,367-byte Wasm module and 23,848-byte RV32 image agreed over 160 complete arenas. The largest full scene returned 8,655 words. The separate 24,576-placement sweep found a per-piece maximum of 38 triangles and established a conservative frame maximum of 1,370 operations and 11,022 words. The over-occupancy check rejected a 33-piece state before any output mutation. Each of the five snapshots had 32 distinct app-pixel hashes.

### What didn't work

The first smooth source compiled to a duplicate-local error at line 155 because the camera cosine and a face corner shared `c` inside the extrusion routine. Renaming the camera term made the error disappear. That readable draft then occupied 16,446 bytes, beyond the stock source gate. I packed the two already-computed depth coefficients rather than repeating sine/cosine recombination inside the projection. With the explicit over-occupancy guard, the resulting source fit at 16,316 bytes.

### What I learned

For the hardware code-slot bound, the raw linked instruction size matters. For a repaint, the dominant input is the number of geometric primitives and pixellated spans, which the code size alone cannot predict. The modeled maximum of 786,488 instructions identifies a host workload and does not give a P4 frame duration.

### What was tricky to build

Signed integer rounding has to be applied in the same order throughout the board and mesh projection. Keeping one projector also makes shared endpoints agree. Coordinate labels need the original game square names even when mounted on a different near board edge. The compact two-axis camera coefficient word avoids a third ABI input and covers every requested phase.

### What warrants a second pair of eyes

Check that the receiver's phase-8 input remap is the inverse of the projection convention, and that its heap output limit accounts for the worst per-piece count. The geometry model's small depth-ordered assemblies should be tested visually when adding any new shape that extends over a neighboring cell.

### What should be done in the future

A lighting computation or alternate mesh budget can be studied with the same 32-phase replay. The physical camera and gameplay capture should retain its own measured timings, sources and receipts.

### Code review instructions

Read the [geometry guide](../design-doc/03-maintain-six-meshes-and-the-rotating-camera.md) for the projection equations and limits. Follow one tile's independently checked corners through phase 0, 4 and 8. Review the [host receipt](../various/maintained-geometry/host-validation.json) for exact compiler and framebuffer identities.

### Technical details

The frozen Typed source SHA-256 is `6ff9dc8a9e3ad3cc9a877c4ed9ebbb6b535941acba7c63e29e87edc4c5337214`. Its modeled RV32 image SHA-256 is `da8e33f9d0cd37fe446ad7a4398c142b92df58da048efd16e974aaf7845f4364`. Host qualification exercised phase 0 through 31 and preserved the same 90-cell PSIX packet up to the receiver's view-local cell 90.
