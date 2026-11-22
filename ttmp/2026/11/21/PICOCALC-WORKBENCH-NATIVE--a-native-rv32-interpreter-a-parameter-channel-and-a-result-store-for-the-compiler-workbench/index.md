---
Title: A native RV32 interpreter, a parameter channel and a result store for the compiler workbench
Ticket: PICOCALC-WORKBENCH-NATIVE
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://cmd/trace-repl/README.md
      Note: User documentation for rv32, args, results, worlds and blocks
    - Path: repo://ttmp/2026/11/21/PICOCALC-WORKBENCH-NATIVE--a-native-rv32-interpreter-a-parameter-channel-and-a-result-store-for-the-compiler-workbench/design-doc/01-native-interpretation-parameters-and-results-in-the-compiler-workbench.md
      Note: Design and as-built notes
ExternalSources: []
Summary: "The second round of trace-REPL workbench changes requested by PICOCALC-RAY-PARITY's field notes: a Go RV32 interpreter identical to the reference (I1, about 440-500x faster than the reference in goja), a fresh args object per cell and job (I2), a result store (I5), per-block detail from stats.paired (I6) and the Files and Agenda worlds (I2b)."
LastUpdated: 2026-11-21T23:30:00-05:00
WhatFor: "Finding the design, evidence and diary of the native interpreter, args, results, blocks and worlds."
WhenToUse: "Before changing rv32, the args channel, results, stats.paired or compiler.at(rev).world."
---

# A native RV32 interpreter, a parameter channel and a result store for the compiler workbench

## Overview

PICOCALC-RAY-PARITY's field notes named what kept compiler optimization work from staying inside the trace-REPL workbench. This ticket implements the first five improvements and proposes the sixth:

- **I1, `rv32`:** the RV32 reference interpreter (`picocalc-os/tools/rv32-interp.js`) run natively in Go, with identical results, bytes, registers, trap flags, fault messages and per-PC counts. `compiler.at(rev).native.rayBench` runs a revision's ray bench on it. The opening frame takes about 50–90 ms instead of 18–46 s for the reference in goja.
- **I2, `args`:** `trace-repl eval --arg NAME=JSON` and `--args-file`; every cell and job sees a fresh `args`, recorded with jobs.
- **I5, `results`:** `results.save(name, value)` with the session, unit, script digest, args, HEAD and loaded compiler revisions; `GET /results`; `trace-repl results`.
- **I6:** `stats.paired(...).blocks` and `.spread`.
- **I2b:** `compiler.at(rev).world("files")` and `world("agenda")`.
- **I3b:** a proposal to export the compiler's opcode table (design Section 8).

## Key Links

- [Design and as-built notes](design-doc/01-native-interpretation-parameters-and-results-in-the-compiler-workbench.md)
- [Investigation diary](reference/01-investigation-diary.md)
- [trace-repl README](../../../../../cmd/trace-repl/README.md)
- Scripts: `scripts/01-node-reference-frame.mjs` (the Node fixture), `02-rv32-speedup.js`, `03-frame-profile.js`, `04-compare-frame-profiles.py`, `05-compile-cost.js`
- Evidence: `various/01-rv32-speedup-2712684.json`, `02-frame-profile-native.json`, `03-frame-profile-reference.json`, `04-compile-cost-2712684.json`, `results/compile-cost-2712684.json`

## Status

Current status: **active**. All five changes are implemented on the branch `worktree-agent-ac1fc97c8047752b6`: `849166a` (I1), `0791eeb` (I2), `887f6d0` (`--arg` fix), `c38e429` (I6), `30820a6` (I5, I2b). `go test ./...`, `go test -race ./...` and `go vet ./...` pass.

## Topics

- picocalc
- compiler
- performance

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.
