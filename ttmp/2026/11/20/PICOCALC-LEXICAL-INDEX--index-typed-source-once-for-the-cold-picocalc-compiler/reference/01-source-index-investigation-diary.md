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
