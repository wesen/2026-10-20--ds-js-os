---
Title: How to compare eight compiler designs on one ESP32-P4
Ticket: PICOCALC-COMPILER-LAB2
Status: active
Topics:
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Shared typed frontend and function emitter
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Native RV32 lowering and reactor linkage
    - Path: repo://firmware/port/esp32p4/main/typed_p4.c
      Note: Device timing and allocation accounting
ExternalSources: []
Summary: Compare eight typed compiler designs and qualify a combined hardware build on the physical ESP32-P4.
LastUpdated: 2026-11-19T21:53:48.361282971-05:00
WhatFor: ""
WhenToUse: ""
---

# How to compare eight compiler designs on one ESP32-P4

The practical question is how long a programmer must wait between changing typed source on the handheld and running the resulting application. We will measure two distinct paths. A cold build starts a fresh compiler. An incremental build starts with an existing editing session and finishes when the processor returns from newly linked RV32 code. A smaller code image can improve the running application even if the compiler takes longer to produce it. Report each outcome separately.

## Start from code a newcomer can follow

The input is the same typed JavaScript used by the installed Files, Agenda and Editor applications. In `picocalc-os/compiler/typed-wasm.js` the lexer finds identifiers, literals and punctuation, and the function emitter checks types and produces operations. The Wasm backend encodes the operations for a stack machine. In `picocalc-os/compiler/typed-rv32.js` the native backend lowers function operations into register-machine instructions and links them into the reserved region of a reactor ELF. An ELF also contains the compiled C reactor, import stubs and padding. Counting RV32 words and measuring the whole file answer different questions. `picocalc-os/compiler/typed-world.js` binds a typed world to its SDK function signatures and exported entries. Files and the Agenda parser use their own wrappers. The hardware front door in `picocalc-os/port/esp32p4/main/typed_p4.c` creates a QuickJS runtime with a counting allocator and evaluates the compiler. Guest code runs subsequently on the P4.

```text
                                  +--> Wasm encoder --> replay on host
typed source --> lexer --> functions
                                  +--> RV32 lowering --> link into reactor ELF
                                                         |
                                                         v
                                                  relocate --> enter --> return
cold clock       [................. fresh compile .......]
edit clock       [edited text with session ready .........................]
```

The old staged native candidate keeps track of operand locations while processing a function. Its counts differ from the earlier production streaming backend. Qualify this exact lowerer against all 24 historical replays before interpreting work based on it. Pin the raw source digest of the native lowerer, all candidate sources, the input sources, the reactor, and finally the entire ELF. A firmware digest alone cannot establish which compiler ran per build. The loaders and applications depend on each other through entry stubs, imports, record field offsets and native call conventions. The historical replays include edited text, long documents, screen output and SDK interactions that a single return-value test misses.

## Experimental units and dependencies

| Study | Comparison | Most important falsification |
| --- | --- | --- |
| 1, frontend | Regex/cursor scanning crossed with fresh/reused token, then a parser that reads spans lazily | A lookahead token outlives the mutable record, an error offset changes, or an apparent win disappears on a fresh runtime |
| 2, conditions (A6) | Staged operand stack vs branches emitted for a condition’s actual destination | A skipped call or trap executes, or a materialized Boolean has the wrong value |
| 3, streamed typed operations | Staged vs observation with identical ELF vs one directly consumed operation | Observation changes output or nested evaluation loses a checked access |
| 4, incremental Editor | Warm clean vs fragment rebuild after three real edits, including a layout change | Eviction, stale type information or relocation changes even one accepted ELF byte |
| 5, register locals (A7) | Qualified A6 vs raw use count vs weighting for loops and calls | Physical guest cycles increase after accounting for callee-save traffic |
| 6, bounds (E8) | Ordinary checks vs direct guard vs a bounded two-hop proof | A mutation, wraparound or control-flow join invalidates the index proof |
| 7, admission | Source order vs literal eligibility vs predicted benefit per analysis visit | A frozen selector loses on a new application or when the budget becomes binding |
| 8, suspension (G) | Hand-written Editor Open vs compiled typed await | Late replies, cancellation, or an error leave a divergent application state |

Studies 1 and 4 can use the production compiler independently of backend qualification. Study 5 builds on study 2. Study 6 can use the typed access representation from study 3. Study 7 needs a frozen predictor and separate evaluation fixtures. Study 8 needs a source-level construct, its compiler and an actual Editor event sequence. It can begin from hand-written Open. Each study owns an intern guide, scripts, diary, candidate identity and evidence. Scope labels come from PICOCALC-NATIVE-NEXT. Study numbers here only prescribe this wave.

## Measurement and decision procedure

Use the same application source and the same reactor for both sides of each paired comparison. Measure long-running Editor work before drawing a general conclusion from a Files helper. Start with two physical boots. Alternate or rotate candidate order within each boot. Record the run order, application, time in microseconds, observed allocator peak, emitted RV32 words, ELF length and hash. For guest timing, use a named workload with specified inputs and report the cycle count separately from compilation and load. A short kernel measures that kernel. Report counts and the range across pairs alongside the median. Separate boots on one board do not establish a population estimate across boards.

```text
for each boot and counterbalanced block:
    initialize the requested compiler or prepare the declared parent revision
    record allocator and timer at the declared starting point
    compile the same input and obtain the ELF
    if this is an edit-to-return test: relocate, invoke, record return timestamp
    compare the entire ELF against a clean host oracle for that compiler and input
    check the specified guest effects and keep each observation
finally: restore the original factory region and verify the three native worlds
```

For a baseline value B and candidate C, savings in percent are 100 × (B − C) / B. Give the denominator and absolute units. Peak QuickJS heap measures live allocator requests at their maximum. A fragment budget can bound cached native words while metadata, retained text, the linker and the VM require additional heap. Report units and what each bound covers. Higher heap is an acceptable exchange for faster cold builds, faster edits, better guest code or simpler implementation. Physical allocation failure, platform capacity, output mismatch and changed application semantics have distinct meanings.

The previous ambition of saving 0.5 s on the roughly 2.45 s Editor cold compile is a target. Record the measured tradeoffs even if a target is missed. For an integrated candidate, compose changes only after differential semantic checks, rerun the 24 replays, then compile all three applications on the P4 with matched output oracles. Compare the combination with both the actual production build and its qualified staged ancestor. End-to-end time cannot be predicted by summing separate percentage changes. Compare edit-to-return, cold builds and guest work in separate columns. Check the restored factory image independently of the research control.

## Reproduction and sources

- `scripts/01-qualify-staged.py WORK GCC EMULATOR` creates a detached checkout, places the staged compiler in its normal import paths, reuses the host application runtime, and runs the professor’s original replay driver.
- `scripts/02-independent-opus.py OUT` sends eight separate frozen design questions via Claude Code and saves the reported model and each prompt digest. Treat its output as proposals to test.
- See the [original eight-study brief](../sources/eight-studies.txt), the [professor’s original task list](../../PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/tasks.md) and the [previous comparison](../../PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/index.md).

## Replaying the final arithmetic without the board

The board driver checks a full reference ELF digest for every compiler, application and block. The archived observation is `various/combined-physical.json`. The first command below validates its two native boots, 192 cold compiles and 384 guest batches, then computes the within-block distributions again. The second prints the absolute clocks alongside the paired percentages. Use a temporary output directory to compare the new tables or plot with the committed report.

```sh
# Run in this ticket directory.
python3 -B scripts/07-combined-results.py various/combined-physical.json /tmp/picocalc-comparison.json
python3 -B scripts/12-integration-table.py /tmp/picocalc-comparison.json various/combined-physical.json
```

The returned ELF of the native-only and combined lanes must match exactly for each application. A scanner change that changes those bytes would invalidate the attribution. The aggregation also checks that every arm used the same application source and reactor, every sample has the required digest and size, and every 128-call guest batch has its corresponding control. Each complete boot is summarized independently.
