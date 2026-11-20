---
Title: Operator investigation diary
Ticket: PICOCALC-RENDER-SNAKE
Status: active
Topics:
    - picocalc
    - rendering
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:00.633680543-05:00
WhatFor: ""
WhenToUse: ""
---

# Snake operator investigation diary

## Step 1. Freeze an independent design and a reproducible host scope

The real Snake source distinguishes a timer gated by focus from the autopilot toggled with p. I commissioned the prospective study from an authenticated Opus High CLI in /tmp, with no enabled tools. Its public design arrived before candidate implementation or measurements. Its proposed grid origin was an assumption, and one suggestion treats a complete template state as a delta. The operator protocol records how the actual experiments will test both points.

### Prompt Context

**User prompt (verbatim, forwarded by the director)**

> research all this, also do chess, snake, system.
>
>
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Interpretation and intent.** Run Snake as an independent research project, with Opus designing the test and writing the finished publication. The director coordinates the device and vault.

### What I did

Read the parent design and source, created the docmgr ticket, commissioned the independent design and preserved its public output and model receipt. Pinned application input to the production prelude, including its seeded xorshift RNG. Seed 5172 places the first food one cell in front of the reset head.

### Why

A full semantic snapshot allows receiver restart and coalescing. A substituted game model could silently change tail-entry, reversal, or scoring behavior.

### What worked

The isolated commission ran with `claude -p --model opus --effort high --tools ""` and returned one result from claude-opus-5-5. The design predates the first result and has a digest.

### What didn't work

First import via `python3 scripts/03-import-opus.py ...` raised `AttributeError: 'list' object has no attribute 'get'`. The authenticated binary returned an event list. The importer now selects its final result, verifies the model, and excludes account metadata from the repository.

### What I learned

The current kernel retains the producer's serialized screen, then embeds it directly under the frame field in a second JSON envelope. Report sizes at both boundaries. The compositor already performs band-based differences for full paint, so fewer brush writes need not reduce panel transfer.

### What was tricky to build

Control and candidate need the same mutable state before the next timer event. Instrument only the prelude's test harness copy, then use the existing callbacks.

### What warrants a second pair of eyes

The original Opus plan's proposed timer status, full redraw link cost and prediction of template keyframe requests require separate interpretation against the source. Its host timing gates need device qualification.

### What should be done in the future

Run the frozen host protocol and send qualified frames to the director's shared raster harness.

### Code review instructions

Read `scripts/04-protocol.md`, the Opus design, `scripts/01-opus-design.txt`, the exact commissioning command and `various/opus-design-receipt.json`.

### Technical details

Base source revision at orientation was `80cc2512f2605da5dae5108703a88c1eb8aaee53`. Screen byte comparisons use UTF-8. The display dimensions are 320 by 320 and pixels are two-byte RGB565 values.
