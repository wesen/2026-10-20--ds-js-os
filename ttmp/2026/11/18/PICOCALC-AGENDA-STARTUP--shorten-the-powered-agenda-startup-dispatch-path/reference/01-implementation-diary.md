---
Title: Implementation diary
Ticket: PICOCALC-AGENDA-STARTUP
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T21:51:51.156033238-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1 — Trace the startup dispatcher and choose a bounded experiment

The typed app is now feature-complete at the integration level. The preceding powered native baseline put the first response slightly above two seconds, with a repeatable delay between Agenda initialization and its first notes request. I isolated that delay in the startup dispatcher and wrote the design before modifying the scheduler.

### Prompt Context

The active goal requires a powered cold compile through first response, with two seconds as the target, and separate physical keypress-to-LCD timing. The user also requested a new docmgr ticket, an intern-facing implementation guide and reMarkable delivery before consequential work.

### What I did

- Followed source capture, manifest registration, world initialization, queued start, checked file read, worker completion, and first frame publication through `agenda_p4.c`, `kernel.c`, `native.c`, `fs.c`, and the P4 dispatcher and FAT worker.
- Recorded the design in `design-doc/01-dispatch-the-first-agenda-read-and-frame-during-system-startup.md`. It separates the initial ready-turn priority change from a possible short opportunity for the same-core filesystem worker.
- Ran `docmgr doctor --ticket PICOCALC-AGENDA-STARTUP` and uploaded “PicoCalc Agenda First Frame.pdf” to `/ai/2026/11/18/PICOCALC-AGENDA-STARTUP`. The upload reported `OK: uploaded`.

### Why

Agenda has already initialized for roughly 539 ms by the time its first file request reaches the worker. Improving native instruction emission by a few milliseconds cannot eliminate that interval. The A/B experiment isolates the scheduler and uses the same generated app in both conditions.

### What worked

The previous three-trial native receipt isolates 539.078–539.581 ms between reactor initialization and notes submission. Approximately 332 ms belongs to world startup attempts that began in that interval. The design points to the scheduler's unconditional priority for instance creation and describes the same-core worker scheduling caveat. Docmgr validation and reMarkable delivery both succeeded.

### What didn't work

No new implementation tests were attempted in this step. The matched powered control series is still running in the parent parity ticket.

### What I learned

A manifest world can be registered, instantiated, and still waiting for its first application turn. On the P4, queuing filesystem work is also distinct from giving the lower-priority worker time to execute. Measuring both intervals keeps the experiment focused.

### What was tricky to build

The design boosts only the selected startup message or its exact read settlement. Lifting the general Agenda priority would also reorder unrelated user key activity, reminders, reloads and later builds.

### What warrants a second pair of eyes

The startup state must expire even when the file read or its result is delayed. The candidate should preserve normal failure behavior and allow the rest of the catalog to finish initialization.

### What should be done in the future

Run a matched powered control and dispatch-only candidate. Inspect the worker interval before deciding whether to test an explicit short wait. Measure the physical keyboard and LCD independently.

### Code review instructions

Review the design's selected event criteria against `pick` in `picocalc-os/nucleus/kernel.c`, the actual read token in `picocalc-os/port/esp32p4/main/fs_p4.c`, and the existing deadline in `agenda_p4.c`.
