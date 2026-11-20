---
Title: Measuring the cold frontend before replacing the lexer
Ticket: PICOCALC-FRONTEND-COLD
Status: active
Topics:
    - picocalc
    - performance
    - quickjs
    - esp32-p4
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Streamed function callback, assembly and link
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Lexer, frontend and Wasm emission
    - Path: repo://picocalc-os/port/esp32p4/main/typed_p4.c
      Note: Outer timing boundary and compiler allocator
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:00.558182892-05:00
WhatFor: ""
WhenToUse: ""
---

# Measuring the cold frontend before replacing the lexer

A cold Editor compile starts when the application wrapper reads its bundled inputs and ends when the compiler has copied the linked module out of a fresh QuickJS realm and destroyed that realm. One old experiment placed 1.38–1.43 seconds of a roughly 2.45-second interval under frontend work and setup. A stopwatch around that entire interval cannot tell us how much removing a lexer would save. The first deliverable is a measurement that can.

## Follow one function through the compiler

Consider a file with two functions. The lexer reads the source and hands the parser one token at a time. The parser resolves names, checks types and emits typed operations. As soon as the first function is complete, the frontend calls the RV32 backend with those operations. The backend lowers them to machine instructions, returns control, and the parser reads the second function. Only after the last callback does the backend assemble and link all the generated instructions.

```text
read sources and reactor, create realm, evaluate compiler scripts, build arguments
     dispatch compiler
     frontend -> lexer -> frontend -> lower function 1 -> frontend
               -> lexer -> frontend -> lower function 2 -> frontend
     assemble native program -> link reactor -> return
copy result, destroy realm
```

The arrows matter for time accounting. If the parser calls the backend for 8 ms during a 20 ms interval, its interval includes those 8 ms. A trace that switches categories at entry and exit charges the 8 ms once and leaves 12 ms for the remaining work. Lexing is nested in the frontend in the same way. Peak heap records the largest live QuickJS allocation total at any instant, so the memory in a phase can include objects left live by earlier code. The native output copy uses the existing C allocator outside this counter.

## Turn the outer timer into a partition

Keep the duration and peak statistic from `p4_typed_compile`. The wrapper starts the clock before reading its typed source and reactor, and the helper stops the clock after releasing QuickJS. A separate profiling build sets a phase at every boundary and accumulates time since the previous change under the prior phase. Its phase durations must sum exactly to the same captured end timestamp minus the wrapper timestamp, within the integer representation used by the clock. The phases are input reads, realm creation, typed compiler evaluation, RV32 compiler evaluation, app linker evaluation, argument preparation, JavaScript dispatch and setup, frontend parse/type/emit, lexical match or cursor scan, token handling, native function lowering, native assembly, native link, result copy, and realm teardown.

The lexer has three timed boundaries on the successful-token path. The first enters matching from the frontend. The second switches after the match or scan finds the token span. The third returns to the frontend after writing the token. The EOF path can inspect trivia and report an error. Record the number of phase transitions and compare the marked runs to a separately acquired clean pair. Each native clock call costs time, and its surrounding JavaScript/C call instructions can fall on either side of the sampled switch. Treat phase values as measurements from marked builds with a visible observer effect. A clean application time improvement is the primary outcome.

The trace instruments both frontends and uses the production call order in every configuration. JavaScript dispatch and setup includes app glue and non-callback work before or after a marked JavaScript routine. Argument preparation includes the existing streamed-mode log line so the partition reconciles with the production metric. Hashing and harness result printing happen afterward.

## Preserve the token contract

The current sticky regular expression consumes whitespace and line comments before a token. The stored token offset points after that trivia. If there is no token at all, the fallback accepts only a remainder made entirely of trivia and stores the offset at the start of that remainder. The fallback also anchors the invalid-token diagnostic at the previous token end. For example, source `x   @` reports the invalid token at column two even though the at sign is in column five. A new scanner must preserve that behavior for this experiment because changing diagnostics would make a successful byte comparison insufficient. The regular expression also backtracks out of a comment when it can match a slash after abandoning the comment. For example, `// no next token` can yield a slash on the old lexer because the comment repetition is optional. The cursor keeps the old regex path for a scan that finds no token after trivia. The candidate therefore tests removing regex work from the successful common path and continues to pay the cost of loading its existing regex literal.

The candidate tracks a UTF-16 cursor. Match ASCII identifiers and digits, recognize punctuation with the same longest-match rule, and accept exactly the string escapes accepted by JSON. A comment ends at LF or EOF and therefore covers CR and other line separators until then. The parser never retains a token object across `next()`; it reads primitive fields or destructures them before advancing. The candidate reuses one token object and assigns its offset, kind, and value. The unchanged `Lexer.fail()` still computes line and column using source slices and LF. Host token mode also compares a cursor scanner that creates a fresh object to help identify the role of token allocation independently of the main comparison.

Falsify correctness at three levels. Compare complete token streams and exceptions from a generated corpus that includes malformed strings, mixed trivia, surrogate pairs, operator prefixes, integer edges and open comments. Compare exact parsed and linked output for valid inputs through the normal Wasm and RV32 entries, including source and ELF bytes for all three applications. On the board require the digest of each accepted image and the same reported streamed mode. Guest execution is inherited by exact image identity and should also be exercised through the prior workflow harness when the toolchain is available.

## Establish the budget before measuring

Files, Agenda and Editor each compile in the four configurations of an order-balanced block. The configurations are clean control, clean cursor candidate, marked control, and marked cursor candidate. A four-block schedule places every configuration in every ordinal position. Repeat under a fresh boot as the independent replay. Hold the build flags, wrapped reactor paths, compiler backend, compiler budgets and typed source inputs constant at revision `40bcf850a5809ef6d839127869faa952596ed157`. No module cache goes through this fixture. The operator starts each capture from a complete boot and checks status for all three native worlds after the batch.

For Editor, a median within-block clean difference of at least 500 ms must hold on both boots. Check paired peak changes and the observed maximum control peak so a lower median cannot hide an increased peak. Compare emitted bytes and guest behavior before any speed claim. Retain failures, smaller wins, and slowdowns in the report. With four observations per configuration per boot, report actual paired values and medians instead of inferring population-level precision.

Use the control trace for a simple upper bound. If the combined match and token phases take substantially less than 500 ms, their complete removal could only reach the target if it also changes parser or GC cost. If the lexer takes longer but the candidate still misses the mark, compare marked phase differences and clean peak changes. Large startup or parse/type/emit durations would justify a separate experiment with their own correctness checks. Use the host run to qualify the scanner and show host/device direction, and use the board to decide the handheld result.
