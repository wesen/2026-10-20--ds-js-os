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
