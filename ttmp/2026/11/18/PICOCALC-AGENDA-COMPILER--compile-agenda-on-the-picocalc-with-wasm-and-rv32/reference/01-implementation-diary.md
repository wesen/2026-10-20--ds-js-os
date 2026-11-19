---
Title: Implementation diary
Ticket: PICOCALC-AGENDA-COMPILER
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T17:49:07.330573624-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1 — Compile Agenda's calendar rule into Wasm

The existing date validator is the acceptance oracle for reading a reminder from the shared todo file. I promoted the ticket's bare-JS emitter into the compiler directory and added typed calls to earlier declarations and signed remainder. Agenda can now express the Gregorian leap rule without a runtime Date object.

### Prompt context

**User prompt (verbatim)**

> Ok, here's the goal for you now:
>
> For the month, I’d let Agenda determine which language features we implement. Week two covers the parts needed to parse one real reminder: strings, records, collections, dates, and diagnostics. Week three connects that path to storage, clock events, and a rendered view. Week four is for testing on the assembled handheld, measuring memory and turn latency, and fixing the bottlenecks the measurements expose. Two seconds for a cold Agenda build through first response is a target to test, with keypress-to-visible-frame measured separately.
>
> Start with WASM, then do RISCV.
>
> commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)
>
> At important milestones,  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).

**Assistant interpretation.** Implement an editable Agenda program with two executable targets and measure the actual device workflow. **Inferred user intent.** Let the behavior of a real application determine the required language and runtime.

### What I did

- Opened the implementation ticket and traced the public reminder file format through agParse and agValidDate.
- Added the typed program and compiled and ran its exports against the original JavaScript date implementation.

### Why

The stored format accepts a four-digit year. Date.UTC treats years between 0 and 99 as years relative to 1900. A conventional Gregorian implementation applied directly to year zero would silently disagree with stored data.

### What worked

The host Wasm engine executed the 268-byte module over 235,158 combinations with identical calendar answers. The check includes invalid months/days and century boundaries.

### What didn't work

The first run of scripts/01-check-calendar.mjs raised “Cannot read properties of undefined (reading 'get')” in FunctionEmitter.prefix. The constructor did not retain the function-signature map. Adding that assignment fixed the actual failing path. The sandbox has no /dev/serial/by-id view, although sysfs lists ttyACM0. Physical qualification needs to identify the port on the host.

### What I learned

Function declarations can call earlier typed declarations using a Wasm function index and checked arguments. Calendar validation and civil-time conversion to epoch milliseconds are separate operations.

### What was tricky to build

The month-end check must account for 1900, 2000 and 2100. A test restricted to current-year dates would miss the error.

### What warrants a second pair of eyes

The public date domain is four-digit years read from the file. The emitter currently resolves functions in declaration order.

### What should be done in the future

Compile the string/token parser, return its records and build the collection consumed by the view. Follow with storage and reminder delivery, device measurements, and the RV32 backend.

### Code review instructions

Read picocalc-os/worlds/agenda/reminder.typed alongside js/apps/agenda.js in the OS tree. Run the ticket calendar checker from repository root.

### Technical details

The script calls WebAssembly.instantiate on new output and compares the exported validDate against the function extracted from Agenda. No precompiled module or JS replacement supplies the tested result.

## Step 2 — Parse reminder lead tokens in compiled code

Agenda reads a value such as !15m from a task line. The application source now parses that token inside the generated Wasm. The compiler gained the string reads, assignments and loop needed to express this behavior.

### Prompt context

See Step 1. Calendar checkpoint 320fb63 established the first callable Wasm functions.

### What I did

Implemented typed string length and checked UTF-16 code-unit indexing, mutable locals and structured while loops. Added the leadMinutes function and a differential test against agParse. Ran the calendar regression after combining the functions into a 559-byte module.

### Why

A single token exercises real source text, bounds, decimal accumulation, unit conversion and a missing-value result. These operations will also be needed when scanning the complete task line.

### What worked

The host executed 30,010 token comparisons including all one-to-four-digit numeric values for minutes, hours and days, leading zeroes, malformed inputs and non-ASCII text. All matched the existing Agenda parser. The 235,158 calendar cases still matched.

### What didn't work

No differential mismatch occurred in this step. The existing host invoke utility accepts scalar arguments only. This test writes an explicit length-prefixed string into the module's memory, so it does not yet exercise OS event decoding.

### What I learned

An unsigned bounds comparison catches negative indexes as well as indexes at or above the string length. Checking before the load keeps malformed indexing inside the normal Wasm fault mechanism.

### What was tricky to build

A temporary local preserves the evaluated index exactly once. Loop declarations have lexical names scoped to the body but physical Wasm locals belong to the enclosing function.

### What warrants a second pair of eyes

Validate incoming buffer lengths before creating strings at the kernel boundary. The internal string representation assumes that a valid owned allocation backs its header.

### What should be done in the future

Return a full parsed task record including title, status, civil date, time and lead, then construct the view's task collection and route it through the real world ABI.

### Code review instructions

Run scripts/01-check-calendar.mjs and scripts/02-check-leads.mjs with Node from repository root. Inspect the compiler's checked charCodeAt emission and the application's use of the declared string type.

## Step 3 — Compile complete stored task lines

The typed Agenda source now scans the original UTF-16 line, records the first syntactic date and reminder tags, and writes the normalized title to a bounded output buffer. The test runner reads the record and title after instantiating the freshly generated module.

### Prompt context

See Step 1. This concludes the stored-line parser milestone. The preceding string and loop checkpoint is 941e7aa.

### What I did

Added declared record fields, typed record loads and stores, block statements, calls used as statements, and a writable UTF-16 buffer. Implemented scanTask, readDue, readLead and writeTitle. Added scripts/03-check-task-records.mjs and its receipt.

### Why

A malformed date is absent to the scheduler but its syntactic tag is removed from the title. This needs both source offsets and validity fields. Keeping the original text supports the later workflow that locates a task by its unmodified line before writing a shared file.

### What worked

All 6,411 differential lines matched agParse, including completed tasks, Unicode whitespace, duplicate tags, date-only tasks, text beside a time, and invalid dates and times. Two negative cases produced source-located type diagnostics. The generated module is 2,605 bytes. Calendar and lead matrices still passed. Running node tests/agenda.test.mjs from picocalc-os passed nine existing Agenda application tests.

### What didn't work

The first complete-line implementation normalized titles in the host oracle. That left a behavior of the application outside the generated module. I added a bounded title output and reran the same cases with the host decoder only reading the result and supplying the presentation label for an empty title.

### What I learned

Separate a regular expression's syntactic match from validation of the fields it matches. A fixed-offset record and caller-provided output can express this boundary with predictable allocation costs.

### What was tricky to build

The optional time requires whitespace, validates its token boundary independently, and extends the due span even for out-of-range hour and minute values. The title writer must collapse whitespace around the removed spans while keeping all other characters in order.

### What warrants a second pair of eyes

The test harness allocates distinct input, title and result regions. The forthcoming world runtime must apply this ownership rule to bounded input and preserve the distinction between a record reference and a scalar type.

### What should be done in the future

Use the records in a task collection, generate the world entry points, and connect the first reminder workflow to storage, the clock and the rendered view.

### Code review instructions

Run scripts/01-check-calendar.mjs, scripts/02-check-leads.mjs and scripts/03-check-task-records.mjs from the repository root. Read reminder.typed alongside agParse in picocalc-os/js/apps/agenda.js. The receipt proves execution in the host Wasm engine. The board and world ABI have separate gates.

## Step 4 — Publish the stored-line milestone

Project commit a8c71ad is the reproducible source checkpoint for the parser milestone. I wrote a new Obsidian project report explaining the distinction between token shape and validity, linear memory layout, and the boundary covered by each test.

### Evidence

- Vault note: Projects/2026/11/18/PROJ - PicoCalc Agenda - Compiling a stored reminder to WebAssembly.md
- Vault commit 5f1dd76 was pushed to origin main. The remote-tracking ref resolved to the same commit after the push.
- The parser task is complete. The publication task stays open for the integration, device and RV32 milestones.

## Step 5 — Read the notes file and publish a frame from a linked Wasm world

The host simulator now runs the compiled parser inside an Agenda world. The world's startup obtains a directory handle from its manifest, submits a read of notes/todo.txt, and builds a frame in the settlement turn. The fixture has two open tasks and one completed task. The resulting frame contains the two parsed open titles, including the supplementary-plane character in the first title.

### Prompt context

See Step 1. This is the first storage and rendering checkpoint on the Wasm path. The parser and vault milestone were committed at a8c71ad and 5f1dd76 respectively.

### What I did

- Extended typed-wasm.js to link generated functions into a prebuilt reactor. Original runtime indices and sections stay in place. The compiler emits calls after the imported and existing function ranges, and a small forwarding body occupies the runtime's named parser slot.
- Added Agenda's Wasm reactor in picocalc-os/worlds/agenda. It uses the SDK for lifecycle and frame delivery, translates UTF-8 to the typed compiler's bounded UTF-16 buffer, and reads the generated record and title.
- Added public native file-open and deferred-read operations. They reuse fs_open_claim, fs_prepare and fs_defer so the same manifest, handle ownership and path checks still govern file access.
- Ran scripts/04-check-wasm-world.mjs with and without the Agenda notes claim. The unprivileged run cannot fetch the file or produce a frame from its contents. The direct message path also rejects a numeric line value.
- Queried the actual ESP32-P4 console with p4cap.py --no-reset and the stats command. It returned the live world table via /dev/ttyACM0. This was a connectivity check against the running firmware.

### Why

A reactor can retain OS-specific startup and SDK behavior while the app's parsing routines remain editable and compiled at runtime. Adding a narrow read-only operation through the existing filesystem capability path allows Wasm Agenda itself to own the read.

### What worked

The linked module validated and booted under the existing WAMR backend. Its first frame carried both expected open titles and excluded the completed task and the header. The 6,411 stored-line comparisons, make test-apps, and all 17 focused Wasm tests passed. The USB port was present on the host outside the sandbox and answered a read-only console query.

### What didn't work

The initial simulator assertion assumed the WAMR trace names event 4 “settle”. That trace prints only the numeric event for the settlement. The file frame had already arrived. I updated the expectation. I also removed the direct parse request's temporary frame update, which would otherwise replace the actual file view. The broader native suite entered its Linux subprocess tests and hit a subprocess test error inside the sandbox. The focused Wasm class passed separately. A bounded retry on the host outside the sandbox completed all 34 native regression tests successfully.

### What I learned

The filesystem settlement arrives as a JSON string. The focused test exercises the kernel I/O path, token dispatch, the linked parser call, and publication to the frame channel. These are simulator observations. The instructions counted in the trace describe WAMR work and are independent of handheld timing.

### What was tricky to build

A standalone Wasm function's call indices start at zero. In the merged module, typed definitions come after the runtime's imports and definitions. Emitting against the final index range avoids rewriting opcodes or shifting existing runtime references. The test compares the declared Task layout against the reactor's expected field order and verifies the Wasm type of the forwarding slot.

### What warrants a second pair of eyes

Review the ABI between the compiler and runtime before exposing a source install command. The displayed projection is bounded to 12 rows and the frame size. The runtime currently discards a line it cannot represent in its 2,048-unit input buffer.

### What should be done in the future

Connect calendar-to-epoch conversion, timer events and durable duplicate suppression to the stored-task scan. Qualify refresh and the rendered result through a real compositor. Add cold compilation and frame instrumentation to the device path and test it on the connected PicoCalc before the RV32 target.

### Code review instructions

Build with make -C picocalc-os and run scripts/04-check-wasm-world.mjs from the repository root. Inspect wasm-world.c, linkWorld in typed-wasm.js and the NW_FS_OPEN and NW_FS_READ handlers. The exact reply, frame and module identity are in various/wasm-world.json.

## Step 6 — Schedule reminders from the compiled task and verify durable suppression

Agenda now re-reads its notes on a 15-second timer, interprets each compiled task's civil time with the configured device zone, and uses the compositor's notification message. The same file supplies the view. A real simulator display capture shows both open task rows.

### Prompt context

See Step 1. The preceding file-backed Wasm checkpoint is d4d6bfb.

### What I did

Added native SDK access to the wall clock and the timezone offset at a nominal epoch. Updated the Wasm runtime to calculate the due instant from the generated record, save the fired identity, and send the notification. Drove the host workflow with a fixed EST/EDT timezone, a persisted store across two cold boots, an unset clock, and the repeated hour at the autumn DST transition. Captured the real compositor and display simulation with the Wasm app focused.

### Why

The same local clock time can occur twice during the fall transition. The existing JS Date binding applies the offset at the nominal UTC instant. Using that rule with 64-bit epoch milliseconds avoids choosing the other occurrence. An identity based on the scheduled instant and normalized title survives re-reading the file and restarting the world.

### What worked

The configured local reminder at 14:15 became eligible at epoch 1793733300000 and reached the simulated compositor 14,003 virtual milliseconds later. The store recorded the firing and a separate boot suppressed the repeat. With an unset clock no notification was sent. The fall-transition test selected the earlier 01:15 and also fired on the first eligible tick. The existing 34 native tests and the app suites passed. The receipt includes the final module and PNG identities.

### What didn't work

The physical board currently runs its prior firmware. All clock, store and display assertions in this step use the host simulator. The simulated font substitutes a fallback glyph for the emoji that the record and frame text preserve.

### What I learned

A raw civil time and a wall-clock epoch must have separate representations. The filesystem settlement is the point where the newest persisted text, parsed records and current clock are all available in one turn.

### What was tricky to build

Stored identities are JSON property names. Duplicate detection uses the same escaped spelling used when persisting the key. Retention is limited by both entry count and the SDK store quota. The renderer enforces its row and frame limit independently from the reminder scan.

### What warrants a second pair of eyes

Check the event boundaries in the receipt and the handling of out-of-range offsets returned by editable parser code. Device timing must take measurements from firmware running this world and use a physical input/visible-frame measurement for the separate display target.

### What should be done in the future

Bundle the reactor and source compiler for on-device cold builds. Measure first response, turn and memory use on the P4, then compare the trusted RV32 backend against the same persisted-reminder workflow.

### Code review instructions

Build the simulator, run scripts/04-check-wasm-world.mjs, and compare the reminder object and captured screen with various/wasm-world.json. For timezone behavior inspect getTimezoneOffset and set_date_fields in the vendored QuickJS implementation.

## Step 7 — Publish the world milestone and check the compiler/runtime layout

The rendered simulator view and persisted reminder now have a vault report. In preparation for linking edited source on the board, I moved the task layout and typed entry validation into compileAgenda, the same bare-JS entry exercised by the host integration. A field of type bool and a string pointer both lower to i32 in Wasm, so validating the reactor function's Wasm signature alone cannot check this contract.

### Evidence

- The first push of b0ccaa4 was rejected as non-fast-forward. The vault was clean. I fetched 9b6b7c3, rebased the report and its screenshot, and pushed fe8b62d to origin main.
- The report's screenshot SHA-256 matches the test receipt. It is the real compositor output from the host simulation.
- The compiler rejects a moved Task field before returning code to load. The successful integration still exercises the three clock cases and the disk-backed restart.

## Step 8 — Give the reactor a normal build target

The host integration and forthcoming firmware bundle need identical reactor bytes. The agenda-reactor Make target builds just the SDK runtime and parser slot. The integration test calls that target before compiling the editable source and linking it to the reactor. The test still boots the result and checks its storage, frame, clock and restart evidence.

### Evidence

- make -C picocalc-os agenda-reactor produced build/agenda-reactor.wasm.
- scripts/04-check-wasm-world.mjs used that artifact and passed. The receipt records its hash and the distinct hash of the linked application.

## Step 9 — Compile, run and measure Agenda on the ESP32-P4

The opt-in firmware built Agenda from source in a new QuickJS realm on the device and loaded the emitted Wasm as the ordinary Agenda world. The serial build command repeated the benchmark with a fresh compiler realm and a fresh WAMR instance. The interval ended on the first file-backed frame published by the kernel.

### Prompt context

See Step 1 for the cold-response target, hardware measurements and RV32 sequence. The host clock and storage milestone is c5fdd25.

### What I did

- Added PICOCALC_TYPED_AGENDA, a boot manifest choosing the Wasm world with Agenda's notes claim, and the compiler bridge in agenda_p4.c.
- Backed up the current app partition, compared the prefix to the prior headless image, then installed test images at 0x10000 without writing the bootloader, partition table or data partitions.
- Measured both bundled source and the new editable notes/agenda.typed file. The device already contained a 43-byte todo.txt and did not have an agenda.typed before the test. I left the valid source on the device after the edit checks.
- Replaced expansion of runtime code into JS number arrays with byte views and one typed-array copy. Compared host linked bytes and repeated the same board experiment.
- Verified that an intentionally invalid typed edit reports a location and leaves the previous Agenda world idle. Restored the valid source and rebuilt it.

### Why

Compile time alone cannot answer the two-second question. The run also waits for restart scheduling, Wasm init, file I/O and the settlement that publishes the view. Boot competition from the other worlds is measured separately.

### What worked

The first stable suite measured a 767 ms median and 830 ms p95 from source capture to frame publication over 20 bundled-source trials. The optimized linker measured 538 ms median and 606 ms p95 on the same workload. The five optimized editable-file trials had a 535 ms median and 599 ms maximum. A fresh full-system boot reached Agenda's frame about 2.428 seconds after its compile began.

The median compiler heap peak fell from 1,358,068 to 407,436 bytes. Compile medians fell from 483.4 to 258.7 ms. The first settlement turn was typically 2.45 ms. Wasm linear-memory plus interpreter-stack accounting was 147,456 bytes. The emitted module size was 42,201 bytes. Exact raw trials reside in various/p4-wasm-bench.json.

### What didn't work

The first cold build failed with “TypeError: not a function” because the host linker expects a Uint8Array but firmware passed an ArrayBuffer. The first correction then failed with “RangeError: invalid length”. The QuickJS buffer-view constructor reads three argument slots, so the corrected invocation explicitly supplies buffer, zero byte offset, and reactor byte length.

The PicoCalc keyboard's I2C address returned NACK and ESP_ERR_INVALID_STATE. The physical keypress-to-visible-frame gate is still open. The measured endpoint is the kernel's frame publish, which precedes display transfer. A response in the first unsynchronized trial took 2.656 seconds, and the raw set preserves it. The serial observer subsequently waited six seconds after opening the port before collecting the settled series.

### What I learned

Wasm body bytes in the runtime can be copied intact. Representing them as boxed JavaScript numbers and flattening vectors creates temporary arrays large enough to dominate this compiler's peak heap. The existing runtime contributes most of the binary, while the input source owns the reminder parser.

### What was tricky to build

The reboot preserves filesystem capabilities only when the compiled module is installed as the manifest's Agenda world. An ordinary unclaimed storage launch would not perform the benchmark's actual notes read.

### What warrants a second pair of eyes

The measured peak is the compiler allocator's live bytes. It is separate from WAMR's world accounting and the board's aggregate PSRAM. The standalone application boot and serial restart share the same compile path, with different competing startup work.

### What should be done in the future

Enable the physical keyboard and display test, instrument the successful panel transfer after the Agenda keypress, and verify the RV32 target against the same file and clock cases.

### Code review instructions

Run make -C picocalc-os agenda-reactor and the ticket's host world test. Build the ESP-IDF project with PICOCALC_TYPED_AGENDA enabled. Use scripts/05-measure-agenda-p4.py with the configured serial port and compare the emitted JSON to the committed hardware receipt.

## Step 10 — Restore the prior image and publish the benchmark

The measured firmware checkpoint is 2d1238c. I kept the valid editable source and restored the exact app image whose bytes matched the saved flash prefix. This returns the P4 to its previous headless configuration while preserving the board's notes and settings.

### Evidence

- esptool verified the restored flash write. The boot trace reported keyboard/power I2C and display SPI offline as before, loaded the two CJI manifests, and answered cji status with #OK cji.
- The vault report “PicoCalc Agenda — Measuring a cold Wasm build on the handheld” was pushed to go-go-parc main at 3b4640c.
- The hardware task remains open for the separate physical input-to-panel measurement. The readiness and memory portion passed on the P4, and the RV32 implementation can begin from the same parser and runtime contract.

## Step 11 — Compile and load a trusted native Agenda world

### What I did

I exposed the typed frontend's function bodies to a second target. typed-rv32.js lowers the structured integer instructions to little-endian RV32IM words. It assigns locals and operand slots in a 16-byte-aligned frame, resolves local control-flow jumps, and emits PC-relative calls. compileAgendaRv32 performs the same Agenda ABI checks as compileAgenda, locates one reserved executable slot in the linked ELF, and patches a tail jump into the compiled parser. The existing SDK reactor still implements the file, timer, notification, and view behavior.

- scripts/07-check-rv32-parser.mjs compares the native return value, all record fields and the cooked title against the Wasm oracle over 6,411 task lines. It also checks 405 date cases and 10,000 lead values.
- scripts/09-check-rv32-world.mjs loads the patched ELF at two distinct addresses through the CJI emulator. The driver presents a deterministic file, a clock transition, a zone offset, and the saved fired identity to the new instance. Both instances render the file and the reminder fires once.
- The opt-in P4 profile compiled on boot and ran 20 fresh bundled builds and five fresh editable-file builds. All used the existing notes/todo.txt. I restored the exact previous app image with a flash hash verification and confirmed the original headless profile and a successful cji status.

### Why

The same typed input and event contract make the two targets comparable. Cold source-to-frame, compile time, and the frame-producing turn describe different parts of the system. The new backend should prove that it runs real machine code and preserves the workflow before we attribute any timing changes to the target.

### What worked

The native ELF is 24,304 bytes and the stand-alone emitted parser is 12,532 bytes. On the settled board, fresh bundled builds had medians of 443.457 ms for compilation, 573.321 ms to publication, and 0.657 ms for the frame-producing turn. The settled bundled p95 was 829 ms and the maximum was 1.455 s. Editable builds had a 573 ms median and 586 ms maximum. On full-system boot, the compiler finished in 446 ms and the first publication arrived after 3.046 s. The per-trial data and executable hashes are in various/p4-rv32-bench.json and the emulator receipts.

### What didn't work

The first small parser runner used a partial initializer that caused GCC to emit an unresolved memset in a no-libc executable. Explicit initialization of the used fields removed that dependency. The full reactor driver first attempted to link floating-point ABI flags against emulator objects built for the integer ABI. The driver now uses the emulator toolchain's integer ABI and exercises the reactor's pointer and integer SDK boundary. The emulator then reported a missing resolution table. Supplying the reactor's ten explicit libc imports completed relocation. Node's sandboxed subprocess wait reported EPERM even after the emulator printed success. The regression script passed outside that sandbox.

### What I learned

Native execution cuts the observed settlement turn from roughly 2.45 ms to 0.66 ms. The current native emitter still spends more time compiling than the optimized Wasm emitter. Under full-system startup the build itself accounts for under half a second in either profile. The remaining time needs measurement between installation, Agenda dispatch, the filesystem settlement, and the rest of world startup.

### What was tricky to build

The compiled parser uses implicit Wasm linear-memory offsets on the first target and actual pointers on the second. The shared reactor keeps the record and UTF-16 layouts constant. The native code and the prebuilt call site must obey the register, stack, and return-address conventions, even when the ELF is relocated.

### What warrants a second pair of eyes

Check the native branch and stack effects, preserved ABI across calls and jumps, and the unique executable-slot check. The native output runs with firmware privileges. The emitted code should be used only for trusted input in the current profile, and a native trap can fault the firmware. The physical trials differed in peripheral configuration. Their runtime memory counters also count different components and should not be treated as comparable system-level peaks.

### What should be done in the future

Re-run both targets with identical firmware/peripheral settings. Measure the boot delay by stage. Capture a real keyboard event through completed panel transfer and verify the final visible frame on assembled hardware.

### Code review instructions

Run scripts/03-check-task-records.mjs, scripts/07-check-rv32-parser.mjs, and scripts/09-check-rv32-world.mjs from the repository root. Pass the ESP RV32 compiler and the built CJI rv32emu to the RV32 scripts. The world harness also takes the agenda-reactor.elf from an ESP-IDF build with PICOCALC_RV32_AGENDA=ON. Compare the receipts and repeat scripts/05-measure-agenda-p4.py against the correct flashed build.

## Step 12 — Publish the RV32 milestone and locate the cold-boot interval

### What I did

I published the native RV32 report to go-go-parc main as 80cbd01, covering the typed parser ABI, instruction generation, ELF slot, deterministic restart experiment, and measured handheld results. The PicoCalc implementation and raw receipts are in e03e3ab. The host app suite passed, and all 34 native and Wasm world integration tests passed.

### What I learned

The native boot trace places typed-manifest registration about 727 ms into the kernel's clock and ELF-manifest registration at 738 ms. The first logged world initialization followed around 2,579 ms. The interval after manifest registration overlaps CJI relocation, frontend output, and radio initialization. `main_p4.c` calls `compiler_restore()` before entering the kernel dispatch loop. The restore loads the installed source and calls `begin()`, which also does work before the loop can run. The trace identifies a long pre-dispatch interval. It does not attribute that interval to a single function or prove the source of the remaining delay after dispatch.

### What should be done in the future

Measure compiler restore, first dispatch, native activation, file request and settlement with timestamps from the same clock. Repeat the two compiler profiles with the same CJI installation and peripheral settings to see where the full-system response misses two seconds. Compare any scheduling change against installed CJI restoration and the regular Agenda frame path.

## Step 13 — Measure startup by stage on the same RV32 profile

### What I did

I added first-response timestamps around manifest registration, installed CJI restore, dispatch, engine creation, filesystem submission and return, settlement, and publication. The new serial sampler makes fresh resets and keeps only Agenda timing fields. I flashed the instrumented application at 0x10000 and conducted three measured reboots with the same headless hardware and existing files. The raw trials are in various/p4-rv32-boot-stages-baseline.json.

### What worked

Median source-to-publication was 3.083 s, with 449 ms of compilation. Manifest handling reached the CJI restore call after about 586 ms. The restore call returned in about 10 ms. Agenda's engine was instantiated around 1.454 s and took 6 ms. The world submitted its notes read around 2.881 s. The returned file reached the kernel about 200 ms later, with roughly another 2 ms to dispatch its settlement and publish the first frame.

### What I learned

The synchronous restore call was short. However, its asynchronous job loads an ELF whose relocation runs on the kernel task because it requires an internal stack. While other worlds initialize, this phase competes directly with the dispatch lane. There is also a 1.42 s interval from Agenda engine initialization to its start message submitting a file request. The kernel gives all manifest boot segments precedence over ready messages. That policy is a separate candidate to measure after isolating the effect of CJI relocation.

### What warrants a second pair of eyes

The trace comes from kernel-side timestamps. The submit-to-return interval includes scheduling on the same-core filesystem worker and queue drain. It does not measure flash read service time. Serial logging also adds a small cost to the instrumented first settlement turn.

### Code review instructions

Build with PICOCALC_RV32_AGENDA enabled. Run scripts/10-measure-agenda-boot.py with the attached UART, keeping the existing app, note, installed CJI slot and peripheral configuration fixed across measurements.

## Step 14 — Defer CJI relocation during the first built-in frame

### What I did

I left CJI restore and the bundle-read worker in place, and added a bounded deferral to the kernel-side relocation phase. In the typed Agenda profile it waits for the first frame or for two seconds from the start of the boot compile, whichever comes first. Manual Agenda rebuilds do not extend the deadline. Cache-hit, progress, activation, and error handling still go through the same compiler state machine.

I flashed only the application partition and repeated the stage capture three times with the same headless RV32 configuration, installed CJI source, and notes file. The firmware SHA-256 was 4a3ac9f0d0bf166c91d854dae0ea07c2e9d72a6216db771df9b80226c5480840. The three complete trials are in various/p4-rv32-boot-stages-cji-deferred.json. I also added a physical input test protocol to the design guide.

### Why

The CJI worker loads its tool independently, but relocation runs on the kernel task's internal stack and has instruction-cache coordination requirements. Moving only its earliest execution time keeps those constraints in place. The deadline bounds the delay to the installed CJI application if Agenda cannot render.

### What worked

Median cold source-to-frame dropped from 3.083 s to 2.743 s, an improvement of 339 ms in the three-reboot comparison. The optimized range was 2.737–2.762 s. Compile time stayed near 450 ms and world accounting stayed at 124,588 B. Median engine creation began about 141 ms earlier, while publication followed about 340 ms earlier. The relocation resumed at the deadline and CJI reported the frontend phase and answered the status command. Both host test targets passed, including all 34 native/Wasm integration cases.

### What didn't work

The first frame still missed two seconds. The first file submission occurred around 2.555 s, before the filesystem worker could service it. CJI reached its deadline before publication, so the observed speedup is from bounded reprioritization rather than from removing relocation from the boot interval. This run confirmed CJI's resumption through frontend progress. It did not wait for the unrelated installed CJI application's full compile to finish.

### What I learned

The confirmed gain comes from boot sequencing, with little change in Agenda's compilation or engine time. On both profiles, the app's start message waits behind other worlds' initialization. Decreasing the app's own compile or initial file size is unlikely to recover the whole difference between the measured full boot and the target. More detailed per-world bootstrap measurements are needed before changing general dispatch policy. Opening ready Agenda on physical hardware remains a different test.

### What was tricky to build

The deadline is pinned to the boot compile epoch and cleared by an actual typed Agenda publication. Missing hardware or a failed first render cannot suppress the compiler indefinitely. The work stays on the kernel stack required by the loader.

### What warrants a second pair of eyes

Compare the deadline-expiry and frame-first paths under different boot loads. A first-frame latency win should account for any corresponding delay to the restored CJI application. The two matched series here each cover three headless resets.

### Code review instructions

Review `compiler_tick`, the startup deadline in `agenda_p4.c`, and the unchanged worker handoff in `compiler/install.c`. Repeat scripts/10-measure-agenda-boot.py on both checkpoints. Check the serial trace for successful CJI progress after the deferral and preserve the baseline file, active installation, and profile.

## Step 15 — Restore the device and publish the boot report

The flash writer verified the previously saved application image at 0x10000. After restoration, the P4 again reported the headless profile, loaded its two normal manifests and answered cji status. The data partitions were outside the write. The vault deep dive on the startup dispatch delay was pushed to go-go-parc main at 4ea333d. The physical timing task stays open until the assembled keyboard and LCD can be exercised.

## Step 16 — Attribute cold boot to individual world initializations

### What I did

I measured complete boot segments for every world and subdivided QuickJS initialization into context setup, evaluation of the trusted prelude, evaluation of the app source, and metadata/jobs. The firmware retains the timing samples in a fixed array and prints them after frame publication. I repeated three resets on the same headless RV32 profile and preserved the unaggregated receipts in various/p4-rv32-boot-per-world.json. The instrumented binary SHA-256 was 44691861a05ff7c04018190040bf60a295ce3383516613327ce1c9a0133d3317.

### What worked

Median Agenda response was 2.733 s. The 23 worlds occupied about 1.37 s in initialization segments before the first frame, based on the sum of their median times. The eleven QuickJS worlds spent about 627 ms inside prelude evaluation, 411 ms in app source evaluation, 88 ms setting up runtimes, and 31 ms in metadata and init jobs. Calc was the largest individual boot turn at 297 ms, including 225 ms in its source. Agent took 50 ms and native Agenda took 6 ms. These totals count only measured world segments. The first-response timer also includes dispatch gaps, CJI work, filesystem scheduling and Agenda's runtime turn.

### What I learned

The shared prelude is parsed and compiled repeatedly. It is a fixed firmware asset, but each QuickJS world must still execute it in an independent context with its own globals and host functions. Sharing serialized compilation output can preserve that separation. The trace is also evidence against changing world scheduling before quantifying that simpler optimization.

### What warrants a second pair of eyes

Prelude evaluation includes both compilation and execution. Only the first part is eligible for reuse. A serialized bytecode optimization must measure decode and first compile costs as well as resident shared bytes and first-frame latency.

### Code review instructions

Rebuild the headless RV32 profile and run scripts/10-measure-agenda-boot.py with --world-profile. Inspect the returned world objects and their four QuickJS stage intervals. Reconcile the per-world sum with the top-level before-dispatch and file-submitted timestamps.

## Step 17 — Reuse the compiled QuickJS prelude and verify native Agenda on the board

### What I did

The typed Agenda firmware now compiles the trusted bundled prelude once, into a temporary QuickJS realm with a memory limit. It serializes the compilation result into one read-only-by-convention buffer in the port heap. Every QuickJS world still creates its own runtime, decodes the bytecode into local allocations, and evaluates it with that world's own host functions and globals. The buffer is rebuilt at boot and released on VM reset. If the one-time compile, serialization, or allocation fails, worlds evaluate the packaged source through the existing path. The firmware reads no external cached executable.

I repeated the headless RV32 boot measurement three times with the prelude cache, leaving the Agenda source, firmware configuration, notes file and CJI installation in place. The tested firmware hash was 6c348ce69444b7474c36448cf8243d789e8a5fde3dd2cabdadccbb9584fb577c. I verified that Calc, Chat, Launcher and native Agenda were idle on the board, restarted Calc, and checked that it returned to idle with its restart counter incremented. The host app and native test targets also passed, including all 34 native and Wasm integration tests.

### Why

The baseline attributed about 627 ms to evaluation of the same trusted prelude in 11 worlds. Reusing its compiled representation avoids repeated JavaScript parsing while preserving independent evaluation and memory ownership. Measuring an ordinary Calc restart verifies that a receiving world can load the cached bytes again after its prior QuickJS heap is released.

### What worked

Median Agenda source-to-publication improved from 2.733 s to 2.162 s, a decrease of 572 ms, or 21 percent. Total prelude work across QuickJS worlds fell from a median of 627 ms to 198 ms, including the one-time compile and serialization. The cache took 44,544 bytes; creating it took about 95 ms. Cold median file submission moved from 2.551 s to 1.864 s. The parser itself stayed near 449 ms. The unaggregated measurements, world restart receipt, and plotted comparison are in the ticket's various folder.

### What didn't work

Only one of the three cold boots met two seconds, with measurements of 1.995 s, 2.162 s and 2.163 s. File return was near 1.919 s in all three, so the two slower samples also waited about 240 ms between arrival and settlement. The sample is too small to estimate a tail percentile. The measurement ends at publication on a headless P4 and does not establish physical input-to-panel timing.

### What I learned

Cache benefits appear even when compilation occurs during the measured boot. The first QuickJS world pays for building the cache, and later worlds amortize it. The critical path moved from repeated parse/compile work toward ready-settlement latency. Comparing file arrival with settlement is now more informative than timing only the Agenda compiler or benchmarking interpreter instruction throughput.

### What was tricky to build

The serialized result must outlive the temporary compiling context but must not share that runtime's objects. The buffer is copied before the compiling context is destroyed. Each decode runs with the receiving world's capped allocator. The source fallback runs only if producing the shared buffer fails.

### What warrants a second pair of eyes

The exact memory tradeoff includes one shared 44,544-byte buffer and temporary compilation allocations. A world still needs its decoded function bodies and constant pool. The per-world status checks and normal host suite are useful evidence, and a broader rollout would benefit from matching per-app startup behavior on both Agenda targets and the physical devices.

### Code review instructions

Inspect `eval_prelude`, `build_prelude_cache`, and `vm_reset` in nucleus/vm.c. Build with PICOCALC_RV32_AGENDA=ON, run scripts/10-measure-agenda-boot.py with --world-profile, and compare the 23-world receipts. scripts/11-plot-agenda-boot.py renders the before/after measurements. Issue `worlds`, `restart calc`, then `worlds` over the P4 console to check the restart path.

## Step 18 — Publish the prelude experiment and restore the prior app

I pushed the technical deep dive and generated comparison figure to go-go-parc main at a1f3854. The flash writer verified the prior app image at 0x10000, and the restored headless firmware loaded both manifests and answered cji status. The source, notes and installation were left on the device. The profiler and physical measurement protocol remain available for the next assembled run.

In the cache receipt all 23 worlds had already made their first boot attempt by the time the notes result returned. The two slower trials had a roughly 242 ms gap from file return to settlement and the faster trial had a 74 ms gap. The next trace should report the actual CJI relocation interval and work taken ahead of the ready Agenda settlement. The remaining physical gate still requires a powered keyboard and panel.

## Step 19 — Time CJI relocation against the pending Agenda file result

### What I did

I captured the beginning and end of the actual esp_elf_relocate call on the same monotonic clock as the Agenda stages. The serial sampler subtracts the source-capture origin from both loader timestamps. I tested three reboots on the unchanged cached-prelude RV32 headless profile. The firmware SHA-256 was 54f5ec891dc6b94795b117d31317038c5a6dfc75bf4698845eb7684bd3eaaae2.

### What worked

File replies reached the kernel between 1.915 and 1.917 s. In the slow boot, CJI relocation started at 2.001 s and held the kernel task until 2.147 s. Agenda started to handle the file result about 1.2 ms later and published at 2.150 s. In the other two boots Agenda began to handle the file result before the deadline and CJI relocation ran after publication. The raw timings are in various/p4-rv32-boot-loader-baseline.json.

### What I learned

The slow boot was a race between the expiration of the fixed startup interval and a result already on the dispatch lane. Removing the CJI operation from that window can recover its blocking time. It still needs a finite bound for the case where the initial file read cannot produce a usable frame.

### Code review instructions

Build the same headless RV32 profile as the prior milestone. Run scripts/10-measure-agenda-boot.py and compare file-returned, cji_loader.start_us, cji_loader.end_us, settle, and first_response for each independent reboot.

## Step 20 — Build the peripheral-enabled profile from an empty build directory

### What I did

I configured a fresh ESP-IDF 5.4.2 build for typed RV32 Agenda with the keyboard, display, power and compositor enabled, using a copy of sdkconfig.agent-elf. The typed manifest previously read the generated CJI manifest at configure time, before that file exists in a clean build. I switched it to the in-memory JSON that the native profile already constructs.

### What worked

The fresh configuration and complete build succeeded. The resulting app image SHA-256 was f287addba826d494489d3a6eacb1cf006d7a1633907111bd7e5055ab385bfe3b and the app partition had 0x10850 bytes free. Checking both generated manifests showed identical world names and entries except for the expected Agenda file, engine, and budget changes. The 22 entries include the native keyboard, power, compositor and display. The clean-build reproduction is in the design guide.

### What should be done in the future

The physical peripherals still need to be powered and observed. I built the enabled profile and left the physical run unclaimed. The eight-run timing experiment uses the headless firmware with the same scheduling and linker changes.

## Step 21 — Remove linker overhead and keep ready file results ahead of relocation

### What I did

I changed the RV32 reactor scan to check the four marker words directly, stopping at the first mismatch, and switched the module copy to the typed-array constructor. The scan still checks every aligned candidate in each executable segment and requires a unique slot. I also added up to 50 ms of relocation deferral after the existing boot deadline when a successful Agenda read from the current world epoch has already returned before that deadline. A missing, failed or late read does not qualify. Publication ends the deferral immediately.

I ran eight independent reboots on the same headless P4 profile. I also compiled the existing editable notes/agenda.typed five times with the installed CJI compiler active. The tested headless firmware SHA-256 was 2b75a3fe92700384ddf5cd4fe0b1c2b57949edb5c8cf7c985c09fc0a760af176.

### Why

Most candidate offsets fail on the first word. Using an array callback for each aligned offset and constructing the output via the generic iterable path cost time in the on-device QuickJS linker. Earlier traces also showed that relocation can start while a successful file result is already queued. A short grace keeps that race from adding a long non-preemptible relocation to the remainder of an otherwise ready boot.

### What worked

Cold source-to-publication ranged from 1.894 to 1.910 s with a median of 1.897 s. All eight boots met the two-second target and completed before CJI relocation. The compile median in the matched headless comparison went from 449.150 ms to 360.656 ms. The CJI loader still ran after publication and took roughly 142–151 ms. The native machine and ELF hashes were identical to the existing emulator receipts, and the emulator repeated the parser differential and durable reminder restart. The host application tests, 34 native/Wasm integration tests, and the full Wasm reminder workflow also passed.

The five editable builds had median first response 749 ms and maximum 1.320 s while CJI was compiling in the background. The compiler allocator peak had a median of 433,504 B, and the native module and live-world counters were 24,304 B and 124,588 B respectively. These editable runs use a different background load from the original settled measurements. They verify responsiveness under that load rather than estimating its cost in an A/B comparison.

### What didn't work

None of the eight optimized boots needed the 50 ms extension. The measured improvement therefore does not prove a response-time benefit from the extension itself. The original collision and the post-frame relocation in the optimized runs are separately visible in the raw receipts. The physical panel remained unavailable for this series.

### What warrants a second pair of eyes

Review the upper bound and epoch check around relocation deferral. Check that the marker comparisons, little-endian reads, and typed-array copy preserve the validation contract, including the uniqueness requirement for the reserved executable slot.

### Code review instructions

Compare scripts/10-measure-agenda-boot.py against the loader-baseline and under-two-seconds receipts. Re-run scripts/05-measure-agenda-p4.py with --source build for editable-source behavior. Use scripts/07-check-rv32-parser.mjs and scripts/09-check-rv32-world.mjs to compare the emitted artifacts and the reminder/restart behavior.

## Step 22 — Publish the cold-start milestone and verify restoration

The go-go-parc report was pushed on main at d3b9f2e. After the cold and editable trials I restored the exact previous application at 0x10000. The flash writer verified its hash, the restored boot loaded both CJI manifests, and the console responded to cji status. The peripheral-enabled test image was built and remains available in the clean build directory. The separate physical test stays open.

## Step 23 — Measure Wasm and RV32 with a matched P4 configuration

### What I did

I built the Wasm and native typed Agenda variants with the same headless native catalog, ESP-IDF configuration, radio settings, and operator compiler. The sampler checked the ordered system manifests field by field after removing Agenda's expected engine difference. It preserved the device's existing notes and editable source. It sampled six cold resets, eight bundled rebuilds, and five editable rebuilds for each backend, in that order. The boot sampler now also records compiler heap and artifact bytes, and the comparison script validates the original app image against the saved partition before flashing.

### Why

The first comparison mixed a headless native profile with a Wasm profile that included the peripheral drivers. A matched profile identifies the effects of compilation, engine initialization and running the frame-producing turn with substantially fewer confounders.

### What worked

All 12 cold boots reached publication within two seconds. The six Wasm boots had a 1.877 s median and a 1.878 s maximum. RV32 had a 1.902 s median and a 1.905 s maximum. Wasm's compiler median was 258.3 ms, compared with 360.8 ms for RV32. The median engine-init interval was 89.5 ms for Wasm and 6.2 ms for RV32, and the frame-producing turn medians were 2.92 ms and 1.10 ms respectively. CJI relocation began after the frame in every cold sample.

The cold compiler allocator peak was 428,512 B for Wasm and 433,496 B for RV32. The modules measured 42,201 B and 24,304 B respectively. At publication, the world counters read 147,456 B for Wasm and 124,588 B for RV32. Those counters cover different parts of each runtime. They do not measure whole-device RAM.

The bundled rebuilds had 609 ms and 646 ms median responses for Wasm and RV32. The later editable batches had 488 ms and 493 ms medians. The background compiler can be in a different phase even with the same saved installation and test order, so the comparison does not isolate a source-path cost or establish a runtime tail distribution.

### What was tricky to build

I retained both tested images separately before reconfiguring the ESP-IDF build. The panel-enabled Wasm build also passed and fit the app partition with 0xfb90 bytes of headroom. Its SHA-256 is 1f9d7a62beb58e92bb0a5874775a41e55a9b8365f65109063718b69fc614cbd7. The peripheral-enabled RV32 image from Step 20 has the same 22 primary manifest worlds as that Wasm image. The two physical images differ only in Agenda's engine at the manifest level.

### What warrants a second pair of eyes

The matched image manifests verify the application catalog and notes claims, not the instantaneous CPU load. Separate the cold compile allocator counter from engine accounting and compare stage measurements with the same start and end definitions. The headless results stop at kernel publication. The keyboard and panel stay outside the experiment.

### Code review instructions

Run scripts/12-measure-matched-targets.py with each image's corresponding generated manifest. Review its raw JSON and restore probe, plus scripts/10-measure-agenda-boot.py and scripts/05-measure-agenda-p4.py for the phase boundaries. The design guide now includes the source ABI, kernel event sequence, test APIs, and peripheral-enabled profiles for both engines.

The verified restore ran in the sampler's cleanup path. The flash writer verified the old application, and boot loaded the two normal manifests and answered cji status. I returned the local build-elf profile to its prior RV32 flags and checked that the regenerated typed manifest exactly matched the tested RV32 manifest.

## Step 24 — Publish the matched-target milestone

The matched comparison and memory-accounting explanation were pushed to go-go-parc main at 428f595. The ticket contains the raw headless measurements and both peripheral-enabled build recipes. The requested milestone publications are complete for the implemented and measured work. The assembled hardware task remains open pending real keyboard-to-LCD evidence.

## Step 25 — Check the assembled-device gate against the current hardware

### What I did

I checked the connected host endpoints and found the PicoCalc serial bridge, with no video or USB test-instrument device exposed. I booted the saved peripheral-enabled RV32 application at offset 0x10000 using scripts/13-probe-assembled-agenda.sh. The script checks the restore image against the saved partition and restores it even if the boot probe fails. I preserved the Agenda and I²C lines in various/p4-peripheral-readiness.txt, leaving unrelated serial output outside the ticket.

### What worked

The peripheral-enabled image compiled native Agenda in 354 ms and published a kernel frame after 2.822 s. Its compiler allocator peaked at 433,496 B and the native world counter was 124,588 B. The frame-producing turn took 1.639 ms. The earlier matched headless work still has six cold samples per target under two seconds. This single peripheral-enabled boot used a failing STM32 bus and cannot establish the timings of healthy assembled hardware.

### What didn't work

The keyboard and power worlds reported ESP_ERR_INVALID_STATE on i2c0 address 0x1f. The capture included 191 I²C NACK diagnostics across the boot window. The attached board could produce kernel frames, but no real keyboard-to-LCD timing was captured.

### What I learned

The long interval in this boot was after the notes read was submitted and before its result reached the kernel. The 856 ms interval includes filesystem worker scheduling, kernel queue drain and concurrent system startup. CJI relocation overlapped it. With the STM32 failing, this is evidence about the current probe configuration.

### What should be done in the future

The physical qualification needs a working STM32 keyboard and LCD, then a capture of the physical T keypress and visible Agenda frame. Use the assembled procedure in the design guide. Once the hardware responds, repeat cold, memory and turn measurements on that configuration separately from the input-to-LCD test.

### Code review instructions

Verify the app hash, current STM32 error, and capture boundary in the compact probe receipt. The flasher verified the previous app image at 0x10000 after the probe, and the restored system answered cji status. No task was closed on the strength of this failed-bus boot.

## Step 26 — Verify that the keyboard and panel buses work after power was connected

### What I did

The user connected power and asked me to retry. I booted the same peripheral-enabled RV32 application as Step 25. That removed the previously observed STM32 errors. I then repeated the probe with two serial stats snapshots and an ordinary editable Agenda build from notes/agenda.typed. The probe driver now accepts capture options so the console operations can be reproduced without running a second serial reader.

### What worked

The second snapshot reported 540 I²C transfers and 82 SPI transfers, both with zero errors. These are bus completions. The first and second monitored boots published the Agenda frame after 2.910 s and 2.786 s. The normal editable build published in 667 ms with a 369 ms compile, a 433,732-byte compiler allocator peak, and a 1.022 ms frame-producing turn. The native module remained 24,304 B. Both cold samples missed the two-second target in this powered configuration. The compact receipt is various/p4-powered-peripheral-retry.txt.

### What I learned

Power changed the observable peripheral state. Agenda can still compile and publish promptly on a running system. Full startup differs from the matched headless runs. In the second boot the file arrived at the kernel around 2.330 s but the Agenda settlement started around 2.784 s. The CJI loader finished before the file arrived in both powered boots. The next useful trace counts which worlds run during that interval.

### What was tricky to build

Successful SPI transactions establish that the P4 sent display data. They cannot show the first visible pixel transition. The user stepped away before a physical press or video could be captured. This is a powered-device startup result and still leaves the separate keyboard-to-LCD test open.

### Code review instructions

Read the two `bus i2c0` and `bus spi2` rows in the powered receipt. Reproduce with the Step 25 script and capture arguments `-s 20 -c '8 stats' -c '11 agenda build' -c '17 stats'`. The original application was restored and verified after both probes.

## Step 27 — Attribute powered startup delay after Agenda's file reply

### What I did

I added per-world timing and segment counts between the first successful notes reply reaching the kernel and Agenda publishing its first view. This reuses the boot profiler's fixed array and prints it after the view, so it avoids per-segment serial writes. The timestamp used to recognize a ready reply is retained independently of the two-second relocation deadline. It gives the same bounded deferral when a read arrives in time while also recording later arrivals.

I built the instrumented peripheral-enabled firmware with ESP-IDF 5.4.2 and booted it on the powered device. The application SHA-256 was fb8853717e0cc3e20b593762205c38a08fb8a27a65df3a5107cf9fde460d2203. The sampler parsed the saved capture as a full per-world profile. The host application and native integration suites passed, including all 34 native and Wasm integration tests.

### What worked

Agenda reached publication at 2.856 s. Its real notes reply reached the kernel at 2.296 s and its settlement started about 559 ms later. World segments measured during that gap totaled 529 ms. The compositor occupied 293 ms in 30 segments. The keyboard occupied 81 ms in 44 segments and the display driver used another 32 ms in 46 segments. These three worlds accounted for about 406 ms of the 559 ms gap. The counters at eight seconds showed 144 I²C transfers and 62 SPI transfers with zero errors. The per-world receipt is various/p4-powered-dispatch-profile.json.

### Why

The headless measurements exclude the UI worlds. Their startup traffic could affect the powered path even when Agenda loads its own engine quickly and the keyboard bus works. Summing the actual measured segments establishes how much time is taken by other worlds after the reply is already available.

### What I learned

The two slow intervals in this healthy boot are the wait to get the file result back and the scheduling delay after it reaches the kernel. The second interval is largely accounted for by real world work. The existing selection rule prioritizes driver and service work over app work. It is useful for responsive peripheral service, and it leaves Agenda waiting through UI startup. The result directs further work toward startup paint and dispatch behavior. A scheduler change would need to preserve input, output, and fairness for other apps.

### What warrants a second pair of eyes

The 29.6 ms remainder includes event-loop, queue, logging, and other work outside the measured segments. It is not assigned to a specific subsystem. This attribution is from one powered boot. Repeating that trace and adding the compositor's message type counts would discriminate startup paints from its other service turns.

### Code review instructions

Review the bounded record collection in `agenda_p4.c` and the completed-segment timestamp in `nucleus/kernel.c`. Run scripts/10-measure-agenda-boot.py with --world-profile and compare file_returned_us, settle_us, reply_wait_us, and reply_wait_segments. The physical T-key to LCD experiment remains a separate capture.

## Step 28 — Publish the powered startup profile and verify restoration

The go-go-parc report was pushed on main at d1ce869. The flash writer verified the original app image after the profiling run and the console answered cji status. The profiling firmware remains available for reproducing the powered boot trace. The keyboard-to-LCD measurement still needs a physical press and capture.

## Step 29 — Prepare a compositor message profile

### What I did

I added three compositor segment totals to the existing boot profiler for draw, world status, and all other turns. The collection uses the kernel turn label before completion clears it and includes segments that resume an asynchronous turn. Each total also records how much work ran after Agenda's successful file reply. The diagnostic world workload is still present for direct comparison.

### What worked

The peripheral-enabled RV32 image built with SHA-256 36dff73ad99d57b043dbade9e298d47b7c13862c58a594520d862c6628e77f04. Host system and native suites passed, including compositor restart, launcher behavior, and all 34 native/Wasm integration cases. The sampler accepted a saved powered trace and the extended trace format. The new image has not run on the board yet.

### Why

The earlier powered profile attributes 293 ms of the wait to the compositor. Separating draws and status handlers will reveal whether the cost is repainting, processing fault and restart messages, or other service work.

### Code review instructions

Use the powered boot probe with the compositor trace image and parse the per-world output from scripts/10-measure-agenda-boot.py. Compare the three compositor rows with the earlier world total before choosing an optimization.

## Step 30 — Expand the finish line to typed Agenda feature parity

The user asked to update the goal to feature-identical Agenda in the typed language. The ticket now uses the original JavaScript app and its tests as the behavioral reference. Its scope includes the UI, editing, file semantics, date shortcuts and Editor transfer, along with the existing reminders, backends, on-device budget measurements, physical timing, and publishing requirements. The goal status tool accepts status updates only, so the expansion is recorded in the ticket and applies to the working objective in this conversation.

## Step 31 — Run the compositor message trace on the powered device

The same peripheral manifest and diagnostic workload booted with 145 I²C and 62 SPI transactions and no bus errors in the captured stats. Agenda published after 2.782 s. In the 462 ms from receipt to settlement, the compositor occupied 235 ms. Draws accounted for 84 ms across four segments, status handlers for 5 ms across two, and the other handlers for 146 ms across seventeen. The new split sums to the measured compositor world total. Removing draws alone would leave most of the delay. The app partition was restored and verified, and the original firmware answered cji status. The receipt is various/p4-powered-compositor-turns.json.

## Step 32 — Infer initialized local types in the shared frontend

### What I did

I made the local type annotation optional for initialized let and const declarations. The compiler already derives a semantic type while emitting the initializer. The declaration now checks it against an explicit annotation or uses it as the binding type. Assignments continue to check that fixed type and the binding's mutability. Parameters, return types, and record fields still use explicit declarations.

### What worked

scripts/14-check-local-inference.mjs stripped all 25 local annotations from the existing typed reminder source in memory and compared the emitted Wasm and RV32 artifacts byte for byte. Both matched. A small inferred program executed in Wasm. Both compilation paths still reject incompatible assignments, a wrong annotation, mutation of const, self-reference, and a missing initializer. The 6,411 stored task-line comparisons also passed.

### What I learned

Initializer types are already available at declaration time, so this rule needs no extra pass or runtime representation. The change is independent of adding contextual typing for an empty typed collection later.
