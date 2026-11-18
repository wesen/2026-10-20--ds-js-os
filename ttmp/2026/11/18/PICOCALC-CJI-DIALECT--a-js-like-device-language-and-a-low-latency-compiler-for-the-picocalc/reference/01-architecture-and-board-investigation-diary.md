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

## Step 3 — Rebuild stage 1, verify physical native artifacts, and specify the typed alternative

**Prompt context.** The user's “JS like” instruction permits representation changes. I chose to compare a conservative reduction in today's compiler work against a typed direct emitter whose different arithmetic rules are intentional.

### What I did

- Used the numeric investigator's stage-1 SLIR (a80b9fc3d6c9…) to build an ESP32-P4 compiler tool. Verified the relinked base tool, generated the diagnostic image, restored the local IDF configuration, and scheduled the serial run after the QuickJS series ended. The native candidate app image was 947d8aecbfd9….
- Checked Flaky at boot, then compiled Files and Agenda through the physical worker's 8 MiB profile command. Verified the new ELF sizes and hashes against both source and compiled host candidate. Archived raw progress, GC counters, image identities and restore evidence. No compiled application was installed in a user slot.
- Read Cooper and Torczon's treatment of linear representation and data-flow, the Liftoff and Sparkplug project articles, the copy-and-patch paper, the QuickJS documentation, Wasm numeric definitions, Rust's incremental model, and the Luau/AssemblyScript implementation descriptions. Cross-checked the local source for native caps, pass order, filesystem, SDK, messaging and the loader. Drafted the novice guide and its architecture/performance figures.

### Why

The previous native artifact hashes would reject legitimate representation changes. Correctness requires independent candidate output and application behavior probes in addition to successful compilation. A headless native check returns an ELF; initial registration in a VM and an interactive workflow end at different points.

### What worked

Files compiled in 140.602 s (9,251,666 bytes job scratch, 58 collections) and Agenda in 169.739 s (10,048,551 bytes, 134 collections). The expected new 217,176- and 330,984-byte modules matched. Those are reductions of 31.9% and 67.5% against the combined historical range-state variant. The absolute time remaining rules out treating removal of the current collector alone as an interactive solution.

### What didn't work

An early local guide link assumed an incorrect relative path to the prior day's CJI import. A link checker resolved the actual ticket tree and the final path now traverses to day 17. The host catalog's broad native-process suite also had harness errors, recorded by its investigator; the guide distinguishes its incomplete result from the successful scoped suites.

### What I learned

Frontend time accounts for over 99% of these two new physical jobs. Whole-job scratch stayed at the same maxima as the previous combined variant even as peak live GC data fell. The full catalog is inexpensive to parse in QuickJS. The argument for a new language is consequently about local compilation, explicit representations and predictable runtime and wire behavior.

### What was tricky to build

PSRAM reservation, GC peak live memory and aggregate job scratch are different counters. The production file module currently mounts wear-levelled internal SPI flash; the physical SD card requires an actual storage path. The Wasm ABI rejects native wire handle payloads, so a full Files port has a concrete dependency absent from the scalar and simulated workflow tests.

### What warrants a second pair of eyes

Reproduce the exact firmware/tool identities and confirm that elapsed time and frontend time in the receipts have different scopes. Review how the proposed fixed types handle unchecked addition, divide-by-zero, f64 formatting, time, state mutation across await and nonnumeric operations.

### What should be done in the future

Run a typed function, compiled from source on device, through the firmware's WAMR engine. Adopt an end-to-end typed world such as Flaky as the next integration gate, then measure real event latency and exercise a failed replacement.

### Code review instructions

Read scripts/board/native-series.sh and verify-native.py, compare various/board/native-{files,agenda}.jsonl with the previous TRIE physical summary, then open the numeric and catalog investigators' receipts. The bytecode hardware baseline is commit 0c51e9a; the independent numeric, catalog and fast-backend studies are df7fcaf/4e12bc4, 9f9ef8a, and 0fbaa96.

## Step 4 — Compile a typed source function on the P4 and execute its new Wasm bytes

**Prompt context.** The requested fundamental rethink needed a runnable consequence of changing the language contract. Host-only elapsed time would not answer the user's device question.

### What I did

- The fast-path investigator supplied a dependency-free source emitter and a typed copy of the actual compositor layout function. I embedded both texts, never the output Wasm, in a separate diagnostic. It used a fresh QuickJS realm each trial to parse the compiler and compile the typed source. The firmware's ordinary WAMR runtime then loaded the result and called the exported function.
- Checked 396 physical results against an independent C implementation per trial, including no selection, the short-list return, both clamp limits and middle positions. Matched the emitted 118 bytes' digest to an independent Node build. Repeated three times.
- Ran the headless restoration smoke at the end of the third diagnostic series. Stored app and firmware identities, UART and the ordinary control's Flaky compile. Revalidated all timing files and rendered figures from the committed data.
- Asked for an independent reading and reMarkable PDF rehearsal. That reader found a repeated synthetic title and repository-relative links that would not resolve in an e-reader PDF. The source guide keeps repository navigation; the publication staging pass will make the printed version usable independently.

### Why

Running a prebuilt test module in WAMR would prove the interpreter works but leave the entire compiler latency unknown. Running a JavaScript equivalent of an integer function is also insufficient to establish the intended wrapping, signed division and boolean rules.

### What worked

Every physical trial emitted the host module hash 1f33714cf1dd24f7926bf8995326e92c1da0b67686d3198d9aaea07a38ab0685. Medians were 37.548 ms for a fresh compiler realm and emitter evaluation, 10.368 ms for the actual source compilation, 2.059 ms for WAMR readiness through export lookup, and 1.407 ms for all 396 calls with checks. The independent host matrix matched original JavaScript on 667,780 valid/comparison cases, while intentional language differences had dedicated tests. Final restore installed ordinary app 2b9e8371ee8e… and produced the expected Flaky module again.

### What didn't work

The new flash-receipt packer initially decoded boot logs as strict UTF-8. UART captures can include arbitrary reset bytes. It now decodes only the search view with replacement and retains the original bytes in its deterministic gzip archive. Docmgr doctor also classified two scripts README files as ticket documents; the tables of contents/reproducers need frontmatter.

### What I learned

Arithmetic can be locally checked and emitted on the actual P4 with a small JS implementation. The largest measured phase for this leaf was parsing/starting the emitter itself. Keeping the compiler hot is an interesting separate memory/latency trade-off. The leaf makes no imports and owns no mutable application state. Building any whole-app forecast from its size or time would be premature.

### What was tricky to build

The WAMR runtime initialization is private to the production translation unit. An isolated diagnostic includes that translation unit with the existing flags/allocator and substitutes the diagnostic console callback at link time. This lets the probe use the same interpreter while supplying a directly callable leaf. The probe copies out a real ArrayBuffer, preserves it until WAMR unloads and times server setup, generation, loading and calls separately. The per-case execution timer includes the C expected result, marshalling and instruction allowance.

### What warrants a second pair of eyes

Confirm that the input manifest and newly emitted module came from the board. Read the three cold-start timing rows, the Node-side SHA and the restore receipts. Review the difference between a kernel-routed event and a direct call to a Wasm export.

### What should be done in the future

Exercise typed code through the actual kernel world event ABI. The first complete typed application's behavior and interactive latency will determine whether more language or native optimization is worthwhile.

### Code review instructions

Run scripts/board/verify-typed.py against various/board/typed-uart.log. Run scripts/board/summarize-qjs.py on the captured JSONL and compare the CSV. Inspect scripts/report/figures.py and the three *-flash-smoke.json records for all firmware swaps. No firmware or compiler binaries are committed to the ticket.

## Step 5 — Exercise the event ABI and prepare the intern edition

**Prompt context.** The user asked for a technical guide for a new intern which can be read later on a reMarkable. Each platform measurement must explain what the newcomer could reproduce and what still needs a production implementation.

### What I did

- Integrated the typed code into the existing Linux kernel event workflow through a separate investigator. The test found the exact generated Wasm function body by signature and used the project's SDK to supply a test world's events and JSON. A QuickJS peer received six correct replies. The sentinel-control world proved that reaching only the SDK glue could not pass the positive cases.
- Added a concrete source walkthrough, diagrams for the compiler routes and file capability handoff, the measured timing plot, an actual simulator screenshot and a migration plan. Included real and proposed APIs, implementation pseudocode, sampling boundaries, storage and trust rules, phase budgets, prior art and the next full-world test.
- Reproduced the CSV and typed JSON from captured data, verified the two native ELF hashes again, matched the screenshot to the independent replay receipt and checked repository-relative links. Three compressed smoke records preserve target and restored image identity per series. The guide snapshot was committed at 09c7bdd and the kernel-routed experiment at 5aaa73b; the physical candidate/typed firmware evidence was committed at 6ac248a.
- Numbered both reproduction indexes under scripts after docmgr treated conventional README names as managed documents. Repaired their current links and reran the complete ticket doctor.

### Why

A valid scalar module can still fail to interact with the OS. A real event/reply extends validation across that boundary. A docs reader on an e-reader needs an offline source map, readable figure captions and a clear unit for every timing.

### What worked

The patched test world handled center, lower/upper clamp, no selection, short list and a signed-boundary case. The placeholder consistently returned -999 and a deliberately malformed numeric string was rejected. The final 19-page PDF has four raster figures, 89 internal and 14 HTTPS annotations. The independent layout check found no clipping or overlapping text in the published layout. A root-side rendering inspection also verified all four figures on pages 2, 5, 6 and 13.

### What didn't work

The first PDF rehearsal duplicated the title in the outline, emitted file links which would be invalid on an e-reader, and overran an API table cell with an unbroken signature. The staging and layout scripts replace the synthetic title, link references to an offline path map, and split long signatures and hashes at safe positions. Canonical Markdown and machine evidence retain complete hashes.

### What I learned

The typed body can service real cross-engine requests when the ordinary SDK supplies the surrounding world. None of these tests generates a complete typed application with managed heap objects, retained mutable state, scheduling, cancellation and transferable file handles. The plan now makes that boundary explicit and testable.

### What was tricky to build

The final document needed useful links both in Git and on a notebook without the repository. PDF verification checked destinations, outline depth, figure count and text geometry. Source and rendered binary identities have separate hashes; the release receipt records both.

### What warrants a second pair of eyes

Use the 19-page edition or the canonical guide to find the OS source map, look up the four timing boundaries, and verify which physical, simulator and host-only results support the recommendation. Re-run the fixture with the sentinel first and compare the application-level replies.

### What should be done in the future

Generate actual state, string and event glue for a small complete typed world. Test normal loader startup and input-to-visible-result latency on an assembled device. Keep the catalog qualification matrix separate from the smoke tests.

### Code review instructions

The source guide, experimental logs, four diaries and scripts live in PICOCALC-CJI-DIALECT. The PDF, layout verification and reMarkable readback belong in various/publication. Reproduce the report figures from scripts/report/figures.py and open the simulator replay/hash entry for 72-agenda-tasks.png.

### Delivery receipt

Uploaded **CJI Intern Guide - Rethinking the PicoCalc Device Language** to `/ai/2026/11/18/PICOCALC-CJI-DIALECT`. Cloud readback returned the same 346,080 bytes as the ticket PDF, SHA-256 `37cc2e5becf1b8630f32065be9428abad8e6da918a2a9feb98d19cecd1c3eff9`. The remote document UUID is `c512405e-d691-4ee4-954e-768ec2dde76e`. The canonical source hash is `8c3015be6d231a0cfc72618d3b1d3eaad67d53c8c0e673328aa2ce5bdf139c24`. Complete metadata resides with the ticket PDF.
