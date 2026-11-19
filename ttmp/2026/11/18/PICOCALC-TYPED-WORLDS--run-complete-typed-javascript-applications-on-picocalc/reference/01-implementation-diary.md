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
