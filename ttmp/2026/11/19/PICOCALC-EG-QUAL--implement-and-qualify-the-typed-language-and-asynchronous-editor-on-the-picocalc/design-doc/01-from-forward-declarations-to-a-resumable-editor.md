---
Title: From forward declarations to a resumable Editor
Ticket: PICOCALC-EG-QUAL
Status: active
Topics:
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-world.js
      Note: SDK signatures and typed world entries
    - Path: repo://picocalc-os/port/esp32p4/main/typed_p4.c
      Note: Times and returns each on-device compilation
    - Path: repo://picocalc-os/worlds/editor/source.list
      Note: Defines the application sources under qualification
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:25.834084183-05:00
WhatFor: ""
WhenToUse: ""
---

# From forward declarations to a resumable Editor

## Follow an Editor request

Editor receives a WorldEvent, a persistent WorldState, a transient output buffer and a transient hints buffer. Reading a file returns a token. The successful issue of a request and the eventual completion arrive in separate invocations of the event handler. Only the persistent state survives between them. Generated continuation code must remember scalar values that will be read later and obtain fresh buffers upon resumption. Our experiment migrates both Open and Find to this model and qualifies the language and application code at their normal entry points.

```text
typed program              host and physical ESP32-P4
    │
    ├─ signatures and call edges ── reject recursive cycles
    ├─ async bodies ── control flow ── live variables ── frame fields
    └─ synchronous bodies and generated resume entries
            ├─ Wasm world linker ── Wasm module
            └─ RV32 lowering ── native ELF
                    ↓
           world event → issue → kernel → completion → resume
```

Editor Find supplies the running example. A character offset in a UTF-16 array and the position of a displayed Unicode code point are both integers. E7 gives them different types at compile time. E6 lets the compiler spot a missing search phase. A search that consumes a slice of 1,024 work units yields to the kernel. Some positions still matter on the next call. G1 finds the variables whose current values can be read in a successor block before being reassigned. G2 writes them into the generated frame before issuing the token. By the time G4 migrates Find, a test must be able to distinguish the results of two different searches whose completions arrive out of order.

## Implementation boundaries

- **E1–E4** extend the shared statement and expression parser with else, for, break and strict inequality. Check equivalent loop bodies, nested exits, skipped side effects and both targets.
- **E5** collects function signatures in source order and detects cycles in the call graph. The host compares existing output bytes before changing any app. The P4 measures the cost of learning about declarations before compiling their bodies.
- **E6–E7** add exhaustive enumerations and distinct integer units. Negative fixtures must exercise missing cases, unrelated enum members, incompatible units and mistaken conversions. The emitted integer representation remains four bytes.
- **G1–G2** analyze the control-flow graph of an asynchronous body, compute liveness, lower it, and expose the resulting layout and transformed source for inspection. A task can await a reactor request or an async child. Validate early failure, nested calls, competing roots, cancellation and duplicate completion on both targets.
- **G3–G4** replace the manual progress of Editor Open and Find. Include normalization through repeated 4,096-unit slices and repeated search yields. Shared application state includes values the view or cancel handler reads. Generated fields count toward the 80-scalar ABI limit and the professor's 71-field prediction.

The production frontend lives in `picocalc-os/compiler/typed-wasm.js`. Both the byte-oriented Wasm emitter and numeric RV32 emitter accept the typed language there. `typed-rv32.js` emits and links machine instructions. `typed-world.js` specifies the 28 import signatures and two public entries. `typed-async.js` is the source-level continuation compiler. `picocalc-os/port/esp32p4/main/typed_p4.c` creates and times a new QuickJS runtime on each device compile. `worlds/editor/source.list` specifies the Editor's compile order. The rest of the OS is the environment in which this compiler-generated application runs.

## Measurements and acceptance

Freeze the existing compiler, application, reactor and board config at project revision `289281c`. Generate baseline and candidate firmware with the same SDK and application reservation. Qualify each target alongside the other target. Three samples per engine allow a middle observation and make alternation meaningful. Report exactly what the board ran, how long the compiler and loader took, each frame digest and Editor CPU time during the workflow. Namespace each temporary test directory and verify its cleanup before the next sample. Preserve the factory partition before a flash, and restore the three original native worlds after the board window.

```text
for each compiler revision:
    run the historical 24 host replays
    independently run the new language and scheduling fixtures
    for trial in the balanced sequence of Wasm and RV32 engines:
        compile and load Editor on the board
        replay edit, search, preview, cancel, and save
        validate returned data and compare screenshot digests
        record compiler time, peak heap, loader time and Editor CPU
    repeat whole-document search for an early hit, late hit and miss
```

The primary comparison is canonical hand-written versus generated Open and Find. All thirteen Editor workflows must still pass on both targets. Native compile and workflow CPU have a predicted maximum increase of 10%, E5 has its own maximum compile increase of 5%. A measured miss is reported along with the failing input and any fix that actually changes the result. Real early and late events and deterministic injected deliveries are identified separately. CPU from a world statistics row includes all its turns during the window. Time spent between issuing a search and observing its completed result also includes scheduling.

## Reproduction

`scripts/02-prepare-images.sh WORK REV IDF_EXPORT LANE` creates a detached clone under WORK, builds both firmware images and validates their manifests. Run each research script from the project root. The control and candidate differ at named source revisions. Physical receipts contain aggregate measurements and frame digests. Full flash backups remain in local scratch storage.

Read the professor's Scope E and G design documents alongside the three implementation tickets for the precise language syntax and state-machine transition rules.

### Run the smallest examples on a development machine

From the repository root, run the six-case language example first. It compiles typed source through the real frontend, instantiates the result as WebAssembly, and calls the exported function with ordinary JavaScript numbers. Then run the continuation harness with a copy of the original compiler and Editor. It compares every UTF-16 unit in the working buffer after each of four settlements, checks cancellation and stale tokens, and compares the layout seen by both targets.

```sh
node ttmp/2026/11/19/PICOCALC-EG-QUAL--*/scripts/27-check-guide-example.mjs
baseline_dir=$(mktemp -d)
git archive 289281c picocalc-os/compiler picocalc-os/worlds | tar -x -C "$baseline_dir"
node ttmp/2026/11/19/PICOCALC-NATIVE-NEXT--*/scripts/14-check-async-layout.mjs "$baseline_dir"
```

For the full application suite, pass the absolute paths to the ESP-IDF RISC-V GCC executable and the CJI RV32 emulator as the two arguments to the professor's script. It builds the host runtime and reactor artifacts and reports each of 24 workflows individually. On a fresh checkout, build the emulator from the CJI source first if its executable is absent. The script header names the expected location. [Frozen suite](../../PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/scripts/01-run-host-replays.sh)

The physical clock starts earlier than any of these host test functions: it includes creating the runtime and linking the Editor module. The long Find observer instead starts when Enter reaches Editor and stops when a retained frame contains the terminal search status. Comparing these durations answers different questions. [Board workflow](../scripts/03-board-qualification.py) · [Find observer](../scripts/05-find-observer.inc)
