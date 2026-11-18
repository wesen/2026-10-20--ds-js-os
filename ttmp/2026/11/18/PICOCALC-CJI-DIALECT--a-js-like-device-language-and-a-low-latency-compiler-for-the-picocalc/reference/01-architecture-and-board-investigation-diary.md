---
Title: Architecture and board investigation diary
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T16:16:11.228680929-05:00
WhatFor: ""
WhenToUse: ""
---

# Architecture and board investigation diary

## Step 1 — Change the design question and define the comparisons

The performance target is a programmer editing a small world on the actual board. The previous experiments measured an optimizing, self-hosted native compiler. Permission to change the language lets us test separately the cost of proving JavaScript numeric behavior, the cost of generating native code, and the cost the application pays after it starts. Retaining the world interface allows these comparisons without changing the kernel or its capabilities.

### Prompt Context

**User prompt (verbatim)**

> we can move away from javascript semantics, especially if this is about preserving edge cases. We want a "JS like" language but don't need to maintain costly properties if avoidable.
>
> Do a fulll fundamental analysis and rethink and validate and research everything, you can use cheaper (much cheaper probably) subagents to do work and experiments for you, although they should keep their experiments in the scripts folder and write their own diaries as they work). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

**Assistant interpretation.** Treat observable semantics and representation as variables in the research, measure concrete alternatives, and specify a route from current worlds to an interactive device language. **Inferred user intent.** Optimize the real edit/run experience, while keeping the project understandable for someone new to compilers.

### What I did

- Created PICOCALC-CJI-DIALECT, an intern guide and four investigation diaries. Three independent workers own numeric lowering, catalog/behavior, and fast-backend research. Each writes its own reproducer and diary. The primary agent owns the board and the design synthesis.
- Selected the measured combined TRIE compiler as the native reference. Its complete Agenda and Files jobs were 522.587 s and 206.321 s with an 8 MiB compiler arena. These are jobs that generated and verified native modules, not application execution time.
- Specified a device QuickJS experiment before seeing its results: parse unchanged bundled sources into bytecode; serialize, reload, and separately check the prelude/world registration and a representative operation. Keep measurements of an alternate executable format visibly separate from native ELF generation.

### Why

Altering only negative zero or overflow may change runtime results without removing structural inference and helper generation. Conversely, a bytecode compiler can avoid most of this work while keeping the full JavaScript numeric behavior. We need both experiments and a catalog inventory before recommending a new language.

### What worked

Existing immutable stage-1 / firmware artifacts and previous hardware receipts are available. The device port already links QuickJS, WAMR and a native ELF runtime. The registered app boot boundary can be inspected directly in nucleus/vm.c. A separate diagnostic app image can use the installed ESP-IDF build without modifying production sources.

### What didn't work

No measurements had completed at this checkpoint.

### What I learned

The compiler module owns an independent firmware libc and lowers soft-float operations; comparing the workstation's Node runtime against it conflates CPU, code generation and VM costs. The currently flashed headless control still contains the world source files, even when its manifest selects native binaries.

### What was tricky to build

The native validator expects the ordinary module digest. A new dialect is allowed to change emitted code, so the experimental board validator must distinguish independent host agreement for the new compiler from equality with the original language. A compiled file also needs a behavioral check.

### What warrants a second pair of eyes

Check what is inside each timer, whether the source and compiler identities match, whether device artifacts are ever actually launched, and whether a proposal silently changes wire, capability or event semantics.

### What should be done in the future

Fill the proposed language contract and architecture decision using observed results; identify hypotheses that still need a production implementation.

### Code review instructions

Start at the intern guide. Reproducers and raw data are separated by experiment owner. The board instrumentation and the restore procedure live in scripts/board/.

### Technical details

The initial headless application binary starts with SHA-256 2b9e8371ee8e. Device examples use one 8 MiB frontend arena for Agenda and Files. App VM memory budgets in the manifest refer to another allocation and another phase.
