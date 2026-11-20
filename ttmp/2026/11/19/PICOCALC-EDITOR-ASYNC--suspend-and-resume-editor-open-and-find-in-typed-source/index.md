---
Title: Suspend and resume Editor Open and Find in typed source
Ticket: PICOCALC-EDITOR-ASYNC
Status: active
Topics:
    - picocalc
    - editor
    - native
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Migrate Editor positions, Open and Find to the production typed language and qualify the emitted worlds.
LastUpdated: 2026-11-19T23:30:55.469302958-05:00
WhatFor: Track Editor app work for E6, E7, G3 and G4.
WhenToUse: When reviewing or reproducing the Editor migrations.
---
# Editor Open and Find across typed turns

The Editor application exercises distinct code-unit and code-point coordinates, exhaustive search phases, typed file-read suspension and yielding Find. The [design](design-doc/01-opening-and-searching-a-document-across-typed-editor-turns.md) records the proposed state layout and qualification criteria. The [diary](reference/01-editor-open-and-find-investigation-diary.md) tracks implementation and evidence chronologically, and [tasks](tasks.md) gives the work status.

The [technical report](analysis/01-what-editor-keeps-across-a-file-read-and-a-search-pause.md) explains the implementation and records the host and physical qualification. The [compiler receipts](various/06-checkpoint-layouts.jsonl) preserve every saved value and the emitted code measurements.
