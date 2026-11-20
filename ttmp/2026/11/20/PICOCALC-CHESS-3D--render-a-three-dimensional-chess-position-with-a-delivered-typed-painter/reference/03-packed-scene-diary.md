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
