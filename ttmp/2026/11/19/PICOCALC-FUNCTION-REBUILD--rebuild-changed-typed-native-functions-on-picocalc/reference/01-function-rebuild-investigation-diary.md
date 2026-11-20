---
Title: Function rebuild investigation diary
Ticket: PICOCALC-FUNCTION-REBUILD
Status: active
Topics:
    - picocalc
    - performance
    - quickjs
    - esp32-p4
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:54:18.8864934-05:00
WhatFor: ""
WhenToUse: ""
---

# Function rebuild investigation diary

## Step 1: Trace source-order resolution and native jumps

I traced frozen typed source from the Files app wrapper into the lexer, function emitter, and native assembly. The production backend already stores unresolved jumps during lowering. The session can retain that intermediate native representation and let the final assembler resolve jumps with the new function order.

### Prompt Context

The verbatim authored brief is preserved in the [lab research brief](../../PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/sources/research-brief.md), under its fourth research question. The supervising experimentalist assigned this lane after the frontend study and asked for a standalone prototype with independent clean oracle, Files or a larger real app, host and device results, diary, design commit first, and explicit edit cases. The intended outcome is a measured result about editing latency and dependencies on a handheld.

### What I did

- Read the research brief, active lab design, frontend results, frozen compiler sources and Files entry points.
- Inspected the prior lab's flash staging, UART parser and guest execution harness.
- Wrote the [intern design](../design-doc/01-compile-one-edited-function-and-rebuild-its-native-links.md) and notified the supervisor about a separate two-boot device image.

### Why

An exact function source span can skip the body lexer safely only when the prior type and layout assumptions still hold. A cached resolved jump can become stale while the callee signature is unchanged. Those facts require separate data in the cache.

### What worked

The compiler cleanly separates source-order declaration validation, structured operations, and RV32 lowering. Files offers a short helper whose real behavior can be observed through the unchanged filename normalization entry.

### What didn't work

No implementation had run at this point.

### What I learned

The parser calls `lex.next()` when accepting a closing brace, so a reused function must perform that same lookahead. This can surface an invalid token immediately after a previously good body. The production streaming backend delays emission errors until after frontend validation, so the production diagnostic oracle remains authoritative if the optimistic path fails.

### What was tricky to build

The frozen frontend accepts only earlier declarations at call sites. Building a full declaration map and using it for all functions would silently permit forward calls. The prototype must produce candidates using the equivalent visibility at each function.

### What warrants a second pair of eyes

Review the lookups made while checking type annotations, field access and calls. Every dependency that changes the original emitter's result must be reflected in the reused fragment's validation.

### What should be done in the future

Implement the staged adapters and run the unchanged and edited cases against the frozen wrapper. Leave physical flash scheduling to the supervisor.

### Code review instructions

Start with `compileFunctions` in `picocalc-os/compiler/typed-wasm.js`, `FunctionCode.call`, `compile`, and `linkSlot` in `picocalc-os/compiler/typed-rv32.js`, then read the staged design and Files wrapper.

### Technical details

The control is `40bcf850a5809ef6d839127869faa952596ed157`. Native calls and local jumps encode a signed 21-bit byte delta in a JAL word. A word in the old image can therefore become stale when only a function's size changes.

## Step 2: Preserve source boundaries and qualify reusable native fragments on the host

The staged variant now recompiles only changed or invalidated functions. The Node oracle compared complete Files and fixture ELF bytes with a separate realm running the frozen compiler. The results include a `filesName` call that moved by 32 bytes when only `filesAlnum` grew.

### Prompt Context

See Step 1. The design was committed as `dbbff2f` before the prototype scripts were written. The supervisor clarified that a physical guest entry must execute the edited real-app artifact and that its clock stays separate from the compile clock.

### What I did

- Added a staging script that extracts and verifies original compiler anchors. It exposes a record parser, header and numeric body methods, native lowering, jump encoding, and app validation. The frozen clean realm has byte-identical compiler inputs.
- Created a revision-owned session with exact source spans, checked binding facts and compact native fragments. Added section timestamps and exact-source, fragment, rejection and stale routes.
- Built fixtures for a body edit, addition of one parameter, invalid return signature, shifted shared record offset, invalid field type, deletion, bad trailing token, tests for foreign revision and caller mutation, and reseeding once a stale fallback succeeds.
- Measured 40 host blocks. The full repeat data are in [host.json.gz](../various/host.json.gz).
- Built an isolated ESP32-P4 app partition using ESP-IDF 5.4.2 with the usual Files, Agenda and Editor RV32 flags. The staged Files reactor had SHA-256 `4c3a4594c7e637a4eae80872de71852cb2c92e74eb29804ce29c1b8e89606c93`. The built firmware hash was `4ec49cf9733f0e209a6fb284c6ccd22b120276cd7b6050f2c7816f701b188be3`. The host benchmark used the built reactor.

### Why

An exact source edit can preserve a function's prior name and body while moving its declaration relative to others. Symbolic jumps let the backend keep its machine words after the compiler lays the program out again. A field access requires an actual layout fact. A function that passes a pointer to another function only needs the type to exist and the callee's compatible signature.

### What worked

- `node 04-host.mjs /tmp/pico-function-rebuild /tmp/pico-function-rebuild/build/esp-idf/main/files-reactor.elf 40` reported `host oracle: 18 cases; 1440 measured attempts`.
- Host Files body edit reused six of seven functions and retained the complete ELF identity with the clean build of that edited source. Candidate versus clean warm medians were 92.5 versus 266.5 microseconds, with 179.5 microseconds median paired savings.
- Host fixture body, signature and layout requests took longer than their warm clean comparisons. They reproduced the same output with ten, nine and nine of eleven fragments reused.
- The compiler and bundled Files source identities were present verbatim in the firmware. The physical runner was handed to the supervisor for the single-device queue.

### What didn't work

The initial unprivileged design staging command failed with `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. The scoped add and commit completed with the sandbox's Git escalation. The first shell listing of the final firmware ran before IDF finished and reported `No such file or directory`. The unified build session then exited 0 and emitted the confirmed file. No compiler or host assertion failed in the recorded run.

### What I learned

A cached body can already encode its local jumps before publication. Local delta cancels the function start. Cross-function deltas must wait for final layout, while import offsets continue through the production slot linker. In the fixture the `caller → base` instruction moves from byte 236 to 260, retains target byte 144, and gets a distinct machine word even though the caller's source is unchanged.

### What was tricky to build

The parser's `records.has` recognizes record types whenever it sees a local binding. Using a layout fingerprint for that existence query would unnecessarily rebuild a caller that only passes along a record pointer. The adapter records existence queries and field lookups separately. The wide layout fingerprint still invalidates all readers of a changed record, so a function that reads a field whose offset happens to survive can be rebuilt.

### What warrants a second pair of eyes

The independent methods reviewer used production Editor source, runtime imports, a prior signature change and a shared `WorldState` layout change to exercise a different profile. Review the capture for how many full-code changes followed relocation and how many conservative layout rebuilds emitted identical bytes.

### What should be done in the future

Verify the executable slot copy on the scheduled board, then compare complete edits and stage costs with the stock wrapper's cold interval.

### Code review instructions

Read [02-incremental.js](../scripts/02-incremental.js) at `fragment`, `compile` and `createFunctionRebuild`. The [case table](../scripts/03-cases.js) defines both engines' assertions. Run [01-stage.py](../scripts/01-stage.py) in a new work path, then run [04-host.mjs](../scripts/04-host.mjs) with a produced Files reactor.

### Technical details

The stock wrapper in the firmware has its original frontend, backend and Files validation source. The warm comparison evaluates those original entry definitions in the session runtime, where the adapters also exist. The installed physical runner verifies the host oracle, UART diagnostics, whole ELF SHA-256, heap ceiling and the edited entry's output. C reads the linked Files slot and copies it to executable memory, including its entry jump. The run timer begins at the actual entry call.
