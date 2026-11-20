---
Title: Chess publisher and counted mailbox investigation diary
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics: [picocalc, chess, psix]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Implementation history and evidence for the producer, wire codec and mailbox route.
WhatFor: Recover the design, diagnostics and checks for the transport lane.
WhenToUse: When reviewing or reproducing the Chess publisher experiment.
---

# Chess publisher and counted mailbox investigation diary

## Step 1. Specify the route between the running worlds

I traced typed Chess's event handler, `typedSdkScreen`, the deferred-delivery queue and native compositor dispatch. I agreed a 90-cell snapshot and a borrowed counted-byte callback with the compiler and compositor operators. The source and each complete position would be separate application messages.

### Prompt Context

The verbatim user prompt is in [director diary step 1](01-director-implementation-and-qualification-diary.md#step-1-establish-the-missing-application-to-display-path). I interpreted the transport assignment as making the actual Chess app own its emitted source and selecting the existing semantic Chess PSIX schema for its live positions. The user wanted a real device path and an independent pedagogical report. The board operator retains exclusive access to the device.

### What I did

- Read `worlds/chess`, `sdk/typed/world.c`, `nucleus/kernel.c`, `nucleus/native.c` and the PSIX staging fixture generator.
- Commissioned the independent [abstract brief](../scripts/transport/opus-brief.txt) with the actual Claude CLI. The invocation selected `--model opus --effort high`, disabled tools, and ran in an isolated `/tmp` directory. The [receipt](../scripts/transport/opus-provenance.json) reports `claude-opus-5-5`, completion after 90,427 ms, and zero web searches. No repository code or local measurements entered the prompt.
- Relayed the source/position callback, feature flag, source path and decoder contract to the compositor, compiler and build operators.

### Why

A counted payload preserves NULs and gives the kernel a single copy with an explicit lifetime. The sending operation can enforce a narrow Chess-to-compositor route before allocating. Both worlds must retain state past their events, so the queue owns the bytes up to receipt and the compositor service owns accepted state for subsequent compilation or drawing.

### What worked

The prior 47-position replay supplied an independent wire oracle and established the same 90-cell layout used by the new painter. The compositor could receive bytes in its native turn, so its CJI event interface continued receiving ordinary messages.

### What didn't work

The initial proposal used a QuickJS ArrayBuffer handler. The physical compositor is a CJI native world, so that handler would miss the target. The agreed receiver takes the packet in `nat_dispatch` during the actual compositor turn.

### What I learned

The digest inside the old PSIX envelope is a stable semantic replay identifier. The newly delivered painter's source identity is a separate comparison against firmware-pinned bytes.

### What was tricky to build

Restart ownership spans the immutable queued copy, compositor state, and compiler worker. Their epochs have different purposes. The queue protects its own scheduled and mailbox deliveries while the receiver controls installation of a completed job.

### What warrants a second pair of eyes

Trace the sender identity and receiver epoch all the way through the actual candidate. A string event with a matching name should stay on the ordinary path.

### What should be done in the future

Use the physical trials to establish which graphics and keyboard work happens between an admitted packet and panel completion.

### Code review instructions

Start with the [transport design](../design-doc/03-transport.md), then `kernel_chess_painter_send` and the counted branch of `nat_dispatch`.

### Technical details

The `PAINTER_PUBLISH` call has a source flag and one counted body. The mailbox stores both epochs. The callback `p4_painter_receive` borrows the bytes until it returns. A typed `painter.resend` message is honored only when sent by the compositor.

## Step 2. Pack the live position and establish packet equivalence

I added a build-time generated source writer, two typed SDK trampolines and the mobile producer view. The latter packs the board, destination bits and view fields from the actual mutable game state. It falls back to the ordinary view when synchronous publication fails. The scoped implementation commit is `8be499c`.

### Prompt Context

See step 1. The game had to preserve input and search behavior, including legal marks and asynchronous replies, while using a full counted position in the candidate.

### What I did

- Implemented `chess_psix_encode` and `chess_psix_decode` with bounded buffers. The decoder extracts the candidate values, re-encodes them and compares the whole wire image.
- Added instrumented host runs over 47 recorded and 16 boundary vectors. The independent JavaScript reference computed exact packet bytes and an accept/reject bitmap for every single-bit mutation.
- Drove normal game events through the actual compiled Wasm world. Checked initial source equality, 12 canonical SDK frames, a legal selection, e2–e4, 78 search slices, b8–c6, F2, Esc, rejection fallback and source replay.

### Why

Comparing a codec with its own output cannot reveal a shared bug. The established JavaScript writer supplies an independent byte oracle. The live world harness also checks that the values come from gameplay rather than a packet fixture.

### What worked

Both C and JavaScript accepted 17,913 of 158,776 mutations. All 19,847 shorter prefixes failed, preserving sentinel output cells. The Wasm producer emitted 6,204 bytes with SHA-256 `3b5a98462994c81a02e7264f07de66d86f2397a33428bb3fe9a5e05b3410643f` and the existing search result for the test game. The default host build, old Chess world test in timing mode, and `make -C picocalc-os test-agent` passed. The Agent test used its default local fixtures and skipped the seven separate HTTPS tests.

### What didn't work

- Initial `node …/live-producer.mjs` attempted `execFileSync('python3')` and returned `Error: spawnSync python3 EPERM` in the workspace sandbox. The reproduction now calls the embedding tool from the shell and passes the generated file to Node.
- The first typed render failed with `SyntaxError: 1088:33: invalid token`. The typed frontend supports `>>`, and the ordinary buffer store truncates to 16 bits. The packed fields now use that store directly and destination masks use arithmetic assembly.
- LeakSanitizer reported `LeakSanitizer does not work under ptrace (strace, gdb, etc)`. Reproduction disables LeakSanitizer while keeping ASan and UBSan active. The codec has no dynamic allocation. The mailbox harness uses explicit live-message counts to check cleanup.

### What I learned

The first and last large numeric values need eight-byte wire bodies. A valid single-bit mutation may legitimately make a different position, so the negative test needs the semantic and structural oracle verdict for each changed packet.

### What was tricky to build

Reconstruction needs an initial bounds check independent of the packet's own references. The byte count and string directory are screened before any strings are used. Fixed-size records locate the tuple. The bounded tuple reader verifies every indirect value offset before reading it. Only a successful comparison copies cells to the caller.

### What warrants a second pair of eyes

Review the signed immediate boundary, promotion hints, Chess outcome precedence and in-place caller limits. Confirm that F2 leaves the source latch set and that authenticated resend resets it.

### What should be done in the future

Account for source, codec, scheduling, native invocation and panel work independently in physical measurements.

### Code review instructions

Run [check.sh](../scripts/transport/check.sh) from the project checkout. For ordinary game behavior run `node <typed-chess-ticket>/scripts/07-chess-world-oracle.mjs --timing-only` after rebuilding the typed reactor. Read `mobile-view.typed` beside `chess-psix.c` to compare field order and widths.

### Technical details

A legal snapshot is 313, 321 or 329 bytes. Wide fields use an IEEE-754 binary64 body containing the exact signed integer, and the ordinary case stores all nine as signed 20-bit immediates.

## Step 3. Control queue lifetime and RV32 linking

I exercised the real kernel route with a test backend while controlling turn boundaries. Code inspection and a separate RV32 compile also revealed an accounting layout issue and an unsupported libgcc reference. Both were fixed before handing the candidate back to the board operator.

### Prompt Context

See step 1. The board path needed a fixed ownership budget and a linkable native producer. The task authorized scoped Git checkpoints and preserved the ordinary release control.

### What I did

- Made in-flight counts private to `kernel.c`, with reset and consistent decrement on the shared message free path. The optional message fields live at the end of `msg_t`.
- Built `mailbox.c` with production kernel and native dispatch code under ASan and UBSan. Used an intentional buffer overwrite after publication, a binary body containing zero, sender rollback, source/frame quota fills, epoch changes before delivery and after queuing, receiver teardown and a spoofed ordinary JSON message.
- Cross-compiled the codec with `riscv32-esp-elf-gcc -march=rv32imafc_zicsr_zifencei -mabi=ilp32f -Os -fPIC -ffunction-sections` and inspected unresolved symbols with `nm -u`.

### Why

An outgoing body must outlive the stack on which it was encoded. A failed publishing segment must release its copy before a receiver can see it. The scheduler's event check and native turn's epoch check cover different intervals. Linking ordinary components against a shared prefix also requires consistent common member offsets.

### What worked

The host scheduler observed the original bytes after the sender overwrote its source buffer. Queue limits were reached at two sources and eight positions, and the next send failed immediately. Host controls established quota release on discard, epoch drops, receipt only during the consumer turn, restart purge, and normal handling of the same message spelling on the JSON route. The wide-number fix removed `__lshrdi3` from the RV32 object. Codec and producer replay passed again after that fix.

### What didn't work

The first candidate ELF showed `U __lshrdi3` in `nm -D …/typed-world-reactor.elf`. The firmware's resolver includes soft-float conversions but lacked this variable 64-bit right-shift helper. I changed byte serialization to two 32-bit halves. A compiler cross-review also identified cross-field legality checks in the earlier staged writer. The director kept wire admission scoped to canonical structure and individual field domains, with game invariants supplied by the bundled producer and painter output bounds checked independently. A director review found a preprocessor-dependent `kernel_t` member before shared fields. The counts now live in the kernel implementation, so separately compiled components read a common `kernel_t` layout.

### What I learned

The toolchain can emit a new unresolved helper for an expression even when an ordinary host sanitizer run passes. Inspecting the standalone RV32 object gave a faster check for this failure than waiting for a board trip.

### What was tricky to build

Discarding a raw message from the restart mailbox must preserve the order and tail pointer of unrelated messages. The fixture queues an ordinary message behind a raw position and verifies that the ordinary one still dispatches after restarting the receiver.

### What warrants a second pair of eyes

Review the ownership transfer from deferred effect to scheduler event to mailbox, and the raw copy's lifetime on every drop. The physical lane must verify source worker and executable lifetime independently of the mailbox controls.

### What should be done in the future

Use the device study for panel timings. The host controls establish kernel transport behavior and cannot establish physical paint latency.

### Code review instructions

The source and frame quotas are in `kernel_chess_painter_send`, the shared release is `free_msg`, and the bounded restart cleanup is in `teardown`. Run [check.sh](../scripts/transport/check.sh) to repeat the tested transitions.

### Technical details

The test receiver is a C stub that checks exact source and binary payloads during the actual native dispatch turn. It has no painter worker or framebuffer. The target runtime remains subject to the separate native loader and real panel qualification.
