---
Title: Fast compiler alternatives investigation diary
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/analysis/03-fast-paths.md
      Note: Fast-path comparison and recommendation
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/scripts/fastpath/03-run-quickjs.py
      Note: Reproduces timing and replay for the complete manifest
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/scripts/fastpath/05-check-typed-wasm.mjs
      Note: Compositor differential and boundary cases
ExternalSources: []
Summary: Investigation and verification of the existing QuickJS path and a typed direct WebAssembly emitter.
LastUpdated: 2026-11-18T16:16:12.258387197-05:00
WhatFor: Explain why these experiments distinguish compile cost, runtime semantics and application execution.
WhenToUse: Read to investigate the timing boundaries, reproduce the host trials or extend the direct emitter.
---

# Fast compiler alternatives investigation diary

## Step 1 — Identify the cheapest existing PicoCalc compilation path

I read the QuickJS boot binding alongside the physical installer and native loaders. The JS path is already a baseline compiler plus interpreter. The CJI path spends most measured time generating and optimizing SLIR before it assembles a different execution format. I investigated both without treating an interpreter result as a native performance win.

### Prompt Context

The authored request is quoted in [the architecture diary, Step 1](01-architecture-and-board-investigation-diary.md#step-1--change-the-design-question-and-define-the-comparisons). The fast-path investigation owns a real catalog compile and replay, primary-source comparison and a recommendation for a deployable dialect baseline.

### What I did

- Read `nucleus/vm.c`, `kernel.c`, both native backends, `sdk/nw.h`, `sdk/nw_elf.h`, the firmware CMake files and prior hardware reports.
- Identified `JS_Eval` with compile-only, `JS_WriteObject`, `JS_ReadObject` and `JS_EvalFunction` as the API-level mechanics underlying the relevant part of `qjsc`.
- Checked the stock serial console. Reported to the board owner that `bench`/`cachestat` combine parse and execution for hardcoded workloads, and `cji check` invokes the optimizing compiler. A private diagnostic can isolate the phases.

### Why

A QuickJS source baseline separates parsing and execution costs from the expense of CJI's analysis and machine code generation. The resulting app stays in the kernel's real JS binding, so existing clock, capabilities and events are available for behavioral validation.

### What worked

The repository already vendors QuickJS 2026-06-04, and the host Makefile provides matching compile flags. The interpreter and artifact can be tested with the same source bytes as the existing firmware.

### What didn't work

A standalone 32-bit C compilation check with `printf '#include <stdio.h>\nint main(void){return 0;}\n' | gcc -m32 -x c - -o /tmp/p4-fastpath-m32-probe` failed with `fatal error: bits/libc-header-start.h: No such file or directory`. The host report uses native x86-64. The board owner can test actual RV32 and real PSRAM.

### What I learned

The old CJI physical compiler receipts and a new QuickJS timing answer different questions. Keep source-to-artifact, activation, run/turn budget and input delay separate. The current WASM path has software validation, bounds and metering. The P4 ELF path runs trusted instructions on the kernel task.

### What was tricky to build

Kernel JS worlds evaluate the prelude in each runtime. The compiler can create independent serializable bytes, but it cannot move a live JSValue between runtimes. Bytecode reading creates ownership in the destination runtime.

### What warrants a second pair of eyes

Look for discarded boot time hidden outside the measured source parsing calls. Review whether the new compiler's artifact loader obeys existing world ranges, local capability accounting and ownership lifetimes.

### What should be done in the future

Use the private board probe before making latency claims on the device. Compare validated Wasm against direct CJI output when a realistic typed app exists.

### Code review instructions

Start at [Fast paths](../analysis/03-fast-paths.md). QuickJS API and native bridge source links are inline.

### Technical details

The vendored patch changes the interrupt polling interval and stats access, plus ESP-specific timezone handling. This build uses bytecode format identifier 5. That number alone is insufficient as a cache compatibility or trust check.

## Step 2 — Compile and replay the unchanged catalog

I built a QuickJS API probe and an independent source/bytecode simulator test under temporary directories. The probe compiles each source, serializes it, frees that runtime, and reloads into a fresh runtime. The replay links the same kernel and engine objects twice and substitutes only paired, immutable boot scripts in one variant.

### Prompt Context

See Step 1. The requested evidence includes source size, output size, observed timings and proof that real apps do useful work from the produced artifact.

### What I did

- Wrote `01-compile-quickjs.c` for phase timings, allocator peak measurements and output equality. Wrote `02-replay-quickjs.c` to replace only known filename/source pairs in the experimental simulator.
- Wrote `03-run-quickjs.py` to reproduce the catalog build and existing event scripts. The tests use the same source runtime engine, scheduled inputs, UTC clock, seed files and fresh persistent store.
- Retained a compact host receipt with artifact/source digests, phase medians, p90 and maxima, size trials and exact replay hashes.

### Why

The compile-only API should accept the whole bundled catalog, but syntax acceptance cannot detect prelude or binding errors. Replay through the real kernel tests scheduled events, dispatch, screenshots, files/store changes and error handling. Per-fixture substitution markers ensure all 23 planned artifacts are used.

### What worked

All 22 manifest worlds and the prelude returned byte-identical artifacts across fresh compile contexts. The final run passed ten paired workflows. 58 of 59 screenshots matched exactly. The About delta mapped to the heap-count display. Unchanged transcript, file and store digests were verified after recording the documented allocator-derived values separately. The complete host test used `python3 "$ticket/scripts/fastpath/03-run-quickjs.py" --work-dir "$work" --jobs 3 --output "$ticket/various/fastpath/quickjs-host.json"` from the repository root. The receipt identifies x86-64 GCC 13.3 and records 21 samples per source.

### What didn't work

- The initial whole-output assertion stopped at `RuntimeError: boot differs in stdout`. Only the simulated per-world heap fields changed. Boot visuals, UART, filesystem and measured virtual turn/bus counters matched.
- The next run stopped at `RuntimeError: repl differs in uart`. Its structured fault record reported `"mem_kb":214` versus `"mem_kb":204`. The deadline timestamp, exception and stack were identical.
- The first Faults run stopped at `RuntimeError: faults differs in stdout`. The deliberate sandbox OOM moved from 2536.098 to 2536.099 virtual ms and cumulative sandbox CPU from 201.20 to 201.21 virtual ms. Kept the OOM timestamp and CPU values in the receipt and added a narrow tolerance for the named fault.
- The first Keys run stopped at `RuntimeError: keys differs in screens`. Only `41-about.png` changed. About sums `w.mem_kb`; comparing the RGB buffers found changed pixels only within `(260, 464, 294, 480)` at 2× scale. The final runner requires the delta to stay within the field and preserves both PNG digests and the actual bounding box.

### What I learned

Snapshot memory differed even while QuickJS's interpreter instruction path and kernel schedule mostly matched. This can leak into diagnostics and can change the exact boundary of allocation exhaustion. Do not normalize those differences away in application requirements. Default debug-preserving bytecode occupied 540,509 bytes versus 278,453 bytes of source. Strip-source trials changed the security/diagnostic/size tradeoff and are excluded from the event replays.

### What was tricky to build

The same linker symbol also serves the two hardcoded `calibrate.js` expressions, so the wrapper lets those through unchanged. QuickJS's internal sandbox eval is ordinary source eval as before. Compiled-in bytecode is paired with its own source, so the experiment cannot accidentally test the normal source path for one bundled app.

### What warrants a second pair of eyes

Confirm that the source/bytecode comparisons only normalize the expected quantities. The host's virtual CPU column reflects interrupt-counter work and kernel charges, so its equality does not predict actual board performance.

### What should be done in the future

If distributing bytecode, use a trusted build artifact or an authenticated private cache. Test source/bytecode behavior under real PSRAM and world memory caps before changing boot defaults.

### Code review instructions

Run both commands in [scripts/fastpath/README.md](../scripts/fastpath/README.md). The paired results live in [quickjs-host.json](../various/fastpath/quickjs-host.json).

### Technical details

The two load paths preserve script names and full debug info. The C probe's allocator models glibc rounded usable block size plus eight bytes, including a fresh default-intrinsics context baseline. It does not model RV32 allocation.

## Step 3 — Compare portable and native baseline implementations

I read primary sources for direct compiler emission and tried to map each alternative to an existing kernel integration boundary. Several systems solve parsing cheaply. The local question is which runtime and trust model can preserve PicoCalc's world effects and support a useful typed numeric subset.

### Prompt Context

See Step 1. The alternatives need to be weighed against QuickJS lowering, a new compact interpreter, direct machine code and host typed AOT compilation.

### What I did

- Read the QuickJS manual, Lua parser and code emitter, the Sparkplug compiler description, the WebAssembly validation algorithm and AssemblyScript's language and compiler documentation.
- Compared each route's frontend passes, emitted format, runtime/interpreter, artifact validation, ABI, platform costs and likely post-boot bottlenecks.

### Why

Choosing an alternative is useful only if it removes the actual cost and explains where the cost goes. A typed transpiler to ordinary JS can inform language design. Wasm can improve local machine representation while preserving a software boundary. Native templates can serve trusted workloads with their own ABI and publication restrictions.

### What worked

The existing WAMR binding supplies a credible target for application-scale comparison. It keeps module bytes alive, validates imports and loads code with separate linear memory and instruction metering. The conclusion and sources are in [Fast paths](../analysis/03-fast-paths.md).

### What didn't work

Opening the full W3C Wasm spec HTML returned `(400) Content length is too large: 16777217+`. The WebAssembly group's separate [Validation Algorithm](https://webassembly.github.io/spec/core/appendix/algorithm.html) provides the needed primary source and algorithm.

### What I learned

A new compact bytecode needs its own verifier and runtime. Direct RV32 emission can remove dispatch and costly proof but does not itself establish a sandbox on the P4. WAMR is already in the current firmware and remains a cheaper integration target to test first.

### What was tricky to build

The native world ABI, Wasm ABI and QuickJS binding are distinct. A portable producer still has to supply the world ABI exports, and language-level bool and integer semantics are not implied by Wasm's host FFI.

### What warrants a second pair of eyes

Check Wasm opcode/feature compatibility with the vendored WAMR configuration. Watch aggregate runtime/host bridge allocation and elapsed time independently of linear memory and Wasm instruction counts.

### What should be done in the future

Test the minimum typed compiler against a kernel-facing world bridge with per-operation deadlines. Use source-level differential behavior and collect physical device UI latency.

### Code review instructions

Trace the boot and runtime progression in [Fast paths](../analysis/03-fast-paths.md), then read [the Wasm bridge](../../../../../../picocalc-os/nucleus/native_wasm.c).

### Technical details

The validator can run against structured blocks and operand/control stacks. Threaded or unstructured custom bytecode must also check target alignment, equal stack state at merges, local indexes, constant bounds and import signatures.

## Step 4 — Try a typed emitter against the compositor's scroll function

I built a host-tested prototype which parses a small explicit type system and emits structured Wasm directly. Retaining the original body of `scrollStart` means the differential exercises an actual repository function. Counterexamples make the contract changes in arithmetic and truthiness observable.

### Prompt Context

The investigation was asked to add a direct compiler prototype and test its output, including a real app kernel and numeric/boolean boundary behavior. The board owner requested a script with no Node dependencies so the same compiler could run in PicoCalc's QuickJS.

### What I did

- Implemented `04-typed-wasm.js` with a scoped token parser, explicit I32/Boolean types, local slots, per-function binary output, short-circuit code and fixed signed min/max intrinsics. It publishes `compileTyped(source)` as a global taking source text and returning Wasm bytes.
- Annotated the original compositor function in `scroll.typed` and verified that deleting annotations gives the exact original function body. Added the host differential and raw artifact evidence.
- Sent the compiler, input and Wasm identities to the board owner for an independent QuickJS/WAMR check.

### Why

The compile cost of this subset comes from lexing, type-checking expressions and emitting the operations, providing a concrete alternative to CJI's whole-program proofs. The direct emitter needs no AST or interpreter by itself because Wasm's existing runtime executes the result.

### What worked

`node "$ticket/scripts/fastpath/05-check-typed-wasm.mjs"` validated the 118-byte module in Node/V8 and matched 667,780 bounded scroll cases against the unmodified JS function. Numeric counterexamples, explicit boolean arguments, literal range errors, type diagnostics and short-circuit traps passed as well. The emitted module has SHA-256 `1f33714cf1dd24f7926bf8995326e92c1da0b67686d3198d9aaea07a38ab0685`.

### What didn't work

The initial test URL used six parent directory traversals and produced `ENOENT: no such file or directory, open '/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/picocalc-os/js/system/compositor.js'`. The correct relative path from `scripts/fastpath` uses seven. The fixed entrypoint then ran the actual repository code.

### What I learned

The scroll function's normal input domain retained behavior even though out-of-domain I32 inputs can wrap where JS produced a large positive number. The compiler's explicit Boolean contract must be enforced at ABI entry. A raw Wasm function with an I32 parameter cannot distinguish `true` from an integer word. Wasm typed arithmetic can preserve the chosen language contract at low mechanical cost.

### What was tricky to build

Short-circuit operations need an emitted control construct to skip the RHS, and both expressions must still pass static checks. Min/max stores each evaluated operand in a temporary to avoid duplicate evaluation of a trapping expression. The evaluator compares the emitted bytes in both entry points so the duplicate host and device invocation paths cannot drift.

### What warrants a second pair of eyes

The implemented language is deliberately a leaf-level subset. It lacks strings, arrays, loops, closures, interfunction or host calls, a world ABI adapter and source-to-Wasm maps. Extrapolation of this result to all apps requires those features and their runtime budgets.

### What should be done in the future

Verify the same artifact and selected outputs in physical WAMR. Measure the direct emitter separately from loading and executing its final artifact. Add a world bridge and a representative larger app before claiming usable app compilation.

### Code review instructions

Start with [scroll.typed](../scripts/fastpath/scroll.typed), [the emitter](../scripts/fastpath/04-typed-wasm.js) and [the differential](../scripts/fastpath/05-check-typed-wasm.mjs). Exact source and bytecode identities, bytes and counterexamples are in [typed-wasm.json](../various/fastpath/typed-wasm.json).

### Technical details

All locals and results are Wasm I32. I32 add/multiply wrap and signed division truncates toward zero, trapping for zero or signed overflow. Only Boolean operands can participate in logical expressions. The bridge rejects coercion and requires exact arity.
