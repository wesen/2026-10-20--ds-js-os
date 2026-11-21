---
Title: What an inferred packed subtraction buys on the ESP32-P4
Ticket: PICOCALC-PIE-LOOPS
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-pie-loops.js
      Note: Loop recognition and lowering
    - Path: repo://ttmp/2026/11/21/PICOCALC-PIE-LOOPS--infer-and-lower-packed-loop-regions-in-unchanged-typed-programs/scripts/03-qualify.mjs
      Note: C, Wasm and unchanged native execution
    - Path: repo://ttmp/2026/11/21/PICOCALC-PIE-LOOPS--infer-and-lower-packed-loop-regions-in-unchanged-typed-programs/scripts/06-board.py
      Note: Paired physical trials
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T07:28:06.842360292-05:00
WhatFor: ""
WhenToUse: ""
---

# What an inferred packed subtraction buys on the ESP32-P4

The ordinary Typed ray tracer computes one sphere intersection per pixel in a scalar loop. This experiment leaves the source exactly as shipped. The RV32 compiler finds a subtraction whose inputs are independent across eight consecutive pixels. One signed vector instruction produces eight discriminants. The original scalar code processes hits in order, converts each nonnegative discriminant to a depth and tests whether that hit is nearer.

## Read the generated function

The frontend gives the native backend 170 operations for the entire row function. Three are loop headers. The first initializes the two output rows; the second traverses spheres. Neither contains the required producer at loop entry. The third header starts at tape cell 172. It has an induction local in slot 17, advances by one, stops below 160, and addresses the input through buffer slot 0 at the sum of slots 16 and 17. It subtracts the loaded u16 from slot 15 and tests whether the result in slot 19 is nonnegative. Its two output address expressions have bases 1545 and 1705. All those numbers come from the decoded program. The compiler contains no table of ray-tracer functions or source hashes.

The analyzer also walks the consumer's operand stack. It checks whether each halfword store carries an address derived from the current index. A call, an unknown write address, an escape from the copied region, or a binding that changes the proof prevents selection. A legal call with unusual input can also decline the fast path at runtime, for example when a destination overlaps unread source data. The original scalar body then handles checks and writes in its normal order. The design guide gives the signed saturation proof, including the upper bound of 32,766. [Design and proof](../design-doc/01-inferring-packed-halfword-subtraction-inside-scalar-typed-loops.md)

The emitter reserves aligned frame scratch. It broadcasts the uniform row value and checks for an aligned group. On a complete group the vendor decoder identifies a 16-byte input load, an eight-lane signed saturating subtraction and a 16-byte scratch store. The scalar part reads one lane at a time, rejects values above the row term, and executes each accepted hit in its original order. The ordinary backend still owns the variable table lookup, the nearest-depth comparison and the writes. In the matched control, eight scalar subtracts and halfword stores fill the same scratch. Both arms use the same admission, memory intervals, iteration domain, lane consumer and fallback. [Side-by-side source, tape and assembly](../various/host/comparison.md) · [Vendor-decoded row](../various/host/vendor-row.txt)

## Host evidence

The frozen ray source has SHA-256 prefix b0a7c02b. Its stock image is 9,564 bytes, the matched scalar image is 10,384 bytes and the PIE image is 10,308 bytes. PIE reduces the size of the packet producer relative to matched scalar; keeping an ordinary fallback still increases total native text by 744 bytes relative to stock. The stock and PIE row functions occupy 944 and 1,688 bytes respectively. The unchanged Wasm row body occupies 517 bytes.

| Default workload | Stock RV32 fetches | Matched scalar | Inferred PIE | Packed groups |
|---|---:|---:|---:|---:|
| 160 isolated calls to the primary row | 3,608,697 | 3,199,910 | 3,131,435 | 3,135 |
| Clean RGB565 frame | 15,532,634 | 15,110,647 | 15,038,542 | 3,300 |
| RGB, depth and identity audit frame | 16,920,810 | 16,514,993 | 16,446,518 | 3,135 |

Counts measure actual guest fetches. For a clean default frame, PIE saved 494,092 instructions against stock. Of those, 72,105 disappeared when switching from the matched scalar producer to PIE. The two kinds of frame have different buffer placement and alignment, so they execute different numbers of vector groups. Host elapsed time in the emulator does not estimate the duration on the P4. [All twelve poses](../various/host/frames.json)

I tested twelve poses, strides up to 320, both complete frame entry points, and all three native images. Every byte of visible color, depth, object identity and row padding matched the compiled C oracle. The harness also compared the entire supplied mutable memory with WebAssembly, including headers and canaries. The large-frame oracle raises only the standalone Wasm module's memory maximum. Its function code is unchanged. For traps, the harness compares the prefix of writes that actually occurred. One short output traps after a vector group has started, and a shifted alias takes the scalar route and preserves the next input's semantics.

After freezing the pass I used a separate loop that sums the distance of samples below a ceiling. It contains different source names, a variable trip bound and a different scalar consumer. For a long aligned transfer, stock executed 3,027 instructions, matched scalar 1,492 and PIE 1,231. For a misaligned eight-element transfer, no full group executed. Stock took 282 instructions, matched scalar 305 and PIE 308. The guard and broadcast overhead is real even when the ultimate answer is scalar. This is a second algorithm evaluated after the compiler freeze; the earlier independent commitment was never opened. [Transfer and failure cases](../various/host/rows.json)

## Physical execution

The P4 compiled each treatment in a fresh compiler context. I linked the same source on the host, checked each linked image's checksum on the device, then ran twelve scenes at their recorded row strides. Six blocks cover every ordering of the three treatments. Within each measurement the firmware also rotates two C references and the selected Typed program. The clean clock stops with the image in memory. The audit clock includes additional output planes. Primary and shade each use a separate benchmark entry point with its own setup, so adding their times will not reconstruct the clean frame.

| Opening scene on P4 | Stock Typed | Matched scalar | Inferred PIE | Paired saving over stock | Paired saving over matched |
|---|---:|---:|---:|---:|---:|
| Clean frame | 57.692 ms | 56.340 ms | 56.069 ms | 2.80% | 0.43% |
| Audit frame | 62.863 ms | 61.495 ms | 61.215 ms | 2.60% | 0.41% |
| Primary intersections | 17.791 ms | 16.429 ms | 16.185 ms | 9.05% | 1.53% |
| Shade | 48.575 ms | 48.562 ms | 48.564 ms | 0.025% | 0.001% |

The three time columns are medians. For the last two columns I first computed the reduction within each block and then took the median of those percentages. In the clean frame all six packed-versus-matched differences favored PIE, ranging from 217 to 307 microseconds. Across twelve scenes the median clean-frame reduction over stock ranged from 2.66% to 2.89%. Against matched scalar it ranged from 0.41% to 0.47%. The shade-only control changed in both directions. Scalar C took 9.535 ms on the opening clean frame and C with its hand-coded PIE row took 8.363 ms, pooled over the eighteen C reference measurements per implementation. Even with its inferred packed producer, the Typed frame still took 5.88 times as long as scalar C.

Each eight-pixel group performs one vector subtraction. Hits still require scalar lookup, comparison and conditional writes. The matched scalar schedule already reuses a checked input interval and keeps the induction state in registers. Those shared changes account for most of the observed improvement. The opening frame saved 1.616 ms against stock. Changing only the packet producer from scalar to PIE saved 0.242 ms. Extending the lifetime of a proved buffer address or retaining hot values in registers for ordinary scalar code deserves its own experiment. A broader scalar pass could help additional renderer stages, including shade. [Full paired results](../various/device/summary.json) · [Raw physical observations](../various/device/rows.json)

## Reproducing the measurements

From the repository root, set `t` to this ticket directory and `prefix` to the installed Espressif binutils path ending in `bin/riscv32-esp-elf`. The first command prints a decoded source-to-instruction listing. The next two execute the differential harness on the host. Frames mode also invokes the system C compiler to build the reference renderer.

```bash
node picocalc-os/tools/typed-inspect.mjs picocalc-os/worlds/raytrace/raytrace.typed --function typedRayComputeRow --pie-loops pie
node "$t/scripts/03-qualify.mjs" "$prefix" /tmp/packed-qualification rows
node "$t/scripts/03-qualify.mjs" "$prefix" /tmp/packed-qualification frames
python3 "$t/scripts/09-paired-results.py" "$t/various/device"
make -C picocalc-os test-apps
```

The device scripts use the staged SDK build from the scalar breakdown study. Script 04 packages the optional compiler alongside the stock control. Script 05 links the expected guest images for comparison. Script 06 verifies the pinned playable firmware, flashes and verifies the trial, checks each compiled guest checksum, records times, restores the prior firmware and checks the running worlds and bus health. The original paired run uses program 8 for matched scalar and program 5 for PIE. The separate compiler-cost follow-up uses program 8 for the frozen first PIE compiler. The two result directories record different experiments. [Firmware and guest image identities](../various/device/images.json) · [Trial build recipe](../scripts/04-build-trial.py) · [Board runner](../scripts/06-board.py)

For an exact replay, the first board trial used the compiler at revision `74456f2`. Build the scalar breakdown SDK stage using its device build recipe and preserve a separate copy of the verified playable build directory. Compile the first trial at that revision and keep its generated `pie.js` file. For the second trial, switch the host compiler to `725b6d5` and pass the saved `pie.js` as script 04's third argument. Its hash is checked before inclusion. Scripts 05 and 06 take the same stage and artifact directory. Pass `--cold-only` after the serial port to collect eighteen compilations on the opening scene. Run script 10 on the follow-up result directory after copying in the corresponding image identities. [SDK stage preparation](../../../21/PICOCALC-SCALAR-BREAKDOWN--factor-the-typed-ray-scalar-row/scripts/device/01-build.py)

## What it costs to recognize the loop

The original vectorizing compiler took 658.027 ms on the first physical trial against 454.133 ms for stock. To find each loop it decoded the compact tape into JavaScript operation records even in functions that could never contain the required expression. The new prefilter searches the raw numeric cells for a necessary sequence: unsigned halfword load, subtraction, write and read of the difference, compare with zero, conditional branch. A matching immediate can produce a false positive. The full structural proof still decides admission. Inspection of a requested function bypasses the filter to retain reasons for rejected loops.

A second firmware included all three compilers in one build: stock, frozen PIE and filtered PIE. I rotated all six load orders. Both PIE compilers generated the same complete 10,308-byte native image and linked ELF, and the board matched the expected ELF checksum at every load. Replaying all twelve host frames also reproduced the first trial's records byte for byte. The compiler-only change therefore preserves the guest instructions timed in the first trial.

| Fresh compiler on P4 | Median compile | Peak JavaScript heap |
|---|---:|---:|
| Stock | 454.095 ms | 679,988 B |
| PIE with full scanning | 657.835 ms | 773,806 B |
| PIE with prefilter | 523.692 ms | 746,388 B |

Within blocks the filter saved a median 134.625 ms (range 129.450–136.843). The final pass still cost an additional 70.324 ms over stock (range 67.246–73.560). At the opening scene's 1.616 ms saved per completed frame, the extra cold cost is recovered after approximately 44 frames. This estimate assumes one cold compile and repeated rendering of a comparable scene. It excludes display transfer and makes no prediction about frame cadence. The six paired blocks qualify this compiler, board and workload. The opt-in setting lets other apps keep the prior cold cost. [Follow-up data](../various/device/prefilter/summary.json) · [Linked image identities](../various/device/prefilter/images.json)
