---
Title: Measuring signature reuse in the asynchronous Editor compiler
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/05-signature-reuse-experiment.py
      Note: Prototype source and phase probes
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/various/signature-reuse/eval.csv
      Note: Fresh-context compiler script evaluation
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/various/signature-reuse/phase-timing-cpu.jsonl
      Note: Linked compiler CPU times and phase probes
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:56:22.463941245-05:00
WhatFor: ""
WhenToUse: ""
---
# Measuring signature reuse in the asynchronous Editor compiler

The continuation compiler reads the original typed program, then writes ordinary typed source that the existing Wasm or RV32 emitter can use. The original pass needs every function's type signature to check calls and record dependencies. The emitter then reads those signatures again in the rewritten text. An isolated prototype retained the first set of ordinary signatures and made the emitter read only the new continuation functions.

## How a signature survives a rewrite

Take a program whose ordinary function `bridge` calls `helper`, with an async function in between. The first pass stores their names, parameter names and types, result types and the text offset of each opening brace. Rewriting discards the async declaration and appends generated continuation functions. It can also insert fields into `WorldState` and expand calls to `start` and `resume`. Those changes move the opening braces in the rewritten file. Reading the original offset after the rewrite would start emission in the wrong body.

The writer tracks two offsets, the number of characters already written and the next original position it will copy. For an ordinary function, its signature and opening brace are copied before any replacement in the body. The new opening-brace offset is the written length plus the distance from the next original position to the original brace. The prototype records that offset and the existing types. On emission it assigns the ordinary functions consecutive ABI indexes, then reads the generated signatures from the appended suffix. The emitter still parses every function body and computes its own call graph. It also reads the rewritten record declarations, including the inserted fields.

```text
source signature     emitted body offset = written + original brace - next copied position
ordinary functions   new indexes follow their order in rewritten source
generated functions  scan only the appended suffix, then assign the next indexes
```

The prototype preserved the exact linked Wasm, RV32 ELF and raw RV32 image for Editor and for a fixture where ordinary and async definitions alternate. It also preserved record layouts, continuation metadata, relocated imports, exports and the call graph. The negative tests compared the original-source locations for an unknown function, an incompatible return type and a duplicate function. A fourth test compared the named cycle. The fixture uses an escaped quote, braces and a fake function delimiter in a buffer literal.

## How much time is recoverable

The measurement uses frozen repository revisions. The pre-G program and compiler are at `1357545`, committed November 19, 2026 at 23:39:02 EST. The complete async Open and Find program and compiler are at `7b321a9`, committed at 23:50:17 EST. The candidate changes only signature handling in a copy of `7b321a9`. The checked-out production compiler was untouched. Pre-G and G4 each use their own Editor sources, so the pre-G comparison measures the complete feature change. G4 and the prototype share one source.

The host is an Intel Core i7-1165G7 pinned to logical CPU 6. Each row is two blocks of nine compilations per variant following a warmup. The native entry is `compileTypedWorldRv32` with the same 240,452-byte reactor in every block. This clock measures process CPU time during the compiler call. It includes ELF linking and excludes both script evaluation and executing the generated program.

| Native compiler variant | First block median | Second block median |
| --- | ---: | ---: |
| Pre-G | 75.36 ms | 77.18 ms |
| G4 | 108.47 ms | 107.22 ms |
| G4 with ordinary signature reuse | 103.54 ms | 100.65 ms |

The best prototype block is still 30.4% above the slower pre-G block and exceeds the 84.90 ms limit calculated from that baseline plus 10%. The two observed savings against G4 are 4.93 and 6.57 ms. The earlier wall-clock run encountered substantial host load drift, so the primary comparison uses process CPU time and brackets the variants with a pre-G measurement at each end.

| Profile inside linked G4 compile | G4 | Prototype |
| --- | ---: | ---: |
| Source signatures and delimiters | 5.31 ms | 5.40 ms |
| Rewrite, including source scan | 29.12 ms | 30.01 ms |
| Emitter signatures and delimiters | 5.89 ms | 0.68 ms |

The instrumented run separates the pre-rewrite signature scan from the emitter's scan. Its measurements overlap with their enclosing phases. For example, the original signature pass is already part of `readProgram`, which is part of the rewrite subtotal. The duplicate scan accounts for a fraction of the extra compile time. The rewrite must still locate relevant operations and check what values live across a suspension. Avoiding one signature scan cannot eliminate those costs.

## Cost of evaluating the compiler scripts

The P4 native Editor path creates a fresh QuickJS context and loads `typed/wasm.js`, optionally `typed/async.js`, then `typed/rv32.js` and the world linker. The load experiment matched that evaluation order on the host. It pre-read the JavaScript text and separately timed context creation and the calls to `JS_Eval`. It never called the application compiler. Two runs of 21 fresh runtimes each, in opposite revision order, produced the CPU-time medians below.

| Compiler source revision | Native compiler scripts, CPU median | Wasm compiler scripts, CPU median |
| --- | ---: | ---: |
| `289281c`, November 19 at 23:20:11 EST | 3.746 ms | 2.362 ms |
| `1357545`, November 19 at 23:39:02 EST | 4.515 ms | 3.143 ms |
| `7b321a9`, November 19 at 23:50:17 EST | 7.579 ms | 6.362 ms |

The async script alone took a 3.074 ms native wall median. Context creation stayed near 0.13 ms in all three variants. Another run with the same warmup and reversed order produced 3.584, 4.371 and 7.561 ms of native evaluation CPU time.

The load difference is measurable and most of it comes from evaluating the continuation compiler itself. It is much smaller than the full host compile gap. Firmware boot receipts time a wider interval. Those receipts include bundle reading, runtime setup, the compiler call and output handling on the ESP32-P4, so the native workload's host timings do not establish the board's load fraction.

## Reproducing the experiment

Build the host QuickJS objects and Wasm reactor, then run from the repository root with an existing RV32 typed-world reactor.

```sh
make -s -C picocalc-os build/picocalc-host typed-world-reactor
sh /path/to/PICOCALC-LANGUAGE-E/scripts/09-run-signature-experiment.sh /tmp/signature-evidence /path/to/typed-world-reactor.elf 6
```

The driver extracts the three frozen compiler revisions, records their hashes and builds temporary instrumented copies. The [raw evidence](../various/signature-reuse/) gives individual samples and the fixture artifact hashes. The included Python staging script also supports reconstructing the prototype independently. The prototype remains a measured experiment because the saved signature work does not close the G4 compile gap.
