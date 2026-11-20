---
Title: Director investigation diary
Ticket: PICOCALC-RENDER-LAB
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:20.741483467-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1: Commission the execution and establish a physical control

The department plan was authorized. I assigned three experimental operators to work with actual Opus High researchers and commissioned a fourth Opus High study of representation. My work covers independent qualification, shared pixel comparison, admission and physical measurement. Each researcher will author a separate teaching article after receiving verified results.

### Prompt Context

> research all this, also do chess, snake, system.
>
> Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
> Chose opus high for researchers
> Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
> analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

I used the department handout at revision 80cc251 as the starting specification.

### What I did

Created this execution ticket, commissioned the studies, traced actual serial visibility and ran the playable three-app control. Wrote a recorder for the production compositor and a C driver linked against the actual graphics primitives and font tables. Defined one NDJSON fixture schema and raw RGB565 output across studies.

### Why

A byte count on the producer, a device CPU interval, and successful display transfer are different observations. Comparing the actual full image detects subtle text, clipping and paint-order changes that an operation count can hide.

### What worked

The external host exposed the P4 on ttyACM0. A read-only world query returned the native compositor, native Chess and Snake, and JS System. The 69-second live control captured three CRC-verified screenshots. The strict oracle's one-letter positive control changed seven pixels. A deliberately skipped transfer recovered on a subsequent identical repaint.

### What didn't work

Inside the filesystem sandbox, listing /dev/ttyACM0 failed although sysfs contained the device. The authorized host check resolved it. Node’s first native subprocess reported “spawnSync git EPERM”; the same scoped test ran under approval. The first glyph differential showed zero changed pixels because an omitted font shifted fields in my line protocol. Explicitly supplying the production default font corrected the error. The first independent Keys holdout stopped with “ReferenceError: ask is not defined” in the focus fixture. I requested a fixture-only fix after the extractor freeze.

### What I learned

Snake runs as a native CJI world on this firmware even though its app source is ordinary JS. The device is available despite the appearance of the sandbox. Code size alone hides the fixed 64 KiB Wasm linear memory a standalone renderer can require.

### What was tricky to build

Full-screen equality and panel recovery require separate oracles. The C driver applies only the returned commit rectangles to a simulated panel. The compositor recorder freezes its clock and exposes drawing exceptions, so a candidate cannot silently pass by drawing the same error view.

### What warrants a second pair of eyes

Check that each study charges packet framing, transient host work and unshared install costs. Examine false positives when a screenshot is unchanged; changing a glyph should affect the raster.

### What should be done in the future

Run the bounded-reader comparison on the frozen corpus, compare candidate treatments on the handheld, independently replay the reported results and verify publication of all articles.

### Code review instructions

Begin with scripts 03 and 04 for pixels, scripts 05 and 06 for the physical control, and the model-attributed public response in various/representation-blind.md. Compare the frozen holdouts to the individual study tickets. Raw serial files stay local to the bench.

### Technical details

The physical lock is /tmp/pico-lab2-wave/original/serial.lock. The installed playable reference image and its historical receipt agree on the SHA-256 beginning f12e2f5d. The frames use 320×320 little-endian RGB565 pixels and the graphics code's 16-row band comparison.

## Step 2: Test the two rendering designs on identical screens

### Prompt Context

The user clarified that both designs were in RENDER-NEXT. I kept the portable-view and bounded-reader comparisons together and reserved Editor and Keys as independent consumer and extraction checks.

### What I did

Implemented a validation pass, an eight-byte record format, traversal on demand and a materializing control sharing the scanner. Ran the actual compositor on 409 host snapshots. Built a width-sensitive, capped within-draw layout reuse candidate. Coordinated portable Wasm probes, whole-guest producer instrumentation and separate fixed System, Snake and Chess receive jobs on the physical device.

### Why

A shorter packet can move cost to the receiver. An indexed reader can reduce materialization yet spend more time locating individual fields. Both possibilities require an end-to-end equality check and independent stage timings.

### What worked

All four traces produced the same graphics commands for original, indexed and cached layout. On 100 System, 236 Snake and 47 Chess frames the memo table recorded zero repeated identical node/width requests. Keys produced 48 hits across 26 frames. The code handles an escaped object key, a duplicate key, null, Unicode and capped input without changing accepted tree values on the corpus.

### What didn't work

The first sandboxed hostname wildcard used inside a command-line assignment failed to expand. Passing the resolved ticket path fixed the replay. The first ESP-IDF configuration failed on a missing historical CJI runtime. Another commit had just moved it. The staging script now extracts the exact CJI revision that goes with the frozen OS source.

### What I learned

Preallocating 4,096 records costs 32 KiB even for a small game update. An exact bound on these records does not bound text allocations, the event bus or the wrappers used to read the values. Claims about hard limits must name the boundary.

### What was tricky to build

Preserving normal array iteration required both indexed reads and property-presence queries. Relative jump offsets allowed streaming over a subtree without decoding all its contents. Repeated indexed reads still revisit text; testing a dense canvas exercises this cost.

### What warrants a second pair of eyes

The generic production compositor is compiled through CJI. Isolated QuickJS decoder results and WAMR producers measure real hardware with different runtimes. The trace on the normally booted app supplies the real frame-handler baseline.

### What should be done in the future

Finish the hardware comparison, compare the independent producer and consumer results, and record where candidate savings fall outside the measured interval.

### Code review instructions

Read scripts 10–12, inspect reader-layout-host.json, then compare stage boundaries in scripts 08 and 13–14 to the blind requirements. Complete device transcripts stay with the bench.

### Technical details

The fixed matrix uses three renderers, plus the independently frozen Keys workload. SHA-256 covers the ordered sequence of graphics calls. Pixel equality for each original recording is independently measured by the child tickets.
