---
Title: Designing and validating compiler optimizations with a trace REPL
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: The lab director's synthesis of the compiler evidence, persistent runtime and nine blinded investigations.
LastUpdated: 2026-11-21T16:00:00-05:00
WhatFor: Teach a newcomer to turn a compiler observation into a falsifiable optimization experiment.
WhenToUse: Before proposing a Typed raytracer optimization or using the workbench to evaluate one.
---

# Designing and validating compiler optimizations with a trace REPL

Two consecutive LLVM dumps show the number of loads of a buffer's capacity falling from eleven to six. On the PicoCalc, changing one part of the raytracer's inner loop to use packed arithmetic saves 242 microseconds on the default scene. An engineer reading the two results might ask how much faster the raytracer would become if our compiler adopted LLVM's load optimization. We can reproduce both observations. Neither experiment measures the effect in that question. Designing the experiment that *would* measure it is the purpose of this workbench.

We built a persistent JavaScript research interface in Go. Three researchers studied the compiler evidence, the lifetime of an investigation and the conclusions engineers drew with the interface. Nine blinded agent sessions supplied the usability observations. This chapter follows one optimization from its initial static evidence to a proposed physical test, then examines how the research interface itself affected the conclusions.

## Follow one ray through one row

The application renders a scene of spheres a row at a time. For each relevant pixel and sphere, the renderer evaluates an intersection, compares its depth with any previously accepted hit and updates the working buffers. Additional work lights and shades the scene and produces the frame. A change confined to the intersection loop can accelerate the primary rendering stage while having a smaller effect on the complete frame.

The PicoCalc runs an ESP32-P4. Its native compiler lowers the project's Typed JavaScript dialect to RISC-V machine code. The P4 also has packed instructions called PIE. One packed subtract can operate on eight 16-bit values. For the experiment here, the compiler has to preserve the outcomes of a scalar algorithm, including how it treats negative intersections, out-of-bounds positions and memory overlap. Executing eight subtractions in one instruction changes only part of the work. Preparing the inputs, checking eligibility and consuming the eight results still take instructions.

The archive contains several related programs. One is a checked C model of the row calculation analyzed with LLVM. Others are images of the actual Typed program. The LLVM intermediate representation, or IR, makes operations such as loads and branches explicit before machine code selection. A compiler pass reads or transforms that representation. The printed state after a pass can tell us what text the compiler produced. An emulator can count which machine instructions ran on a supplied input. A board timer measures elapsed time on its hardware. Each answers a different experimental question.

The three collections have different units of observation. The diagram gives the identifiers to retain when combining them in a report.

```text
checked C row ── LLVM passes ──> printed state    (variant, stream, ordinal, bytes)
              └─ RV32 execution -> guest counts   (C arm, fixture, region, unit)
Typed source ─── RV32 execution -> guest counts   (Typed image, fixture, region, unit)
              └─ P4 trial ──────> microseconds   (image, scene, phase, paired block)
```

## Establish exactly what LLVM changed

In the checked C model, the address of the working buffer arrives as the first argument to the row function. The buffer's first field is its capacity. On this specific representation, loading a 32-bit integer directly from that argument reads the capacity. That gives the researcher a defensible selection predicate. Counting every load in the function would also include depths, sphere fields and lookup-table entries.

```js
const row = a.variant("checked").function("row")
const middle = row.timeline("middle")
const capacity = q.ir.instructions()
  .opcode("load").resultType("i32").pointer(row.argument(0)).count()

const decreases = middle.measure(capacity).changes()
  .where(change => change.status === "known" && change.delta < 0)
const firstDecrease = q.run(decreases.first())
firstDecrease
```

The first four statements build reusable definitions. The metric says which instructions count. The timeline selects ordered observations in the checked middle-end run. The predicate consumes change records. Evaluating the completed query produces the first corresponding change and its witnesses. The following table contains the crucial parts of those witnesses. The byte intervals refer to the verified, uncompressed checked middle-end log and exclude the final endpoint.

| Event | Last transformation | Bytes | Direct capacity-load sites | Trap-call sites |
|---:|---|---|---:|---:|
| 73 | SROA | [231496, 240363) | 11 | 11 |
| 74 | EarlyCSE | [240363, 248127) | 6 | 11 |

EarlyCSE is an early common-subexpression elimination pass. Five static load sites disappear between those consecutive prints. Both prints cover the whole function. All eleven trap-call sites are still present, so removing a redundant read of the capacity and removing an observable bounds check are experimentally distinguishable. The archive has no matching EarlyCSE-disabled execution. From this pair alone we cannot assign saved cycles, dynamic loads or frames per second to the transformation. [Independent reader and reference values](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/scripts/13-verify-evidence-article.py)

There is an instructive failure case only fourteen events later. Event 88 prints the loop headed by `for.cond`. The header contains no enclosing function, although an earlier event and the spelling of its blocks suggest `row`. The released API reports the function as `null` and records that suggestion in `ownerHint`, identifying event 87 as its anchor. Asking for a whole-function count on the partial print returns `unavailable` with the reason `loopFragment`. Filtering a timeline must also preserve original ordinals. Two appearances of EarlyCSE separated by other passes cannot establish what the second invocation did by itself. A range and a reason are useful results even when no count is justified. [Loop witness reconciliation](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/various/usability-loop-reconciliation.json)

## Compare the Typed implementations on identical inputs

The dynamic comparison uses 160 valid row inputs from the opening scene. Stock is the ordinary Typed compiler output. Matched scalar and PIE share a different implementation of the hot region, including its admission rules and the consumer of the generated lanes. Their producers differ. One prepares the lanes with scalar arithmetic, the other uses packed operations. Thus stock versus PIE measures the whole change to the region, while matched scalar versus PIE asks a much narrower question about its producer.

| Typed image | Executed interpreter steps | Direct stack loads | Direct stack stores |
|---|---:|---:|---:|
| Stock | 3,608,697 | 936,328 | 353,778 |
| Matched scalar | 3,199,910 | 729,553 | 309,611 |
| PIE | 3,131,435 | 729,553 | 309,776 |

Moving from stock to matched scalar saves 408,787 interpreter steps, or 11.33% of stock. Total direct stack accesses fall by 250,942. Dividing that difference by stock's 1,290,106 direct stack accesses gives 19.45%. Dividing it instead by the entire 408,787-instruction reduction gives 61.39%. The denominators answer different questions. Neither calculation establishes that a particular register allocation caused the reduction. Several compiler decisions changed together. An access relative to the stack pointer might be a saved register, a local, a temporary or scratch space. The aggregate gives no program counter with which to identify those uses.

PIE saves a further 68,475 interpreter steps relative to matched scalar. Total stack traffic scarcely moves for that comparison. The hardware study independently records a median 242 µs saved per clean frame on the default scene for matched scalar versus PIE, and 1,616 µs for stock versus PIE. Across the twelve scenes, each with six paired blocks, the per-scene median saving for the narrow comparison ranges from 0.4095% to 0.4663%. The decision cell tests a claim that this change saves at least 1% on every measured scene. All twelve fall below the threshold. A small positive result and a rejected one-percent claim describe the same observations. [Executable decision cell](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/scripts/11-test-optimization-claim.js) · [Per-scene results](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/various/device-claim-release.json)

The hardware table can be inspected directly in the same JavaScript session. Keep the two observations from a block paired even when the two arms ran at different times. Opening up this small intermediate table before computing any median makes it possible to spot a missing block or a mismatched scene.

```js
const trials = hardware.pairs("scalar", "pie", "clean")
const opening = trials.filter(r => r.pose === "default")
opening.map(r => ({
  block: r.block, savedMicroseconds: r.savedUs,
  savedPercent: r.savedPct, rawRows: [r.baselineRow, r.candidateRow]
}))
```

## Keep the investigation alive

The host starts a Go process that verifies and retains six streams totaling 30,912,391 uncompressed bytes. Each investigator opens a separate JavaScript VM using go-go-goja. A VM owns lexical variables, closures, query plans, measurement caches and materialized answers. A later HTTP request naming the same session can evaluate `firstDecrease` without rebuilding the earlier definitions. Closing the session discards these values. Restarting the process ends every session. The recorded source bytes and measurements live on disk and can be reopened.

On the corrected service a fresh VM took 123.18 ms to evaluate the load-change query over an already running archive. Seven further evaluations of the same plan returned the identical serialized witness with a median round trip of 1.88 ms. Reading its saved result took 0.38 ms. Independent cache-counter checks on the frozen baseline showed what that distinction meant: rerunning the two measurements hit two snapshot entries and two value entries. Reading the saved answer touched none of those caches. These host times include HTTP and serialization and describe one local configuration. They measure the cost of following a question through the REPL. The P4 measurements above describe executing the generated program. [Timing samples and witness](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/various/session-reuse-release.json)

## Test what the researcher concludes

We issued four baseline task cards in independent Pi sessions, repeated them with fresh investigators on the corrected build, and added a fifth, held-out allocator task. All nine used DeepSeek 4.1 Flash at high thinking effort and could query only through the public tool. Across the sessions the investigators attempted 122 calls. The lab harness delivered 119 evaluations and refused three calls after a card's limit. The tasks, public replies, final answers, build hashes and an independently checked raw-loop witness remain available. Worked examples supplied some names and ordinals. A successful lookup demonstrates use of the interface. It has less evidentiary weight as a test of unaided discovery. [Protocol and iteration history](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/playbooks/01-running-blind-compiler-engineer-persona-sessions.md)

The three primary baseline investigators found all fourteen numerical or identification targets. Two nevertheless reported unsupported additional conclusions. One counted block labels among the functions. Another queried for loop events, saw zero and concluded that none existed. In fact the checked stream contains 42 loop events. The corrected release identifies 42 in each of checked and unchecked middle-end output and 438 in the firmware capture. In the last case 437 prints begin with an explicit loop preheader. The remaining event names an invalidated loop and prints its containing module. Counting subjects and counting a particular kind of printed body produce different totals. One final cross-build replay accounted for every one of the 45 added observations in the checked row timeline, from 99 to 144. It found 42 loop subjects, two module prints and one function print at ordinal 144. The ordinal 144 and the count of 144 observations refer to different quantities. [Cross-build reconciliation](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/various/usability-timeline-reconciliation.json)

The fresh pass investigator distinguished a fragment with unavailable whole-function state, an unknown transition after a partial print and a gap created by filtering events. The held-out allocator investigator located both virtual-register rewriter events, at ordinals 74 and 78 in the backend stream. The machine property `NoVRegs` was false and then true. That establishes whether virtual register operands remain in those two printed states. It supplies no dynamic count of executed spills.

The follow-up optimizer correctly distinguished the bundled scalar arm, chose the right denominator for the 19.45% result and asked for instruction-address evidence. It still tried to project from timings of a rendering stage across scenes and emulator work for a single row to a complete-frame sensitivity. Those populations differ. Joining them requires measurements on corresponding scenes, stages and treatments. There was also a smaller arithmetic error: with 72 observations the participant selected the upper middle percentage; the usual median averages the two middle values. Correcting that formula alone would leave the mismatch between workloads intact. Both services exposed the board data. Its use in the second investigator’s response reflects what that participant discovered and chose to query. This remaining error limits what we can claim about the tool and about nine single-run personas. We found specific failures, fixed reproducible defects, and observed better reasoning on specific questions. A general improvement in researcher accuracy would require repeated independent trials.

## The compiler experiment I would fund

Give a treatment in the scalar backend one explicit change: retain two identified hot intermediate values in registers. Choose those values by first collecting per-instruction execution counts for the stock and matched scalar builds and classifying the hottest stack addresses against the disassembly. Record which loads are eliminated, which stores remain and which new moves or spills the change introduces. Emit a build identity for each treatment and record its checked-access contract, source digest, code bytes and cold compilation cost.

1. **Control the transformation.** Compile the same Typed input with the scalar backend with and without the new rule. Keep the packed producer fixed. Record the per-function instruction changes with the same code and data layout conditions wherever possible.
2. **Prove the observed output is equivalent.** Compare all original row fixtures byte for byte. Add held-out scenes and invalid-index, aliasing and boundary cases. On a failing input, compare the first trap and the externally visible writes preceding it.
3. **Measure the relevant population.** Count executed instructions by program counter on identical row inputs. Measure primary-stage and whole-frame time separately on the same physical scenes, pairing runs by block and retaining their order. Include compiled image size and on-device compilation cost.
4. **State when to decline the change.** Reject an output or trap difference. If stack accesses fall but the physical primary-stage median fails the chosen per-scene criterion, report both outcomes. If only the full-frame criterion matters to the application, decide the threshold before examining those results.

This is what the lab produced beyond a query interface: a concrete compiler experiment, an identified gap in the evidence needed to run it, and an existing threshold claim that the archived measurements already refute. The workbench currently analyzes captured experiments. New compiler variants, new executions and new physical observations must still be produced and identified by their respective harnesses. [CLI and session protocol](/home/manuel/code/wesen/2026-10-20--ds-js-os/cmd/trace-repl/README.md) · [Original specification and workbook](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/reference/05-original-language-specification-and-workbook-concordance.md)
