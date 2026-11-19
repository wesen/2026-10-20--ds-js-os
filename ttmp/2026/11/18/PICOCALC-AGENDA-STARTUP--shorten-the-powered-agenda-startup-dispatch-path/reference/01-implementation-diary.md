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

The host app suite and 34 native integration tests passed. Both powered candidates built. The healthy Wasm pilot completed all file-state comparisons, including Editor save, and its framebuffer passed CRC. Its three cold trials reported zero I²C errors and submitted the first read in a 2.174–2.240 ms window after Agenda's initialization. RV32 and the full control comparison were still running when I recorded this step.

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

## Step 3 — Qualify the candidate on the powered PicoCalc

The implementation is in `e7abb41`. The healthy dispatch-only variant met the target on all six cold boots. Wasm published in 1.690–1.731 s and RV32 in 1.785–1.787 s. The same fixture passed toggle, edit, confirmed deletion, normalized creation and Editor save on both builds. Each target's real board framebuffer matched the final fixture view and passed CRC.

### Prompt Context

See Step 1. The remaining gaps are the matched unoptimized controls and a visible LCD measurement from a physical key.

### What I did

- Ran the powered qualification with three cold boots and two settled rebuilds per target. Verified I²C and SPI counters per boot, and read back actual notes after each workflow operation.
- Recovered the interrupted native half without discarding the completed Wasm evidence. Verified the readback matched the disposable 67-byte fixture, cleared it, and reran only RV32 from the same firmware pair using tmux.
- Combined both candidate receipts and ran `scripts/01-summarize-powered-runs.py`. Stored the two inspected framebuffer pictures in the parity ticket.
- Enabled the tested option by default for new typed Agenda P4 configurations. The existing control build script passes the disabled value explicitly. Added a video frame-interval calculator and checked its bounds against a synthetic clip.

### Why

A broad boot priority override would affect unrelated worlds. The two-event candidate achieved the cold target using the normal filesystem worker. There is no need to change the worker priority to qualify this build. Physical timing still requires a common clock for key travel and the visible panel.

### What worked

- Wasm median cold first response was 1,701,793 µs and RV32 was 1,786,761 µs. All six boots reported zero I²C and SPI errors. Both workflows passed with zero bus errors and exact byte matches.
- Median initialization-to-submission was 2,217 µs for Wasm and 1,631 µs for RV32. Submission-to-return was about 328 ms for each target. Earlier submission overlaps remaining instance creation even though the same-core lower-priority worker takes longer to report than in the prior native trace.
- Compiler allocator peaks were 630,180 bytes for Wasm and 709,796 bytes for RV32. The native ELF was 66,348 bytes and the Wasm module 67,434 bytes. The complete per-boot and per-operation receipts are under this ticket's `various/`.

### What didn't work

The first paired command exited 143 after flashing and booting the candidate RV32 image, and supplied no native trial receipt. Its teardown did not run. A first cleanup check assumed the raw UART was UTF-8 and raised `UnicodeDecodeError` on byte `0xff`. I verified the directory byte count and exact ASCII fixture in the raw bytes before clearing it. The next run used tmux and passed. I added target-specific resume and a cleanup guard so unrelated file contents are preserved.

### What I learned

Early enqueueing and early completion are different. The startup priority moved file submission to within a few milliseconds of initialization. Other boot work still delayed the return, but enough of it overlapped the outstanding operation to get both targets below two seconds. A settled rebuild has no cold startup work to reorder and uses the ordinary lane.

### What was tricky to build

The benchmarking process can terminate while the board is still running normally. Recovery used the verified app flash and fixture bytes, then resumed just the missing target. This also avoided treating the serial interruption as a fault in the new code.

### What warrants a second pair of eyes

Three cold trials per target establish behavior for this fixture and board. They do not bound tail latency across device revisions or larger notes files. Keep the physical measurement distinct from the first publication and kernel turn.

### What should be done in the future

Complete the control comparison and collect the physical video. Keep the tested firmware and restore the empty task file so the physical test starts from a known state.

### Code review instructions

Use the full receipt `p4-early-dispatch-candidate.json` and summary under `various/`. Check the six intermediate file states in each target's workflow. The CRC-checked board frame captures are in the parity ticket's `various/`. Use the video calculator's `--trial KEY_FRAME LCD_FRAME` once those frames are available. A 100 fps synthetic test with frame indices 5 and 9 returned a 30–50 ms interval and a 40 ms midpoint.
