---
Title: The 3D chessboard that consumes eight-lane projection
Ticket: PICOCALC-CHESS-3D
Status: active
Topics:
    - picocalc
    - native
    - esp32-p4
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/scripts/packed/01-source.mjs
      Note: Build visible tile triangles from the packed ground lattice
    - Path: repo://ttmp/2026/11/20/PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/scripts/packed/benchmark.inc
      Note: Paired raw PIE and guarded RV32 comparison
    - Path: repo://ttmp/2026/11/20/PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/various/packed/physical.json
      Note: Physical identity, three witnesses, cycle samples and restored release
ExternalSources: []
Summary: Trace the 81 ground vertices through actual packed execution and compare command words, pixels, and native call costs.
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# The 3D chessboard that consumes eight-lane projection

In the scalar chess painter, each square computes its corner coordinates from the camera equation. Touching squares share corners, so those calls recompute coordinates. The packed experiment constructs 81 ground vertices for the 8 by 8 board and projects ten eight-element groups plus one scalar remainder. The tile triangles and top of the board lip read those projected coordinates. If those values change, the board pixels change.

The scene's eight-argument function takes a semantic Chess state, a display list and six private scratch buffers. It stages the ground inputs in ordinary scalar Typed. The projection function is byte-for-byte the input from the earlier compiler experiment. The backend recognizes its typed operations and proves that the intermediate results fit a signed 16-bit lane. The ESP32-P4 target then applies the same arithmetic to eight vertices in one group. This part leaves a scalar path for failed checks and the one-vertex tail. [PIE experiment and measured projection](../PICOCALC-TYPED-PIE--lower-bounded-scalar-typed-vertex-loops-to-esp32-p4-pie-instructions/index.md)

## Where the coordinates go

In the existing scene, the board floor uses screen coordinates `(160+x-z, 42+(x+z)*pitch/8)`. Its y coordinate is zero. The projection kernel runs at that same floor height and writes `384+x-z` and `640+x+z`. Subtraction of the offsets recovers the intermediate horizontal position and the original sum `x+z`. The painter multiplies that sum by pitch and divides by 8, in the same order as the scalar painter. At the origin this gives (160, 42). At (x,z)=(16,0) and pitch 5, it gives (176, 52). The points become triangle coordinates beside the state-dependent colors. The depth output stays in the six-buffer interface. Piece and bottom lip vertices continue to use their scalar heights and draw order.

The host compared all 47 positions at camera pitches 3, 5 and 7, and included the e3 and f3 cursor positions. For each of the 143 state and pitch combinations, the frozen scalar Wasm, packed Wasm, alternate native scalar and PIE instruction model produced the same command bytes. The modeled projection issued 30 packed stores per draw. Scratch cells 0 through 80 contained the expected six coordinate planes, the pitch remained in `ys[81]`, and the uninstrumented tail left `depth[81]` untouched. A misaligned host call used the ordinary continuation and produced the scalar result. Both command streams passed through the staged C raster and yielded identical frame bodies and hint strings. [Host comparison receipt](../various/packed/host.json)

## Measure the right unit of work

The unchanged two-argument scalar scene is the control for the complete change. The control for PIE's contribution to the new scene uses the same six buffers, guards, lattice construction, screen conversion and triangle commands. Its projection loop uses ordinary RV32 operations. This difference matters because the alternate scene changes how the board is computed as well as the hardware instructions that perform the central projection.

The paired research image reserves one reactor slot for three closed compilations of the app-delivered scalar source. The ordinary observed draw calls the witnessed PIE entry. Only that entry writes a reserved tag at `depth[81]` after the verified vector prefix. The two measurement entries have no tag write. After a captured scene settles, a console request schedules the paired benchmark on the kernel lane with the current semantic state. Each arm warms once for each sample, then runs eight native calls. The arms alternate order over 11 samples. Every batch checks that the command count and words match the witnessed call. The timing runs outside the ordinary draw turn.

## Physical result

The PicoCalc received 7,965 source bytes from the Chess app and ran the compiler once through the private three-variant build path. The source length and FNV-1a value matched the host input. The linked image was 50,252 bytes and matched the independent host link by length and FNV-1a. The observed triple compilation took 1,962,756 µs including worker scheduling, and relocation took 1,441 µs. The earlier scalar scene installed a single 17,456-byte image, with observed compile and relocation intervals of 1,064,648 and 741 µs. The triple-build cost belongs to the measurement apparatus. [Physical scalar control](../various/scalar-device/receipt.json) [Paired physical receipt](../various/packed/physical.json)

The active painter rendered the opening board with the cursor at e2, e3 and f3. Each draw stamped `abcd` beyond the projected depth values, returned 3,281 drawing words and produced the same completed SPI pixel CRC as the independent host frame. The SPI check included the app body and hints. These are three cursor states in one physical opening position. The wider host matrix covers distinct Chess positions and three camera pitches.

| Cursor | Guarded RV32 cycles | Raw PIE cycles | Difference | Raw PIE time at 360 MHz |
| --- | ---: | ---: | ---: | ---: |
| e2 | 188,920 | 185,356 | −1.89% | 514.9 µs |
| e3 | 188,936 | 185,363 | −1.89% | 514.9 µs |
| f3 | 188,923 | 185,342 | −1.90% | 514.8 µs |

The paired numbers are per-call medians on CPU1, with the same loaded scene, state and output layout in both arms. The guard preparation, construction of 81 vertices and final screen-space conversion remain in each measured call. The raster call took about 18.15 ms in the observed frames and was outside this timing window. The test used an instrumented keyboard register and SPI capture. The timing therefore measures native generation of scene commands, with raster time reported separately.

The earlier two-argument scalar scene produced matching physical pixels without the shared lattice. Its three observed native calls took 488, 592 and 593 µs. The corresponding witnessed alternate calls took 538, 648 and 652 µs. Those single observations come from different firmware images and include ordinary scheduling. The controlled 1.9% improvement applies specifically to choosing PIE over guarded RV32 inside the same packed scene. The host instruction model also counted more work for the whole alternate scene than for the scalar control in the opening frame. At a fixed pitch, the ground lattice could be retained across board-state changes. That would remove construction and projection work and propose a distinct comparison from lowering those operations to PIE.

The runner restored and verified the preceding playable app and partition, confirmed healthy native worlds and observed the ordinary painter install again. [Witnessed e2 framebuffer capture](../various/packed/e2-screen.png) [Board identity and raw timing lines](../various/packed/uart-evidence.txt)
