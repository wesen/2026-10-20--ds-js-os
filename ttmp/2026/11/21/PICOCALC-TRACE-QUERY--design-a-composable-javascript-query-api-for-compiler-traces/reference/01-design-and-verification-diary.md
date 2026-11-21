---
Title: Design and verification diary
Ticket: PICOCALC-TRACE-QUERY
Status: active
Topics:
    - compiler
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T12:28:24.537243869-05:00
WhatFor: ""
WhenToUse: ""
---

# Design and verification diary

## Step 1. Establish the archive contract before designing the language

The guide is a design deliverable. I checked the actual archive and wrote a small independent verifier so examples can distinguish measured observations, expected API behavior and missing evidence.

### Prompt Context

User request (verbatim): “create a new docmgr ticket, Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Make many examples from simple to complex showcasing different analysis, try to grund them in your previous LLVM work. Remember to keep it composable around core components and fundamentals (say, data analysis fundamentals and compiler fundamentals and query language fundamentals, etc...) .”

The requested outcome is a guide and worked examples for implementing a host JS library.

### What I did

Created the ticket, design, workbook, diary and delivery task. Read the prior pass reader, repository manifest and execution summaries. Independently hashed and inspected the six compressed streams using Node.

### Why

An API that silently uses the wrong occurrence or treats a partial function as a complete snapshot can give a plausible but erroneous result. The design needs fixed test cases before naming methods.

### What worked

The checked middle-end states at ordinals 73 and 74 are consecutive complete row functions. The count of direct capacity loads changes from eleven to six. Backend states 74 and 78 answer a different question and differ on NoVRegs. The verifier also rechecks the matched pass-off and stack counts.

### What didn't work

The stored initial LLVM modules have no source-location or compile-unit records. Treat a source-line query as unavailable until a separate capture supports it.

### What I learned

Variant, phase and ordinal must travel together. Compiling an executable again under a different pipeline invalidates a PC profile join unless executable identity is established.

### What was tricky to build

The archive's byte offsets apply after decompression. A JavaScript string slice uses UTF-16 positions. The verifier slices the Buffer before decoding.

### What warrants a second pair of eyes

Proof that two states cover the same subject, unit consistency, treatment pairing, and deferred lambda behavior.

### What should be done in the future

Specify a minimal grammar, an evidence-preserving implementation and an example ladder. Validate the final workbook and deliver both chapters as a single PDF.

### Code review instructions

Run scripts/01-check-evidence.mjs with Node and follow its references into the sibling PICOCALC-ROW-IR ticket.

### Technical details

Baseline project revision 6de1090. The production query library has not been requested in this ticket.

## Step 2. Publish the design and example ladder

I wrote two chapters that can be read in sequence. The first introduces the observed ray program, the compiler capture and the proposed query engine. The second presents the design as a series of increasingly demanding user programs. Both chapters use the same delta sign, callback phases, evidence rules and archive identity.

### Prompt Context

See Step 1 for the user's request. Commit 42134cf established the evidence and ticket before the guide and workbook were finalized.

### What I did

Defined the grammar, observation contract, parameter binding, query plan, caching and session effects. Wrote 26 examples and generated individual JS modules that match the workbook text. Extended the independent verifier to walk earlier complete states, resetting at coverage gaps. Inspected the guide again for comparability and added join grain, duplicate-key handling, zero denominators and operator signatures. Ran docmgr doctor, validated local links and code fences, and compared the verifier's output with the saved receipt.

### Why

The shared buffer and repeated register rewriter expose two different failure modes. One requires understanding the operand being measured and one requires identification of an exact pass invocation. A library should express both through the same archive, timeline, selection and evidence primitives.

### What worked

All 26 modules matched the chapter and passed Node syntax checks. The independent script verified all six uncompressed hashes, 4,133 headers and the first observed direct header-load decrease from 11 to 6 at ordinals 73–74. It reproduced the trace and execution assertions recorded in various/verified-facts.json. Docmgr checks passed.

### What didn't work

No delivery failure occurred. There is no installed JS query engine for these example programs; the workbook marks its design contracts and the verifier separately.

### What I learned

A proposal can distinguish attribution, comparison and explanation through its operator contracts. The unchecked or disabled compiler arm requires its own capture if an analyst wants to attribute a machine-state property to that arm.

### What was tricky to build

The examples had to stay composable while remaining readable in a PDF. I used a single documented context, generated one module per example, and verified the correspondence so the source files and printed program bodies agree.

### What warrants a second pair of eyes

During implementation, review callback cache invalidation, operand resolution across snapshots and missing measurements in per-pose joins. Query latency remains unmeasured.

### What should be done in the future

The design's six increments start with a digest-checked archive adapter and end with fragments and interactive parameters. Use the checked-row, machine-rewriter and stack-count examples as the initial end-to-end tests.

### Code review instructions

Read design-doc/01 then design-doc/02. Run node scripts/01-check-evidence.mjs and python3 scripts/02-workbook-modules.py from the ticket. The design and examples were committed at 0d85ccd.

### Technical details

Delivery receipt: OK: uploaded PicoCalc Compiler Trace Queries - Intern Guide and Workbook.pdf -> /ai/2026/11/21/PICOCALC-TRACE-QUERY. This receipt confirms delivery to the reMarkable cloud library.
