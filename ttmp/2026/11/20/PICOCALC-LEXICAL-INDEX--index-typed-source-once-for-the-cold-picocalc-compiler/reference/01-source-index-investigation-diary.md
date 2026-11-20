---
Title: Source index investigation diary
Ticket: PICOCALC-LEXICAL-INDEX
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:17:49.953483442-05:00
WhatFor: ""
WhenToUse: ""
---

# Source index investigation diary

## Step 1: Set the hypothesis from the failed cold compilation gate

The first physical G4 compile requires 3.817 s against a measured 2.646 s pre-G median. We have actual controls for both compiler work and application execution. This ticket tests a representation used by several frontend stages.

### Prompt Context

**User prompt (verbatim).** “do E1-E7 and G1-G4.” The goal also requires a detailed investigation diary and individually authored, published research reports.

**Assistant interpretation.** Implement the general language and await features, then satisfy the gate on the actual device. Additional work should address measured costs while preserving byte identity, error messages and application behavior.

**Inferred user intent.** The new compiler must remain practical for editing and recompiling on a handheld, including larger apps whose source needs additional analysis.

### What I did

I read the current lexer, signature scan, async compiler and complete P4 qualification receipts. I used the earlier physical breakdown to formulate a candidate with an explicit cost objective. I split the C record producer and the JavaScript cursor between the supervisor and the continuation implementer.

### Why

The old scanner spends much of its time extracting spellings and creating per-occurrence objects. A symbol table can share spellings across independent syntax analyses without combining the corresponding variable bindings.

### What worked

The current compiled app passed all historical host replays. The latest board image carried a complete compiler and successfully generated its native Editor. Previous lexical and artifact differential fixtures provide a high-coverage reference for an input index.

### What didn't work

The first G4 cold compile exceeded the allowed maximum by approximately 0.91 s. Reusing the signature header scan or switching to the earlier JavaScript cursor improved the host clock by single-digit milliseconds in each study.

### What I learned

The cold qualification includes setting up the compiler in a fresh QuickJS context. C and JavaScript optimizations should use the same accounting and timing boundaries. Changing only a warm cache hit cannot meet this gate.

### What was tricky to build

The signature scan can skip over invalid tokens that a subsequent body parse diagnoses. Scanning globally must preserve which error is reported first. String positions count UTF-16 code units, including two units for a supplementary character.

### What warrants a second pair of eyes

Check every offset and how a bounded view begins inside whitespace, string content or a comment. Check allocation lifetimes across successful, failed and repeated compilations.

### What should be done in the future

Measure indexed compilation with a fresh runtime, use the full existing lexical and app test corpus, then qualify the strongest correct design on the physical board.

### Code review instructions

Read the intern guide before inspecting the isolated candidate. The reference frontend is `2e4fee1`. The pre-G timing control is `1357545`.

### Technical details

The original and transformed input strings are distinct. Each can have its own index during one cold compilation. The current Editor compiler has a 4 MiB limit and a six-second watchdog.

## Step 2: Compare native occurrence records with actual QuickJS lexer behavior

I built the C record producer against the production QuickJS allocator and inspected its ownership rules. The reference accepted a trailing-comment case in an unexpected way. The staged scanner now declines that input so the existing lexer owns its interpretation.

### Prompt Context

**User prompt (verbatim).** See Step 1. **Assistant interpretation.** Speed up cold compilation while preserving token behavior, artifacts and diagnostics. **Inferred user intent.** A speed improvement should remain usable under the compiler's existing memory budget. The initial producer is in `16661c5`. The independently qualified JavaScript cursor is in `de07831`.

### What I did

I compared every emitted row, its source interval, identifier ordinal and paired braces against `typedWasm.Lexer` using `scripts/08-check-native-records.js`. I added supplementary Unicode, lone surrogate, malformed escape, comment, low-memory and repeated-call cases. I inspected the vendored `js_array_buffer_constructor3` before committing to ownership transfer of off-heap row storage accounted to the QuickJS allocator.

### Why

The syntax parser revisits the same source with different bounds. A changed position, an incorrect end sentinel or a partial table reused after failure can affect legal-source compilation or change the first reported diagnostic.

### What worked

The actual C producer under 4 MiB matched 129,572 token records from 2,519 accepted sources. It declined twelve unsupported or ambiguous inputs. Three attempts to index 300,000 identifiers exhausted the available space for records and cleanly returned to ordinary scanning. The immediately following small indexes all succeeded. See `various/producer-differential.json`.

### What didn't work

The first implementation treated a final line comment as unconditional end of input. The existing regular expression can backtrack and emit the slash. That divergence was reproduced in the independent cursor tests. Returning an index allocation exception also risked rejecting a program that ordinary streaming could still compile.

### What I learned

Returning an unavailable-index indication is sufficient for these cases. The reference lexer and parser already define the correct observable behavior. The host researcher separately reproduced byte-identical Wasm and RV32 for all three apps.

### What was tricky to build

When creating externally backed ArrayBuffers, the constructor acquires memory on success. On error the caller still owns the raw pointer. The wrapper releases the buffer exactly once, then the optional accelerator clears its allocation exception after releasing its temporary state.

### What warrants a second pair of eyes

Inspect UTF-16 indices for astral characters and inspect the two transfer paths that set ArrayBuffer properties. Confirm that using only retained allocator counters for the heap includes native temporary allocations.

### What should be done in the future

Compare both the indexed implementation and the optional borrowed-token implementation on the board. The fresh QuickJS host comparison showed an 18.8% reduction for the first change in one paired series. A separate series showed a further 5.2% for token reuse. Neither series predicts the board clock by itself.

### Code review instructions

Build with `scripts/04-build-native-host.sh`. Run the resulting executable with `INDEX picocalc-os/compiler/typed-wasm.js scripts/08-check-native-records.js -- EDITOR_SOURCE` using paths resolved from the project and ticket. See the independent cursor diary for full linked artifacts and diagnostic tests.

### Technical details

Each occurrence occupies four unsigned 32-bit words. The algorithm maps a spelling to the first source interval that contains it. Variable binding remains in the typed frontend. Separate staged images pin the C scanner and both JavaScript cursor implementations.

## Step 3: Replay the professor's frontend-only timing gate

I ran the original phase timer against the pre-E Editor corpus, then repeated it on the two staged index implementations. All three medians exceeded the historical absolute gate. The indexed versions still improved on the control measured in the same session.

### Prompt Context

See Step 1. The E5 design asks for a host median of at most 31.4 ms. I interpreted that as a separate test from the device cold-build requirement.

### What I did

I attached the optional C index to the original QuickJS timing harness, kept its fifteen-sample JavaScript timer unchanged, and ran all arms on CPU 7. The exact source SHA-256 was f37f60f3b0c646cd35f13c41bc893a136732ebe769e328cfb906b0fe7531a6ed.

### Why

The frontend-only measurement excludes native lowering, linking and firmware startup. Changes between historical and present host conditions can affect an absolute limit.

### What worked

The historical pre-E control at 289281c took 44.73 ms. The staged index took 39.28 ms. Borrowing tokens in internal consumers reduced the median to 35.15 ms, 21.4% below the simultaneously studied control.

### What didn't work

The fastest observed median still exceeded the 31.4 ms ceiling by 3.75 ms. The historical control itself exceeded the ceiling by 13.33 ms.

### What I learned

A relative improvement and an absolute qualification can give different answers. The source used here has handwritten continuations; it is appropriate for the E5 gate.

### What was tricky to build

The original benchmark exercises several compiler entry points within one runtime. Installing the index in that runtime preserves the original benchmark loop and warm-up. Installing it does not cause the old compiler to call it.

### What warrants a second pair of eyes

Check the driver row labeled frontend only, the pre-E source revision and pinned CPU. Other processes on the host were active during the series.

### What should be done in the future

Use the independent, full-source device runs to decide which index variant to pursue. Repeat the absolute host gate under controlled conditions when qualifying the final implementation.

### Code review instructions

Run scripts/12-run-professor-frontend.sh with the prepared qualification directory, a CPU number and a scratch output directory. Compare its text files with various/professor-frontend.

### Technical details

The three arms ran consecutively. Each reports one warm-up and fifteen timed compilations. The complete source, timer construction and runtime setup are reproducible from the checked-in script.

## Step 4: Measure two index representations on the physical compiler

Both qualified implementations compiled the identical async Editor on three fresh ESP32-P4 boots. The index recovered 685.7 ms of the earlier regression. Reusing the current token at two internal call sites recovered another 136.6 ms.

### Prompt Context

See Step 1. The unchanged acceptance question is whether the complete native application compiles within 10% of the pre-G Editor while preserving its generated behavior.

### What I did

I built each firmware from 2e4fee1 in a separate checkout, verified the partition and SDK configuration, and scheduled both on the serial bus. I retained the explicit reboot's compile record for each sample. I prepared two follow-up images, one using the index for the async prepass and one also retaining original source spans for ordinary bodies.

### Why

An index can reduce scanning work while still creating a JavaScript token object for each occurrence. Changing the lifetime of the returned token in two known non-retaining consumers isolates that cost. Reusing a single object in consumers that retain tokens would be incorrect.

### What worked

Native cold time with the index was 3.132429, 3.131194 and 3.131202 s. With additional token reuse it was 2.995217, 2.993614 and 2.994557 s. The two medians are 3.131202 and 2.994557 s. Every run emitted the 240,452-byte fixed-slot module. The earlier unchanged async compiler median was 3.816925 s.

### What didn't work

The second median still exceeded the 2.910113 s cold limit by 84.4 ms. A wholly separate measurement of the full-sized Find fixture obtained its expected native early result, but its first serial screenshot stopped before the CRC footer. The search driver now captures the screenshot after the timed segment in a separate 22-second window.

### What I learned

The two index changes together reduced cold time by 21.5%. The remaining distance to the gate is smaller than the 181 ms spent scanning for operations in the reference async rewrite. An indexed prepass has a sufficiently large measurable target even if some of its work remains necessary.

### What was tricky to build

The C producer and JavaScript cursor are a matched pair. I staged each candidate with source digests. The partial board data are readable during capture, so the final comparator waits for a successful factory restore, verifies image hashes and checks the count, module size and timings of every candidate.

### What warrants a second pair of eyes

The figures measure three consecutive fresh reboots per image. They describe this Editor and firmware. The experiment does not characterize unrelated larger apps or deliberate thermal variation.

### What should be done in the future

Run the indexed async prepass and source-span composition after the Find series. Re-run the entire physical workflow on the best candidate that clears the cold threshold, then compare pixels, execution costs and fresh compile times before integration.

### Code review instructions

Read scripts/13-compare-physical-index.py to see how the manual and generated controls are matched. Scripts/15-screen-composed-candidates.sh and 16-qualify-fastest-editor.sh specify the follow-up measurements.

### Technical details

The clock includes launching QuickJS, loading the source compiler, emitting instructions, linking and teardown. Native module size includes the reserved slot. Host differential fixtures provide the stronger byte-for-byte content check.
