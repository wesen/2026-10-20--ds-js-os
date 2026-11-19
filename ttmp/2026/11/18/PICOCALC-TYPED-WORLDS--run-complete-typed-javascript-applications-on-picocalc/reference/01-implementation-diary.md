---
Title: Implementation diary
Ticket: PICOCALC-TYPED-WORLDS
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T23:39:08.850640852-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1 — Set the complete Editor boundary and compile its empty view

The current goal covers Editor alone. The app-specific C prototype was removed before commit. Its experiment verified the kernel file path but left document state, command policy, and screen building in C, contrary to the clarified source requirement. The reusable typed layout checkpoint remains. The next slice provides the original no-file view from typed source on both compiler backends.

### Prompt Context

**User prompts (verbatim)** “I want them to be 100% typed javascript”

The user subsequently set the goal “convert editor entirely to typed javascript. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”.

**Assistant interpretation:** Every application-specific handler and behavior in Editor belongs in typed JavaScript. Shared kernel and SDK code may provide primitives to the app.

**Inferred user intent:** Get a full typed app that the handheld can compile and run using the device compiler. Existing behavior remains the reference.

### What I did

- Audited where the original Editor and the hybrid Agenda and Files implementations keep application behavior. Recorded the distinction in the implementation guide and retained the earlier hybrid device receipts as such.
- Created `PICOCALC-TYPED-WORLDS`, scoped its active tasks to Editor, and uploaded the guide to `/ai/2026/11/18/PICOCALC-TYPED-WORLDS/PicoCalc Editor Entirely in Typed JavaScript.pdf`. The service returned `OK: uploaded`.
- Added bounded `buffer.writeLiteral(offset, "...")` support to the shared typed front end. Both output engines consume its existing indexed-load and store instructions. Used it in `worlds/editor/view.typed` to generate the original unopened Editor screen.
- Added a scripted test that obtains the expected view from the original app, runs the emitted Wasm in Node, and executes the matching RV32 code in the local emulator.

### Why

The original Editor's behavior needs typed source for presentation as well as document geometry. A literal write lets the first renderer express the original text and UI tree. The existing string input ABI remains useful for operating-system events and documents. The generic runtime design is separate from app-specific event ordering and view policy.

### What worked

- `scripts/01-check-editor-empty-view.mjs` matched all 222 UTF-16 units of the original empty view. The test module including its extra fixture functions emitted 2,111 Wasm bytes and 6,972 RV32 bytes.
- The test verified surrogate-pair and escape decoding, nonzero write offsets, empty writes and a Wasm trap before any write on insufficient capacity. The previous layout test still passed 107,776 dual-backend vectors.
- Re-ran the existing Files and Agenda Wasm workflow drivers after the lexer change. Files matched 26 screens and exact writes. Agenda passed its grouped views, diagnostics, mutations, refresh, Editor grant and reminder checks.
- Before withdrawal, the prototype with a C Editor reactor matched seven Editor views and all 26 Files views through the real simulator file grants and saves. This was evidence about the native SDK path. That prototype did not satisfy the source requirement and is outside the new implementation.

### What didn't work

- The discarded C prototype's RV32 emulator runner initially pointed at `02-editor-rv32-driver.c` and the cross-compiler reported “No such file or directory.” After correcting that path, the prototype runner reported `it links to __gtdf2, which picocalc-os does not give a module`. The failure was in the local fixture's resolve table, which lacked that helper. The production resolver already lists it. The prototype was withdrawn when the user clarified source ownership.
- The new empty-view slice still runs as an isolated generated function. The common world runtime, actual Editor manifest entry, event handling, and physical qualification remain open.

### What I learned

A compiled typed function and a complete typed app are different implementation milestones. The original Editor relies on application-level decisions about pending reads and writes, dirty state, and file grants. A shared SDK should deliver the events and offer checked operations, while the typed Editor tells the SDK when to use them.

### What was tricky to build

The tokenizer and emitter accept a double-quoted literal with JSON escapes. The emitter checks both the start and the final UTF-16 index before the first store. This avoids modifying the beginning of the view before discovering that the buffer is too short. Wasm and RV32 reuse the existing unsigned bounds and trap instructions.

### What warrants a second pair of eyes

The literal write initially emits a store per code unit. It is adequate for this view, but its growth should be considered when sharing larger constant data across a real application. The temporary 1,022-unit limit follows the RV32 immediate-offset range. The runtime design should provide a single storage ownership contract so limits and error behavior are identical across engines.

### What should be done in the future

Use a shared reactor to run the generated Editor initialization and publish the typed view. Add typed SDK imports and the open/read settlement first, then port edit keys, file saves, search, Markdown, and stored positions. Keep original Editor tests and the Files handoff fixture as verification. Finish by comparing both handheld engines and checking that the Editor build uses the common reactor.

### Code review instructions

Start at `worlds/editor/view.typed`, the literal token and `bufferLiteral` in `compiler/typed-wasm.js`, and the RV32 store lowering in `compiler/typed-rv32.js`. Run the new ticket's `scripts/01-check-editor-empty-view.mjs` from the repo root with the P4 GCC and the CJI `build/rv32/rv32emu` path. The emulator needs its companion objects in that directory.

### Technical details

The `buffer` header contains the writable capacity in UTF-16 units. `writeLiteral` returns the unit count and leaves the capacity unchanged. Empty literals return zero and store no bytes. The screen is a JSON UI tree matching the original Editor screen before it receives a file handle. The test's synthetic C driver passes data to the generated function under RV32 emulation and is absent from application builds.

## Step 2 — Run Editor startup through a shared world reactor

The standalone typed screen now runs as a PicoCalc world. Its startup metadata, shortcut, icon and empty view are written in `worlds/editor/editor.typed` and `view.typed`. The shared runtime transfers those strings to the existing SDK.

I loaded the Wasm world through the same host manifest path used by other PicoCalc apps. The original and generated Editor produced the same compositor JSON and pixel output. The linked RV32 module exercised the same runtime source under the emulator.

### Prompt Context

See Step 1 for the active Editor goal and source boundary.

**Commit (preceding checkpoint)** `616a50e` — “Start the complete typed Editor port with its original empty view.”

### What I did

- Added `sdk/typed/world.c` and template slots for Wasm and RV32. The shared reactor invokes the typed metadata and event entry points. It validates UTF-16 output, converts it to UTF-8, and uses the existing native presentation and screen calls.
- Added `compiler/typed-world.js` to check the app entry signatures and use the appropriate existing linker.
- Added a typed Editor bootstrap with the original kind, title, shortcut, icon, about text, and startup view and hints.
- Added `scripts/02-check-editor-world.mjs` and its RV32 driver. The host script starts the original Editor and the compiled Editor in matched manifests, presses the actual Editor shortcut, and compares both the screen tree and framebuffer image.

### Why

The earlier experiment compiled a function and checked its bytes. Running the typed source as a world tests the ABI, launcher entry, lifecycle, compositor, and target loader together. The shared source makes metadata and screen transport reusable by a separate app without copying C.

### What worked

- `make -C picocalc-os typed-world-reactor build/picocalc-host` succeeded.
- `scripts/02-check-editor-world.mjs` passed with the P4 GCC and CJI emulator. The Wasm package was 15,972 bytes and the P4 ELF was 27,332 bytes. The RV32 driver checked the complete metadata, start frame and absence of an extra tick frame. The Wasm test checked exact frame JSON, hint text and framebuffer bytes against the original.
- The Wasm test linked the compiled Editor to the same generic reactor used for the RV32 source build. Neither target used an Editor-specific C implementation.

### What didn't work

No command failed in this checkpoint. The user-facing Editor remains the original app in the stock manifest. The validated fixture exercises startup and the launcher shortcut.

### What I learned

The runtime can cover basic view output with two entry points and no Editor knowledge. A complete Editor needs richer kernel input and an SDK operation path. The existing `NW_DONE` and `NW_LATER` turn contract must remain visible to the typed program for file-open sequencing.

### What was tricky to build

The same typed source has to fit the SDK's byte limits on both targets. The reactor validates surrogate pairs and the output buffer size before sending a UTF-8 view. The actual `nw_screen` syscall still checks the combined screen and hints limit. The startup comparison loads the real compositor, so identical screenshots also cover launcher activation.

### What warrants a second pair of eyes

Treat the two entry points as an initial ABI. The current event entry receives the event kind. The rest of the event envelope and a checked effect API still need to be wired into typed code. Avoid encoding Editor decisions in the reactor as that interface grows.

### What should be done in the future

Add kernel message and settlement input and the checked SDK call boundary. Exercise a real Files handoff and read settlement with the typed Editor. Run the reference Editor scenarios for editing, saves, search, Markdown, and positions before a hardware install.

### Code review instructions

Trace `compiler/typed-world.js` through the existing `linkWorld` and `linkSlot` functions. Read `sdk/typed/world.c` beside the typed Editor entry points. Build the reactor with make and run the ticket's startup fixture from the project repository root with the P4 compiler and emulator.

### Technical details

`typedWorldMeta(field, buffer)` returns a UTF-16 count for kind, title, shortcut, help text or icon. `typedWorldEvent(kind, screen, hints)` returns the screen count. A zero return means that the typed world has no frame to publish for that event. The current shared runtime is a bootstrap and rendering path. File I/O and interactive keys still need runtime hooks and typed Editor handlers.

## Step 3 — Let typed Editor call the shared SDK

Editor now explicitly requests its start frame through `typedSdkScreen`. The runtime validates the two output spans and forwards the existing screen call. The typed event's return value can carry the kernel's done-or-wait status independently of a frame length.

### Prompt Context

See Step 1 for the full Editor goal. This advances the shared runtime needed to keep application policy in typed source.

**Commit (preceding checkpoint)** `766e12b` — “Boot typed Editor through a shared PicoCalc world reactor.”

### What I did

- Passed typed SDK signatures into the existing function resolver in `compiler/typed-wasm.js`. The Wasm linker binds those names to exported reactor functions and compares their machine-level signatures.
- Added RV32 fixups for calls to the runtime and a table of tail jumps in `sdk/typed/rv32-slot.S`. The slot encodes the number of typed entries and runtime imports. Old reactors use zero runtime imports and retain their existing header value.
- Moved the screen publication request into `editor.typed`. The generic C function checks the buffer identities and counts, transcodes the UTF-16 strings, and calls `nw_screen`.

### Why

A typed world needs to choose the timing and order of its effects. Separating SDK calls from the event result preserves that control. The runtime still uses the existing checked kernel entry.

### What worked

- The Wasm simulator comparison still matched the original Editor frame and screenshot. The linked RV32 startup and metadata tests still passed. The updated artifacts were 15,819 bytes for Wasm and 27,284 bytes for ELF.
- Both linkers rejected a screen call with an integer where the typed signature requires a buffer.
- Existing Files passed its Wasm and RV32 fixtures. Editor's standalone layout still passed 107,776 vectors.

### What didn't work

No failures occurred in this checkpoint. The runtime still only exposes the screen SDK call, and the event entrance currently carries only the event kind.

### What I learned

The existing Wasm index mechanism already fits direct typed calls into a trusted reactor. The RV32 backend can preserve position independence by emitting a relative call to a fixed-size template trampoline. The trampoline jumps directly to the SDK wrapper with the original return address retained.

### What was tricky to build

The runtime SDK functions must resolve before the typed functions are checked. RV32 generates the typed code separately and learns the relative position of its trampoline at ELF linking. The template linker checks the declared import count and validates that each trampoline begins with the intended jump encoding.

### What warrants a second pair of eyes

Keep the shared SDK signature order aligned with the assembly trampoline order as more operations become available. Check that every writable range is validated locally and that the kernel remains responsible for authority checks.

### What should be done in the future

Deliver the structured message and settlement data to the typed app, keep per-instance state across turns, and add checked file-open, read, reply, and grant-release calls. Drive the original Files-to-Editor open workflow through both targets.

### Code review instructions

Compare the import handling in both compiler backends and follow `typedSdkScreen` from typed Editor through the runtime and `nw_screen`. Run `02-check-editor-world.mjs` with P4 GCC and the CJI emulator after rebuilding `typed-world-reactor`.

### Technical details

Wasm binds the runtime function's existing index. RV32 stores the relocation offset and the import-table index, then patches a four-byte JAL to its template trampoline. The original two typed entry slots are still patched as tail jumps into the generated program. The screen API takes two explicit lengths in UTF-16 units and returns the kernel SDK result as an i32.

## Step 4 — Open files through typed Editor and the shared SDK

The file-open workflow now lives in typed source. Editor reads the offered handle, waits for its token, normalizes the loaded document, replies to Files, and renders the first viewport. The runtime provides generic state and text storage, JSON event decoding, and checked SDK calls. It does not select the app's filename, file ownership transition, or screen.

The normal workflow passed through the PicoCalc simulator with the original Files app and actual file capabilities. A separate RV32 driver loaded the linked ELF and replayed a corresponding SDK sequence. A 64 KiB fixture also rendered identically with an experimental Wasm budget. The stock Wasm turn budget remains a limit for that case.

### Prompt Context

See Step 1 for the complete typed Editor goal.

**Commit (preceding checkpoint)** `1e26184` — “Bind shared SDK calls from typed worlds on Wasm and RV32.”

### What I did

- Added a fixed `WorldEvent` and scalar `WorldState` contract and validated the layouts in `compiler/typed-world.js`. The shared runtime owns the allocations. Editor declares its own field meanings and tracks both the active and offered file handles.
- Added generic SDK helpers for event strings, named handles, file reads, replies, releases, and yielding. Moved the strict single-code-point UTF-8 decoder to a helper shared with the existing native apps.
- Added Editor's typed token-matching state machine, newline normalization and JSON viewport rendering. Retained the previous grant until the new read was accepted, and released a refused grant without clearing the old frame.
- Extended `scripts/02-check-editor-world.mjs` and its RV32 driver for existing and missing files, a Unicode and mixed-newline payload, stale settlement tokens, and rejected reads. Used the original JS Editor as reference for three screen trees and three simulator framebuffer captures.

### Why

A file arrives as a capability inside an ask. The app has to keep that ask pending until the read settles and manage the capability lifetime itself. The SDK hands it the result and enforces authority. A full-size input also needs bounded work per event so a file open does not monopolize the kernel lane.

### What worked

- The normal fixture passed at the stock Wasm quota and 50 ms budget and through RV32 emulation. It matched three screens and their simulator framebuffers. The first file contained an emoji, a wrapped row, a tab and mixed newlines. The missing file opened empty.
- The RV32 fixture confirmed that a stale token produces no reply, a successful replacement releases the previous grant, and an ordinary read failure releases only the refused grant.
- With `--large`, a 65,536-byte mixed-line-ending ASCII file matched the original view. The typed Wasm fixture used 512 KiB and a 200 ms virtual turn budget. The original QuickJS Editor used 2 MiB for this comparison. The RV32 driver also exercised the normalized result and the explicit yield tokens for this file.
- The linked Editor artifacts were 27,441 bytes for Wasm and 70,856 bytes for ELF. The Files Wasm regression still matched its 26 screens after factoring the UTF-8 decoder.

### What didn't work

- Appending record declarations behind the layout functions produced `SyntaxError: 130:1: expected function`. The typed grammar requires records at the beginning. The test now concatenates `state.typed` before the functions.
- The first RV32 driver compared the JSON source strings and reported `failed: typed screen`. The test uses parsed trees because the typed writer escapes the tab as `\\u0009` and the reference can use `\\t`.
- The original Editor's 512 KiB fixture reported `ran out of memory (its limit is 512 KB)`. The first large-frame collector also hit `SyntaxError: Unterminated string in JSON at position 1003` from the logger's per-record limit. The reference now uses a larger world memory quota in the stress case, and the collector writes short chunks.
- The typed path exceeded `50 virtual ms` on the 64 KiB fixture. Before optimizing the shared decoder, it also exceeded `200 virtual ms`. The generic decoder now widens groups of eight plain ASCII bytes and handles escapes or non-ASCII through the scalar path. Combined with separating decoding and normalization and yielding every 4,096 UTF-16 units, the fixture passes at 200 ms. It still fails at 50 ms.

### What I learned

The app's normalization and runtime JSON conversion contribute separately to the meter. Yielding only inside the typed normalization loop did not fix the first segment. The original and typed implementations also have different memory use when handling the same large input, so the stress comparison explicitly records separate quotas.

### What was tricky to build

The runtime uses a counted buffer capacity during writing and a counted string length during reading. The typed code obtains a fresh writable view by slot before writing again. The normalization loop also handles a CR LF pair split across chunk boundaries by comparing the next unit against the actual source length.

### What warrants a second pair of eyes

The 64 KiB case uses representative mostly-ASCII data, and the 50 ms limit remains unresolved. Check long unbroken lines and heavy escape expansion separately. The native test stubs file effects, while the simulator exercises real grants. Hardware, saved positions, editing, saving, Markdown, and search still require qualification.

### What should be done in the future

Port keyboard input and document mutations, then implement write snapshots and save completion. Retain the same grant and view evidence while adding positions, dirty-state refusal, search, and Markdown. Profile long opens before selecting the production budget. Then build and qualify the complete world on both handheld engines.

### Code review instructions

Read `worlds/editor/state.typed`, `editor.typed`, and `view.typed`. The shared bridge is `sdk/typed/world.c`, with import signatures in `compiler/typed-world.js`. Rebuild `typed-world-reactor`, then run `02-check-editor-world.mjs` with P4 GCC and the CJI emulator. Add `--large` for the 64 KiB case or `--large --stock-budget` to reproduce the current stock-budget limit.

### Technical details

The runtime validates the fixed 16-byte event record and allows up to 64 scalar state fields. Its text storage currently provides a 65,536-unit slot and three 256-unit slots. The open handler keeps the ask pending with `NW_LATER`. File and yield settlements use the same token matching. The RV32 reactor reserves 64 KiB of typed code space because the new view and event routines exceed the startup-only slot budget.

## Step 5 — Edit and save the granted document from typed code

Editor now receives compositor keyboard messages, moves the cursor through logical lines and wrapped rows, and edits the UTF-16 document. Its save handler submits the changed text through the existing file grant. A detached write token lets editing continue during a pending save.

The matched simulator fixture now exercises navigation, deletion of a supplementary character, insertion, joining and splitting lines, and an actual write. The RV32 fixture adds a sequence in which the user types after submitting one save and asks to leave while that write is pending.

### Prompt Context

See Step 1 for the full Editor migration goal.

**Commit (preceding checkpoint)** `adfd4f9` — “Open files and render the document in typed Editor.”

### What I did

- Added the typed command, motion, splice, and save code in `worlds/editor/edit.typed`. The app owns key gating, surrogate-pair movement, soft-wrap navigation, line splitting, dirtiness, write tokens, and compositor focus requests.
- Generalized the typed document view to draw the actual viewport, cursor, status, and hints. The typed code decides which rows and status to present.
- Bound generic SDK operations for moving a bounded span, submitting a file write, extracting an integer event member, and sending a message. The runtime checks the ranges, transcodes UTF-16 for the file SDK, and preserves the kernel's existing file permission checks.
- Extended `02-check-editor-world.mjs --edit` and its RV32 driver to compare settled screen states and exact saved bytes. The RV32 driver also verifies that the older write does not clear a more recent edit and that a later clean completion returns to Files.

### Why

The keyboard and save policy belong to the typed application. A bounded shared move primitive keeps raw memory copying separate from Editor's decision about what to insert and delete. Saving must preserve the bytes that were submitted even if new input arrives before the settlement.

### What worked

- The 123-byte fixture matched the original across all observed settled frames and four captured framebuffers at a 50 ms Wasm turn budget. The test deleted the emoji as one character, spliced the lines, and checked the exact normalized saved bytes on disk.
- The relocated RV32 fixture checked the same screen trees and file bytes. It then held the first of two writes, applied another edit, and verified that the first completion kept the newer content dirty and left Editor focused. The later clean save honored the earlier escape request.
- The 64 KiB open regression still passed under the experimental 200 ms turn budget. The original Editor's ten reference tests passed separately.

### What didn't work

The first linked RV32 run reported `it links to memmove, which picocalc-os does not give a module`. The local emulator fixture's import table omitted the helper. The P4 resolver already exports it. Adding it to the fixture enabled the linked test.

### What I learned

The filesystem SDK copies the submitted bytes while accepting the write. The typed app can use a document revision to identify whether the visible state has advanced before settlement. Revision comparison is sufficient for the tested sequence. Full parity must also consider edits that reconstruct the exact submitted text and the saved copy needed by confirmed discard.

### What was tricky to build

A logical line-relative status column, display-row cursor column, and document offset have different meanings after soft wrap. The typed renderer uses the same row geometry for status and layout while preserving the preferred column across vertical commands. The generic splice moves overlapping memory, so deleting a Unicode pair and joining adjacent lines retain exact surrounding text.

### What warrants a second pair of eyes

Confirm full save parity with an exact saved snapshot, including edit-back-to-same-content, discard, and permission errors. The current Escape warning covers dirty state and waits during a pending save. Confirmed discard, search, Markdown, saved positions, performance on the physical device, and final installation remain open.

### What should be done in the future

Implement exact snapshot comparison, dirty discard, and durable cursor positions, then search and Markdown. Measure navigation for long inputs whose cursor is near the end. Finish by running all original behaviors against the compiled app and verifying both physical targets.

### Code review instructions

Read `worlds/editor/edit.typed` and check how its functions call `editorLocate` and `editorDocumentFrame` in `view.typed`. Follow `typedSdkFileWrite` to the existing write operation. Build `typed-world-reactor` and run `02-check-editor-world.mjs --edit` with P4 GCC and the CJI emulator. Run `--large` separately.

### Technical details

The visible document is a bounded UTF-16 buffer. Cursor offsets and span copies use UTF-16 units, while status and wrap columns count code points. The kernel copies the UTF-8 snapshot for a write. The current typed state records the document revision at submission and matches the returned write token. The RV32 template slot is 96 KiB for the added command and view routines.

## Step 6 — Preserve exact save snapshots and restore the last saved text

The typed app now selects a saved snapshot and a separate pending snapshot from two storage slots. Editing continues in the document buffer while the kernel writes a copy of the submitted text. On a successful settlement, Editor promotes the pending snapshot and compares its content with the visible document. On failure, the old snapshot remains available for a later discard.

The simulator replay now presses Escape twice after an unsaved edit and verifies that Files regains focus without any new write. The RV32 replay also covers editing back to the submitted bytes during an outstanding write and a subsequent failed write.

### Prompt Context

See Step 1 for the complete typed Editor goal.

**Commit (preceding checkpoint)** `8b7df99` — “Port Editor keyboard editing and asynchronous saves to typed JavaScript.”

### What I did

- Replaced revision counters in `state.typed` and `edit.typed` with the saved slot and the typed discard arm. The event handler selects which snapshot to capture, promote, compare, or restore.
- Added generic UTF-8 snapshot capture, exact comparison against UTF-16, restoration, and file submission to `sdk/typed/world.c`. Exposed those operations using the common compiler signature table and RV32 trampolines.
- Implemented the original double-Escape confirmation, status text, restoration, and return-to-Files behavior. Edits cancel the armed state. A successful save that matches the document clears it as well.
- Included asynchronous filesystem error text in the typed view and added the shared error-text path for immediate kernel call failure.
- Extended `02-check-editor-world.mjs --edit` and its RV32 driver to verify discard, write races, and preservation of the accepted snapshot after rejection.

### Why

A revision counter cannot detect a sequence that edits and then restores the exact submitted content. Discard requires the saved content even after a failed write, and rereading the file would make the result depend on external changes. The app owns snapshot policy. The shared runtime owns representation conversion and transport.

### What worked

- The Wasm simulator matched the original's settled frames and four framebuffer captures, including the discard workflow. The persisted file bytes matched the reference.
- The linked RV32 driver verified that additional text stayed dirty after the earlier write, that editing back to the submitted text was clean, and that a clean completion honored the return-to-Files request.
- A simulated write failure displayed “Not saved: disk full”. A later confirmed discard restored the previous good snapshot without submitting another write.
- The 65,536-byte open fixture still passed on both backends with the established 200 ms experimental Wasm budget and 512 KiB typed-world memory quota. The linked artifacts at this checkpoint were 42,884 bytes for Wasm and 104,820 bytes for ELF.

### What didn't work

No validation command failed in this checkpoint. The large-file test still uses the experimental budget recorded in Step 4. It exercises opening, not a full-size save or discard.

### What I learned

A successful save can swap slot roles without copying between them. Comparing UTF-8 and UTF-16 by decoding into scalar values handles supplementary characters and avoids adding another full document buffer. The document restored after discard uses the same normalized line endings as the editor view.

### What was tricky to build

The pending snapshot must survive until the matching write token settles. The active snapshot must survive a failed write. The typed event logic controls both lifetimes and clears the deferred leave request when the write completes. The runtime handles a single checked operation per call.

### What warrants a second pair of eyes

Check worst-case full-size snapshot capture and restore against Wasm instruction and memory limits. Persisted cursor positions, search, Markdown, and both physical installations remain open. The simulator and emulated RV32 workflow are independent evidence, with real filesystem effects in the former and explicit fault injection in the latter.

### What should be done in the future

Wire the typed app to the existing per-file position record. Then port search and Markdown, run the full original behavioral suite against both generated targets, and qualify the result on PicoCalc.

### Code review instructions

Start with `editorSave`, `editorWriteDone`, and `editorDiscard` in `worlds/editor/edit.typed`. Follow the snapshot imports to `sdk/typed/world.c`. Rebuild `typed-world-reactor` and run `02-check-editor-world.mjs --edit` with the ESP32-P4 GCC and CJI emulator. Run `--large` for the separate capacity fixture.

### Technical details

The typed state keeps one index identifying the last successful snapshot. The second slot contains the text of the next pending write. Each generic slot holds up to 65,536 UTF-8 bytes and a terminating NUL. The filesystem SDK receives the snapshot using the current file capability. The same shared C source is linked into both backends and contains no Editor-specific ownership state.

## Step 7 — Load and persist per-file cursor positions in typed Editor

Typed Editor now reads the existing `pos` record and restores the logical line, code-point column, and viewport top when a file opens. It stores the current position on successful saves, departure, and replacement. The simulator verified a saved position across a fresh process with the same disk-backed store.

The app keeps a position for up to 20 files. It ranks the previous positions by their stored timestamps and retains up to nineteen alongside the position it just touched. The kernel continues to own the world's store namespace and persistence.

### Prompt Context

See Step 1 for the full typed Editor migration goal.

**Commit (preceding checkpoint)** `0b6ad0b` — “Preserve exact typed Editor save and discard snapshots.”

### What I did

- Added `worlds/editor/positions.typed` for reading and writing the original `{"pos":{"path":[line,column,top,epoch_millis]}}` schema. It parses the app's stored tuples, checks the filename, chooses which entries to keep, and applies the position to the current document.
- Added generic store load and save bindings and a timestamp formatter to the common runtime. The timestamp uses the same boot epoch as the existing JS realm when wall time is unavailable.
- Connected position updates to opening another file, a successful write, clean Escape, and confirmed discard. Restoration runs after new-file state initialization and before the first viewport is published.
- Extended `02-check-editor-world.mjs --positions` with a seeded record containing 20 files and a second simulator invocation using the same on-disk store. The RV32 driver runs the corresponding seeded restore, updates, and eviction using the shared store ABI.

### Why

Persisting raw cursor offsets would lose the meaning of positions after file edits and would change the user's existing records. The original logical coordinates let the typed Editor clamp against the reopened text. The app can compare decimal timestamp spans directly without adding a 64-bit value type to the compiler.

### What worked

- The matched Wasm run restored the original position after a supplementary character, advanced one code-point column, wrote the updated record, and recovered that change in a fresh process. Its four framebuffer captures matched the original. Both runs retained 20 entries and evicted the oldest.
- The linked RV32 driver matched the original frame trees and verified both the updated coordinate and the eviction in the stored record.
- The editing, write, and discard comparison still passed at the stock 50 ms simulator turn budget. The 64 KiB open fixture still matched with the experimental 200 ms budget. The ten original Editor tests passed separately.
- The linked artifacts were 64,339 bytes for Wasm and 138,220 bytes for the shared-runtime RV32 ELF.

### What didn't work

The first combined typed source run reported `SyntaxError: 362:11: expected identifier`. The local name `record` collided with the typed language's record keyword. Renaming it to `stored` resolved the parse failure.

### What I learned

The record's column counts code points, while the document's cursor is a UTF-16 offset. Restoring a stored column by advancing code points is necessary for supplementary characters. The snapshot routines and the position routines temporarily change a buffer's length header, so replacement must reacquire the writable document view before decoding the new file.

### What was tricky to build

Opening a replacement file overwrites document storage. The app remembers the old position while its coordinates can still be calculated, then restores the new file's position after reading and normalizing it. The shared store scratch slot keeps the existing JSON available while new JSON is assembled in a separate buffer.

### What warrants a second pair of eyes

The on-disk parser targets the compact, single-root `pos` record produced by the original Editor. Timestamp ties retain the previous order among untouched entries, with the new touch first. A backward clock jump can therefore differ from a full wall-clock sort. Long documents with a cursor near the end still need timing checks.

### What should be done in the future

Port find, find-next, and highlighting, then Markdown editing and preview. Run the full workflow tests on both compiled engines and qualify the physical device build.

### Code review instructions

Read the schema handling in `worlds/editor/positions.typed` next to the original `edRemember` and `edRestore`. Review lifecycle calls from `editorOpened`, `editorReadSuccess`, and the save and departure handlers. Rebuild `typed-world-reactor` and run `02-check-editor-world.mjs --positions` with P4 GCC and the CJI emulator.

### Technical details

The shared bridge supplies a bounded 4,096-unit store scratch buffer. Ranking uses compact UTF-16 offsets into that short record and stores no extra document copy. The RV32 code template now reserves 128 KiB. The position persistence test uses the actual host store directory, while the RV32 fixture intercepts the same native store opcodes.

## Step 8 — Port Find, Find Next, and match highlighting

Editor now runs the find prompt, case-insensitive search, wraparound, and textarea highlights in typed JavaScript. The document and query use the common counted UTF-16 buffers. Search adoption adds no app-specific C handler.

The matched simulator and RV32 runs used the same key sequence, including query editing, a missing result, case-insensitive repetition, overlapping matches, and Unicode characters that affect an ASCII search.

### Prompt Context

See Step 1 for the complete typed Editor goal.

**Commit (preceding checkpoint)** `0168e57` — “Restore and persist per-file cursor positions in typed Editor.”

### What I did

- Added `worlds/editor/find.typed` with the prompt state, line-by-line search loop, cursor mapping, find status text, and per-row match markers.
- Connected F3, F4, Enter, Backspace and Escape to the typed key dispatcher. Opening a file or discarding edits clears the query the same way as the original app.
- Split the viewport into shared helpers, the document renderer, and a standalone empty view so the compiler sees helpers before callers. The startup-only test now loads `empty.typed`.
- Extended the common buffer allocator with another small slot for opaque persistent text. The typed world uses it for the query.
- Added the `--find` scenario to the matched host and linked RV32 test. The C fixture replays the same key sequence generated by the Node runner.

### Why

Search and its cursor effects belong in the typed world. The original prompt accepts printable ASCII, but applies Unicode lowercase conversion to the document. Preserving the reference's folded string indexes matters for both cursor movement and highlight columns.

### What worked

- The 65-byte fixture matched the original's screen trees and four compositor framebuffer captures in the Wasm simulator at the stock 50 ms budget. The RV32 emulator matched the screen trees and hint changes on the same inputs.
- The fixture checked wraparound, Kelvin-sign matching, dotted-I expansion, missing searches, prompt cancellation, and two overlapping matches in `ababa`. The original and typed worlds kept the file bytes unchanged.
- The edit/save, position restoration, and 64 KiB open scenarios still passed. The large-open run uses the previously recorded 200 ms budget. The standalone initial-view fixture and 107,776 layout vectors also passed.
- The linked typed Editor was 67,933 bytes for Wasm and 170,972 bytes for ELF.

### What didn't work

No executable validation command failed in this checkpoint. Long-document search performance remains unmeasured. Earlier large-open limits remain as documented.

### What I learned

The fixture checks every scalar's lowercase conversion in the Node runtime used by the host tests. Outside ASCII, only dotted I and Kelvin sign can emit a printable ASCII unit, and only dotted I expands the UTF-16 length when lowercased. QuickJS reference execution also checked those characters through the real Editor workflow. A dotted-I match cannot continue across its added non-ASCII combining mark.

### What was tricky to build

The reference looks for a term in a lowercase logical line and then applies the match index to the original line. The typed implementation preserves that mapping, even when an earlier dotted I shifts the folded index. Highlight matches use each visible wrapped row as a separate search span and permit overlaps.

### What warrants a second pair of eyes

Check instruction use on an unsuccessful search across the full 64 KiB and on viewports with a dense set of marks. The current fixture proves the behavior on a representative text sample. Markdown bracket handling, indentation, line colors, and preview remain to be ported.

### What should be done in the future

Implement Markdown continuation, styling, and preview in typed source. Then compare the complete workflows and device timing across the two engines before selecting the typed Editor in physical firmware.

### Code review instructions

Start with `find.typed` beside the original `edFindNext`, `edKey`, and `edView`. Review `document-view.typed` for the cursor and mark output. Rebuild `typed-world-reactor`; run the ticket's `02-check-editor-world.mjs --find` with P4 GCC and the CJI emulator.

### Technical details

The prompt stores up to 60 ASCII characters and hides the cursor while editing. The search keeps folded UTF-16 offsets until mapping them back to original code-point columns. The compositor receives its existing `textarea` marks array. The shared RV32 template reserves 160 KiB for the typed module.

## Step 9 — Port Markdown editing and preview

Typed Editor now detects Markdown extensions, colors headings, quotes, and fenced code, and continues bullet or numbered lists. F6 enters and exits preview. The typed preview builds the existing Compositor lines tree from headings, paragraphs, lists, quotes, and fenced blocks.

The matched tests verified real saved file bytes as well as presentation. The fixture used a viewport that starts inside a fence whose opening marker is offscreen, plus a separate preview with inline syntax and a Unicode heading.

### Prompt Context

See Step 1 for the complete typed Editor goal.

**Commit (preceding checkpoint)** `2a4ed8e` — “Port Editor find and match highlighting to typed JavaScript.”

### What I did

- Added `markdown.typed` for extension detection, line classification, list markers, inline token removal, and decimal continuation. Enter continues an indented or numbered list and clears an empty item.
- Added `preview.typed` for paragraph aggregation, item presentation, fence handling, and preview scrolling. The typed app chooses the syntax, transformation order, text and colors.
- Exposed a generic UTF-16 uppercase operation using the same vendored QuickJS Unicode mapping tables as the reference. It preserves expansions such as sharp S to SS. No Markdown parser runs in C.
- Extended the matched host and RV32 fixture with `--markdown`. It saves a document after removing an empty bullet and adding a continued numbered entry. It compares Markdown edit and preview trees and simulator framebuffers.

### Why

The existing Editor combines line-oriented editing and a lightweight reading view. Reusing the Compositor's lines widget preserves the reference viewport and scroll behavior. Sharing the existing Unicode tables avoids a second case-mapping implementation while keeping the choice of when to capitalize a heading in typed source.

### What worked

- The 339-byte Markdown workflow matched the original editor trees and five framebuffer captures in the Wasm simulator at the stock 50 ms virtual turn budget. The RV32 emulator matched the same trees, hints, and exact submitted save bytes.
- The fixture checked bullet termination, numbered-list carry from 9 to 10, headings, fenced colors when the marker is offscreen, quote and paragraph formatting, link/code/bold stripping, and page scrolling inside preview.
- Find, edit/save, cursor persistence, and the 64 KiB open check still matched on both backends. The large-open check retained its experimental 200 ms budget.
- The linked artifacts were 79,746 bytes for Wasm and 239,572 bytes for ELF. The RV32 template reserves 224 KiB for generated instructions.

### What didn't work

The first shared-runtime build failed with `error: use of undeclared identifier 'TRUE'` from the vendored `libunicode.h`. The upstream header relies on definitions in `cutils.h`. Including it in the same order as the existing QuickJS source resolved the build.

### What I learned

Fence state needs to be tracked while skipping offscreen rows. A wrapped line must toggle it once per logical line. Preview inline transformations must run in the original bold, code, and link order because one substitution can expose text consumed by the next.

### What was tricky to build

The preview can wrap several source lines into a single paragraph item. It keeps that item's JSON string open while appending escaped content, then closes it before a new block. A heading or code row uses its own style and does not share the paragraph's accumulator.

### What warrants a second pair of eyes

The preview renderer currently stops adding items when the next line could exceed the fixed output buffer. The native screen budget is also measured in UTF-8 bytes, so very large previews need separate viewport and byte-limit qualification. Extreme numbered markers use decimal carry, which can differ from JavaScript Number rounding. Long-document search and preview timing and the actual firmware builds remain open.

### What should be done in the future

Wire the compiled Editor into both P4 firmware profiles, then verify the complete workflow on the physical device and record source compile and first-use measurements. Exercise large previews and long searches separately.

### Code review instructions

Read `markdown.typed` and `preview.typed` next to `edNewline`, `edColors`, and `edPreview` in the original Editor. Review the viewport's fence transitions in `document-view.typed`. Rebuild `typed-world-reactor` and run `02-check-editor-world.mjs --markdown` with the P4 compiler and CJI emulator.

### Technical details

The typed renderer writes UTF-16 JSON and the shared runtime checks and converts it at the screen SDK boundary. Preview borrows two bounded work buffers, while the shared uppercase primitive maps one scalar at a time. The position parser and preview transformations use their shared scratch at different event stages.

## Step 10 — Build matched P4 firmware profiles for typed Editor

The Wasm and RV32 firmware now each select Editor from the shared typed runtime. The CMake bundle includes the same typed source list verified by the simulator exercise. A dedicated runner passes the source and reactor into the existing on-device compiler.

Both images built for the current panel-enabled ESP32-P4 profile. The physical test uses a backup of the installed application and writes only its partition. Board qualification was in progress at this checkpoint.

### Prompt Context

See Step 1 for the full typed Editor goal.

**Commit (preceding checkpoint)** `59ad19f` — “Port Editor Markdown editing and preview to typed JavaScript.”

### What I did

- Added common source ordering in `worlds/editor/source.list`. The hardware bundle and host fixture now concatenate the same bytes.
- Added optional typed Editor firmware switches and manifest selection. When enabled, the native profile omits the previous CJI Editor binary and selects the typed reactor with the existing world name and lack of root filesystem authority.
- Added the thin P4 compiler invocation in `editor_p4.c`. It reuses the shared bounded runner with an Editor-specific compiler allocation and time ceiling. Agenda and Files continue using that runner's existing defaults.
- Added reproducible build and powered qualification scripts. Backed up the currently installed 8 MiB application, checked that the live partition table matched the builds, and started the powered test in tmux.

### Why

Passing in Node and emulation does not exercise the device's source compilation time, actual memory allocator, ELF loader, panel, or FAT worker. The optional profile makes the first qualification reversible. Both profiles use the same peripheral and application configuration so a difference in Editor's backend is identifiable.

### What worked

- ESP-IDF 5.4.2 built a 4,251,472-byte Wasm Editor firmware and a 4,445,584-byte RV32 Editor firmware. Both fit the 8 MiB factory app partition.
- The build scripts verified source SHA-256 `b243f5ac6b814d4871b8200958577522d8732e470f8ccbe326a64e69c166471a`, the selected manifest entries, the shared reactor bundle, and absence of `natives/editor.elf` in both images.
- The image pair has identical SDK and partition configuration. All three possible boot manifests were assembled and Editor retains no filesystem claim. The physical table matched byte for byte, and esptool saved the existing 8 MiB application.

### What didn't work

No firmware build failed. Physical behavior and device compile timing were still being collected when this build checkpoint was recorded.

### What I learned

The Wasm fixture can run under a smaller world quota, while native ELF budgets include the reserved instruction segment and static data. A shared 768 KiB manifest cap lets the paired test exercise the same application settings. Both profiles use a 200 ms turn limit because the previous full-size Wasm read exceeded 50 ms in the simulator.

### What was tricky to build

Several existing typed app options stack their manifest entries. The Editor entry is applied first so the later Files and Agenda manifest variants carry the same Editor source and runtime. The compile runner reads the bundle when the kernel asks for `editor/compiled.bin`.

### What warrants a second pair of eyes

The profile's 4 MiB compiler heap ceiling and six-second compile limit are initial qualification parameters. Cold startup changes for all other worlds when Editor compiles synchronously during manifest loading. The device observations should distinguish compilation from loader and panel work.

### What should be done in the future

Finish the paired physical test and inspect both framebuffer captures on each target. Follow with a long-document search and preview budget audit before closing the migration.

### Code review instructions

Read the typed Editor block in `port/esp32p4/main/CMakeLists.txt`, the bundle dispatch in `port_p4.c`, and `editor_p4.c`. Use the ticket's `03-build-editor-firmware.sh` for both targets and `04-qualify-editor-on-p4.py --help` for the hardware trial.

### Technical details

The optional firmware mode keeps all Editor state and policy in the eleven typed source files. Its P4 adapter only acquires the source and reactor and invokes the compiler. The paired test writes the application at `0x10000`. The backup and output images remain under `/tmp/typed-editor-board-backup` and `/tmp/typed-editor-firmware`.

## Step 11 — Run both typed Editor backends on the physical PicoCalc

Both images compiled the Editor source at boot and passed the same workflow on the powered PicoCalc. The test used an isolated directory and created a Markdown document from the keyboard, saved it, found text, displayed the preview, and discarded a later unsaved edit. The test then removed both scratch directories and left the verified RV32 image active.

### Prompt Context

See Step 1 for the full Editor goal.

**Commit (firmware)** `f5f824d` — “Build typed Editor from source on both PicoCalc P4 engines.”

**Commit (backfilled from Git):** `93f2d66` — "Qualify typed Editor Wasm and RV32 on the physical PicoCalc"

### What I did

- Ran `04-qualify-editor-on-p4.py` against the matched images on `/dev/ttyACM0`. Verified the partition table, held the keyboard bus before flashing, and required esptool's flash hash verification.
- Captured the cold source compilation, module size, heap high-water mark, and world load lines from UART. Used Files to narrow and pass a file grant to Editor.
- Compared FAT readback before and after discard. The test verified the exact 20-byte document, including the lack of a trailing LF, and required both temporary directories to be removed.
- Inspected both CRC-checked search and preview framebuffers from each target. Saved the receipt and four framebuffer captures under `various/`.

### Why

The host had verified behavior at the shared runtime boundary. This run checks source compilation within actual ESP32-P4 limits, the device's two module loaders, and the keyboard-to-Files-to-Editor workflow using the real filesystem worker and compositor.

### What worked

- Wasm compiled in 1.678–1.684 s, with approximately 1.34 MB peak compiler JS allocation. Its linked module was 79,746 bytes and the measured load segment took 156.1 ms.
- RV32 compiled in 2.723–2.733 s, with approximately 2.23 MB peak compiler JS allocation. Its linked ELF was 239,572 bytes and the measured load segment took 12.4 ms.
- Both images rendered a highlighted “two” in the editor and the same Markdown bullets under “SAMPLE” in the preview. The saved bytes matched before and after discard. The I²C and SPI counters reported no errors on either run.
- After the run the console still answered on the RV32 firmware. The root listing showed the original `notes/` and `apps/` directories and neither fixture directory.

### What didn't work

No powered workflow failures occurred. The workflow uses a short file. Full-size stress cases are recorded separately.

### What I learned

Wasm compiled faster in this run. RV32 loaded faster and used less Editor CPU in the matched workflow. Kernel statistics reported 290.61 CPU ms for Wasm and 52.85 CPU ms for RV32 across 33 reported Editor turns. This measures accumulated on-device execution, not elapsed time from a keypress to the LCD.

### What was tricky to build

The console's `cat` adds a display newline for an unterminated file. The workflow checked both output text and the directory entry's byte count to distinguish actual stored bytes from console formatting. The screenshot routine adds no application code and verifies the checksum over the captured framebuffer.

### What warrants a second pair of eyes

The receipt binds the test to the two actual image hashes and the source build checkpoint. The emulator and short powered case do not establish latency or correctness over every possible document size.

### What should be done in the future

Close the long-document gaps measured in the host capacity tests and then rerun both physical profiles. A final installed image should include those fixes if the goal is evaluated against the full supported file range.

### Code review instructions

See `various/p4-editor-powered.json` for the compile, load, bus, and image data. Compare the target-specific `p4-editor-*-find.png` and `p4-editor-*-preview.png` capture pairs. To repeat the test, use the build and hardware scripts given in Step 10.

### Technical details

The host used console-injected keys through the PicoCalc's keyboard world and captured the compositor framebuffer over UART. The physical flash writes targeted only the factory app at `0x10000` using the previously verified 8 MiB configuration. The console captures remain in `/tmp/typed-editor-powered`.

## Step 12 — Measure large workflows and remove the redundant save comparison

I used the host simulator to exercise three operations above the short powered fixture's scale. This identified a write-settlement overrun despite correct stored bytes, a no-match search overrun, and a preview that dropped the end of its input. I fixed the write settlement in typed source and reran the comparison.

### Prompt Context

See Step 1 for the full Editor goal. This is the capacity check identified before closing the device migration.

**Commit (baseline measurement)** `f5f824d` — “Build typed Editor from source on both PicoCalc P4 engines.”

**Commit (backfilled from Git):** `208076a` — "Finish full-size Editor saves without rescanning unchanged snapshots"

### What I did

- Added `05-measure-large-editor.mjs` to reuse the generated large matched host fixture. It runs isolated 65,536-byte save and no-match find cases and a 21,614-byte preview with a final marker.
- Recorded the pre-change and post-change results as `various/editor-large-host-before.json` and `various/editor-large-host-after.json`.
- Added a typed flag that tracks mutations after submission. On successful settlement, a save that saw no edits can become clean immediately. When edits occurred, the typed app still uses exact snapshot comparison. The existing write-race and restoration tests cover both different-text and edit-back-to-same-text cases.

### Why

The synchronous write submission already copied the snapshot. With no intervening edit, rescanning all submitted text during settlement repeats work. Keeping the exact comparison only for the conditional case preserves the behavior that replaced revision-only dirtiness.

### What worked

- The full-size plain save now reported successful completion at a 200 ms virtual turn budget and left exactly the expected bytes on disk. The linked Editor still passed the dual-backend large open and editing / save-race replays.
- The larger observer captured the complete reference preview, including the end marker. The source fixture still ran the reference Editor with the separately documented 2 MiB quota.

### What didn't work

- The initial reference preview observer failed with `probe crashed handling frames: ran out of memory (its limit is 384 KB)`. The measurement script now gives the observer 2 MiB on both variants and writes independent trial manifests.
- Before the save fix, the typed path reported `editor crashed: ran past its turn budget of 200 virtual ms` after the filesystem wrote the correct bytes.
- The no-match find continues to report `editor crashed handling key: ran past its turn budget of 200 virtual ms`. The typed preview returns a valid initial frame without the final marker at 21,614 bytes. These defects keep full-file-range qualification open.

### What I learned

The file result can be durable even if the application faults processing settlement. The correct disk bytes do not imply the application finished saving. Similarly, a valid preview frame does not imply it contains the entire scrollable document.

### What was tricky to build

The save fast path must be based on user mutations after submission. The explicit flag is cleared when a write begins and set only when an edit changes the live document before settlement. The exact comparison still handles editing back to the same bytes.

### What warrants a second pair of eyes

The new host-only save fix has not been flashed. A full-size save followed by concurrent edits may still need a chunked or faster exact comparison. The baseline device timing in Step 11 refers to the prior source build, so keep its measurements distinct from this host result.

### What should be done in the future

Bound or accelerate full-file search so it cannot exceed one turn. Implement a preview that exposes the end of a long document within the native screen budget. Then rebuild and rerun the physical profiles.

### Code review instructions

Read `editorChange`, `editorSave`, and `editorWriteDone` in `worlds/editor/edit.typed`. Rebuild the shared reactor and run `02-check-editor-world.mjs --large --keep-fixture`; pass its retained path to `05-measure-large-editor.mjs`. Run `02-check-editor-world.mjs --edit` to verify per-file write behavior, exact dirty checks, and discard.

### Technical details

The large Wasm fixture uses the existing typed program's stock 512 KiB host memory quota and a 200 ms metered budget. Its observer runs separately from the edited world. The physical profiles use a 768 KiB quota. The comparison stores application faults and output completeness independently of exact file bytes.
