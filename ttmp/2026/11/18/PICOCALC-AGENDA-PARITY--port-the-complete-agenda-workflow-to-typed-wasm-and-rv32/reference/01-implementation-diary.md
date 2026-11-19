---
Title: Implementation diary
Ticket: PICOCALC-AGENDA-PARITY
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T20:33:40.864380424-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

## Step 1 — Specify the parity workflow and host boundary

### What I did

I created the parity implementation ticket and described the original JavaScript behavior, a typed action boundary, asynchronous file-edit sequencing, Editor capability transfer, and backend validation. The design preserves both original milestones and uses the current reminder viewer as the built baseline.

### What worked

Docmgr validated the ticket. reMarkable reported `OK: uploaded Typed Agenda Feature Parity.pdf -> /ai/2026/11/18/PICOCALC-AGENDA-PARITY`.

### What warrants a second pair of eyes

Review the separation between typed app decisions and SDK I/O before adding kernel calls. The fixed native program region already has less capacity than the new emitted code.

## Step 2 — Normalize complete Agenda entry prompts in typed source

### What I did

I refactored the date and time helpers to read spans of the original UTF-16 input. The typed entry parser can now tokenize the full prompt, reject duplicate dates and malformed tokens, preserve free text, and format the civil date and optional time into a bounded output buffer. The return value is a length or a diagnostic category. The runtime will still need to provide localized today, display the errors, and sequence filesystem mutations.

### Why

The original Agenda normalizes prompts before it writes a checkbox line. A token-only test does not cover bad times after valid dates, whitespace, lead placement, or a prompt with no title. Full-prompt normalization gives the future editor a deterministic typed operation.

### What worked

The shared fixture runner compared 3,924 isolated token and civil-date cases and 292 complete prompt cases using Wasm and RV32 execution. Complete successful prompts matched the original JavaScript text byte for byte in the UTF-16 buffers. Invalid prompts matched the original error categories. Four boundary cases also checked exact-size and insufficient result buffers. The receipt is various/entry-prompt-both-targets.json.

### What I learned

The combined parser, calendar helpers, and prompt normalizer emit 30,388 RV32 bytes before the reactor. That figure is evidence for revisiting the native template boundary. Host tests establish the source behavior and exercise real RV32 instructions under emulation. No running world calls the prompt normalizer yet.

### Code review instructions

Read normalizeEntry in worlds/agenda/entry.typed alongside agExpand in js/apps/agenda.js. Run scripts/16-check-entry-tokens.mjs from the parent Agenda compiler ticket with the ESP RV32 GCC and rv32emu. The C runner checks the return value and every output code unit.

The companion milestone write-up, “PicoCalc Agenda — Normalizing typed task entry,” was pushed to go-go-parc main at d88b30a.

## Step 3 — Wire task creation through the actual world runtime

### What I did

I linked both parseTask and normalizeEntry into the same prebuilt reactor. The Wasm linker appends the compiled bodies once and rewrites both stub bodies after checking their signatures. The native linker fills two entry jumps, using a capacity and entry count read from the executable template. The parity checkpoint reserves 48 KiB in RV32 so the 30,388 bytes of typed code fit without relocating any existing ELF sections. The board's compiler combines the reminder source with the bundled entry rules for both its boot and editable-source commands.

I added local-date and filesystem-write calls to the world SDK. The calendar call uses the same configured local clock as the host, and the write call uses the existing filesystem capability check and queued write. In the app, F2 opens the prompt. Enter calls the typed normalizer, reads the current file, appends the valid line through the notes capability, and refreshes after the write settles. The request path invalidates earlier refresh tokens so late reads cannot republish an older snapshot. Failed normalization leaves the note untouched.

### What worked

The real host simulator used its keyboard, compositor, Wasm runtime and an isolated notes directory. It saved the exact expected line for a weekday and 12-hour shorthand, preserved the pre-existing heading and task bytes, left the file unchanged on an invalid prompt, and created a previously missing todo.txt. The existing reminder and restart tests still pass. The linked Wasm world is 49,806 bytes.

The native test loaded the P4 ELF into rv32emu and exercised the same compiled normalizer after real reactor key dispatch. It checked the write payload and post-write refresh alongside existing reminder deduplication. That test uses filesystem, clock and storage stubs at the SDK boundary. The ELF is 59,528 bytes, including the reserved region. The assembled build fits its 4 MiB app partition with 0x4ce0 bytes of room.

### What didn't work

An early refactor dropped the previous diagnostic when the notes claim is absent. The Wasm regression caught it, and I restored the diagnostic. The shorthand test initially configured the wall clock using an unsupported simulator command and now uses the simulator's normal -w and -z options.

### What should be done in the future

The live app now adds a task. Full grouping, selection, toggling, editing, deletion and the Editor handoff still need to be ported. The prompt currently displays diagnostic categories. A complete port should retain the original offending-token messages and fit the prompt into the grouped task screen. The board's tight application flash budget also needs to be tracked as the parity code grows.

### Code review instructions

Run the parent ticket's scripts/04-check-wasm-world.mjs for the real simulator and scripts/09-check-rv32-world.mjs with the current P4 reactor ELF for native execution. The receipts in various/ distinguish simulator integration from the native SDK emulation boundary.

## Step 4 — Run the enlarged native reactor on the powered P4

The newly linked native image loaded and published the real notes view after 3.277 s on full boot. Its compile took 719 ms and peaked at 695,364 B. The following editable build published after 2.158 s with 1.128 s in its compiler. The native world counter was 160,328 bytes. The I²C and SPI counters had no errors. These are single read-only boot and rebuild samples. They do not certify a real keypress, note write, or visible LCD timing. The new complete source exceeds two seconds in this powered session. Compare like-for-like activity before assigning that change to code size alone.

The original application was restored and verified by the flash writer and cji status. The milestone report was pushed to go-go-parc main at 5641c3f.
