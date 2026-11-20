---
Title: Opus researcher investigation diary
Ticket: PICOCALC-RENDER-CHESS
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:07:24.601751856-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary: handheld Chess rendering experiment

## Entry 1: Blind design and its corrections

I supplied this design without access to the repository, the guest program, or any hardware. The operator wrote and ran all code. My contribution here consists of predictions and a test proposal. Some of that proposal did not hold up, and the operator corrected it before building anything.

### Prompt context
The original design request is archived as `scripts/01-independent-design.txt`. That file is the authoritative record of what I was asked. I do not restate it as a quotation here.

### What I did
- Predicted typical wire ratios of 20–100x between the original transport and the candidate.
- Proposed a usefulness floor: a candidate below 5x would not justify adoption.
- Predicted a standalone WebAssembly module of 20–80 KB.
- Predicted receiver compile cost for a hypothetical 1.5 GHz handheld.
- Proposed sorting drawing commands.
- Stated that I had frozen a holdout seed.

### Why
I expected a canonical command order to make the transport compact and to make comparisons easy. I chose ratio, module size and compile cost as the decision measures because they bound both the wire cost and the install cost.

### What worked
The measures I chose survived as reporting axes. The 5x floor remained usable as a reference line.

### What didn't work
- **Holdout seed.** My written design supplied no numeric seed. A claimed frozen seed with no recorded value cannot be verified, so it has to be treated as absent.
- **Command sorting.** Sorting conflicts with the requirement to preserve the original exact order. I withdraw it.
- **Speculative cases.** Flipped-board, threefold-repetition and 50-move displays do not exist in the guest, so those cases cannot be scored.
- **Compile prediction.** It targets a hypothetical device. No host number can confirm or refute it.

### What I learned
The operator required:
- the original exact order,
- exact bytes,
- the real typed game policy,
- no anti-aliasing tolerance, and
- explicit seeded edge fixtures, with no claim of sealed random tests.

Each of these replaced a looser element of my design.

### What was tricky to build
I built nothing. The hard part of the design was stating equivalence with zero tolerance while still allowing the payload to be compressed.

### What warrants a second pair of eyes
Any document that cites my "frozen holdout seed" as evidence.

### What should be done in the future
- Record seeds as literal numbers.
- Propose only cases the guest can display.

### Code review instructions
- Confirm that no sorting step exists anywhere in the producer or receiver path.
- Confirm that the fixtures are labeled as explicit and seeded, not as sealed random tests.

### Technical details
- Predicted ratio band: 20–100x.
- Usefulness floor: 5x.
- Predicted module size: 20–80 KB.
- Compile target: a hypothetical 1.5 GHz handheld.

## Entry 2: Review of the completed host milestone

The operator reported the host milestone results to me, and I interpreted them against my predictions. Everything below is the operator's reported outcome. I did not observe or execute any of it. A later entry will cover a separate physical experiment, so physical receipts and final recommendations stay open.

### Prompt context
The operator reported that their first sandboxed attempt to reach me failed with `ENOTFOUND`, and that an authorized rerun worked.

### What I did
I compared the reported numbers with my Entry 1 predictions and separated host evidence from device claims. I also identified which claims still need review.

### Why
My predictions were blind. They need to be scored openly, including the ones that missed.

### What worked
**Position format.** The complete position uses:
- 64 printable hex pieces,
- 16 hex digits for rank masks,
- a full 64-hex program hash and schema 1,
- nine small decimal fields, and brackets.

It carries status and outcome decisions, cursor, selection, last move, hint, and the completed depth, node count and signed score when these are visible. The producer owns real legality and check.

**Guest setup.** Opening and search run through unmodified initialization and user events. Ten fixtures change new-game positions identically in both guest arms. Independent guest instances produce the ordinary tree and the new state. The import-free receiver reconstructs the ordinary tree and hints within a fixed 64 KiB memory.

**Coverage.** 127 events produced 47 screens. These covered:
- promotion, cancel and underpromotion,
- both castlings,
- en passant,
- mate wins for both colors,
- stalemate,
- dead material,
- check, and
- a negative score.

One unchanged publication matched deduplication on both sides.

**Equivalence.** The following all matched:
- all ordered tree and hint bytes,
- 47 fresh-receiver replays,
- all 47 A/A and all 47 A/resident RGB565 320x320 full frames, including a virtual lost-flush recovery, and
- byte-delivered and source-delivered views, each against all 47 framebuffers.

Five invalid states left the last good replay intact.

### What didn't work
- **Wire ratio.** The overall ratio of 14.973x falls below my 20–100x band. The ordinary opening-only ratio of 19.144x also falls just below it. Both clear the 5x floor.
- **Module size.** The module is 8641 bytes, far under my 20–80 KB prediction.
- **Receiver time.** Receiver time rose from 28.062 to 37.404 microseconds.
- **Comment edit.** The first trailing source-comment edit gave `SyntaxError: 154:1: expected function`. Moving the comment to the beginning compiled to the unchanged artifact.

### What I learned
- **Payback.** On this opening, both arms pay back their byte cost by changed post 2.
- **Timing saving.** The paired time-to-parsed-paint-input saving is 1.024 microseconds. That sits inside the A/A individual-pair 95th percentile of 6.525 microseconds, so it does not show a host speed advantage.
- **Byte reduction.** The real gain is in bytes, not latency.

### What was tricky to build
Per the operator's report, the tricky parts were:
- reconstructing hints without imports inside a fixed memory, and
- keeping source approval tied to a fixed digest while the cache depends on compile and ABI.

A neutral source edit misses the cache and then hits.

### What warrants a second pair of eyes
- **Native queue.** The native-envelope grammar was reproduced on the host, but the native queue was not run.
- **Host scope.** The host's unrelated-event probe and runtime are not device behavior.
- **Out of scope.** Telemetry and filesystem UI fall outside the host endpoint.
- **Syntax error.** The trailing-comment error should be explained, not just avoided.

### What should be done in the future
- Run the native queue.
- Complete the P4 measurement for the firmware-only C producer harness. The operator smoke-tested it with actual WAMR on the host, 25 frames per arm.
- Hold recommendations until the physical entry.

### Code review instructions
- Verify that ordered byte equality is checked directly, not after normalization.
- Confirm that invalid states cannot overwrite the last good replay.
- Check that cache keys include the compile and ABI inputs.
- Confirm that dedup compares the full publication.
- Inspect where in the source grammar a comment is accepted.

### Technical details
**Wire bytes**

| Measure | Original | Candidate | Ratio |
|---|---|---|---|
| 46 changed posts | 178955 B | 11952 B | 14.973x |
| Ordinary opening only | — | — | 19.144x |
| Launch | 4835 tree + 41 hints | 200 + 0 | — |
| Launch, framed | 4936 | 260 | — |

**Install sizes**
- Module: 8641 bytes, from 6408 bytes of source.
- Separate real binary install packets: 8649 and 6416 bytes.

**Host timing, selected-key medians (1200 pairs)**

| Measure | Before | After |
|---|---|---|
| Game event and screen capture | 14.583 µs | 5.347 µs |
| Receiver | 28.062 µs | 37.404 µs |

- Paired time-to-parsed-paint-input saving: 1.024 µs.
- A/A individual-pair differences, 95th percentile when selected: 6.525 µs.

**Warm execution, R/M/S**
- 25.276 / 25.193 / 25.410 µs.

**Fresh Linux Node processes (12 per arm)**
- Median install-to-first-verified-tree, R/M/S: 1.787 / 1.936 / 7.031 ms.
