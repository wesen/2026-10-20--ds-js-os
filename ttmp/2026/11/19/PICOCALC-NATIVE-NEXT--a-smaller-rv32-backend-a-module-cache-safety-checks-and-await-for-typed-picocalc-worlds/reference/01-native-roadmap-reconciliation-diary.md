---
Title: Native roadmap reconciliation diary
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T18:31:08.081304965-05:00
WhatFor: ""
WhenToUse: ""
---

# Native roadmap reconciliation diary

## Step 1: Reconcile the original checklist with later compiler experiments

I counted the parent gates by scope and checked which experimental results a reader would miss by reading only the unchecked lines. I added the grouped inventory and linked the primary receipts in the ticket index.

### Prompt Context

**User prompt (verbatim):** “what about open tasks in NATIVE_NEXT?”

**Assistant interpretation:** Give the native roadmap the same grouped status treatment as the rendering roadmap. **Inferred user intent:** Identify unresolved engineering decisions and avoid repeating research that already ran on the P4.

### What I did

Read tasks.md, the research index, the integrated E/G acceptance, and the staged backend, direct-condition, register-local, bounded-index and release-lab results. Counted each numbered parent task once and kept the stable IDs.

### Why

A successful experimental code-size gate and promotion to the current shipping compiler can require different work.

### What worked

All 41 tasks had a scope and a checkbox. The groups exhaust the 30 open tasks. The qualification receipt covers the 11 checked language and async tasks.

### What didn't work

The checklist alone did not identify the later 80 KiB Editor device trial or the later compiler candidates. Following their physical receipts establishes the demonstrated results.

### What I learned

The staged Editor trial reached the original final module and world memory targets. The release experiments used newer app sources and different compiler options. They cannot establish production slot qualification by themselves.

### What was tricky to build

The Agenda candidate emitted four more instructions than the A4 headline model. I recorded both numbers. Fragment caching also needed its own measurement boundary to avoid mistaken credit for B2 warm boot.

### What warrants a second pair of eyes

Any proposal to close an A task should identify the compiler revision, application corpus, target tolerance, physical acceptance and whether that task includes production migration.

### What should be done in the future

Run the most promising staged code generation on the current release corpus and compare the cold compiler, slot capacity and generated program on the same board.

### Code review instructions

Count the checkbox rows in tasks.md and compare them with the grouped scope IDs in index.md. Follow the A6, A7 and small-slot links before inferring how much implementation remains.

### Technical details

The open counts by scope are A 9, B 2, C 1, D 2, E 2, F 6, G 0, M 2 and H 6.
