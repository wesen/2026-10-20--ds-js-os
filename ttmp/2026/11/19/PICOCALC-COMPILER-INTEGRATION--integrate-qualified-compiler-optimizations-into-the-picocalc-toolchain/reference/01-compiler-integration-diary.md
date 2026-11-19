---
Title: Compiler integration diary
Ticket: PICOCALC-COMPILER-INTEGRATION
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T17:20:47.426925037-05:00
WhatFor: ""
WhenToUse: ""
---

# Compiler integration diary

## Step 1: Trace the requested merges to the normal compiler entry points

The physical trial established an operand representation using generated research-only compiler bundles. The production firmware shares its frontend between Wasm and native worlds. I traced the actual callers and opened a separate integration ticket to retain that distinction.

### Prompt Context

**User prompt (verbatim):** “ok, merge the first two. Does each have a report?”

**Assistant interpretation:** Integrate the qualified changes, identify their individual reports, and verify the real entry points. I asked which second change the user intended while beginning the common native work.

### What I did

Inspected `FunctionEmitter`, `compileFunctions`, `FunctionCode`, the public exports and the physical trial oracle. Identified unsigned immediates emitted for calls, locals, field offsets and literal stores, as well as signed i32 constants.

### Why

Changing only integer constants would leave other variable-length operands incompatible with the native consumer. Replacing the whole frontend with the generated benchmark file would break Wasm linking.

### What worked

The production source has a common function parser and separate target entry points. The research ticket already contains detailed individual reports and an independently verified physical baseline.

### What didn't work

No implementation failure at this checkpoint. The phrase “the first two” has multiple possible antecedents; I began the shared work while checking the intended pair.

### What I learned

The default `typedWasm.compileFunctions` output also has diagnostic and research consumers that expect Wasm bytes. The native caller can explicitly select a separate representation.

### What was tricky to build

The source scanner must still complete checking all functions before RV32 lowering can reject one. This is one reason to retain buffering.

### What warrants a second pair of eyes

Check how field offsets above 127 and signed 32-bit extremes cross the new interface. Verify mixed native/Wasm firmware remains functional.

### What should be done in the future

Qualify the real merged compiler and record its output and timing separately from the prototype.

### Code review instructions

Start at `typedRv32.compile` and follow its call to `typedWasm.compileFunctions`. Compare the native and byte-mode emitters for every variable-length operand.

### Technical details

The revision at intake is e202e94. The two prior board compilers produced 240,452-byte Editor executables. The numeric-operand experiment held the reactor and register backend constant.

## Step 2: Merge the native representation and preserve the experimental control

A production build has to serve both Wasm and native applications. I kept the public frontend and its type checker, added a numeric emitter for the native caller, and compared complete executable artifacts across the transition. I also pinned the old text-bounds research harness to the frontend from which its published measurements were taken.

### Prompt Context

See Step 1. The two preceding proposals concerned buffered native operands and direct removal of text checks. I used that pair for integration.

**Commit (code)** `4452064` — Pass buffered numeric operands from the typed frontend to native lowering.

### What I did

- Changed the frontend to select the emitter once per compilation and changed the RV32 instruction reader to consume one cell for each immediate.
- Built wide local, function index and field offset fixtures. Compared all six public world outputs, native metadata and three diagnostic cases with `e202e94`.
- Pinned the historical instrumented emitter and its receipt metadata to the same Git blob. Reran the bounds study and its independent examiner against the checked-in JSON files.

### Why

The original experiment rewrote known snippets of the frontend to measure the counterfactual. Production now spells those snippets differently. Pinning both the instrumented input and the recorded hash makes the experiment repeatable after today's production change.

### What worked

All six application artifacts matched byte for byte across the numeric transition. The high-index native fixture emitted 6,200 bytes. Both original bounds receipts reproduced byte for byte using `node scripts/bounds/run.mjs --linked` and `node scripts/examiner/bounds.mjs` from the historical ticket (run with the repository root as working directory).

### What didn't work

The sandboxed Node subprocess initially reported `spawnSync git EPERM`; the same test succeeded with scoped permission to spawn Git. The first historical replay omitted `--linked` and produced standalone Wasm, causing `cmp` to report a difference on line 5. Repeating the linked configuration matched the original.

### What I learned

Equal native linked files provide a stronger representation-only regression test than equal output length. The pinned historical measurements still answer a separate question from the shared emitter that ships in firmware.

### What was tricky to build

Wasm emits signed or unsigned variable-length immediates depending on the operation. The new RV32 reader must consume all of those cases in the new format, including both operands of a memory instruction.

### What warrants a second pair of eyes

Check the emitter's use of raw fixed operands and the framing of functions with zero locals. Follow any call to the public function compiler from a world wrapper.

### What should be done in the future

Measure the shared production compiler on the physical board and qualify direct bounds independently of the representation change.

### Code review instructions

Start with `git show 4452064`, then run `scripts/check-numeric.mjs` with the ESP-IDF reactor directory and revision `4452064`. The byte comparisons are recorded in `various/numeric-parity.json`.

### Technical details

The comparison used identical reactor bytes in each paired call. Linked ELF sizes were 24,424 bytes for Files, 66,364 for Agenda and 240,452 for Editor. The reactor reserves an instruction slot, so a later decrease in the number of generated instructions need not shrink the whole ELF.

## Step 3: Correct the scope and qualify the production streaming path

The user's answer to the pending clarification selected numeric operands and streaming. The direct proof had already reached local main. I reverted that code, kept its engineering evidence and canceled a queued comparator benchmark before it acquired the serial port. The firmware already under test completed its safe restoration. The active production work then moved to per-function streaming.

### Prompt Context

**User clarification (verbatim)** “Numeric operands + streaming”.

**Assistant interpretation** Merge both changes and make the memory-saving choice reachable through the real handheld build. Preserve the faster buffered default. Include a report for each.

**Commits** `e082ec3` and its revert `3785155`; streamed native JS in `2317696`; firmware build option in `3c0add0`.

### What I did

Supervised independent implementation and review. Added an opt-in ESP-IDF definition for the native compiler translation unit, passed an options object to the JS world linker and created a same-revision A/B firmware build and board runner. The qualification runner checks that all five JS files are embedded in each flashed binary, then checks an actual per-application serial mode marker. The earlier bounds proof is absent from the final production source.

### Why

The two intended changes address different aspects of the operation array. Numeric operands simplify its representation. Streaming shortens its lifetime. The caller can select streaming when memory constrains the application. Tests must ensure that it changes neither executable bytes nor diagnostics.

### What worked

The independent V8 heap probe found one live numeric body during streamed callbacks at the first, eighth, sixteenth and thirty-second completed function. Buffering retained 1, 8, 16 and 32 respectively. The production fixtures produced identical complete native and Wasm world artifacts. Both C configurations built.

### What didn't work

I started work on the wrong second proposal before the clarification arrived and committed it as `e082ec3`. I reverted it explicitly and verified the pinned bounds reproducers separately. During qualification, the initial firmware build session exited with status 143 at 509/1152 units. Resuming the existing build directory inside tmux completed it. The first bundle preflight rejected a C array's trailing decimal zero as invalid hexadecimal. That preflight ran before any flash; reading C literals correctly resolved the error.

### What I learned

The delayed native error must survive release of the completed body's IR. A later frontend error still takes precedence. Retaining the words and the call fixups is sufficient to assemble the identical program after IR release.

### What was tricky to build

The C wrapper constructs QuickJS values in a limited allocator. If allocating the options object or setting its property fails, the existing exception must reach the compiler's rejection path after all argument references are released. Wasm calls continue to use two arguments.

### What warrants a second pair of eyes

Read `compileFunctions` and `typedRv32.compile` together, looking for any descriptor that can continue to reach an operation array after its callback. Inspect the native-only guard in `p4_typed_compile`.

### What should be done in the future

Use the release receipt for decisions about enabling streaming on a memory-constrained workload. The discarded bounds implementation can be studied at its pinned commit.

### Code review instructions

See `reference/streaming-implementation-diary.md`, the integration tests in `scripts/` and the independent streaming examination. The bounds experiment's physical and host receipts are explicitly prefixed `archived-bounds`.

### Technical details

The archived four-boot Editor comparison was 2.357 s with numeric operands alone versus 2.468 s with the direct proof enabled, despite an unchanged Editor executable. The isolated Files runtime experiment was canceled before flashing. These results concern the archived bounds candidate and are not evidence for a streaming speedup.
