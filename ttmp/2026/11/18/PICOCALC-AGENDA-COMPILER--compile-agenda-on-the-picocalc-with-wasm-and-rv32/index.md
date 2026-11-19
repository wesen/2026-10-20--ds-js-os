---
Title: Compile Agenda on the PicoCalc with Wasm and RV32
Ticket: PICOCALC-AGENDA-COMPILER
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T17:49:07.093235267-05:00
WhatFor: ""
WhenToUse: ""
---

# Compile Agenda on the PicoCalc with Wasm and RV32

## Overview

Deliver a typed Agenda that is feature-identical to the original JavaScript Agenda on the PicoCalc. The original app is the behavioral reference. Compile the typed implementation to Wasm and trusted RV32, in that order, and validate both against the same public workflows and notes fixtures.

The small reminder viewer established the compiler, notes, clock, restart and rendering path. The expanded goal includes the original Agenda's task entry, edits, completion and deletion, date shortcuts, grouped task view, and capability-based Editor handoff. Keep the two-second cold-build-to-first-response target and measure memory, turn latency and physical keypress-to-visible-frame separately on the assembled device. Record and commit the implementation diary and publish milestone reports to the go-go-parc vault.

See the [feature-parity acceptance criteria](design-doc/01-compiling-a-reminder-from-typed-source-through-the-picocalc-event-loop.md#feature-parity-acceptance) for the scope and evidence needed to finish.

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
