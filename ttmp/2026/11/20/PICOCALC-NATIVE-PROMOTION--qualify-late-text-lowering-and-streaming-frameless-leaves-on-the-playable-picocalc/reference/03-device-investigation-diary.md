---
Title: Device investigation diary
Ticket: PICOCALC-NATIVE-PROMOTION
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T20:01:06.925902032-05:00
WhatFor: ""
WhenToUse: ""
---

# Device investigation diary

## Step 1. Establish the installed firmware and measure ordinary cold builds

The handheld began on the published smooth-Chess application. I acquired the USB console, stopped between peripheral transactions, read back the installed application and partition table, then issued three ordinary reboot commands. Each boot supplies five independently reported compiler observations and one host-observed health endpoint.

### Prompt Context

**User prompt (verbatim)** See the [director's investigation diary](01-director-investigation-diary.md) for the user-authored release request. This investigator received the following **delegated assignment (verbatim)**.

> Own board qualification and all serial use for this release. New ticket ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc. Begin now with actual installed (previous 134f3a24) ordinary release preflight, collect repeatable baseline app cold boot/compile timing and normally loaded PSRAM Chess fixed-work move (UI end-to-end with state/nodes if available) + Editor workflows editing using temporary safe scratch data, plus native health and painter. Make a meaningful baseline vs candidate using normal apps, capture observables and compare, distinguish guest vs UI time, no destructive user file edits. Preserve scripts, compact evidence and full diary under scripts/device, various/device and reference/03-device-investigation-diary.md. Once I supply built candidate path flash app only with hash/partition safeguards; leave latest qualified candidate on device if passes, restore verified ordinary release on failure. If device unavailable register evidence and coordinate. No source compiler edits. Commit your owned files; signal when baseline is running. I own official build/package. If additional targeted PSRAM fixed work is needed coordinate with me.

**Assistant interpretation** Verify the installed comparison arm, observe ordinary startup in both arms and qualify normal app behavior.

**Inferred user intent** Decide whether the production compiler can ship on an everyday playable handheld using repeatable physical evidence.

**Commit (code)** See repository history for the present investigation and its bundled runner.

### What I did

The baseline runner verifies the application at 0x10000 and partition table at 0x8000 against files of known SHA-256. The device remains on its existing filesystem. Cold timing uses five production console records per reboot. The host also records monotonic elapsed time to the last compile line and to the successful native-world and painter queries. [Baseline runner](../scripts/device/01-baseline.py)

### Why

The compiler, native-world loader, painter installation and filesystem share a real boot. A desktop ELF or a dedicated research image would leave startup scheduling, on-device source, allocated compiler heap and this loading path unmeasured.

### What worked

All three boots reported successful Agenda, Files, Editor, Chess and mobile painter builds. The median baseline compile durations were 574.761 ms for Agenda, 273.617 ms for Files, 2,584.555 ms for Editor, 3,637.659 ms for Chess and 1,362.095 ms for the mobile painter. All eight required native worlds became healthy and the painter installed on one compile. [Baseline receipt](../various/device/baseline-cold.json)

### What didn't work

The first collector terminated with `AssertionError` in `assert not log and p['compiles']==1 and p['rejects']==0`. A deliberately denied demonstration reported `nat-import crashed: it links to path_open, which picocalc-os does not give a module`. I restricted the crash check to the eight ordinary native worlds and repeated all three boots.

### What I learned

The release intentionally exercises failing examples at boot. Its shipped workloads and native peripheral services have individual identifiers and status fields permitting a precise health predicate.

### What was tricky to build

A serial console constructor drains startup logs before use. Explicit reboot from an already-open console establishes the same observation boundary across all trials. The final five app records include the screen-message painter, whose source arrives separately from the four bundle compilations.

### What warrants a second pair of eyes

The compile durations and peak bytes come from the firmware compiler telemetry. The host readiness metric includes UART transmission, query time, scheduling and other boot tasks. Healthy worlds are tested by exact file, engine, state and error. [Compiler timer](../../../../../../picocalc-os/port/esp32p4/main/typed_p4.c)

### What should be done in the future

Use identical poll and restart conditions for the candidate and preserve the image that passed the ordinary release gates.

### Code review instructions

Review `cold`, `hold`, `esp` and `ready`, including the app-only write offset and the independent partition verification. The known release and candidate hashes must differ. [Shared console helpers](../scripts/device/common.py)

### Technical details

The old app digest is `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1`. The partition table digest is `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. The expected worlds are compositor, snake, keyboard, display, files, editor, agenda and chess. The keyboard check observes live I²C transfer growth with equal error counters across a sampling interval.

## Step 2. Establish a repeatable visible move and an owned Editor document

I exercised a complete opening move in the real Chess application and compared the entire body and hint area of its framebuffer with an independent frozen render. The Editor workload creates its own directory and file in the existing filesystem, types and revises two lines, saves, closes, reopens and edits again. It checks the visible deletion prompt before removing either scratch entry.

### Prompt Context

**User prompt (verbatim)** See Step 1.

**Assistant interpretation** Measure computation and observable completion separately while preserving user files.

**Inferred user intent** Verify that generated code handles actual play and editing and quantify the effect on normal latency.

**Commit (code)** See repository history for the qualification runner and reference fixtures.

### What I did

For each Chess block I started a new game, selected e2, moved the cursor two squares, then timed the final Enter that submits e2e4. I sampled the painter for two more packets and two more paints, read the world's CPU accumulator, and compared the 320×298 body and hint area against the frozen b8c6 reply. The whole 320×320 transfer has its own CRC. For Editor I verified the prospective directory and alternative root file were absent, checked the Files path on screen, and used the normal Files and Editor keys throughout. [Workflow runner](../scripts/device/workflows.py) [Frozen match and reference frames](../various/device/reference)

### Why

The ordinary production console provides time and state for the whole Chess world, SPI byte counts and external framebuffer snapshots. The deterministic reference carries the board, selection, depth, node count and score associated with the expected pixels. The device can directly confirm only state that is rendered or exported. It does not directly print the engine's result tuple.

### What worked

The first three baseline moves each produced the b8c6 reply digest `5ebdc7118d57aac83f7fc5702dab8db5546d8a18e32a7c6c9dc9b8b28644c55b`, two additional painter calls to paint and 23,628 additional SPI bytes. Both saved file revisions were read back. The cleanup matched independently rasterized confirmation glyphs before deleting the file and its empty directory.

### What didn't work

The first second-save read returned `AssertionError: ('reopen', ['no file qcprobe7/qcheck7.txt'])`. A later read returned exactly `['alpha text', 'beTa7']`; the path can temporarily disappear during a save. I polled for the full expected content with a deadline. A repeat from an existing game then returned `AssertionError: initial-chess differs from opening`. F1 returns to the launcher while Chess retains its board, so I added a new-game F2 before checking the initial reference.

### What I learned

A sampled painter counter and the Chess world's accumulated time cover different boundaries. The first successful painter query is a conservative observable upper bound on body-paint completion. A separate screenshot checks the exact endpoint; neither UART observation measures the physical last panel scanline.

### What was tricky to build

Editor input takes the ordinary keyboard and compositor route. Each new save can publish asynchronously. Matching an exact file identifier in a red confirmation raster before deletion prevents selecting a different entry after Files refreshes its list. A second absent-path check confirms removal.

### What warrants a second pair of eyes

The host bracket spans the start of the previous unsuccessful poll to the end of the first successful poll. The Chess world delta includes other work in its single event turn. The numerical search fields come from independent reference execution, and equality of the rendered pose does not expose hidden device state. The director is separately measuring the isolated search.

### What should be done in the future

Pair the same receipt with a candidate produced by the ordinary build recipe, and retain the same RGB565 body fixtures and filesystem expectations.

### Code review instructions

Inspect the `play`, `match`, `edit` and `remove_owned` functions. Regenerate the two reference records with the frozen Chess camera harness and compare the decompressed bytes. [Reference game generator](../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/scripts/camera/01-match.mjs)

### Technical details

The first revision is `alpha text\nbeTa`; the second is `alpha text\nbeTa7`. The captured foreground body begins at row 22. The reference tuple's final three fields are completed depth 3, 1,600 nodes and score 12. Ordinary guest timing is the native Chess world's kernel CPU accumulator difference, with 0.001 ms presentation precision. SPI traffic covers the same interval plus the counter queries.
