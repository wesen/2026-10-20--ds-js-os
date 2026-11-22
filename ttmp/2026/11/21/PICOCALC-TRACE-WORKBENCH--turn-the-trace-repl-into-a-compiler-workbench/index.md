---
Title: Turn the trace REPL into a compiler workbench
Ticket: PICOCALC-TRACE-WORKBENCH
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
      Note: CLI and protocol, updated for every change
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-WORKBENCH--turn-the-trace-repl-into-a-compiler-workbench/design-doc/01-turning-the-trace-repl-into-a-compiler-workbench-an-intern-guide.md
      Note: Design and as-built record
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T20:10:39.416710585-05:00
WhatFor: ""
WhenToUse: ""
---

# Turn the trace REPL into a compiler workbench

## Overview

PICOCALC-RAY-PARITY found that the trace REPL's most valuable use was running the unmodified Typed compiler in a persistent goja VM, and that its cell limit, deadline and missing file access forced every such use through Python drivers. This ticket turned the REPL into a compiler workbench with seven changes, all implemented and tested:
- W1 `compiler.at(rev)`: several compiler revisions isolated in one VM.
- W2 `repo.read/show/list` and `--mount`.
- W3 background jobs.
- W4 `GET /info`.
- W5 a shared `stats` global.
- W6 rename-aware function timelines.
- W7 idle reaping and `GET /sessions`.

The acceptance run replaces RAY-PARITY's drivers with cells and jobs (`scripts/02`–`06`). It reproduces RAY-PARITY's recorded planner equivalence (98 identical, 168 identical errors, 0 mismatches) and its board scores exactly.

Start with the [intern guide](design-doc/01-turning-the-trace-repl-into-a-compiler-workbench-an-intern-guide.md), which records the design and what was built, then the [investigation diary](reference/01-investigation-diary.md).

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc
- compiler
- performance

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
