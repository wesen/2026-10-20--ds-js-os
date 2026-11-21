---
Title: "Independent review of the compiler measurements"
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: analysis
Intent: long-term
---

# Packet Boundaries in a Typed Compiler on the ESP32-P4: Lane-Load Counts, Frame and Row Cycles, Physics Controls and Selector Regret

The independent reviewer used two queries in a separate REPL sandbox and reviewed the supplied measurement tables. A frame time is in microseconds and ends when the compiled entry returns with its output buffers ready. The primary entry returns depth and material IDs. The complete entry returns RGB565. Collision/gate timings are physical cycles per call. Two pairs differ only in lighting, giving ten distinct primary inputs among twelve distinct color-frame fixtures. After this review the scoring script was amended to label its published tables with the timing units and entry points. The source and units are also explicit in the [frame harness](../scripts/director/frame.c), [gate harness](../scripts/director/gate.c), and [independent replication](06-independent-replication.md). The sections below preserve the reviewer's distinctions about what the summary tables establish on their own. The proposed code-placement experiment could test sensitivity to fetch location. A RAM/flash interaction would still leave the individual effects of layout, alignment and instruction scheduling unresolved.

This review checks the measurements behind the lab's choice of SIMD packet boundary for the ray-row code. It's written for students who are new to compiler measurement. For each result it gives the unit, names the denominator of each percentage, and says whether the claim was tested on the device or is still an inference.

## 1. Instruction counts for the three images

The lab compares three emitted RV32 images of the same row function, named `pie`, `empty` and `full`. The files don't define these names, so this review describes the images only by what was measured in them.

I re-ran the lane-load count against the local SIMD study:

```js
['pie','empty','full'].map(k => simd.executions(k+'-row', k+'-opening', 'scalar-lane-load').executions)
// [26070, 9182, 3246]
```

A second query returned the image digests, the workload (`opening-160-rows`) and the trace step totals. All three match the candidate workbook exactly. In each image the `scalar-lane-load` role covers one static instruction.

| Image | Guest steps | Steps vs pie | Lane loads | Packet stores | Extracts | Image bytes |
|---|---|---|---|---|---|---|
| pie | 3,131,435 | baseline | 26,070 | 3,135 | not recorded | 10,308 |
| empty | 2,983,602 | −4.72% | 9,182 | 1,024 | not recorded | 10,332 |
| full | 2,954,486 | −5.65% | 3,246 | 282 | 5,936 | 12,684 |

The step-change denominator is the pie image's 3,131,435 steps. Before the run, the workbook predicted the pair [16,888, 5,936], and the observed pair is the same. 16,888 is 26,070 − 9,182, the number of lane loads that empty removes, and 5,936 is the number of extracts in full. One more exact relation holds: 3,246 + 5,936 = 9,182. So full reads the same number of lanes as empty but performs 5,936 of those reads as extracts instead of loads.

These numbers count retired guest instructions. They say nothing about time. The README makes this point too: guest instruction counts are not a substitute for device time.

## 2. The default complete frame

`frame-result.json` gives two phases for each pose, labelled `clean` and `primary`. The file doesn't define them. I read the larger `clean` row as the complete frame, but that's my assumption. The file also doesn't record a unit.

| Default pose | Before | After | Saved | Pct | Wins |
|---|---|---|---|---|---|
| clean, empty vs pie | 56,243.5 | 55,737.5 | 508.5 | 0.90% | 6/6 |
| clean, full vs pie | 56,243.5 | 55,861.0 | 391.0 | 0.70% | 6/6 |
| clean, full vs empty | 55,737.5 | 55,861.0 | −126.0 | −0.23% | 0/6 |
| primary, empty vs pie | 16,337.5 | 15,791.0 | 546.5 | 3.35% | 6/6 |
| primary, full vs empty | 15,791.0 | 15,930.5 | −131.0 | −0.83% | 0/6 |

**Denominators.** `pct` is `saved ÷ before`. `saved` is the median of the per-block paired differences, not the difference between the two medians. That's why 56,243.5 − 55,737.5 = 506.0 while `saved` is 508.5. In the `incrementalFull` rows, `before` is the empty image, so −0.23% means full is slower than empty and is measured against empty.

The two phases show why the denominator matters. Empty saves about the same absolute amount in both phases (508.5 and 546.5), but because the `clean` denominator is about 3.4 times larger, the percentage falls from 3.35% to 0.90%. The cost of full relative to empty is also about the same in both phases (−126 and −131). That suggests the work that differs between the images happens within the primary phase.

The result holds across all 12 poses. Empty and full each beat pie in 6 of 6 blocks in every pose and phase. Full loses to empty in 0 of 6 blocks in all 24 pose-phase rows. The loss ranges from 102.0 to 138.5 in `clean` and from 120.0 to 150.5 in `primary`.

## 3. Whole-row cycles

`ceiling-summary.json` reports device cycles for whole rows on three workloads, with 9 paired blocks per arm.

| Workload | pie median | empty median | empty vs pie | full median | full vs pie |
|---|---|---|---|---|---|
| opening | 3,916,869 | 3,731,049 | 4.74% (9/9) | 3,725,090 | 4.90% (9/9) |
| dense | 3,994,113 | 3,784,493 | 5.25% (9/9) | 3,776,730 | 5.44% (9/9) |
| sparse | 3,858,067 | 3,786,735 | 1.85% (9/9) | 3,787,359 | 1.83% (9/9) |

**Denominators.** Each percentage is relative to the arm named in that row's `control` field, and that field changes from row to row. `typed-empty` and `typed-full` are measured against `typed-pie`. `typed-pie` is measured against `typed-scalar`, `typed-scalar` against `typed-stock`, and `reg-scalar` against `checked-c`. These percentages can't be added together. For example, empty's 4.74% isn't its saving over stock. Taken from the medians alone, empty is 17.1% below stock on the opening workload.

The table has no paired comparison between full and empty. Comparing their medians, full is 5,959 cycles lower on opening (0.16% of empty) and 7,763 lower on dense, and 624 higher on sparse. Without a pairing, these gaps don't show a difference. At the whole-row level, the order of full and empty hasn't been established.

The instruction counts and the cycle counts also scale differently. On opening, empty removes 147,833 guest instructions compared with pie and saves 185,830 cycles. Full removes another 29,116 instructions beyond empty, but its median is only 5,959 cycles lower. That comparison assumes the `opening` workload here is the same as `opening-160-rows` in the trace, which the files don't state.

For scale: the checked C build of the row takes 1,005,500 cycles, and the register scalar build takes 313,477. The choice of packet boundary is worth about 5% of a row that still runs about 3.7 times slower than checked C.

## 4. Particle and contact controls

The workbook records three paired physics measurements in physical P4 cycles. Each percentage is relative to the matched scalar baseline, and a negative value means the packed arm was slower.

| Cell | Baseline → candidate | Blocks | Median saved | Wins |
|---|---|---|---|---|
| checkedPlanar | guarded-soa-scalar → guarded-soa-pie | 12 | 89.3% | 12/12 |
| conversion | aos-scalar → convert-pie-roundtrip | 12 | −47.2% | 0/12 |
| contact | grouped-scalar → grouped-pie | 14 | −43.9% | 0/14 |

A saving of −47.2% means the candidate took about 1.47 times the baseline's cycles. The packed-arithmetic trace for `guarded_soa_pie` shows 16 executions at one PC, out of 126 traced steps. The role's second range executed zero times. The source for that decision is a hand-written assembly file (`physics_checked.S`, line 35), not compiler output. These cells are therefore controls. They show that packed arithmetic pays off on the P4 when data is already in planar (SoA) layout. They also show that converting to packets and back, or packing grouped contacts, loses every block. They don't show what the typed compiler emits.

## 5. The blind selector

`selector-result.json` scores a selector on held-out flash-resident code in cycles per call. Regret is `(chosen − fastest) ÷ fastest`, where fastest is the lowest median for that case, so the denominator changes from case to case.

- The selector predicted `pie` in all 15 of 15 cases.
- It picked the winner in 12 cases. Its median regret is 0%.
- The three misses are all `dynamic, n=3`, where stock is fastest. The regrets are 24.08%, 23.06% and 23.43%. For example, at reach 0 pie takes 186.45 cycles and stock takes 150.26.

Because the prediction never changed, this test can't tell the selector apart from a fixed rule that always picks pie. Choosing automatically adds 75 to 142.5 µs (paired medians) to a pie compile of about 23.3 ms. Peak memory is 814,020 bytes in every arm.

`gate-result.json` reports a separate runtime gate. Its percentages are also relative to the fastest fixed arm. At n=3, pie is 23.03% above stock and the gated version is 1.92% above stock. At n ≥ 8, the gate stays within −0.42% to +0.58% of the fastest fixed arm. The gate's n=3 medians are close to the selector's dynamic n=3 medians at reach 35, but the files don't say whether the two tables measure the same kernel.

## 6. Tested choices and outstanding inferences

**Tested:**

- The exact lane-load, store and extract counts for each image, re-verified here.
- Empty and full each beat pie on the device, both in whole rows (9/9 blocks on three workloads) and in the frame (6/6 blocks in 24 pose-phase rows).
- In the frame, full is slower than empty in every block. For the complete frame, empty is the choice that measurement supports.
- The selector always predicts pie and has 23–24% regret at n=3.

**Outstanding inference:**

- Why full loses in the frame even though it executes fewer instructions. One candidate explanation: the full image is 2,352 bytes (22.8%) larger, so instruction fetch through the flash cache may cost more when other frame code runs between rows. The frame file doesn't say where the code executes from, and nothing has tested this explanation.
- Whether full and empty differ at all in whole-row cycles.
- Whether the selector can ever choose anything other than pie, and whether the gate removes its n=3 regret on the same kernel.

## 7. Follow-up experiment

The experiment tests the instruction-fetch explanation directly, as a 2×2 paired design:

1. Build four arms: empty and full from flash, as they are now, and empty and full with the row function placed in internal RAM (for example with `IRAM_ATTR`). The machine code stays unchanged.
2. Before measuring, run `simd.executions` on each new image to check that it still has 9,182 or 3,246 lane loads and 5,936 extracts. Any difference disqualifies the image.
3. Measure all four arms in rotated blocks: 6 blocks, 12 poses, both phases. Also record a paired full-vs-empty whole-row comparison on the three ceiling workloads.
4. Report `incrementalFull` with empty as the denominator, separately for flash and for RAM.

Decide the rule before running. If the RAM pair's loss is under one third of the flash pair's loss in at least 10 of 12 poses, fetch cost explains the frame result. If the loss stays at about −120 in RAM, the cost is in executing full's extracts, and the row-level benchmark is missing it for some other reason.

## Run this article's JavaScript

From the compiler checkout, the following commands open a fresh stateful session on port 3794 and run the exact cell printed below. The shell variable `sid` retains the session ID for follow-up queries. If the service has stopped, its [launcher](../scripts/evidence/06-start-workbench.sh) accepts `candidates` to mount the combined study.

~~~sh
ticket=$(ls -d ttmp/2026/11/21/PICOCALC-SIMD-LAB--*)
sid=$(python3 "$ticket/scripts/director/09-open-lab-session.py" --keep | awk '{print $NF}')
go run ./cmd/trace-repl eval --addr 127.0.0.1:3794 --session "$sid" < "$ticket/scripts/reports/05-independent-review.js"
~~~

~~~js
(() => {
    const trials = lab.scores.cases;
    const misses = trials.filter(t => t.predicted !== t.best);
    return {cases:trials.length, winners:trials.length-misses.length,
        distinctPredictions:[...new Set(trials.map(t=>t.predicted))],
        misses:misses.map(t=>({n:t.n, reach:t.reach, excessPercent:t.regretPct})),
        laneLoads:["pie","empty","full"].map(k=>
            simd.executions(k+"-row", k+"-opening", "scalar-lane-load").executions)};
})()
~~~

[Standalone JavaScript file](../scripts/reports/05-independent-review.js) · [Checked replies from all six articles](../various/director/report-cell-replies.json)
