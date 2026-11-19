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

## Step 2 — Implement the dispatch-only candidate for both backends

The guide and its upload are in `bdaaf54`. I added an opt-in P4 experiment that advances Agenda's initial start message and its exact first notes settlement. It keeps the original FIFO selection within each world, the normal per-world priority outside the two events, and the existing FAT worker.

### Prompt Context

See Step 1 for the user goal and the guide required before implementation. This is the first, dispatch-only alternative described there.

### What I did

- Added `PICOCALC_AGENDA_EARLY_BOOT` in the P4 build and attached the definition only to the typed Agenda firmware.
- In `kernel.c`, `pick` first selects the existing candidate for each world. The early gate can raise that candidate to priority 11 only for a start message or settlement. The ordinary creation priority is 10.
- In `agenda_p4.c`, the eligibility check requires the initially compiled Agenda, the original world epoch, the first publication still pending, and the existing startup deadline. The zero token represents its initial start. `fs_p4.c` records the first actual read token only for `notes/todo.txt` from that world, with the job's epoch checked at submission.
- Built the powered Wasm and RV32 variants with the single flag enabled. Manifest, SDK and partition artifacts matched the corresponding control images. Symbol inspection of the P4 ELF verified both new gate functions. The candidate does not alter the SDK bridge or the application's typed source.

### Why

Moving the start turn advances I/O submission. Moving just the corresponding settlement lets the reactor publish once the file is ready, while preserving the other worlds' work and the scheduler's normal order everywhere else. This isolates dispatch from changes to FreeRTOS priority, core placement or queue service.

### What worked

The host app suite and 34 native integration tests passed. Both powered candidates built. The healthy Wasm pilot completed all file-state comparisons, including Editor save, and its framebuffer passed CRC. Its three cold trials reported zero I²C errors and pressed the first read into a 2.174–2.240 ms window after Agenda's initialization. RV32 and the full control comparison were still running when I recorded this step.

### What didn't work

The preceding control attempt encountered a keyboard-controller NACK fault. After the user returned, two console samples showed the historical error count held at 7,112 while 142 additional transfers succeeded. I resumed the paired experiment after that check. The probe now confirms the `hold` response before each flash or reboot and reports I²C and SPI counters for every cold trial.

### What I learned

The priority gate can reuse the actual read promise rather than depend on approximate state such as the next settlement being for startup. At the filesystem boundary, both the epoch and the target path are available. The first notes read is identified there.

### What was tricky to build

The scheduler picks a candidate for each world before comparing their priorities. The new condition checks that chosen candidate. It cannot skip an earlier event from the same world. An expired deadline or later epoch simply returns to the normal policy.

### What warrants a second pair of eyes

Check that a missing file still becomes a usable empty Agenda view. The read promise is attached at FIFO submission before its I/O has started. A late or failed completion must remain dispatchable at normal priority after the gate expires.

### What should be done in the future

Finish the healthy two-target candidate and controls before deciding whether a bounded worker opportunity is needed. Keep the optical latency experiment independent.

### Code review instructions

Review `pick` in `picocalc-os/nucleus/kernel.c`, the predicate and promise capture in `agenda_p4.c`, and the capture call in `fs_p4.c`. The parent parity ticket builds both targets with `scripts/05-build-powered-targets.sh` and runs the powered fixture with `scripts/06-qualify-powered-targets.py`.
