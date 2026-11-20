---
Title: The 3D chessboard that consumes eight-lane projection
Ticket: PICOCALC-CHESS-3D
Status: active
Topics: [picocalc, native, esp32-p4, performance]
DocType: analysis
Intent: long-term
Summary: Trace the 81 ground vertices through actual packed execution and compare command words, pixels, and native call costs.
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
