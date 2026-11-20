---
Title: Frontend cold compilation investigation diary
Ticket: PICOCALC-FRONTEND-COLD
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
LastUpdated: 2026-11-19T20:23:01.220617027-05:00
WhatFor: ""
WhenToUse: ""
---

# Frontend cold compilation investigation diary

## Step 1 — Locate the interval and pin the control

The historical output-storage trial put about 1.38–1.43 seconds of Editor time in a label that reappeared between function callbacks. I read the production call chain before designing the new trace. The wrapper's timer starts before it reads sources and reactors. A fresh QuickJS context evaluates the compiler files, copies native compiler inputs, and calls the streamed compiler entry point. The frontend and backend alternate inside that call every time a function finishes.

The experiment uses commit `40bcf850a5809ef6d839127869faa952596ed157` throughout. It uses the normal app wrappers for timing. Only the research fixture selects the compiler variant, and the board operator owns flash access.

### Prompt context

The verbatim frontend assignment in the attached brief reads as follows.

> Break down the 1.4-second interval on the P4. The current lexer runs a regular expression with named captures and constructs a token object on every successful match. Compare it with a cursor-based scanner if the trace shows scanning or allocation is material.

Its deliverable reads as follows.

> A time breakdown that reconciles with the clean build, plus one controlled implementation comparison preserving diagnostics and output.

The brief also requests an ambitious half-second Editor improvement under the current peak heap budget. I interpret cold as repeating the full bundled-input compile with a new QuickJS runtime and context every time.

### What I did

- Read the independent phase study, production runtime wrapper, lexer, and streaming callback.
- First requested a design and operator handoff from Claude Code with `claude -p --model opus --effort high --restricted --safe-mode --strict-mcp-config --tools '' --no-session-persistence --output-format json`. The prompt contained selected compiler excerpts and the design brief and ran from an empty scratch directory.
- Coordinated the first device slot with the supervising operator. It will run after host checks and a reproducible isolated firmware build.

### Why

Exclusive time is essential because frontend calls into backend lowering. Charging the whole `compileFunctions` call to the frontend would count each lowering callback twice.

### What worked

I traced the earlier residual label to the start of the JavaScript call and the intervals between callbacks. Production's Editor wrapper allows six seconds and four MiB, but the promotion thresholds are the observed control peak and the 0.5 second target.

### What did not work

The combined study scripts are numbered. My initial command `sed -n '1,200p' ttmp/2026/11/19/PICOCALC-RV32-COMBINED*/scripts/stage.py` produced `zsh:1: no matches found`. Listing the directory revealed `01-stage.py`, which documents the isolation and on-device bundle-selection pattern.

### What I learned

A complete module identity check must include the actual bundled reactor because the slot size is fixed. Raw native bytes and metadata remain independently useful. The current lexer reports invalid text at the offset before skipped trivia on a match failure.

### What was tricky to build

The lexer accepts JavaScript whitespace, LF-terminated comments, and JSON string escapes. Error preservation must include malformed strings and surrogate code units as well as ordinary programs.

### What warrants a second pair of eyes

Check the accounting boundaries against the C wrapper and streamed JavaScript callback. In particular, distinguish startup of the compiler realm, evaluation of the files, argument copies, frontend parse and emit, assembly, link, and cleanup.

### What should be done in the future

Record clean and instrumented timings independently. Report instrumentation cost before interpreting any per-token result.

### Code review instructions

Start at `Lexer.next` and `compileFunctions` in `picocalc-os/compiler/typed-wasm.js`, then `typedRv32.compile` and `linkSlot` in `picocalc-os/compiler/typed-rv32.js`. The outer timing and heap live in `picocalc-os/port/esp32p4/main/typed_p4.c`.

### Technical details

The pinned wrapper observes QuickJS allocation high water via `port_heap_usable`. Native result copying uses a separate C allocation. Native module identity is checked after each measured compile, outside the wrapper's elapsed time.
