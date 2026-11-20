---
Title: Operator investigation diary
Ticket: PICOCALC-RENDER-SYSTEM
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:37.566492665-05:00
WhatFor: ""
WhenToUse: ""
---

# Operator investigation diary

## Step 1. Commission a blind design and freeze the inputs

The department asks whether fixed portions of a live System display belong in the receiving process. I scheduled a blind Opus High design before collecting candidate data. The director supplies the pixel oracle and controls the single physical board.

### Prompt Context

**User prompt (verbatim, as forwarded by the director)**

> research all this, also do chess, snake, system.
>
>
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Assistant interpretation.** Study manual specialization of the ordinary System app and test any released extractor on a held-out ordinary app. **Inferred intent.** A reader should be able to reproduce the separation of costs and understand the limits of the measurements.

### What I did

Created the child ticket with docmgr, read the parent briefs, the current System app and the SDK constructors. Invoked the authenticated Claude CLI at Opus High from /tmp with tools disabled and a generic commission. Recorded the incoming operator revision 80cc251. Kept Keys source sealed.

### Why

The existing monitor has bounded row windows and graph encoding. Comparisons must use that already improved control. The kernel owns deduplication by encoded publication, so unchanged inputs must incur producer work while contributing zero queued bytes on every arm.

### What worked

The real SDK constructors are in picocalc-os/js/prelude.js. The production screen and ordinary JavaScript callbacks can run against deterministic kernel samples without changing the app.

### What didn't work

The first CLI invocation ran inside the default workspace sandbox. Subsequent steps record its actual result.

### What I learned

The SDK paragraph wrapper contains both tree and hints. A table's selected row is relative to its centered window. The graph has a real alternate floating-point path near half-pixel ties.

### What was tricky to build

A reproducible capture needs the same callback state in each arm and real constructor details, including flattening, property defaults and string conversion. Pixel equality is independently checked by the director using complete frames.

### What warrants a second pair of eyes

The publication envelope and retained-state assumptions. This child harness can price an isolated stage and exact logical bytes; the kernel and panel have their own ownership boundaries.

### What should be done in the future

Qualify the manual treatment and freeze any extractor before the holdout replay.

### Code review instructions

Read scripts/01-design-commission.txt, then inspect the source around worldsTab, handlesTab, busesTab and the SDK __render callback.

### Technical details

Study identifier PICOCALC-RENDER-SYSTEM. At the beginning of the run the worktree had unrelated staged renames. Only child-ticket paths enter this study's commits.
