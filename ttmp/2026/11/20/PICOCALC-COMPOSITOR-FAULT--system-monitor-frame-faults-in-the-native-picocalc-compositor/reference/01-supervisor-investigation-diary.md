---
Title: Supervisor investigation diary
Ticket: PICOCALC-COMPOSITOR-FAULT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T07:12:08.257084126-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary

## Step 1: Reconstruct the native fault and commission two investigations

I opened PICOCALC-COMPOSITOR-FAULT against firmware source b1cbfa1. The earlier receipt preserved structured fault records. Rereading their neighboring serial lines supplied an important missing fact about the two invalid event returns.

### Prompt Context

**User prompt (verbatim):**

> create a new docmgr ticket to investigate the compositor bug, write a detailed design doc explaining how th ecompositor works and how to debug it and all the wyas in how this is working and implemented, and then send off a researcher pair to investigate and fix it.
>
> Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
> Chose opus high for researchers
> Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
> analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

### What I did

Used docmgr to create the ticket, guide and diary. Read the generated Ninja recipe, native event adapter, generated-language prelude, System app and compositor. Started two independent Claude Opus high sessions, one on frame production and one on event receipt. Their initial input consisted of a bounded incident summary. The supervisor owns all physical measurements.

### Why

The earlier event record showed the native ABI outcome. A world can emit a more specific runtime reason just before the kernel records the generic outcome.

### What worked

In /tmp/p4-sysmon-fault-02.log both invalid returns follow the exact line “compositor: crashed: out of memory” by about 1.3 ms. The two elapsed-time failures contain no such preceding line in this capture. Source confirms the CJI ELF bridge deliberately returns 2 on a fatal runtime error. See various/baseline-faults.log.

### What didn't work

Filtering only for #OCT1 discarded the explanatory lines. The first attempt to start tmux for the candidate build returned “Operation not permitted”; an approved tmux invocation started the build.

### What I learned

The compositor is a CJI-built native service, and its frame handler retains a tree before scheduling another event to paint. The generic native loader times the whole entry. Both decoding and garbage collection can contribute to frame receipt.

### What was tricky to build

The visual result depends on the visible rows after layout and on the integer y coordinate of each sparkline sample. Producer-side changes must preserve selection and details across the entire catalog. The first candidate centers a bounded row window and encodes graph samples in plot units; the supervisor will test these independently of a larger budget.

### What warrants a second pair of eyes

The exact failed allocation and the relative costs of JSON parsing and collection remain unknown. Candidate pixel equivalence requires attention to rounding ties and to both ends of the table.

### What should be done in the future

Test the source-level behavior, flash the candidate, exercise every tab and scroll, and inspect actual frames and restart deltas. Deliver the research reports after the physical results arrive.

### Code review instructions

Follow the native ELF path through runtime/cji_elf.c and elf_event. Read the design document alongside the project sources listed in its component table.

### Technical details

The reproducing image has a 320 × 320 display, 80 ms compositor segment budget and 768 KiB compositor quota. The System monitor collects 48 samples of history. Both eyes on quota and host allocator behavior are needed when interpreting an out-of-memory record.

## Step 2: Compare the changed producer against the existing renderer

I implemented the System frame reduction in df79a0f and compared it to dcf3fca. The initial candidate keeps the existing app features, driver and native event ABI. The physical trial uses the same playable firmware profile as the fault report.

### Prompt Context

See Step 1. The comparison answers whether a smaller message can preserve the observed screen.

### What I did

Compiled both source versions into separate host VM contexts, called the actual compositor drawing routines, and compared the recorded draw calls. Built the four-app ESP-IDF image and started the normal installer and qualification schedule against the shared serial lock.

### Why

A plain JSON equality test would reject an intentional change in representation. A selected-row count alone would miss a shifted viewport or a graph whose lines move by one pixel.

### What worked

All 65 fixture selections produced identical drawing calls. For the final selection of each tab, the serialized synthetic tree fell from 4016 to 1766 bytes for Worlds, 2641 to 1529 for Handles, and 2678 to 1166 for Buses. The two existing host test files passed. The firmware build completed. These byte counts exclude the enclosing event.

### What didn't work

The first host harness attempted to spawn git from Node; the sandbox reported “spawnSync git EPERM”. Passing the original source through stdin produced the same comparison without a nested process. An initial Opus alias session declined the receiver request. Explicit Opus 4.6 High returned a public technical review. Its suggestion to clamp a fault return to 1 conflicts with the actual native ABI and was rejected.

### What I learned

A source-free review needs an explicit definition of each return code. I checked the receiver's recommendations against the local loader and documented the correction in various/04-review-disposition.md.

### What was tricky to build

The candidate flashes only the application partition. The physical driver remains enabled, and the capture schedule waits across samples, scrolls, changes tabs, reopens System and returns to Chess. Local framebuffer contents will be verified visually as well as by CRC.

### What warrants a second pair of eyes

Test the numeric transform near half-pixel ties and examine long-run physical behavior. The host fixture measures drawing calls for one 320-pixel layout.

### What should be done in the future

Review every captured tab and the final world snapshots. Query another state snapshot if a long serial JSON response is incomplete. A visible crash invalidates the candidate even if it restarts successfully.

### Code review instructions

Run the comparison command in the design guide. The exact physical schedule and acceptance checks are in scripts/04-exercise-device.py.

### Technical details

Negative rounding before negation gives a distance that rounds halfway towards the baseline for an integer-base line plot. The existing compositor remains responsible for geometry, cell colors, font clipping and pixel writes.

## Step 3: Correct a drawing difference and inspect the first physical trial

The producer researcher's boundary-case suggestion found a real one-pixel difference in the first candidate. I corrected the calculation in ef0ff95. The first candidate provided direct physical evidence about the fault while the corrected firmware was building.

### Prompt Context

See Step 1. This step verifies both the visible output and continued progress of the services on the board.

### What I did

Added half-pixel samples, empty lists and lengths surrounding each table's window capacity. Replayed the actual draw calls. Built the corrected image separately while inspecting the first board's 152-second qualification.

### Why

A measurable payload reduction cannot establish that the graph still draws the same points. A CRC failure during serial capture should be separated from the compositor fault.

### What worked

The added test first failed at “half-pixel fixture / tab 0 / count 0 / row 0”. The recorded line endpoint moved from 81 to 80. Preserving the original operands close to a half fixed that fixture. All 69 added comparisons passed. The first image reached the bottom world, both other tabs and Chess. Compositor turns advanced by 1,075 and System by 327 with no new fault records.

### What didn't work

The final Chess screenshot in the first run failed with “BAD: 984297 px”. A separate capture of the same screen passed CRC. The four System screenshots passed on the first attempt. An initial research report interpreted cumulative turns as a throughput improvement. I removed that claim and kept the two counter observations and their meaning.

### What I learned

The errors found by the two independent reviews were of different kinds. The producer's proposed test changed production code. The receiver qualification required observable progress in addition to a quiet log. An independent technical review still needs verification against the ABI.

### What was tricky to build

The two runs use the same 80 ms budget, 768 KiB quota, four native typed apps and enabled peripherals. The only production source changed between the two candidate images is the graph boundary correction.

### What warrants a second pair of eyes

The previous control did not run for the same duration as the candidates. No rate reduction or latency speedup is inferred from the number of timed events.

### What should be done in the future

Rerun the corrected binary and verify its five screenshots, fault stream and world snapshots. Archive both the first receipt and the corrected-build result.

### Code review instructions

Compare df79a0f and ef0ff95, then run scripts/02-compare-system-frames.mjs with the old source supplied on standard input. Inspect scripts/04-exercise-device.py for the time and location of each UI action.

### Technical details

The real Worlds screenshot showed six rows. After the Down sequence, the final nat-dial row was selected with its details. The other two frames showed the Handles listing and the I²C and SPI bus transfer graphs. The half-pixel correction uses the actual display coordinate range.

## Step 4: Qualify the final firmware and publish the three studies

I inspected the five captured screens on the corrected firmware and verified the final world counters. Both researchers returned their authored articles and diaries. I reviewed their conclusions, completed the synthesis and published the three reports.

### Prompt Context

See Step 1. Publication and an installed, qualified fix are the completion conditions.

### What I did

Installed ef0ff95 and ran the full 152-second schedule. Checked each image against its intended screen, inspected the structured receipt, reviewed the Opus High articles against the source, and pushed five files to go-go-parc main in b246fd0.

### Why

The first trial exercised the frame reduction; a fresh trial was necessary to qualify the corrected graph implementation. The operator's problem concerns a live screen, so a clean log alone was insufficient.

### What worked

All five final images passed CRC and visual inspection. Three full snapshots showed that the compositor, System and display progressed without restarting. The serial stream contained zero fault events in the test window. Final focus was Chess. Both researcher reports and the supervisor report are published with two board figures.

### What didn't work

The first published-draft review caught a suggested throughput percentage derived from cumulative turn counts; that interpretation was removed before publication. The docmgr check also caught missing document metadata on interim review files. Adding frontmatter and numeric prefixes resolved it.

### What I learned

Keeping the raw line immediately before each structured fault made the runtime error legible. Comparing drawing operations exposed a real half-pixel regression. Device-side restart counters, active turns and actual screens answered three different questions.

### What was tricky to build

The first trial's corrupt final UART image required an isolated retry. The final trial recovered all five images directly. The prose distinguishes a charge at a failed allocation from the unknown size of the refused request.

### What warrants a second pair of eyes

The run duration is bounded and the failing allocation site remains unmeasured. The eight- and fourteen-row enclosing windows depend on the PicoCalc layout.

### What should be done in the future

Reopen the study if the monitor faults again on the installed build or if a change to its panel geometry invalidates the differential drawing test.

### Code review instructions

Inspect the two production commits df79a0f and ef0ff95, then the final device receipt and the three articles in the analysis folder. The vault publication changes exactly three notes and two images.

### Technical details

The installed application image SHA-256 is f12e2f5d6e668ef7d61fa456b69b56bf9f1e976e929672e7df81ac33a2f03f83. Final world counters advanced by 1,075 compositor, 327 System and 279 display turns. Both tolerances remained 80 ms and 768 KiB for the compositor.
