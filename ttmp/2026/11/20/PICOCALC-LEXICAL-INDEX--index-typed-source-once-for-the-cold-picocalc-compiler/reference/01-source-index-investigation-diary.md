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
