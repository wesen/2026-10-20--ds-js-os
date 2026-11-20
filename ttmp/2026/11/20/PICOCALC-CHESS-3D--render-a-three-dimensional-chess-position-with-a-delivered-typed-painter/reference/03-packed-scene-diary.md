---
Title: Packed Chess scene investigation diary
Ticket: PICOCALC-CHESS-3D
Status: active
Topics: [picocalc, native, esp32-p4]
DocType: reference
Intent: long-term
Summary: Private scene integration, host differential, paired device protocol and restoration.
---

# Packed Chess scene investigation diary

## Step 1 — Connect the eight-lane projection to actual triangles

The alternate scene retains the existing command schema and derives board corners from a batched lattice. It can be compared with the frozen two-argument scene without changing the module delivered by that control image.

### Prompt Context

**Prompt provenance** — The director extended the project with a private experiment that passes eight Typed arguments, consumes the result in visible geometry, compares commands and pixels, and measures the complete scene with guarded scalar as a matched control.

**Assistant interpretation** — Establish that a normal downloaded painter can execute automatically selected PIE code whose results affect actual painted geometry.

**Inferred user intent** — Evaluate the whole application case independently from the isolated kernel's speedup.

### What I did

- Wrote the design and derived the exact integer projection identity for y=0.
- Generated the alternate source from the frozen scalar scene and the unchanged project function.
- Compared the results and C raster output for 47 fixtures times three camera pitches, plus e3 and f3.
- Used the vendor disassembler to classify the real emitted words in the native model and verified 30 packed stores.

### Why

The new painter must use the projected words in visible triangle coordinates. A stand-alone project call inside the painter would leave its rendering and full-scene cost unexplained.

### What worked

All 143 command lists and raster outputs matched. The alternate raw PIE native image is 11,640 bytes, the alternate stock scalar is 10,884 bytes, and the two-argument frozen control is 9,572 bytes. The aligned model executed ten packed groups and a scalar remainder.

### What didn't work

The first host reproduction failed with `spawnSync .../riscv32-esp-elf-as EPERM` while the clean IDF build was active. Running the compiler and C raster with approval produced the differential receipt. The host run used no serial connection.

### What I learned

The floor formula can recover both screen coordinates from the fixed project expressions without moving the original integer division. The piece and lower side-wall projections stay scalar. Layout reuse reduces corner projections but adds buffer staging and checked coordinate reads.

### What was tricky to build

The native ABI has eight argument registers, so camera pitch travels in reserved `ys[81]`. That slot is separate from the depth witness and the first 81 position cells. A four-byte buffer header requires storage padding to align the payload.

### What warrants a second pair of eyes

Check the generated transforms, the heap alignment and capacity, and whether the position-dependent cursor and hints still match.

### What should be done in the future

Measure identical retained scenes under guarded scalar and PIE code and compare with the two-argument control. Static ground caching is a separate comparison.

### Code review instructions

Run `scripts/packed/01-source.mjs` and compare the generated source with `scripts/scene/isometric.typed`. Then run `scripts/packed/02-host.mjs` with the 2D fixtures, staged C raster and Espressif tool prefix. [Design guide](../design-doc/03-feed-the-visible-board-from-packed-ground-vertices.md)

### Technical details

For tile corner base `j=rank*9+file`, the corner indices are `j,j+1,j+10,j+9`. The schema of the drawing commands stays fixed.

## Step 2 — Observe the app-delivered vector path and pair the native scene controls

The board image contains three closed versions of the same delivered eight-argument source. It paints through the witnessed version. The kernel times the two uninstrumented versions under an explicit research command after each captured state.

### Prompt Context

**Previous prompt** — See Step 1. The director requested matched raw PIE and guarded scalar calls, separate from the witnessed visible path and ordinary draw turn.

**Commit (host and device preparation)** — `305622a` Feed actual Chess board triangles from the packed ground lattice.

### What I did

- Staged the private three-entry reactor, launcher identity check, aligned scratch and native timing command.
- Built from the warm ESP-IDF output after the clean bootstrap reached the CJI stage.
- Checked the app-only candidate, release, partition geometry, source and independently linked ELF before opening serial.
- Recorded three witnessed frames and all 66 timed eight-call batches on the board.
- Compared the three on-device command lists by full word arrays, then checked the actual framebuffer and completed SPI pixels separately.

### Why

A standalone PIE kernel's speedup cannot determine total scene cost. Both timed versions need the same state, input construction and layout. The raw executable avoids any cost of the evidence write.

### What worked

The app-delivered source was 7,965 bytes and the linked output was 50,252 bytes. Both matched the expected length and FNV-1a identity. The e2, e3 and f3 frames each wrote the reserved `abcd` witness and produced matching physical pixels. The paired native medians improved by approximately 1.9%. The witnessed single-call measurements include the evidence write and ordinary scheduling, while the paired rows exclude both witness instrumentation and raster.

### What didn't work

Independent review found two C staging issues before the measured image. The initial reactor still used the control's two-argument prototype. Declaring extra functions by replacing only the `app_main` line also attached the existing visibility attribute to an inserted declaration. The final stage replaces both prototypes and inserts the extra declarations before the entire annotated function. The independent wrapper test then passed with `-Wall -Wextra -Werror`.

### What I learned

The main scene spends over 185,000 cycles per call even when the standalone vector loop completes only 81 points. The matched optimization eliminates about 3,600 cycles, whereas replacing the scalar geometry path with scratch staging and repeated checked reads adds work elsewhere.

### What was tricky to build

The UART command arrives on CPU0, while the live painter and scratch belong to the CPU1 kernel lane. The command transfers a request through an atomic flag and the kernel benchmark reads its owned state in a separate poll. Each sample checks complete command bytes against the witnessed reference before discarding the working output.

### What warrants a second pair of eyes

The evidence marker exists only in the staged, allowlisted experiment. Review the runtime and compiler checks together if the source or ABI grows. Compare native generation times separately from raster and completed display transfers.

### What should be done in the future

A cached fixed-camera board would provide another end-to-end control. A generic painter ABI for new applications would require its own source authorization and capacity design.

### Code review instructions

Review the witness under `scripts/packed/03-stage.py` and the timing loop in `scripts/packed/benchmark.inc`. The parent scene runner owns display and flash checks, and the packed adapter adds staged ELF identity and the paired timing protocol.

### Technical details

Each arm completes one warmup, then eight measured calls. Arms alternate first position across 11 samples per state. The data buffer allocation is internal and 16-byte aligned. The two comparison entries are generated from the same source as the witnessed entry and relocate together in the widened research slot.

The physical runner exited successfully. Readback verified the application and partition against the previous playable release. All eight monitored worlds were healthy and the 2D painter reinstalled with zero rejects. The serial lock passed to the scalar 3D board operator for the separate move test. [Verified board receipt](../various/packed/physical.json)

## Step 3 — Fit the smooth-camera source into its two native slots

The smooth-camera experiment grew both the mobile painter and the Chess game that delivers its source. I built and qualified its observed and ordinary firmware from a frozen source in the private warm build. The observed firmware carries the camera and panel instrumentation. The ordinary firmware omits those hooks.

### Prompt Context

**Director follow-up** — Build the final smooth renderer in both firmware profiles, preserve the 2D slots and record host linking and PSRAM settings. Expand the game slot only in the 3D lane if necessary.

**Commit (slot sizing)** — `7611ade` Size dedicated native slots for the smooth 3D Chess build.

### What I did

- Compiled the final 16,316-byte source with the stock mobile-painter linker. It emits 23,848 code bytes and exports `paintChess` at native offset 17,564.
- Replayed the generated source writer as real Typed Wasm and compared all 16,316 reconstructed ASCII bytes against the allowed source.
- Compiled and linked the composed 61,022-byte Chess game and checked the entry jump destinations, copied native words and relocation count.
- Built observed and ordinary images with ESP-IDF 5.4.2 in the same warm work directory and copied snapshots before switching profiles.
- Compared published source and partition bytes and checked that the observed image includes the `camobs` command while the ordinary image omits it.

### Why

The mobile painter's source transport ceiling is separate from its generated code reservation. Additionally, delivery is implemented by a Typed routine in the Chess game, so more source text causes the producer itself to emit more native stores. Both code images have to fit independently.

### What worked

The dedicated 32 KiB mobile-painter slot has 8,896 bytes spare after its entry header and emitted code. The 256 KiB 3D Chess slot has 5,596 bytes spare after its header, import entries and 256,400 code bytes. The game emits 19 imported call relocations and links to the same 30 declared runtime imports. The 2D mobile slot stayed 16 KiB and the ordinary shared world slot stayed 224 KiB in assembled and linked artifacts. Both configurations use 200 MHz PSRAM, a 360 MHz CPU and the PSRAM ELF loader.

### What didn't work

The preliminary host link against the original shared game template returned `SyntaxError: RV32 program does not fit the reactor slot`. The expected 256,548-byte extent exceeds 224 KiB. The CMake 3D lane now builds a dedicated game template at 256 KiB and leaves other worlds on the original template.

The first observed firmware compilation reported duplicate `camera_begin` and `camera_panel_end_window` definitions. Concurrent build-script changes had staged the observer twice. I reduced the observed branch to one call and reran it from the standard restaged inputs. Both profiles then compiled successfully.

### What I learned

The reserved capacity shown in the ELF excludes its unrelated sections. The 32 KiB slot corresponds to a 33,840-byte linked painter ELF. The 256 KiB game slot lives inside a 274,892-byte linked game ELF. Their source limits remain bounded independently.

### What was tricky to build

Game source delivery uses generated `writeLiteral` operations. It preserves the exact authorized source bytes while generating enough machine code to outgrow the game reactor before the static source limit is reached. Checking the draw compiler alone missed the game-side overflow.

### What warrants a second pair of eyes

Actual device compilation latency, runtime heap peak and display acceptance still require the separate physical run. The host qualification confirms linking and exact bytes, and checks the build configuration.

### What should be done in the future

Keep the two independent host linker checks in the firmware build when further changing the painter generator or source.

### Code review instructions

Read `scripts/camera/07-qualify-build.mjs` and the staged CMake slot conditions. [Observed receipt](../various/camera/native-slot-observed.json) [Ordinary receipt](../various/camera/native-slot-ordinary.json)

### Technical details

Both builds contain source SHA-256 `6ff9dc8a9e3ad3cc9a877c4ed9ebbb6b535941acba7c63e29e87edc4c5337214`. Observed app SHA-256 is `6364be0178215b2742c5648c48d657f7e5b9b00cd0bbc898b8b39426ff62e7a2`. Ordinary app SHA-256 is `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1`. The partition table is identical between builds and to the ordinary recovery app.
