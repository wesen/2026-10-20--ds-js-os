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
