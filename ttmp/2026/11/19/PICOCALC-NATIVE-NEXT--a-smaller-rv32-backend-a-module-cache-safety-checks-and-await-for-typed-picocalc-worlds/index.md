---
Title: A smaller RV32 backend, a module cache, safety checks and await for typed PicoCalc worlds
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T15:02:51.316148173-05:00
WhatFor: ""
WhenToUse: ""
---

# A smaller RV32 backend, a module cache, safety checks and await for typed PicoCalc worlds

## Overview

This ticket is the implementation plan for the next stage of the typed-JavaScript compiler on the PicoCalc, derived from the roadmap of the special issue in PICOCALC-COMPILER-ISSUE. It contains 41 tasks in nine scopes: a smaller RV32 backend (A), a cache for compiled modules (B), the CJI tool out of the default profile (C), one interface description for the reactor functions (D), language additions (E), stack bound, trap exit, fuel and a verifier (F), `await` (G), the key-to-frame measurement (M) and later items (H).

Start with [the implementation plan](./design-doc/01-implementation-plan-orientation-task-index-dependencies-and-device-qualification.md). It defines the terms, lists every task with its dependencies, and describes host acceptance, device qualification and the one deferred measurement. The scope documents 02 to 08 in `design-doc/` hold the task descriptions.

No source code has been changed by this ticket. `scripts/01-run-host-replays.sh` runs the 24 existing host replays (all pass, see `various/01-host-replays-baseline.txt`), and `scripts/02-staged-register-model.mjs` gives the predicted instruction counts for each step of Scope A (`various/02-staged-register-model.txt`).

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc

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
