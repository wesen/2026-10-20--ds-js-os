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
