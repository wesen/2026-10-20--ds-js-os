---
Title: What twelve ray fixtures actually test
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: analysis
Intent: long-term
Summary: Independent paired frame analysis and a register-pressure probe for the opt-in empty-packet lowering.
---

# What twelve ray fixtures actually test

The opening scene took a median **508.5 µs less per complete in-memory color frame** with the empty-packet bypass. The comparison is against the compiler's existing PIE loop, which already subtracts eight halfwords at a time. The new branch finds the smallest unsigned input in a packet. If even that value exceeds the ray's row term, every lane misses and the compiler advances the pixel index by eight. The saved time measures the effect of the two complete compiler images on this board.

## Reconstruct one result

The board records one elapsed time per native call. Each of six blocks tries all three images on each fixture. The block identifies which observations to subtract. In block zero on the opening scene, the baseline took 56,274 µs and the bypass took 55,679 µs. Their difference was 595 µs. The corresponding differences for all six blocks were 595, 502, 465, 561, 515 and 467 µs. Sorting them puts 502 and 515 in the middle. Their mean gives 508.5 µs. Dividing each difference by its own baseline first gives a median saving of 0.9040%. [Physical observations](../various/director/frame-device-rows.json) · [Independent pairing cell](../scripts/examiner/frame-pairs.js)

| Timed native call | Opening median paired saving | Range of fixture median savings | Pairs favoring bypass over baseline |
|---|---:|---:|---:|
| `typedRayFrame`, prepared scene through shaded RGB pixels | 508.5 µs, 0.9040% | 0.8907–0.9910% | 72 of 72 |
| `typedRayTrace`, geometry preparation through stored depth and object IDs | 546.5 µs, 3.3459% | 3.1942–3.3654% | 72 of 72 |

The bypass also beat the experimental full-packet treatment in every one of those pairs. The timer includes scene preparation inside each entry, and stops after the entry returns. The harness initializes buffers before the clock starts, then checks the return value, output-plane canaries and output digests after timing. The RGB entry finishes with the image in RAM. LCD transfer and input dispatch are outside that interval. The two timed calls each prepare their own scene. [Harness](../scripts/director/frame.c) · [Native entry bindings](../scripts/director/06-frame-images.mjs) · [All 24 fixture/phase summaries](../various/examiner/frame-pairs.json)

## Count the inputs that reach the program

Twelve fixture names represent twelve color-frame inputs. Only ten distinct combinations reach the primary tracer. The harness passes the sphere coordinates and stride to that computation. The lamp coordinates go to the color entry only. Thus `default` and `lamp-only` both trace the sphere at (68, 61) with stride 160. Likewise `left-lamp` and `right-lamp` both trace (80, 80) with stride 160. Their paired depth and object-ID digests coincide even though the RGB digests differ. All 72 primary observations count as real pairs. Treating their fixture labels as twelve distinct primary scenes would overstate scene coverage. [Fixture arguments and digests](../various/director/frame-fixtures.json)

Treatment order rotates across blocks. Code placement stays fixed per treatment in the benchmark. The frame generator embeds each complete program in turn, aligns its start to 16 bytes, and introduces a 24-byte increase in the row routine between baseline and bypass. This also moves later routines within the program. The timings establish the benefit of those exact images. A placement-balanced relink would help attribute a fraction of a percentage point exclusively to the changed packet instructions. [Image generator](../scripts/director/06-frame-images.mjs) · [Code sizes and hashes](../various/director/packet-images.json)

## Keep a value alive across a hit

A fast path must preserve the input pointer, uniform row term, index, lane count and scratch pointer while ordinary compiled code handles a hit. I wrote a separate accepted loop that reads unsigned input, conditionally writes to a second buffer, and immediately reads that value back. Its nested arithmetic keeps more operands live than the five registers available to the scalar expression stack. Division, bounds checks and spills exercise the scratch registers. The packet state lives in x12–x17, while the scalar expression stack uses x5–x7 and x28–x29 with x30, x31 and x10 available for scratch. The recognizer rejects a call inside the copied continuation, where that register arrangement would need a separate preservation rule. [Probe source](../scripts/examiner/probe.typed) · [Comparison driver](../scripts/examiner/probe.mjs)

On 24 aligned lanes the packed loop executed three packet minima and 50 scalar spill writes in its hit continuations. It returned 124,130 and changed 20 of the 400 supplied bytes. Stock RV32 and Wasm returned the same result and agreed byte-for-byte. A short-output fixture trapped after one two-byte write. All three executions preserved the same write before the trap. A zero divisor trapped before the first store, a misaligned start with a scalar tail returned 68,302, and a zero-trip call returned zero. I found no register-clobber or skipped-effect counterexample in these five host cases. They are semantic checks on an additional admitted program. The timing measurements above come from the original physical ray trial. [Probe results and image identities](../various/examiner/probe.json)
