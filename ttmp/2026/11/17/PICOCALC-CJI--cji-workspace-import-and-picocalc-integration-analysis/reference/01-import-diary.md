---
Title: Import diary
Ticket: PICOCALC-CJI
Status: active
Topics:
    - picocalc
    - esp32-p4
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T19:42:02.326223027-05:00
WhatFor: ""
WhenToUse: ""
---

# Import diary

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

Imported the original ZIP intact under sources/ and verified it against the download with cmp and ZIP CRC checks. SHA-256 is 4275d9447fca25e529683228be36a514da657eaeddacf6806c4142efc6ae97c1. Cross-checked chapters 24, 30 and 35 and saved emulator gates against the local native SDK, P4 loader and partition map.

## Step 1. Select the source and exercise the RV32 path

The initial import preserved the ZIP. For the hardware investigation I replaced that copy with the compiler and the files needed to reproduce the hosted RV32 test. I used the same repository SDK and JavaScript worlds that the prospective board build would use.

### Prompt context

> Create a new docmgr ticket and import ~/Downloads/cji-workspace-final*.zip and analyze it and tell me what this is, within the context of this project.

> Ok, import the important parts of the zip, not the zip itself, something that's reasonable to commit. Then, analyze how to make this work, I plugged in the picocal with esp23-p4.
>
> Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
> The document is detailed, the design is elegant and simple, we don't want to add anything new for now. just make it work on the hardware. But we need to explain everything to our intern and flesh things out in detail.

> commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

I interpreted this as a reproducible source handoff and bring-up design anchored in tests on this checkout. The intern needs to distinguish a working compiler from a working device integration.

### What I did

Verified the original download before deleting its ticket copy. Retained the SLJIT license, the upstream file paths, fixture outputs and three chapters. Built slas-rv32, compiled toplog and ran NOSNAP=1 sh tools/rv32/nw-test.sh with PICOCALC pointing to this checkout.

### Why

toplog logs during initialization and answers a message. It exercises the runtime, loader and service interface with two observable outcomes.

### What worked

Four compiled worlds and the C control matched their expected traces. See various/rv32-nosnap.txt.

### What didn't work

ld.lld was absent from the shell path. The ld.lld supplied with the installed Rust stable toolchain completed the emulator link after its gcc-ld directory was added to PATH.

### What I learned

The monolithic world option lets the first bring-up omit the separate shared JavaScript prelude unit. The common C runtime and ELF glue are still required.

### What was tricky to build

The tool named slas-rv32 executes on Linux. Its output executes on RISC-V. The emulator firmware is a third build product with its own linker and no ESP-IDF dependencies.

### What warrants a second pair of eyes

Check that the native fixture outputs and vendored license are tracked, and that no nested Git repository or binary is staged.

### What should be done in the future

Link the real runtime into the optional P4 component and compare a physical start and reply to the emulator trace.

### Code review instructions

Start with sources/README.md, then read sources/cji/tools/rv32/nw-test.sh alongside the recorded output.

### Technical details

toplog had 199,616 loaded bytes, 38,672 bytes of peak charged allocations and a 304-byte root-stack high-water mark in this emulator configuration.
