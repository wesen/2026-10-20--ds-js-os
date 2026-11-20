---
Title: Supervisor investigation diary
Ticket: PICOCALC-COMPOSITOR-FAULT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T07:12:08.257084126-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary

## Step 1: Reconstruct the native fault and commission two investigations

I opened PICOCALC-COMPOSITOR-FAULT against firmware source b1cbfa1. The earlier receipt preserved structured fault records. Rereading their neighboring serial lines supplied an important missing fact about the two invalid event returns.

### Prompt Context

**User prompt (verbatim):**

> create a new docmgr ticket to investigate the compositor bug, write a detailed design doc explaining how th ecompositor works and how to debug it and all the wyas in how this is working and implemented, and then send off a researcher pair to investigate and fix it.
>
> Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
> Chose opus high for researchers
> Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
> analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

### What I did

Used docmgr to create the ticket, guide and diary. Read the generated Ninja recipe, native event adapter, generated-language prelude, System app and compositor. Started two independent Claude Opus high sessions, one on frame production and one on event receipt. Their initial input consisted of a bounded incident summary. The supervisor owns all physical measurements.

### Why

The earlier event record showed the native ABI outcome. A world can emit a more specific runtime reason just before the kernel records the generic outcome.

### What worked

In /tmp/p4-sysmon-fault-02.log both invalid returns follow the exact line “compositor: crashed: out of memory” by about 1.3 ms. The two elapsed-time failures contain no such preceding line in this capture. Source confirms the CJI ELF bridge deliberately returns 2 on a fatal runtime error. See various/baseline-faults.log.

### What didn't work

Filtering only for #OCT1 discarded the explanatory lines. The first attempt to start tmux for the candidate build returned “Operation not permitted”; an approved tmux invocation started the build.

### What I learned

The compositor is a CJI-built native service, and its frame handler retains a tree before scheduling another event to paint. The generic native loader times the whole entry. Both decoding and garbage collection can contribute to frame receipt.

### What was tricky to build

The visual result depends on the visible rows after layout and on the integer y coordinate of each sparkline sample. Producer-side changes must preserve selection and details across the entire catalog. The first candidate centers a bounded row window and encodes graph samples in plot units; the supervisor will test these independently of a larger budget.

### What warrants a second pair of eyes

The exact failed allocation and the relative costs of JSON parsing and collection remain unknown. Candidate pixel equivalence requires attention to rounding ties and to both ends of the table.

### What should be done in the future

Test the source-level behavior, flash the candidate, exercise every tab and scroll, and inspect actual frames and restart deltas. Deliver the research reports after the physical results arrive.

### Code review instructions

Follow the native ELF path through runtime/cji_elf.c and elf_event. Read the design document alongside the project sources listed in its component table.

### Technical details

The reproducing image has a 320 × 320 display, 80 ms compositor segment budget and 768 KiB compositor quota. The System monitor collects 48 samples of history. Both eyes on quota and host allocator behavior are needed when interpreting an out-of-memory record.
