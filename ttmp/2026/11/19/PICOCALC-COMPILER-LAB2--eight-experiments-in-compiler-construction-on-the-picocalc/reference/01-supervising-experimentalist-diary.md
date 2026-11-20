---
Title: Supervising experimentalist diary
Ticket: PICOCALC-COMPILER-LAB2
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
LastUpdated: 2026-11-19T21:53:48.752500474-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervising experimentalist diary

## Step 1: Separate the eight questions and test the old baseline through its normal entry points

I allocated the first three Sol researchers to scanning, condition destinations and preserving typed operations. Each wrote a design before changing the compiler. The earlier wave established a fast native candidate and an incremental Files experiment. This protocol asks whether the candidate preserves the broader application suite and which changes help an actual edit on the handheld.

### Prompt Context

**User prompt (verbatim)** “use the same sol/opus subagent config.” Earlier clarification (verbatim) “heap usage is not vitally critical, it's good to keep an eye out but we can definitely trade things off in either direction.”

**Assistant interpretation.** Use GPT-6.2 Sol High for independent implementation and actual Claude Code Opus High for separate design input. Give the board one operator. Evaluate memory jointly with latency, output and application behavior.

**Inferred user intent.** The newcomer should be able to distinguish a measured effect, a compiler model and a failed hypothesis. Preserve negative outcomes and exact replication inputs.

**Commit (code).** Initial protocol and qualification harness; the three study preregistrations are `b6a29e1`, `14c544d` and `3a1acc2`.

### What I did

- Copied the complete assignment into `sources/eight-studies.txt` and pinned the previous wave at `dbe26be`. Wrote the replay wrapper and a separate, tools-disabled Opus CLI dispatcher, one study per prompt.
- Staged the research compiler in a detached checkout, copied the host runtime, ran the professor’s replay suite, and isolated the cause of apparent failures by executing an individual failing Files replay.
- Started the same unmodified replay suite with permission to launch its host subprocesses. Started a fresh current partition-table and factory-image read using the existing backup script. The device is visible at `/dev/ttyACM0`.

### Why

Host replays resolve their compiler imports relative to the checkout. A candidate sitting in a different directory would let a green test exercise ordinary production code. Independent model proposals require separate input before seeing each other’s recommendations.

### What worked

The source digest matched the staged lowerer, and the first replays on the unrestricted local host produced expected Files and Agenda results. Three Sol researchers recorded their designs while the single board was still free. Opus returned separate model-identified responses.

### What didn't work

In the sandbox, Node reported `spawnSync .../picocalc-host EPERM` even though the host child produced its frames. The omnibus runner prints only each failing command’s last two lines. Rerunning one command directly exposed the actual exception.

### What I learned

A replay receipt needs its source identity and its process execution status. A generated screenshot alone did not establish that the parent process accepted the run.

### What was tricky to build

A shared worktree would permit unrelated study patches to contaminate qualification. An isolated checkout needs the existing compiled host runtime and external RISC-V toolchain, while its JavaScript compiler must come exclusively from the pinned trial.

### What warrants a second pair of eyes

Review the pinned digest in the replay wrapper, read any FAIL before accepting the baseline, and ensure the board backup identifies the same partition map as the firmware driver. Check that study 3 reports the observation-only control even if its direct consumer is faster.

### What should be done in the future

Finish native qualification and the physical comparisons, then compose compatible interventions and replay the complete combined compiler.

### Code review instructions

Read the protocol beside `scripts/01-qualify-staged.py`. Compare the original script’s 24 invocations with the recorded outcome. Read `scripts/02-independent-opus.py` for the precise material available to each reviewer.

### Technical details

Staged RV32 SHA-256 `532c5ed74ac6105b98c6a4609bae7f9c551f89e5a19ab36cd0e6faba91745e5b`. Scratch directory `/tmp/pico-lab2-wave`. Raw firmware and serial captures stay there. The committed evidence should contain compiler and output identities, timing rows, and restoration checks.
