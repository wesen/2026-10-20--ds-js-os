---
Title: Architecture and board investigation diary
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T16:16:11.228680929-05:00
WhatFor: ""
WhenToUse: ""
---

# Architecture and board investigation diary

## Step 1 — Change the design question and define the comparisons

The performance target is a programmer editing a small world on the actual board. The previous experiments measured an optimizing, self-hosted native compiler. Permission to change the language lets us test separately the cost of proving JavaScript numeric behavior, the cost of generating native code, and the cost the application pays after it starts. Retaining the world interface allows these comparisons without changing the kernel or its capabilities.

### Prompt Context

**User prompt (verbatim)**

> we can move away from javascript semantics, especially if this is about preserving edge cases. We want a "JS like" language but don't need to maintain costly properties if avoidable.
>
> Do a fulll fundamental analysis and rethink and validate and research everything, you can use cheaper (much cheaper probably) subagents to do work and experiments for you, although they should keep their experiments in the scripts folder and write their own diaries as they work). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

**Assistant interpretation.** Treat observable semantics and representation as variables in the research, measure concrete alternatives, and specify a route from current worlds to an interactive device language. **Inferred user intent.** Optimize the real edit/run experience, while keeping the project understandable for someone new to compilers.

### What I did

- Created PICOCALC-CJI-DIALECT, an intern guide and four investigation diaries. Three independent workers own numeric lowering, catalog/behavior, and fast-backend research. Each writes its own reproducer and diary. The primary agent owns the board and the design synthesis.
- Selected the measured combined TRIE compiler as the native reference. Its complete Agenda and Files jobs were 522.587 s and 206.321 s with an 8 MiB compiler arena. These are jobs that generated and verified native modules, not application execution time.
- Specified a device QuickJS experiment before seeing its results: parse unchanged bundled sources into bytecode; serialize, reload, and separately check the prelude/world registration and a representative operation. Keep measurements of an alternate executable format visibly separate from native ELF generation.

### Why

Altering only negative zero or overflow may change runtime results without removing structural inference and helper generation. Conversely, a bytecode compiler can avoid most of this work while keeping the full JavaScript numeric behavior. We need both experiments and a catalog inventory before recommending a new language.

### What worked

Existing immutable stage-1 / firmware artifacts and previous hardware receipts are available. The device port already links QuickJS, WAMR and a native ELF runtime. The registered app boot boundary can be inspected directly in nucleus/vm.c. A separate diagnostic app image can use the installed ESP-IDF build without modifying production sources.

### What didn't work

No measurements had completed at this checkpoint.

### What I learned

The compiler module owns an independent firmware libc and lowers soft-float operations; comparing the workstation's Node runtime against it conflates CPU, code generation and VM costs. The currently flashed headless control still contains the world source files, even when its manifest selects native binaries.

### What was tricky to build

The native validator expects the ordinary module digest. A new dialect is allowed to change emitted code, so the experimental board validator must distinguish independent host agreement for the new compiler from equality with the original language. A compiled file also needs a behavioral check.

### What warrants a second pair of eyes

Check what is inside each timer, whether the source and compiler identities match, whether device artifacts are ever actually launched, and whether a proposal silently changes wire, capability or event semantics.

### What should be done in the future

Fill the proposed language contract and architecture decision using observed results; identify hypotheses that still need a production implementation.

### Code review instructions

Start at the intern guide. Reproducers and raw data are separated by experiment owner. The board instrumentation and the restore procedure live in scripts/board/.

### Technical details

The initial headless application binary starts with SHA-256 2b9e8371ee8e. Device examples use one 8 MiB frontend arena for Agenda and Files. App VM memory budgets in the manifest refer to another allocation and another phase.

## Step 2 — Compile and reload the unchanged catalog on the physical ESP32-P4

**Prompt context.** The same user request asks whether the language contract itself should change. I interpreted “validate” to include a control that retains today's JS semantics, compiles the actual source on the board and executes the resulting bytecode.

### What I did

- Added a diagnostic translation unit and linked it into an isolated headless image at the existing console calibration callback. Used the same firmware objects, QuickJS version, bundled sources and original prelude. Restricted native operations to seed and self identity. Created and destroyed separate compile and execution runtimes for each world, with its manifest budget.
- Ran three complete serial manifest cycles. Checked SHA-256 against the checkout for each source, stable bytecode identities, fresh registration for 66/66 trials, and the three designated behavioral checks on all repetitions. Used the ordinary control's Flaky native compile as a hardware smoke gate.
- Prepared the local-numeric CJI firmware against the same control tool. Used the host numeric experiment's generated stage-1 SLIR and independently established Agenda/Files RV32 module identities. Building the firmware was independent of access to the serial port.

### Why

A source language and an execution format are different choices. A fast startup for JS bytecode tests whether native ELF must block an interactive edit. Compiling native files with changed arithmetic rules tests a different hypothesis.

### What worked

The bytecode compiler accepted all 22 sources, including Calc and Sandbox. All registered successfully three times. Median compile/ready was 37.059/108.922 ms for Agenda, 15.931/82.127 ms for Files, and 193.839/311.267 ms for Calc. The RAM artifact crossed a runtime boundary. Included probes executed the compiled app's Agenda date expansion, Files byte-size formatter and Flaky ping.

### What didn't work

The first UART reader assumed that the first explicit bench command would return keyboard. Boot had already invoked the callback, so the first explicit command returned power. The reader stopped on this mismatch and the shell restored the control and ran its smoke test. I changed the reader to synchronize on the first manifest name and verify every subsequent trial and name; the successful run used a fresh directory. It retained the incomplete priming cycle in the compressed UART log and excluded that cycle from the statistical table.

### What I learned

On this board normal JS syntax, fractions, dynamic values and callbacks coexist with subsecond compilation for every bundled source. Prelude execution and fresh contexts comprise much of the smaller worlds' registration time. The emitted instructions, execution engine and semantic guarantees of a CJI ELF and a QuickJS artifact differ.

### What was tricky to build

The cap on each QuickJS realm is the manifest's cap. Source/prelude file reads, source hashing, and the application-specific witness are outside the ready timer; the two fresh realms, bytecode copy/serialization, prelude evaluation, registration and __init are inside. No simulated keypress or screen presentation is implied. The stub cannot exercise authority or async I/O. A separate Linux replay uses the real simulated kernel.

### What warrants a second pair of eyes

Compare the three raw values to their CSV medians; check the paths and SHA-256 in the hardware and host receipts. A reboot and immutable ordinary firmware snapshot provide the restore check.

### What should be done in the future

Profile the actual operator edit/start through the kernel with live input and display when those peripherals are available. Test the proposed typed emitter on the board and check whether native compilation remains a significant delay even with the numeric proof removed.

### Code review instructions

Read scripts/board/qjs_probe.c alongside scripts/board/run-qjs.py, then replay scripts/board/summarize-qjs.py against various/board/quickjs-p4.jsonl. scripts/board/qjs-series.sh contains the restoration trap. The initial design and diary were committed as 64abaf3.
