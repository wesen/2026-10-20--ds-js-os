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

## Step 2: Qualify the checkpoints and define a whole-search clock

The independently rebuilt control, the language-only Editor and the Editor with asynchronous Open each passed the 24 historical host workflows. The production continuation compiler can now compile real application code that issues a file read, waits for normalization or yields during a search. Its first full-source token array used more than the target QuickJS heap. The replacement retains source spans for ordinary functions.

### Prompt Context

**User prompt (verbatim).**

> what about measuring the performance of teh generated code, are we covering any of it?

**Assistant interpretation.** A generated Editor can take many kernel turns to complete one Find. Measure a whole operation on the handheld and measure the CPU charged to the Editor separately.

**Inferred user intent.** Compare two working programs on the same input and make the cost of suspension visible to a reader who does not yet understand the kernel.

**Commit (code).** The application control is `289281c`. The language-only application is `1357545`. Open first passed at `eb4ef81`, the compiler span change is `0f23617`, and the first complete Open and Find source is `7b321a9`.

### What I did

- Integrated the compiler script in the ESP-IDF typed world and in the host Editor workflow. Ran the 24 historic workflows on three separate frozen checkouts. Preserved the language and Open receipts in the ticket.
- Used the original physical workflow unchanged for application actions and inserted a starting `stats` command to read the Editor CPU counter. Prepared a separate instrumented kernel for whole-document searches and built both observer images. It starts its clock when Enter in the prepared Find prompt reaches the Editor. It stops when that same Editor returns a frame containing the expected position or miss status.
- Read the complete 8 MiB factory partition and compared each experimental partition table with the device backup. Recorded SHA-256 `6b0e3ba4a2d4546b5eeae3a608c82b3b0df06034afc5afedcc1e3e264d0b883f` for the saved factory application. Confirmed the four design guides were accepted together in the reMarkable folder `/ai/2026/11/19/PICOCALC-EG-QUAL`.
- Examined differing control screenshots with Pillow's RGB difference bounding box. Changed the matched pre-G and G4 comparison firmware to fix only the wall-clock input returned by the port. Scheduling and all reported durations use the hardware monotonic clock. The standard product and unmodified control continue to obtain the actual wall time.

### Why

A guest cycle count for a short literal comparison cannot determine the total time spent on a 65,536-byte document. A user may wait while the Editor is sleeping. Conversely, the serial tool spends seconds moving a compressed screenshot, well after the Editor computed the answer. Starting and stopping inside the kernel excludes that transport.

### What worked

The frozen language checkpoint preserves the original native text under distinct integer annotations. The E6 enumeration adds 36 native words. Open alone passed the 13 Editor workflows and used exactly 71 persistent words. The combined language and app passed five additional direct reactor fixtures, including a canceled timer delivered while the replacement operation is active. The first control native runs took 34.39 and 35.15 ms of total Editor CPU during the small interactive workflow.

### What didn't work

Two captures on identical native control firmware had different SHA-256 values. Both the preview and Find differences fell inside rectangle (612, 10) to (626, 30), in the live clock. An image digest from two different wall times cannot test Editor output. I kept these real-clock samples and made the matched captures share a time input. I also reviewed the first general continuation implementation and flagged whole-file token retention. The original compiler at `62d829f` exceeded 4 MiB under vendored QuickJS on the full staged Editor. Its span-based replacement compiled the same source under the cap.

### What I learned

`WorldState` holds app data and generated frame fields after the compiler itself exits. The compiler heap can shrink by megabytes while the app frame shrinks by a single word. A measure of one tells the reader little about the lifetime of the other.

### What was tricky to build

The physical driver checks successful file reads, normalized bytes, bus error counters, and screenshot transfer CRCs. These validate different properties from a pixel comparison. The new search clock also checks that Enter belongs to the intended prompt and the final status names the actual file. A short-circuit in the clock must not mistake the initial 1:1 status for the later 1:2 match.

### What warrants a second pair of eyes

Inspect the monotonic timestamps in `05-find-observer.inc`, the placement in `run_segment` and the engine counter. The engine interval includes the reactor and its SDK work. Compare the starting and ending published statuses for all three search cases.

### What should be done in the future

Complete matched physical runs on both targets, repeat any failed qualification after diagnosis, and compare the whole search with the small workflow. Document any failed prediction separately from partial or missing data.

### Code review instructions

Start with `03-board-qualification.py` for normative workflows. Read `07-time-find.py` for diagnostic searches, and `09-fixed-wall-images.py` to see the only clock change. `08-host-replays.py` checks the exact Git revision and requires 24 successes.

### Technical details

The dense fixture is 851 copies of 75 printable characters plus CR LF, followed by the nine bytes of `needlezzz`. Its last line is 852 and its total size is 65,536 bytes. An early match for `ext` ends at displayed position 1:2. The final unique `needle` starts at 852:1. A miss for `text text z` forces the search to exhaust its candidate positions.
