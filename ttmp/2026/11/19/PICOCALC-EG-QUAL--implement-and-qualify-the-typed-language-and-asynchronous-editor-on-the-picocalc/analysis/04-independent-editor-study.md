---
Title: "How to measure a complete generated search on a handheld"
Ticket: PICOCALC-EG-QUAL
Status: review
Topics:
    - picocalc
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Independent Opus High analysis checked against the implementation and its recorded experiments."
LastUpdated: 2026-11-20T00:00:00-05:00
WhatFor: "Read with the implementation team's compiler and application measurements."
WhenToUse: "When studying the completed E and G compiler phases."
---

# How to measure a complete generated search on a handheld

## 1. Scope

This report examines whether compiler-generated cooperative yield machinery can replace hand-written continuation state machines in a text editor running as a Wasm or RV32 guest on the PicoCalc P4. The manual arm is pre-G revision `1357545`, which uses hand-written continuations and E language tasks E1–E7. The await arm is final compiled-await revision `2e4fee1`. The combined delivery port `7b321a9` produces byte-identical linked artifacts from the same typed source under the final compiler. Both execution engines — native RV32 and Wasm — run on the actual PicoCalc P4. Native RV32 editor code executes directly on the P4 processor. Compilation also runs on the P4.

## 2. What Was Measured

The experiment has three layers. First, twenty-four frozen host semantic replays verify that all key revisions produce correct output. The Editor suite also compares thirteen workflows against its JavaScript reference. Five additional fixtures exercise timer and input order on real Wasm and emulated RV32 reactors; emulated RV32 applies only to these host-side fixtures, not to the physical P4 measurements described below.

Second, a physical short workflow runs the standard test — typing, file save/readback, simple Find, Markdown preview, discard, and cleanup — on the actual P4 hardware with three trials per engine per arm. Each trial compares two specific captured frames. Device firmware is built separately for the two engines. Wall time displayed to the app is fixed for screenshot consistency, but all timers and timeout decisions use the actual monotonic clock. The test directory name differs between engines by design, so only screenshots within an engine are compared.

Third, a Find query fixture delivers a specific search against a 65,536-byte buffer containing 851 CRLF lines of repeated text plus a final nine bytes `needlezzz`. Three query classes are tested: an early query matching at column 2 of line 1; a dense miss query (`text text z`) that exhausts all candidate positions; and a unique late query matching the needle at line 852, column 1. The measurement interval begins at delivering Enter in the query prompt and ends at producing a retained frame with the expected result. The elapsed clock includes scheduling; the separate Editor CPU clock sums only the Editor's execution segments; engine time includes reactor and SDK execution. The separate host fixtures deliberately reorder events that normal kernel routing can serialize. The physical fixture drives the real Editor through serial key injection. Search outcomes were verified on both physical engines before timings were accepted. Each query class has one physical trial per engine per arm. No confidence intervals or workload-wide speed claims can be drawn from such an exploratory sample. The code to reproduce is in PICOCALC-EG-QUAL/scripts.

## 3. Compiler Cost

Both compiler intervals are measured on the real P4. On the native RV32 target, median compilation time rose from 2,645,557 μs to 3,816,925 μs (+44.28%). On the Wasm target, it rose from 2,028,286 μs to 3,121,485 μs (+53.90%). Peak compiler heap followed the same pattern: 1,493,644 to 2,256,776 bytes (+51.09%) on RV32 and 1,545,892 to 2,263,468 bytes (+46.42%) on Wasm.

The first measured generated build missed the prespecified cold compile gate (`native_compile_within_10pct: False`). Its success or failure is separate from subsequent compiler experiments.

Separately measured rewrite-phase totals account for 896.5 ms of the 1,179.7 ms added to the native compile interval. The rewrite decomposes as: 440.8 ms reading input, 181.4 ms scanning for operations, 160.7 ms analyzing tasks, and 57.1 ms building rewritten text. The remaining approximately 283 ms falls in other compiler phases. The dominant added cost is reading and scanning the source, not control-flow analysis.

## 4. Output Artifact Size

The native RV32 module is delivered in a fixed-size envelope of 240,452 bytes in both arms. This identical envelope does not imply identical native instructions: the manual editor uses 21,922 native words while the await editor uses 22,292, a growth of 370 words. The G3 typed-await pass added 264 native words to its E6 control (21,922 to 22,186); G4 added 106 further (22,186 to 22,292). The Wasm module grew by 667 bytes, from 88,302 to 88,969 (+0.76%).

## 5. Runtime Performance

The full Editor workflow CPU time, measured across three physical P4 trials per arm, is closely matched. On RV32, medians are 35.03 ms (manual) and 34.80 ms (await), a difference of −0.66%. On Wasm, medians are 144.35 ms and 144.30 ms, a difference of −0.03%. The native workflow CPU passes the prespecified 10% gate (`native_cpu_within_10pct: True`).

## 6. Find Query Timing

The table below reports all measured values from the single physical trial per query class, engine, and arm. The elapsed clock includes host scheduling between segments. The Editor CPU clock sums only Editor execution segments.

| Engine | Query | Elapsed manual → await (ms) | Δ | CPU manual → await (ms) | Δ | Seg. | Settl. |
|--------|-------|-----------------------------|---------|-------------------------|---------|------|--------|
| rv32 | early | 4.52 → 4.09 | −9.52% | 4.50 → 4.06 | −9.83% | 1 → 1 | 0 → 0 |
| rv32 | late | 54.23 → 55.81 | +2.91% | 39.54 → 39.60 | +0.15% | 27 → 27 | 26 → 26 |
| rv32 | miss | 183.88 → 171.67 | −6.64% | 116.28 → 113.12 | −2.72% | 297 → 297 | 296 → 296 |
| wasm | early | 41.52 → 41.61 | +0.22% | 41.49 → 41.57 | +0.20% | 1 → 1 | 0 → 0 |
| wasm | late | 732.41 → 738.09 | +0.78% | 604.11 → 603.38 | −0.12% | 27 → 27 | 26 → 26 |
| wasm | miss | 1762.06 → 1656.60 | −5.98% | 1370.97 → 1277.17 | −6.84% | 297 → 297 | 296 → 296 |

The early hit completes in one Editor segment with zero settlements on both engines, confirming that a needle near offset zero returns before the first yield boundary. The late hit at line 852 produces 27 segments and 26 settlements. Line number alone does not predict search cost because the SDK can skip an entire line in a single seek operation. The miss query exhausts all candidate positions, producing 297 segments and 296 settlements — the most of any class. The difference between elapsed and CPU times reflects the scheduling boundaries: for example, the rv32 late hit spends 54.23 ms elapsed but only 39.54 ms in Editor CPU, with the remainder in scheduling across 26 settlements.

The equal segment and settlement counts between arms demonstrate that the two implementations take equal numbers of cooperative turns through the host for each query class. These counts do not establish that suspensions occur at identical byte offsets or that the implementations are equivalent across all possible workloads.

## 7. State Words

The await Editor declares 57 state words and the compiler generates 13 additional words, totaling 70. The manual Editor uses 71 state words. These counts cover the entire application, not just the search function. The 13 generated words include control metadata for both of the application's cooperative tasks. The title length, which previously occupied its own state word, was moved into an existing spare SDK buffer cell, contributing to the one-word net reduction.

## 8. Visual Equivalence

Both engines produce exactly one distinct screenshot hash per captured frame across all six physical runs (three manual, three await). The await Editor's visual output matches the manual Editor for every compared frame on both engines.

## 9. Limitations

Each Find query class has one physical trial per engine per arm. The workflow layer has three trials per arm and shows tight clustering, but the query layer does not support statistical inference. No hardware logic analyzer, key-to-pixel latency, or source-level instruction profile was collected. The physical sample timing is exploratory throughout.

## 10. Conclusion

The generated await transformation achieves equal cooperative turn counts, matching visual output, and no measurable runtime penalty on the integrated Editor workflow for both execution engines on the PicoCalc P4. The await arm uses one fewer application state word than the manual arm, while the native RV32 program grows by 370 words and the Wasm binary by 667 bytes. The cost is in compilation: +44–54% in time and +46–51% in peak memory, with the rewrite phase's input reading and operation scanning accounting for the majority of the added time. Because compilation runs on the P4 itself, this overhead is a material constraint. The first cold compile measurement missed the prespecified 10% gate. A later physical compiler experiment reused tokens and original source spans. Its three cold native builds had a median of 2.725 seconds, 3.01% above the handwritten reference. [Subsequent compiler screening](../../../20/PICOCALC-LEXICAL-INDEX--index-typed-source-once-for-the-cold-picocalc-compiler/various/physical-comparison-composed.json)

The implementation team supplied the measurements for this independent article. The companion ticket is `PICOCALC-EDITOR-ASYNC`. [Verified inputs](../sources/verified/editor.md) · [Researcher's investigation diary](../reference/04-independent-editor-diary.md)
