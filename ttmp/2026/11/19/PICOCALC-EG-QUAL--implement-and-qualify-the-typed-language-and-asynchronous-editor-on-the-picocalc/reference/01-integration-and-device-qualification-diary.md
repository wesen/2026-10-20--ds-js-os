---
Title: Integration and device qualification diary
Ticket: PICOCALC-EG-QUAL
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:26.213776286-05:00
WhatFor: ""
WhenToUse: ""
---

# Integration and device qualification diary

## Step 1: Freeze the shipping compiler and start the control builds

I separated the public language from the application that will exercise it. The unmodified Editor and its compiler must be available for a direct comparison after other researchers edit the production sources. I pinned a detached build to revision `289281c`, which closed the previous research program.

### Prompt Context

**User prompt (verbatim).**

> do E1-E7 and G1-G4.
>
> Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
> Chose opus high for researchers
> Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
> analogies, see skill).
> Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

**Assistant interpretation.** Implement the production code and test all eleven named tasks against the professor’s specifications. Commission Opus High independent researchers, use the established Sol implementation team, and publish individual reports and my synthesis after results.

**Inferred user intent.** A new intern should be able to reproduce why the compiler accepts a program, how continuations translate to machine code, and what a user of the Editor actually waits for.

**Commit (code).** The control is `289281ccf97ebe83196ab3c2c38845b99a24a7be`.

### What I did

- Read the acceptance sections in both professor documents and compared them with the earlier Open pilot, which only transforms the initial file read.
- Assigned the production frontend, general continuation compiler and application migration to separate implementers. Commissioned independent high-effort Opus researchers for all three questions.
- Checked the serial device on the physical host, started a fresh read of its factory partition, and launched matched baseline firmware builds from the pinned checkout in isolated scratch space.

### Why

The normal host replays load scripts relative to their checkout. A test run with links into a mutable production compiler could silently exercise a different version from the physical control. The restored 8 MiB factory image is also independent of the firmware rebuilt for this study.

### What worked

The USB Single Serial adapter is present at `/dev/ttyACM0` on the physical host. The baseline image build selected the installed ESP-IDF 5.4.2 toolchain. Production sources, thresholds and target order are recorded in the integration guide.

### What didn't work

A sandboxed `ls /dev/ttyACM*` returned `no matches found`. The authorized physical-host check showed the requested port. The Claude Code default Opus alias twice returned a provider safeguard error for the compiler design sessions. The CLI offered a model change. I launched the same three ordinary software engineering research questions on explicit Opus 4.6 High with the same inputs and settings.

### What I learned

The E5 call graph is shared by forward calls and asynchronous call checking. The three awaitable SDK calls are already present in the production import table. Their metadata can be extended without adding a new kernel interface or a second source of truth.

### What was tricky to build

Radio and filesystem state must survive hardware experiments. The backup reads the partition table and factory program only. The mounted device belongs to the physical host rather than the sandbox’s device view.

### What warrants a second pair of eyes

Check that both ELF and Wasm world entry points use the same SDK descriptors. Compare state lifetimes, including scratch views and scalar fields, at each suspension.

### What should be done in the future

Gather baseline return values, frames and timing before switching firmware. Exercise both compiler targets and both complete application workflows, then publish source-qualified measurements.

### Code review instructions

Start with `scripts/01-opus-research.py`, `scripts/02-prepare-images.sh`, the normal typed-world linker, and the `PICOCALC-NATIVE-NEXT` acceptance tables.

### Technical details

The physical port is independent from the USB UART at `/dev/ttyUSB0`. Board scheduling uses the same shared serial lock as the previous wave.
