---
Title: Director diary for the mobile three-dimensional Chess experiment
Ticket: PICOCALC-CHESS-3D
Status: active
Topics:
    - picocalc
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:08:00.740753045-05:00
WhatFor: ""
WhenToUse: ""
---

# Director diary for the mobile three-dimensional Chess experiment

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

# Director diary for the mobile three-dimensional Chess experiment

## Step 1: Tie the geometry study to two independent prerequisites

The user proposed delivering a 3D painter once the previous research came back. The 2D mobile painter completed its opening and two cursor observations in an initial healthy boot. The independent compiler candidate was also ready for falsification. I opened a separate ticket for rendering, so a successful SIMD microbenchmark cannot accidentally be reported as a 3D application speedup.

### Prompt Context

**User prompt (verbatim):**

> Ok, send out another researcher to do this. And I guess once the other research comes back, we could start experimenting with sending a 3d rendering painter over to the compositor?

The user requested Sol Medium and independent Astra supervision with diaries and textbook reports. I interpreted this as an initial downstream experiment on the same bootable Chess game.

### What I did

Created PICOCALC-CHESS-3D, the intern guide, this diary, and two acceptance tasks. Traced the existing state cells, drawing vocabulary, code slot and measured renderer path. Proposed a single triangle record and a source-owned mesh.

### Why

Keeping the position unchanged lets us attribute differences in rendering to the program. A second view gives us evidence that the geometry is three-dimensional and defines a useful later performance comparison.

### What worked

The preceding 2D physical run observed one compiled entry reused through e2, e3, and f3. The P4 compiler and PSIX route can already carry a different pinned program in a research image. The independent PIE team supplied a testable projected-vertex kernel.

### What didn't work

An earlier two-core background build overran a launcher draw deadline. That result belongs to mobile-painter qualification and informs how a larger source is scheduled. The current production drawing vocabulary cannot express filled triangles in one record.

### What I learned

The normal painter owns two buffers with a four-byte capacity header, and its native image must fit the code slot. A candidate vertex loop with six array arguments needs a specific buffer layout and a way to acquire scratch; its isolated result does not automatically extend the full painter.

### What was tricky to build

Define a workload that fits the existing output, keeps squares identifiable, makes piece height observable and permits independent pixel checks. Separate the 2D oracle from the geometry reference for the new appearance.

### What warrants a second pair of eyes

Coordinate range, edge coverage, face order, buffer bounds, and evidence of native execution versus host rendering.

### What should be done in the future

Execute the design and record exactly which portions ran through the actual display.

### Code review instructions

Read the design guide first, then the 2D painter contract in nucleus/mobile_painter.h and the implementation research in the PICOCALC-TYPED-PIE ticket.

### Technical details

The app body is 320 by 280 pixels. A 3D experiment can use the same 90-cell state, 4,096-word output buffer and compiled entry signature. One triangle record as proposed consumes eight 16-bit words. The old 2D cursor fixture describes different geometry and needs its own new expectation.

## Step 2: Render the same state under three orthographic projections

I implemented the first real three-coordinate painting program before handing it to the specialist. Its geometry and the triangle raster could be tested on the host while the only board was still qualifying the early 2D images. The scene researcher then improved each piece's shape and preserved the independent scalar baseline for comparison with the packed branch.

### Prompt Context

See Step 1 for the request. The original conversation identified two related aims: app-supplied drawing code and a tangible P4 SIMD demonstration. I kept two different acceptance tests, one for a physical 3D screen and another for an actual packed projection feeding its triangles.

### What I did

I wrote scripts/scene/isometric.typed, the stage/poses/raster scripts and the horizontal-span triangle implementation. I reused the production gfx and prior 47 game fixtures. The raster test compares a scanline renderer with a per-pixel, directed-edge reference; neither implementation uses the other's edge intersections. I transferred ownership of these files to the 3D researcher and inspected their updated screenshot and command counts. Commissioned an eight-argument closed-painter experiment and an independent review in this same ticket.

### Why

An orthographic transform has independently calculable vertices. The first square's projected corners establish the sign and scale of both board axes. Three camera settings illustrate depth and elevation. Independent triangle checks ensure that a visually plausible board has neither a pinhole nor overdraw ambiguity at the diagonal of adjacent faces.

### What worked

The initial host trial compiled 5,136 bytes of RV32 and matched 51 positions or pose controls in the raster harness. Ten triangles in opposite winding orders and four malformed streams exercised the reader independently. The enhanced frozen source compiled to 9,572 RV32 bytes. The independent supervisor compared 15 full arenas across Wasm and RV32 and checked 1,920 board triangles. All six final piece geometries differ even with color and glyph identity removed.

### What didn't work

The first helper signature exceeded the eight-register native argument limit. Encoding a projected point as 512*v + u reduced the signature to six. Assigning to a Typed parameter produced “expected mutable local at”; I introduced a local cursor. An unbraced assignment after a one-line if produced “expected return”; changing to an explicit block fixed it. The first raster harness selected the wrong ticket parent directory and failed with StopIteration before running a test. I corrected the path and replayed the suite.

### What I learned

The 9,572-byte scalar scene includes many projections but gives the automatic selector zero complete eligible loops. A compact source function that takes one mesh point per call cannot supply eight independent coordinate columns simply by enabling a target flag. The compiler microbenchmark's 27.8-fold runtime improvement cannot be assigned to this complete application.

### What was tricky to build

The command validator must count both ordinary primitives and multiword triangles, and the frame has a separate record-count limit and word-count limit. The enhanced opening requires 406 commands and 3,281 words. The specialized experiment raises the record cap privately and preserves the existing word capacity. For the packed continuation, the team must show real projected corners flow into screen triangles while avoiding undefined pointers or writes past the public Typed result.

### What warrants a second pair of eyes

Compare source identity, pixel equality and instruction witnesses separately. In the optional packed study, an instrumentation-only witness must not become an observable out-of-bounds store in the ordinary compiler.

### What should be done in the future

Collect the physical scalar and, if host gates pass, hardware packed runs. Record the latest healthy ordinary image after each temporary candidate. Publish each researcher's article and the director synthesis with these qualifications.

### Code review instructions

Run scripts/scene/poses.mjs using the earlier compiler replay fixtures and scripts/scene/raster.py on those commands. Review the edge oracle alongside triangle.inc and verify the fixed camera against its two host alternatives. Consult the independent reviewer before claiming use of PIE.

### Technical details

The scalar function packs x and y screen coordinates into an i32 so the face helper can pass three point values, a color, a destination buffer and its offset. RGB565 values remain distinct from vertex encodings. The host screenshot covers only the 320-by-280 body, while the board experiment also observes the composed hints and completed SPI writes.

## Step 3: Isolate the camera from game state and replay four actual turns

The physical fixed-camera research established scalar and packed results on an opening exchange. The next request changes the app's presentation and requires evidence from an asymmetric position. I assigned the maintained geometry to the scene researcher, kept keyboard routing and receiver ownership here, and built a reproducible match with the actual search engine.

### Prompt Context

**User prompt (verbatim):** “can we add a camera rotation keys?” Then “take screenshots a few turns deep as well, when pieces have been moved. Also make proper 3d models for each piece, this is a bit boring, and the letters are meh” and “can you when you test rotating and such, make a little gif (or mutliple) instead of just screenshots?”

**Assistant interpretation:** Ship controls, distinguish all six pieces by geometry and deliver actual gameplay and rotation animations. **Inferred user intent:** See whether the app looks good, remains playable and communicates positions clearly beyond its initial diagram.

### What I did

I passed the yaw through the compositor draw syscall, reserved a receiver-only input cell, mapped arrows through the inverse camera transform and exposed the new board as a P4 build option. Wrote a real four-turn host replay, independent image reference driver, device qualification script and two-animation publisher under scripts/camera. Reviewed both frozen physical studies and measured triangle spans on their archived opening.

### Why

The game already publishes a complete, sufficient PSIX position. Orientation belongs to the local view. Capturing castling and a knight capture gives strongly asymmetric views. Keeping the first experiment's source frozen preserves its published baseline.

### What worked

The host game played e2e4 b8c6, g1f3 g8f6, f1c4 f6e4, e1g1 d7d5. The real compositor callbacks passed the authorization, wraparound, remapped-arrow, focus and key-edge cases. The app tests passed. Physical research checkpoint cafbe29 validated the previous single exchange, and d41dfbc and 3ef0dd5 recorded and reviewed the packed result.

### What didn't work

A search for picocalc-os/tests/chess-world.test.mjs reported “No such file or directory”. The earlier render study has an executable game-world harness in scripts/03-guest.mjs. Reusing it yielded the move list above.

### What I learned

Completed hardware writes for one opening exchange supply a control, but insufficient variety for judging a camera or identifying a piece by its silhouette. The new script settles each actual asynchronous engine search and records the received position before preparing its next input.

### What was tricky to build

A redraw for a turn must invalidate the retained commands even when the game bytes are identical. Reusing the ordinary publisher notification inside an active draw would queue another draw. The service restores that epoch after successful regeneration and keeps the old orientation on a rejected list.

### What warrants a second pair of eyes

Review color parity, asymmetric face visibility, focus transitions, both PSIX and Typed buffer boundaries, and the actual source allowed by the release build.

### What should be done in the future

Complete the model and hardware qualification, publish the game and rotation GIFs, and record the actual installed firmware.

### Code review instructions

Start with design-doc/05, then inspect painter_service.c, compositor.js, scripts/camera/01-match.mjs and scripts/camera/04-device.py. Look at independent panel and full app-pixel comparisons separately.

### Technical details

The search produces a 90-cell position, the compositor appends a separate yaw at cell 90, and the native callback retains its two-buffer signature. The 2D build never adds this cell. GIF intervals describe playback and do not measure raster performance.
