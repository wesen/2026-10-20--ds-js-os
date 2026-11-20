---
Title: Editor Open and Find investigation diary
Ticket: PICOCALC-EDITOR-ASYNC
Status: active
Topics:
    - picocalc
    - editor
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Record the Editor language and continuation changes and their qualification from revision 289281c.
LastUpdated: 2026-11-19T23:31:00.516106279-05:00
WhatFor: Trace implementation decisions, failures and measurements.
WhenToUse: To review or reproduce the Editor work.
---
# Editor Open and Find investigation diary

## Step 1 — Trace both continuations and predict the state layout

I read the production scope, the single-read pilot and the current Editor sources before changing the app. Open's pending title uses the same buffer as status rendering, so the planned Open flag protects both key handling and rendering. For Find, using an absolute folded offset and an absolute anchor makes it possible to remove two relative coordinates while retaining the current physical line end across waits.

### Prompt context

**User prompt (verbatim, relayed by the supervising agent):**

> do E1-E7 and G1-G4. 
>
>
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Assistant interpretation.** Implement the Editor application work in E6, E7, G3 and G4. Coordinate the compiler APIs and hardware qualification with the other contributors. Maintain an evidence-backed account for the final report.

**Inferred user intent.** Use the language features in the complete production workflows and explain their runtime effects to a newcomer.

### What I did

- Traced the source at `289281c` through `editorOpen`, `editorReadDone`, `editorFindStep`, `editorShow` and the native event handoff.
- Used `docmgr ticket create-ticket` and `docmgr doc add` to make the workspace and draft the design before editing application code.
- Coordinated the enum and distinct integer forms with the frontend author and confirmed the actual ambient names and types with the continuation author.

### Why

The 71-field prediction depends on which state the rest of Editor observes. The only external search-continuation dependency is the rendering check for a positive token. The renderer can obtain the same pending information from the generated task, leaving the query and editing UI state in ordinary app fields.

### What worked

The current source and worked examples explain the expected read/yield cadence and all four search ranges. The code inspection found no consumer of the search positions outside the search implementation. The display mark generator independently scans query matches on the visible rows.

### What didn't work

The initial path lookup `rg -n 'typedSdkYield|case NW_SETTLE|next_promise|NW_LATER' picocalc-os/kernel` failed with `picocalc-os/kernel: IO error for operation on picocalc-os/kernel: No such file or directory`. Reading `picocalc-os/nucleus/native.c` found the native turn implementation.

### What I learned

An opening turn needs its own guard even when the compiler has the waiting token. The guard continues to identify ownership while the continuation itself runs. By contrast, rendering a search result only when it is no longer waiting is expressible with the generated pending query.

### What was tricky to build

Search counts U+0130 as two folded units for coordinates consumed by one input unit. The old folded coordinate is relative to the line start. Keeping it as an absolute offset permits the same clamped cursor calculation while requiring one fewer live coordinate. The planned wrap test uses the physical end of each line against the anchor because the anchor cannot lie between lines.

### What warrants a second pair of eyes

Check trailing-newline handling and the case where a wrapped prefix match starts before the anchor and ends after it. Check the title against intervening frames while the normalizer waits, since buffer 2 is shared.

### What should be done in the future

Test direct event injection as well as ordinary kernel workflows. The kernel serializes mailbox messages during the asynchronous turn, so the extra race fixtures must identify their stimuli as direct reactor calls.

### Code review instructions

Start with the [implementation design](../design-doc/01-opening-and-searching-a-document-across-typed-editor-turns.md). Compare the paths in `editor.typed`, `find.typed` and `document-view.typed` at `289281c` before reviewing the migration commits.

### Technical details

The baseline has 71 declared fields and the reactor has room for 80. The prospective combined layout has 71 fields. Open replaces seven with one declared flag, five saved scalars and two generated control fields. Find replaces eight with five saved scalars and two generated control fields.
