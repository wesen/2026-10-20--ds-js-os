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

## Step 2 — Parse reminder lead tokens in compiled code

Agenda reads a value such as !15m from a task line. The application source now parses that token inside the generated Wasm. The compiler gained the string reads, assignments and loop needed to express this behavior.

### Prompt context

See Step 1. Calendar checkpoint 320fb63 established the first callable Wasm functions.

### What I did

Implemented typed string length and checked UTF-16 code-unit indexing, mutable locals and structured while loops. Added the leadMinutes function and a differential test against agParse. Ran the calendar regression after combining the functions into a 559-byte module.

### Why

A single token exercises real source text, bounds, decimal accumulation, unit conversion and a missing-value result. These operations will also be needed when scanning the complete task line.

### What worked

The host executed 30,010 token comparisons including all one-to-four-digit numeric values for minutes, hours and days, leading zeroes, malformed inputs and non-ASCII text. All matched the existing Agenda parser. The 235,158 calendar cases still matched.

### What didn't work

No differential mismatch occurred in this step. The existing host invoke utility accepts scalar arguments only. This test writes an explicit length-prefixed string into the module's memory, so it does not yet exercise OS event decoding.

### What I learned

An unsigned bounds comparison catches negative indexes as well as indexes at or above the string length. Checking before the load keeps malformed indexing inside the normal Wasm fault mechanism.

### What was tricky to build

A temporary local preserves the evaluated index exactly once. Loop declarations have lexical names scoped to the body but physical Wasm locals belong to the enclosing function.

### What warrants a second pair of eyes

Validate incoming buffer lengths before creating strings at the kernel boundary. The internal string representation assumes that a valid owned allocation backs its header.

### What should be done in the future

Return a full parsed task record including title, status, civil date, time and lead, then construct the view's task collection and route it through the real world ABI.

### Code review instructions

Run scripts/01-check-calendar.mjs and scripts/02-check-leads.mjs with Node from repository root. Inspect the compiler's checked charCodeAt emission and the application's use of the declared string type.
