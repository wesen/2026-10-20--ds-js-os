---
Title: Combined compiler trial diary
Ticket: PICOCALC-RV32-COMBINED
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:00:41.909133773-05:00
WhatFor: ""
WhenToUse: ""
---

# Combined compiler trial diary


## Step 1: Freeze the integration question

The earlier work measured individual candidates on Editor and kept the production backend intact. This trial adds the missing combined cell and exercises all three ordinary native compile entry points. I chose a single experimental firmware and two independent boots for a controlled replication.

### Prompt Context

**User prompt (verbatim):**

> My recommendation is to advance branch fusion and compact output to a combined integration trial, consistent with your preference for memory savings. Their interaction is still unmeasured. Production continues to use streaming. The original board firmware was restored and Files, Agenda, and Editor all booted natively.
>
> ^-- and we want to do that, and I guess it's otherwise all written up, right?

**Assistant interpretation:** Perform the joint trial and identify whether prior writing already covers the separate mechanisms.

**Inferred user intent:** Make an evidence-based integration decision for the physical device while preserving streaming.

### What I did

Created the integration ticket. Read the two generator implementations and the existing physical receipts. Traced the real Files, Agenda and Editor C wrappers before specifying the experiment. Started a new read-only factory backup.

### Why

Reusing the earlier board digest as the only backup would assume that the board had not changed. Evaluating only Editor would hide a possible fixed storage cost for smaller programs.

### What worked

Both individual experiments expose deterministic generators against revision `6426798`. Compact’s transformation accepts RV32 compiler source as input. This supplies a direct composition point for the branch candidate.

### What didn't work

No failure observed in this design step. Previously measured direct-output numbers describe a different linker path and cannot answer this trial.

### What I learned

Agenda already owns the correct source concatenation and compiler budget. Calling its bundled compile implementation preserves both.

### What was tricky to build

A complete ELF can differ legitimately between branch settings. The storage setting must preserve byte identity within each branch setting.

### What warrants a second pair of eyes

Check that ordinary native loads use the combined configuration and that all timed measurements exclude verification hashes.

### What should be done in the future

Measure both boots and record a disposition per workload.

### Code review instructions

Read the four-cell table in the intern guide before inspecting the runner or aggregating observations.

### Technical details

The experiment’s code baseline is the same as the independent wave. The project checkout starting this trial was `fc817d6`.
