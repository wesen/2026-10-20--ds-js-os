---
Title: "Compiling an empty-packet exit for the PicoCalc ray tracer"
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: analysis
Intent: long-term
---

# Compiling an empty-packet exit for the PicoCalc ray tracer

A 160×160 ray tracer on an ESP32-P4 illustrates a practical compiler question. When one instruction can work on eight pixels simultaneously, how long should those pixels stay together? Three native images compiled from the same Typed source gave different answers. The smallest new variant made the default complete frame 508.5 microseconds faster than the previous SIMD implementation. A larger variant executed fewer instructions in simulation but gave some of that improvement back on the device. Understanding the difference requires examining what the scalar portion does, how the compiler can prove an eight-lane operation safe, and where the experiment places its timer.

## From a scanline to eight candidate intersections

For each sphere on a scanline, the tracer computes R = radius² − dy², where dy is the vertical distance from the sphere center. For each ray it reads s, a precomputed unsigned halfword containing the squared horizontal distance. In the source, a ray hits when the signed i32 difference R−s is nonnegative. On the admitted fast path this is equivalent to the unsigned comparison s ≤ R. On a hit, the program reads a square-root table and conditionally updates the nearest depth and the material identifier. A PIE vector register holds eight u16 values of s, so the compiler processes rays in packets of eight.

## Three candidate schedules

**Baseline.** The previous compiler subtracts the eight values, spills the results to scratch memory, and then consumes each lane in scalar code.

**Empty-only.** The new candidate first issues a horizontal unsigned minimum on the input register. If the minimum exceeds R, no lane can satisfy s ≤ R, so all eight rays miss. The code then skips the subtraction, the scratch store and the scalar consumers. Otherwise it continues on the baseline path.

**Empty+full.** The third candidate also computes a horizontal maximum. If the maximum is ≤ R, every lane hits, and the code unrolls eight direct register extracts in place of the scratch path.

All three schedules keep checked fallbacks. When the input span, arithmetic or alias preconditions fail, the code takes a path that does not rely on these shortcuts.

Consider R = 50 and the packet [64, 81, 100, 121, 144, 169, 196, 225]. The minimum is 64. Because 64 > 50, the empty-only test rejects all eight rays with a single comparison.

## How the input determines scratch traffic

The 160-row opening scene produced 3,135 aligned packets, comprising 2,111 empty, 282 mixed and 742 full. Empty packets make up about 67% of the total.

The scratch-store counts follow from this breakdown. The baseline stores every packet (3,135). Empty-only stores only non-empty packets (282 + 742 = 1,024). Empty+full stores only mixed packets (282).

## How a narrower operation can preserve the Typed observable result

The Typed calculation interprets s as an unsigned halfword from 0 to 65,535 and subtracts it in i32. The P4 instruction interprets inputs as signed halfwords and saturates the result to [−32,768, 32,767]. To obtain the right Typed result, the compiler checks a particular postcondition. It reads the physical result bits as an unsigned halfword u and accepts the lane if u ≤ R. For 0 ≤ R ≤ 32,766, every mathematically nonnegative difference is recovered exactly and every negative difference is rejected.

The proof has three cases. For s ≤ R the difference fits exactly and passes. For R < s ≤ 32,767 the hardware result is negative and its unsigned bit pattern exceeds R. For s ≥ 32,768 the signed hardware interpretation of s is negative. The subtraction therefore produces more than R, even if it saturates at 32,767. The rule must stop one below that saturation value. At R=32,767 and s=65,535 the instruction treats the input as −1, saturates to 32,767 and would incorrectly admit a miss. The Typed difference is −32,768.

When a constant is visible to the compiler, this rule can be resolved before emission. A known suitable literal removes the numeric guard. A known unsuitable literal discards the packed plan. An unknown threshold retains the ordinary test and fallback. This specialization keeps the memory-dependent guards. Computing eight inputs together could change an answer if an output aliases a future input, and raising an early whole-span exception could discard writes the original loop would have performed. On a failed precondition the compiler executes the original checked computation in the original order.

To test this contract the lab generated one scalar, one runtime-guarded and one literal-specialized native image per source family. An independent scalar oracle compared the first failing buffer and index, the ordered halfword writes, the return value on success and the final visible bytes. All three images agreed across each of 2,520 cases. There were 723 traps, 618 with earlier writes. Cases included equal and shifted overlapping buffers, short capacities, three alignments, one-to-seven-lane remainders, negative thresholds and extreme signed values. These were real emulated guest instructions. The architecture trace supplies reproducible behavior; device times came from a physically separate benchmark.

Literal 32,766 reduced an example function from 704 bytes to 688. Literal 32,767 emitted only the 264-byte scalar program. The unknown case remained 696 bytes. At lengths 8, 32 and 127 the valid literal specialization saved median 4.63%, 1.28% and 0.43% respectively on the physical P4 against the guarded original. Even the byte-identical dynamic control had modest differences between distinct flash addresses. Treat small timing differences as a combination of compiler work and measurement conditions. The actual sphere's row threshold varies. These example functions establish a way to omit a test when source facts permit it; they do not contribute an additional measured ray-frame speedup.

The Opus researcher also wrote an independent single-lane model. The operator swept **all 65,536 input bit patterns** separately at R values 0, 1, 31, 1,024, 32,765, 32,766 and 32,767. That is 458,752 comparisons. Each of the first six thresholds agreed throughout. At 32,767, exactly 32,768 values were falsely admitted, beginning at s=32,768. The exhaustive sweep covers all inputs at seven thresholds. The three-case proof supplies the argument for every threshold in the admitted interval. The actual machine-code tests separately cover the memory, ordering and trap obligations.

## Measuring an attainable row speed

The first hardware comparison ran nine implementations over opening, dense and sparse radius configurations. Three schedules used a hand-written admissibility check: require a valid row, capacity for all referenced planes, at most three spheres, valid center y and radius at most 32. When the check fails the kernel calls the original checked C row. On the hot path it retains scalar values in registers and lifts checks that are invariant during the inner loop. One variant executes scalar arithmetic, another adds an assembly unsigned minimum, and a third adds both a minimum and maximum. The strong scalar and hand PIE controls therefore have the same access contract. Comparing either directly with compiled Typed measures many differences, including scalar code generation.

Each arm computed 160 rows starting each call from its independently restored 4,100-byte buffer. The hardware cycle counter bracketed each call. Input restoration and comparison with an independent Wasm full-buffer CRC followed outside that interval. Across nine order-rotated blocks all 38,880 calls returned the correct value and matched the oracle. Median opening results were 313,477 cycles for the strong scalar schedule and 273,307 for the minimum-only hand schedule, a 12.81% paired saving. Earlier compiler PIE took 3,916,869 cycles. Compiler-generated empty exit took 3,731,049 cycles, saving 4.74%; the full candidate took 3,725,090 cycles, saving 4.90%. Both candidate schedules passed all checks.

## What reached the complete frame

| Measure | Baseline | Empty-only | Empty+full |
|---|---:|---:|---:|
| Function size (bytes) | 1,688 | 1,712 | 4,064 |
| Guest instructions | 3,131,435 | 2,983,602 | 2,954,486 |
| Scratch packet stores | 3,135 | 1,024 | 282 |
| Median frame time (µs) | 56,243.5 | 55,737.5 | 55,861 |

These times come from actual compiled whole frames on the P4. All of them end before screen transfer. Paired medians from six rotated blocks give the following differences.

- Compared with baseline, empty-only saved 508.5 µs (0.904%) on the full frame and 546.5 µs (3.346%) on its primary stage.
- Compared with empty-only, empty+full lost 126 µs.

Empty-only gave the lowest whole-frame median at each of the twelve pose/stride fixtures. Each clean frame matched the independent RGB hash, and each primary-only frame matched the depth and material-ID hashes. Those hashes include stride padding. All three planes retained their end sentinels.

Empty-only adds 24 bytes of code. Empty+full executes 29,116 fewer guest instructions than empty-only and performs 742 fewer scratch stores, yet it is slower. In this case, instruction count alone did not predict frame time. Distinguishing instruction-cache behavior from placement or other costs would require an additional controlled experiment.

## What each group costs in isolation

A separate, hand-controlled microbenchmark timed a function call over identical inputs, with controlled initial depth and material identifiers. Each value below is the median of nine block means, in cycles per eight rays, for the opening scene. The columns show the scalar, minimum-only and minimum-plus-maximum schedules.

| Opening group | Groups per block | Scalar | Minimum only | Minimum and maximum |
|---|---:|---:|---:|---:|
| Empty | 2,111 | 55.208 | 40.242 | 41.230 |
| Mixed | 282 | 95.110 | 128.259 | 126.972 |
| Full | 742 | 132.745 | 164.982 | 151.001 |

The minimum test lowers the cost of an empty packet by 14.966 cycles, about 27%. On mixed and full packets, both vector schedules cost more than scalar code in this harness. The maximum test recovers 13.981 cycles on full packets relative to min-only, but it adds 0.988 cycles on empty packets. Across opening, dense and sparse inputs, 208,791 output comparisons passed.

These figures describe isolated packets. They are distinct from complete-row timings and should not be summed to predict a frame. They show where each test removes work and where it adds work.

## Which schedule belongs in the compiler

Retain the empty-only (min-only) schedule. It improved the compiled whole frame over baseline, won all twelve pose/stride comparisons, passed all image checks, and adds only 24 bytes. The empty-and-full schedule costs more than twice the native bytes of the minimum-only schedule and gave back 126 µs in the paired default whole-frame comparison. The selected plan preserves the original checked fallbacks.

## Reproducing the measurements

The three diagnostic visits all ended with flash verification of the original 4,804,016 application bytes and 3,072 partition-table bytes. The OS reported all eight worlds present and the native painter installed. Fresh builds from the ticket inputs matched all three executable payloads. The complete image hashes differ because the application description records the build time, the ELF identification and the firmware integrity fields.

| Source or interface | What a student can verify |
|---|---|
| `picocalc-os/worlds/raytrace/raytrace.typed`, `typedRayComputeRow(work, y)` | Source semantics, table lookup and conditional store order |
| `scripts/director/packet-emitter.patch`, `scripts/director/04-packet-images.mjs` | Three generated images from identical source, plus their SHA values |
| `scripts/ray/board/main/ceiling.c` and `ceiling_reduce.S` | Identical preflight guards around the independently compiled scalar and hand PIE row |
| `scripts/ray/04-static-proof.mjs` and `09-opus-exhaustive-lanes.mjs` | Literal simplification in an isolated compiler, machine-code checks including alias/trap timing, and exhaustive arithmetic model |
| `scripts/ray/06-stage-board.sh`, `05-score.py` and `07-score-classes.py` | Build all device images, validate every measurement cell and recalculate medians |
| `scripts/ray/08-repl-ray.py` and `simd.packets('opening-160-rows')` | Load physical timing rows into the local REPL and independently verify the number of empty, mixed and full packets in every block |

Paths beginning with `scripts/` belong to docmgr ticket `PICOCALC-SIMD-LAB` in the PicoCalc checkout. Its `various/ray/` directory contains the raw numeric records, independent output witnesses and flash restoration receipts. Its `various/director/` directory contains the 432 frame and primary-phase measurements on the twelve pose/stride fixtures.

*Research credits.* The external Opus High team authored the packet-schedule analysis and the independent exhaustive-lane script. The ray operator built the hand-scheduled row and packet trials, literal-specialization compiler comparison, ordered-effect oracle and firmware procedures, then extended the article with their measurements. The lab director implemented the candidate Typed emitters and complete-frame harness. The evidence researcher reconstructed dynamic guest counts from traced native addresses.

## Run this article's JavaScript

From the compiler checkout, the following commands open a fresh stateful session on port 3794 and run the exact cell printed below. The shell variable `sid` retains the session ID for follow-up queries. If the service has stopped, its [launcher](../scripts/evidence/06-start-workbench.sh) accepts `candidates` to mount the combined study.

~~~sh
ticket=$(ls -d ttmp/2026/11/21/PICOCALC-SIMD-LAB--*)
sid=$(python3 "$ticket/scripts/director/09-open-lab-session.py" --keep | awk '{print $NF}')
go run ./cmd/trace-repl eval --addr 127.0.0.1:3794 --session "$sid" < "$ticket/scripts/reports/02-ray-packets.js"
~~~

~~~js
["empty", "mixed", "full"].map(kind => {
    const row = lab.packetCosts("opening", kind);
    return {kind, packets:row.packetsPerBlock, unit:row.unit,
        scalar:row.schedules.scalar.cycles_per_packet_median,
        minimum:row.schedules.empty.cycles_per_packet_median};
})
~~~

[Standalone JavaScript file](../scripts/reports/02-ray-packets.js) · [Checked replies from all six articles](../various/director/report-cell-replies.json)
