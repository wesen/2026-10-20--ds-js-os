---
Title: Implementation diary
Ticket: PICOCALC-AGENDA-COMPILER
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T17:49:07.330573624-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1 — Compile Agenda's calendar rule into Wasm

The existing date validator is the acceptance oracle for reading a reminder from the shared todo file. I promoted the ticket's bare-JS emitter into the compiler directory and added typed calls to earlier declarations and signed remainder. Agenda can now express the Gregorian leap rule without a runtime Date object.

### Prompt context

**User prompt (verbatim)**

> Ok, here's the goal for you now:
>
> For the month, I’d let Agenda determine which language features we implement. Week two covers the parts needed to parse one real reminder: strings, records, collections, dates, and diagnostics. Week three connects that path to storage, clock events, and a rendered view. Week four is for testing on the assembled handheld, measuring memory and turn latency, and fixing the bottlenecks the measurements expose. Two seconds for a cold Agenda build through first response is a target to test, with keypress-to-visible-frame measured separately.
>
> Start with WASM, then do RISCV.
>
> commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)
>
> At important milestones,  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).

**Assistant interpretation.** Implement an editable Agenda program with two executable targets and measure the actual device workflow. **Inferred user intent.** Let the behavior of a real application determine the required language and runtime.

### What I did

- Opened the implementation ticket and traced the public reminder file format through agParse and agValidDate.
- Added the typed program and compiled and ran its exports against the original JavaScript date implementation.

### Why

The stored format accepts a four-digit year. Date.UTC treats years between 0 and 99 as years relative to 1900. A conventional Gregorian implementation applied directly to year zero would silently disagree with stored data.

### What worked

The host Wasm engine executed the 268-byte module over 235,158 combinations with identical calendar answers. The check includes invalid months/days and century boundaries.

### What didn't work

The first run of scripts/01-check-calendar.mjs raised “Cannot read properties of undefined (reading 'get')” in FunctionEmitter.prefix. The constructor did not retain the function-signature map. Adding that assignment fixed the actual failing path. The sandbox has no /dev/serial/by-id view, although sysfs lists ttyACM0. Physical qualification needs to identify the port on the host.

### What I learned

Function declarations can call earlier typed declarations using a Wasm function index and checked arguments. Calendar validation and civil-time conversion to epoch milliseconds are separate operations.

### What was tricky to build

The month-end check must account for 1900, 2000 and 2100. A test restricted to current-year dates would miss the error.

### What warrants a second pair of eyes

The public date domain is four-digit years read from the file. The emitter currently resolves functions in declaration order.

### What should be done in the future

Compile the string/token parser, return its records and build the collection consumed by the view. Follow with storage and reminder delivery, device measurements, and the RV32 backend.

### Code review instructions

Read picocalc-os/worlds/agenda/reminder.typed alongside js/apps/agenda.js in the OS tree. Run the ticket calendar checker from repository root.

### Technical details

The script calls WebAssembly.instantiate on new output and compares the exported validDate against the function extracted from Agenda. No precompiled module or JS replacement supplies the tested result.
