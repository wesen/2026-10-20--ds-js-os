---
Title: Scalar 3D Chess scene investigation diary
Ticket: PICOCALC-CHESS-3D
DocType: reference
Status: active
Topics:
  - picocalc
  - compiler
---

# Scalar 3D Chess scene investigation diary

## Step 1. Build silhouettes that survive the handheld's resolution

I started with the director's first orthographic painter. Its four commands per piece made a depth cue and a legible glyph, but each piece used the same tapered body with a different height. I made the visible faces and upper vertices depend on the kind, and reviewed the resulting 320-pixel body at all three camera pitches. The base has two rectilinear faces, the knight extends a muzzle, the bishop narrows to a point, the rook and queen have different crowns, and the king carries a cross. The type glyph remains small enough to leave part of the shape visible.

### Prompt context

See [Step 1 of the director's diary](01-director-diary-for-the-mobile-three-dimensional-chess-experiment.md) for the authored request. I interpreted the scene assignment as a new physically exercised picture through the existing app source and PSIX path. The acceptance proof had to survive changes of cursor and verify completed SPI output.

### What I did

I revised `piece` in [isometric.typed](../scripts/scene/isometric.typed), added a five-unit board lip, retained selected and last-move hints using tile colors, and reused the normal help strings. I raised the private validator's record limit to 454 and kept the two-buffer ABI and 4,096-word arena. First I ran `node scripts/scene/poses.mjs /tmp/mobile-painter-compiler-replay-final/fixtures.bin /tmp/chess3d-silhouette-poses`. I recorded the exact frozen source hash before handing it to the independent compiler supervisor.

### Why

One or two extra faces work directly at the resolution of the physical panel. Drawing each visible quad as two triangles allowed the same validation and raster code to cover flat tiles, caps and tapered sides. A direct hardware bake-off could then keep position packets identical and change only the picture generator and its vocabulary.

### What worked

The host opening used 406 commands and 3,281 words. The raw RV32 program was 9,572 bytes. The three pitch previews showed real changes in slab height and piece occlusion. The independent reviewer verified six geometry signatures at a single shared square after removing the colors and glyphs, then confirmed equality of 15 complete Wasm and RV32 arenas and the 128 tile triangles in each view.

### What didn't work

The first run of `python3 -B scripts/scene/raster.py /tmp/chess3d-silhouette-poses /tmp/chess3d-silhouette-raster various` failed with `CalledProcessError ... returned non-zero exit status 2`. All five small test triangles still passed. I inspected each scene record and established that every coordinate and glyph cell met the geometric bounds. The staged C file's include had resolved `painter_commands.h` from the checkout, which in turn included the old 274-command header from its own directory. I copied the shared declarations into the isolated tree beside the staged mobile header, and used that include directory first. The full replay accepted after that change.

### What I learned

The 2D command count can be exhausted while the existing word buffer still has room. The scenario opening exercises 32 pieces, and the arithmetic bound accounts for a more expensive distribution after promotions. The normal PSIX field validator accepts dense tuples by syntax. The legal occupancy bound governs experimental success and the buffer and validator protect storage even when a decoded tuple exceeds it.

### What was tricky to build

Faces and accents must stay inside the body in all three views. Projected packed points and the depth diagonal gave compact Typed helpers within the RV32 eight-register call ABI. The base uses a half-width of six world units, while the most extended knight top still lies on its own board cell's x edge.

### What warrants a second pair of eyes

Review the view-specific face order in `piece` before adding camera rotation. The current ordering proof uses equal grid diagonal spacing and the closed geometry; it has no z-buffer.

### What should be done in the future

Consider physical flyover controls only after qualifying moves and selected state on the temporary image. A future renderer could reserve UI space for coordinates and move evaluation. The fixed camera study records body and hint behavior.

### Code review instructions

Start at `piece`, then follow `paintPose` and `face`. Compare the same state across [camera presets](../various/camera-poses.png). Read [the implementation guide](../design-doc/02-implement-and-qualify-the-scalar-scene.md) for the high-pitch and command-count bounds.

### Technical details

The experiment froze painter SHA-256 `d6c2dc3a6858dbf1571409a534f63c27d0d5ab116dd466fafbd7701fca7a81a4`. Commit `20fcfe3` includes the final staged source and host receipts. The stock and target-enabled raw RV32 images both had SHA-256 `4d855ee9984881d5954fd7ca9f8bd38c7880d36448d5739d15262b7e954a5213` in the independent review.

## Step 2. Establish expected body pixels, then build the observation image

I built a Python reference renderer for the Typed command words. The C compositor extension computes spans by intersecting edges at a pixel-center row. The reference tests each pixel center against three directed half planes. Both use the same small bitmap font data so I could also verify the type glyphs and predict the compositor's hint strip on the handheld. This made it possible to compare all 190,720 bytes of the app area. The status bar can change due to the clock and battery and is outside the comparison.

### Prompt context

See Step 1. The primary physical evidence was specified as all app pixels for the opening on e2 and the arrow transitions to e3 and f3, with a separate observer on completed panel writes.

### What I did

I added [oracle.py](../scripts/scene/oracle.py), used it from the host raster checks, and prepared an observed firmware build with the 2D study's panel and keyboard probes. I added an opt-in target flag specifically to the mobile painter linker and a compile guard that requires the lowering diagnostics list to stay empty. I added logging of the source length and linked ELF length plus their FNV-1a digests. The host runs the stock linker with the candidate's generated ELF slot template for a direct comparison.

### Why

A framebuffer provides evidence up through the compositor. A panel command can report completed writes independently of the framebuffer. Observing both also checks the pixels from the hints strip that the compositor draws after the native painter returns. It avoids assigning an observed result to a stock fallback without inspecting the code installation counters and source identity.

### What worked

The independent Python body matched the product-derived raster for every frame in 51 host cases. It also matched ten standalone triangle cases, including the two windings and a degenerate case. Four malformed lists were rejected by the C reader. The warm-cache IDF build produced image SHA-256 `16e45761b46f75a5b3c98b9c67920efac483b1fe73863427aea7bc6d50247e24`. The cold tree produced the same staged source for host comparison and was still building the self-hosted CJI compiler when the warm build completed.

### What didn't work

A typo left one parenthesis open in the new oracle assertion. Python reported `SyntaxError: '(' was never closed` at raster.py line 38. Closing the expression allowed all 51 complete-frame comparisons to finish. The default tmux socket returned `Operation not permitted` for the build launch. I started the isolated non-server build in a shell execution session. The fresh tree reached Ninja task 1037 and then spent several minutes on `node ... cji.js build/rv32/stage1/bundle-cji.js --emit`. The existing warm candidate had compatible cached compiler artifacts and rebuilt the changed firmware files plus the app bundle. The default sandbox lacked `/dev/ttyACM0`; the serial trial ran in an escalated execution session with the shared serial lock and restoration path.

### What I learned

The ELF container reports 17,456 bytes because it includes a fixed-size executable slot and headers. The raw RV32 result occupies 9,572 bytes. The compiler flag is meaningful on the physical image even when the entire source stays scalar. A digest of the linked output is useful because the ELF sizes alone can agree without any agreement in executable bytes.

### What was tricky to build

The build-derived trusted source and Chess's embedded published source must derive from the same file. The CMake step regenerates the combined Chess Typed unit and C bundle when staging changes. Using the warm path saves unrelated AOT compilation only if CMake reruns and synthesizes the app payload again. I checked its generated unit and preserved the build manifest before moving to hardware.

### What warrants a second pair of eyes

Verify the stock host linked image uses the same reactor file as the device, and preserve the scope of the digest claim. The host's comparison of raw machine bytes is exact. The device logs an FNV-1a fingerprint of the linked image. The two results answer related questions.

### What should be done in the future

Benchmark a matched scalar and packed scene only with a single batch that reaches the same emitted faces. Record complete frame and projected-vertex evidence separately.

### Code review instructions

Review [instrument.py](../scripts/scene/instrument.py) for the opt-in and output identity check. Run the host raster harness and verify that its expected files contain the body followed by the hints strip. Compare the independent half-plane rule with the C scanline implementation.

### Technical details

Both builds used the same IDF toolchain and board partition layout. The candidate was assembled in `/tmp/mobile-painter-candidate`. The ordinary qualified release was separately pinned at `/tmp/mobile-painter-production/build`, app SHA-256 `75c94df7b1aa565c8cb7858bea628aa2c9c644ef64cc885b96e1d80088f8af56`.

## Step 3. Exercise the compiled 3D painter through the panel and restore the release

I verified the ordinary image and partition, then temporarily installed the observed 3D image. After the key-status substitute was active, I opened Chess with the ordinary launcher key and captured e2, then sent Up and Right and captured e3 and f3. The app-area pixels, including the bottom 18 hints rows, agreed byte for byte with the independent reference. The status bar was retained in the raw captures and excluded from pixel comparisons.

### Prompt context

See Step 1. The physical test had to connect the app's delivered program, its incoming state and the compositor's actual display transfers. The scene runs at the default pitch of 5 in this test. The other pitches were exercised on the host.

### What I did

I executed [device.py](../scripts/scene/device.py) against the observed build at `/tmp/mobile-painter-candidate/build`. I used the approved ordinary image in `/tmp/mobile-painter-production/build` both for preflight and restoration. The device runner held the shared serial lock, verified the partition geometry, and changed only the app image at offset `0x10000`. At each checkpoint it requested a framebuffer capture and the SPI observer's app checksum. I preserved the build manifest, raw captures, filtered UART evidence and esptool digest results.

### Why

The framebuffer check catches errors before the final display transfer. The SPI shadow independently reconstructs pixels from completed data transactions in their LCD address windows. Checking both makes lost or misplaced line spans observable.

### What worked

| Checkpoint | Packets / calls / paints | Native command generation | Raster | SPI busy | Panel app CRC-32 |
| --- | --- | ---: | ---: | ---: | --- |
| e2 | 1 / 1 / 1 | 488 µs | 18,090 µs | 55.96 ms | `9bfb0fa8` |
| e3 | 2 / 2 / 2 | 592 µs | 18,049 µs | 1.66 ms | `372bf81b` |
| f3 | 3 / 3 / 3 | 593 µs | 18,070 µs | 1.42 ms | `65a21193` |

One source and one compile were recorded. There were no painter rejects, SPI faults or incomplete writes. The compile worker took 1,064,648 µs and relocation took 741 µs. UART reported 7,093 delivered bytes with FNV-1a `e3c9dfb8` and a 17,456-byte linked image with FNV-1a `d5a226be`. Both agree with the independently built stock host reference for the corresponding buffers. The app and partition both matched their original flash digests after restoration. Eight monitored native worlds returned healthy and the ordinary painter installed on one compile.

### What didn't work

The regular I2C keyboard controller reported existing NACKs in the release's preflight UART. The observed image used the instrumented key-status register, the same scoped isolation as the earlier 2D run. The tested key path still passed through the keyboard world and ordinary compositor focus. The trial exercised no physical I2C keystroke or full game on the research image.

### What I learned

A change of cursor affects the dirty spans but retains the amount of triangle work. The two cursor updates sent only 1,448 and 2,531 bytes during their observation windows, while their native raster measurements stayed near 18 ms. That behavior isolates a whole-list replay cost. SPI busy counters include other transfers in the window, and the deliberate settle interval makes this an unsuitable end-to-end response-time measurement.

### What was tricky to build

The early e2 request arrived after a launcher settle and reused the native rendering previously produced from the opening PSIX packet. Its native counter and raster counter therefore time two different executions, one that built the command list and one that first painted it. On e3 and f3 both counts advanced for each packet. I used all three counts and their timing scopes in the article rather than summing stage times.

### What warrants a second pair of eyes

Audit the same-trace alignment of the three screenshot checksums and the three SPI observer checksums. The raw full-screen captures include top rows beyond the CRC comparison and must be sliced at byte 14,080.

### What should be done in the future

A fair packed comparison can use the same three app captures, and must also show that packed values supply the board triangles. This hardware trial is a scalar baseline.

### Code review instructions

Begin with the [physical receipt](../various/scalar-device/receipt.json) and [display captures](../various/scalar-device/display-captures.png). Compare the SHA-256 values for each body, hint strip and full app region with the [host receipt](../various/host-poses.json). Read the final [restore verification](../various/scalar-device/restore-verified.log) before reusing the device.

### Technical details

The final observed app SHA-256 was `16e45761b46f75a5b3c98b9c67920efac483b1fe73863427aea7bc6d50247e24`. The partition SHA-256 was `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. The clean tree eventually completed, but the measurements identify the warm-path image by its own separately recorded digest.
