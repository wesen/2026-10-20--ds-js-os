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
