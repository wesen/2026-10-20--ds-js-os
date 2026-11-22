---
Title: Investigation diary for the orthographic ray tracer
Ticket: PICOCALC-RAYTRACE
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://firmware/nucleus/raytrace_demo.c
      Note: Maintains scene, shadows, depth and both rendering modes
    - Path: repo://firmware/nucleus/raytrace_demo.h
      Note: Stable packed and scalar render and intersection APIs
    - Path: repo://ttmp/2026/11/20/PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/scripts/renderer/03-qualify.sh
      Note: Reproduces checked host images and the model of actual target instruction bytes
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Investigation diary for the orthographic ray tracer

## Step 1. Establish the scene and implement a packed row

The renderer needed a small shared interface for native firmware, simulator use and direct target benchmarks. I fixed the dimensions and the legal scene inputs before choosing the packed arithmetic. The ordinary renderer and the primary-intersection benchmark call the same nearest-depth routine.

### Prompt Context

**Implementation brief:** “Implement the 160x160 orthographic raytracer with actual ESP32-P4 PIE and scalar kernels, shared portable API and host pixel equality tests.” The director added movable sphere and light controls, shadows, and occupancy measurements.

**Assistant interpretation:** Implement an original fixed-size orthographic scene with both portable scalar and hardware PIE primary discriminants. Preserve identical depth, shadow and color semantics after the intersection stage.

**Inferred user intent:** A playable demo should expose visible scene controls while making SIMD performance and correctness testable on the same rendering work.

**Commit (code):** `be51049` — “Implement the orthographic ray tracer and ESP32-P4 packet intersections”.

### What I did

- Exposed `raytrace_demo_render`, `raytrace_demo_intersections`, `raytrace_demo_has_pie`, scene controls and optional statistics in `picocalc-os/nucleus/raytrace_demo.h`.
- Placed three spheres in front of a checker plane. The first sphere moves in x and y. A directional lamp changes its x and y components as the user moves its screen control.
- Used exact signed fixed-point-free primary intersection arithmetic and a shared integer square-root table. Added nearest-depth selection, integer diffuse shading, and direct oblique ray tests for checker plane shadows.
- Implemented the assembly row in `picocalc-os/nucleus/raytrace_demo_pie.S`, then cross-compiled and disassembled the exact instructions with the installed Espressif toolchain.
- Sent the API, default scene and measured stack usage to the app and board integration owners.

### Why

- In an orthographic ray the y term is unchanged across a row. Its signed 16-bit value can be broadcast once, then eight adjacent x terms can be loaded and subtracted together.
- The scene and coordinate ranges prove signed 16-bit saturation can never change an intersection result. The C and PIE renderers keep depth selection, lighting, shadow geometry and output conversion shared.
- The independent primary-intersections API uses the same primary routine and stores its normal depth plane. Passing a null statistics pointer omits optional counting and hashing from timing.

### What worked

- The portable C implementation passed strict host compilation with `-std=c11 -Wall -Wextra -Werror -pedantic`.
- ESP-IDF 5.4.2's toolchain compiled the C and assembly. Disassembly reported the expected broadcast, vector load, signed subtract and vector store, followed by the scalar group loop.
- With ESP-IDF's `-O2` profile, reported static stack was 3,136 bytes in `raytrace_demo_render` and 2,960 bytes in `raytrace_demo_intersections`. The shared row function used another 96 bytes.

### What didn't work

- The first standalone assembler command used only the base RV32 extension set. It rejected the four `esp.*` instructions with the diagnostic `extension 'xespv' required`. I reproduced the actual ESP-IDF target command with `-march=rv32imafc_zicsr_zifencei_xesppie -mabi=ilp32f` and the configured 20241119 toolchain. The instructions assembled and disassembled successfully.

### What I learned

- The 160-pixel width is exactly 20 eight-lane groups. The vector loads and stores can use aligned private scratch independently of the public buffer address and pitch.
- The IDF port's PIE context saves q0, q1 and q2. Keeping the row confined to those registers avoids the omitted q3 in this port version.
- The metrics need separate denominators. A PIE frame issues 76,800 candidate lanes in 9,600 groups. Some candidates hit the same pixel, so active lanes and final sphere pixels differ.

### What was tricky to build

- The projected shadow width grows with lamp angle. The early rectangle uses a provable conservative axis bound, then the exact ray-sphere condition makes the final decision. The control scene places every sphere in front of the checker plane, so a positive projection and nonnegative discriminant describe a forward hit.
- Optional statistics must leave the geometry alone. Invalid input returns before writing pixels or stats, so callers can retain an existing image on failure.

### What warrants a second pair of eyes

- Confirm the input coordinate bounds whenever the UI range changes. These bounds also protect the packed arithmetic and the shared square-root table index.
- Check that the target config enables the actual assembly and that the two benchmark boundaries are labeled separately.

### What should be done in the future

- Use a fresh arithmetic proof when a scene adds larger radii, perspective rays, or geometry outside the admitted coordinate range.

### Code review instructions

- Read `prepare`, `trace_row` and `in_shadow` in the shared renderer. Verify the scene rules and line up the C row calculation with the vector instruction operands.
- Run the host qualification command documented in Step 2.

### Technical details

- Default scene values are 68, 61, 31, 25 in sphere-x, sphere-y, light-x, light-y order. The sphere control range is 32 through 127. The lamp control range is zero through 159.
- The fixed frame has three candidate tests per ray. RGB and depth checksums use FNV-1a in low-byte-first order and exclude padding.
- The device display and application integration have separate operators and receipts.

## Step 2. Compare finished buffers and independently execute the target words

The two host checks answer different questions. The portable C check exercises the full renderer and its geometry with both scalar and modeled PIE. The target instruction check assembles the production row and executes those linked bytes in a reviewed instruction model.

### Prompt Context

The brief in Step 1 requires host pixel equality. The director also requested a newcomer article explaining the packed arithmetic and tests.

### What I did

- Ran strict scalar and modeled PIE builds under UndefinedBehaviorSanitizer across 12 shared control scenes.
- Compared every color and depth element and both canaries with caller stride 163 and output offset by one halfword. Compared the scalar path with and without statistics.
- Independently computed primary depth and plane-shadow membership with unpruned double-precision ray equations. Compared all primary depths and the hit and shadow totals.
- Linked the ESP32-P4 row, obtained decoded operands from Espressif objdump, and ran the exact seven machine words through the earlier reviewed RV32 and PIE model.
- Wrote the [newcomer article](../analysis/05-why-eight-ray-tests-fit-in-a-pie-register.md) and associated its evidence with docmgr.

### Why

- Full-buffer matches catch writes outside the active row and equivalence errors after the discriminant calculation. The independent geometry calculation checks the shared path that both variants could otherwise get wrong.
- Native-word execution catches an incorrect assembly operand order or update amount that a substitute C lane model cannot detect.

### What worked

- All 12 scenes matched scalar and modeled PIE color, depth and padding. The independent geometry check matched every nearest depth, all candidate hit counts and all visible shadow counts.
- The moving-light control kept depth checksum `ee9a0b05` and changed pixel checksum `2f75a8a5` to `97296759`. Visible shadow pixels changed from 4,793 to 3,923.
- The linked-word check matched all 754 row cases. The model observed 14,890 vector stores and 45,424 PIE operations, with signed results ranging from −31,729 to 1,024 in this test matrix.
- Repeating the complete host script reproduced all three JSON files byte for byte.

### What didn't work

- Automatic approval review rejected the requested upload of the director's guide to the external reMarkable account before executing the command. It identified a lack of trusted user authorization for that specific research document and destination. No upload or alternate transfer was attempted after the rejection.

### What I learned

- Host C model agreement and actual target instruction model agreement are separate evidence. Physical timing and silicon execution belong to the target trial.
- The same default scene has 6,983 sphere candidate hits and 6,123 winning sphere pixels. Moving the lamp changes visible shadow coverage without changing those primary results.

### What was tricky to build

- The older RV32 model consumes 32-bit code words, so the assembled row scopes `.option norvc` and aligns its entry to four bytes. The qualification script links the local branch before extracting the actual code bytes.
- The array hash must be independent of host endianness. The host test extracts each halfword with `memcpy` and hashes its low byte first, matching the public checksum contract.

### What warrants a second pair of eyes

- Compare the actual disassembly operands and patched branch displacement with the model receipt. Review group sizes below 20, though the renderer always requests 20.
- Verify target-board checksums independently against the host default and changed-scene values.

### What should be done in the future

- Compare the full rendering and primary-depth timing boundaries separately if later work vectorizes depth selection or shadows.

### Code review instructions

From the repository root, provide the ESP-IDF compiler prefix used for the board build.

```sh
P=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-RAYTRACE--*')
bash "$P/scripts/renderer/03-qualify.sh" /path/to/bin/riscv32-esp-elf /tmp/raytrace-qualification
```

### Technical details

- [Portable scalar receipt](../various/renderer/host-scalar.json)
- [Portable packed model receipt](../various/renderer/host-model.json)
- [Linked target instruction receipt](../various/renderer/pie-model.json)
