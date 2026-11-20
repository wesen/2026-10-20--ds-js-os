---
Title: Control flow, forward calls, enums, and distinct integers
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:28:59.140979097-05:00
WhatFor: ""
WhenToUse: ""
---

# Control flow, forward calls, enums, and distinct integers

## Overview

Production support for E1 through E7 of the PicoCalc language roadmap.

## Key Links

- [Intern design](design-doc/01-extending-the-picocalc-streaming-typed-language.md)
- [Signature reuse and compiler loading experiment](analysis/02-measuring-signature-reuse-in-the-asynchronous-editor-compiler.md)
- [Implementation report](analysis/01-how-the-picocalc-frontend-adds-language-features-without-buffering-functions.md)
- [Investigation diary](reference/01-investigation-diary.md)

## Reproduction

Build the host and Wasm reactors from the repository root.

```sh
make -s -C picocalc-os build/picocalc-host typed-world-reactor files-reactor agenda-reactor
```

Run the scripts in this ticket from the repository root. The differential driver takes the ESP32-P4 GCC and CJI RV32 interpreter paths.

| Script | Inputs |
| --- | --- |
| `01-check-functions-differential.mjs` | P4 GCC and CJI RV32 interpreter |
| `02-compare-worlds.mjs` | `289281c c5e2839`, `289281c 4eb08cb`, `289281c 4eb08cb ed86ba9`, or `ed86ba9 4eb08cb 1357545 --enum-migration` |
| `03-time-quickjs.sh` | `289281c c5e2839 4eb08cb 289281c` |
| `04-check-inequality-model.sh` | Uses the Scope E roadmap's staged register model |

The [supervisor's qualification ticket](../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/index.md) tracks the device workflow, integrated replays, and independent reviews.

## Topics

- picocalc
- native

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
